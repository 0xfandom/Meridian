// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {IPool} from "./interfaces/IPool.sol";
import {IInterestRateModel} from "./interfaces/IInterestRateModel.sol";
import {IPriceOracle} from "./interfaces/IPriceOracle.sol";
import {MarginAccount} from "./MarginAccount.sol";

/// @title CreditManager
/// @notice Owns the lifecycle and risk accounting of margin accounts: it clones accounts,
///         draws and repays principal from the pool, tracks per-account debt via a borrow
///         index, and enforces account health on every value-reducing action.
/// @dev Debt uses Aave-style scaled balances: a per-account scaled figure multiplied by a
///      cumulative index gives the live debt; the difference from the outstanding face
///      principal is the accrued interest. The pool remains the authority for lender-side
///      interest, so interest paid on repayment is clamped to what the pool reports as owed.
contract CreditManager is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 internal constant WAD = 1e18;
    uint256 internal constant RAY = 1e27;
    uint256 internal constant BPS = 1e4;
    uint256 internal constant SECONDS_PER_YEAR = 365 days;
    uint256 internal constant HEALTH_FACTOR_ONE = 1e18;

    IPool public immutable pool;
    IERC20 public immutable underlying;
    IERC20 public immutable collateralToken;
    IInterestRateModel public immutable interestRateModel;
    address public immutable accountImplementation;
    uint256 public immutable liquidationThresholdBps;

    IPriceOracle public oracle;
    address public facade;

    uint256 public borrowIndex = RAY;
    uint256 public lastIndexUpdate;

    struct Account {
        address owner;
        uint256 facePrincipal; // outstanding principal drawn from the pool
        uint256 scaledDebt; // debt scaled by the borrow index (RAY)
        bool open;
    }

    mapping(address account => Account data) public accounts;

    /// @notice A single call routed through a margin account, typically to an adapter.
    struct MultiCall {
        address target;
        bytes callData;
    }

    event OpenAccount(address indexed account, address indexed owner, uint256 collateral, uint256 borrowed);
    event Multicall(address indexed account, uint256 calls);
    event CloseAccount(address indexed account, address indexed owner);
    event AddCollateral(address indexed account, uint256 amount);
    event WithdrawCollateral(address indexed account, address indexed to, uint256 amount);
    event IncreaseDebt(address indexed account, uint256 amount);
    event DecreaseDebt(address indexed account, uint256 principalRepaid, uint256 interestPaid);
    event OracleSet(address indexed oracle);
    event FacadeSet(address indexed facade);

    error ZeroAddress();
    error InvalidThreshold();
    error NotAuthorized();
    error UnknownAccount();
    error AccountNotEmpty();
    error Undercollateralized();

    constructor(
        IPool pool_,
        IERC20 collateralToken_,
        IInterestRateModel interestRateModel_,
        IPriceOracle oracle_,
        address accountImplementation_,
        uint256 liquidationThresholdBps_,
        address owner_
    ) Ownable(owner_) {
        if (
            address(pool_) == address(0) || address(collateralToken_) == address(0)
                || address(interestRateModel_) == address(0) || address(oracle_) == address(0)
                || accountImplementation_ == address(0)
        ) revert ZeroAddress();
        if (liquidationThresholdBps_ == 0 || liquidationThresholdBps_ > BPS) revert InvalidThreshold();

        pool = pool_;
        underlying = IERC20(pool_.asset());
        collateralToken = collateralToken_;
        interestRateModel = interestRateModel_;
        oracle = oracle_;
        accountImplementation = accountImplementation_;
        liquidationThresholdBps = liquidationThresholdBps_;
        lastIndexUpdate = block.timestamp;
    }

    // --------------------------------------------------------------------- //
    //                                 Admin                                 //
    // --------------------------------------------------------------------- //

    function setOracle(IPriceOracle oracle_) external onlyOwner {
        if (address(oracle_) == address(0)) revert ZeroAddress();
        oracle = oracle_;
        emit OracleSet(address(oracle_));
    }

    function setFacade(address facade_) external onlyOwner {
        if (facade_ == address(0)) revert ZeroAddress();
        facade = facade_;
        emit FacadeSet(facade_);
    }

    // --------------------------------------------------------------------- //
    //                              Lifecycle                                //
    // --------------------------------------------------------------------- //

    /// @notice Clones an account for `onBehalf`, pulls collateral, and draws `borrowAmount`.
    function openCreditAccount(uint256 collateralAmount, uint256 borrowAmount, address onBehalf)
        external
        nonReentrant
        returns (address account)
    {
        if (onBehalf == address(0)) revert ZeroAddress();
        _accrueIndex();

        account = Clones.clone(accountImplementation);
        MarginAccount(account).initialize(address(this));

        Account storage a = accounts[account];
        a.owner = onBehalf;
        a.open = true;

        if (collateralAmount > 0) {
            collateralToken.safeTransferFrom(onBehalf, account, collateralAmount);
        }
        if (borrowAmount > 0) {
            a.facePrincipal = borrowAmount;
            a.scaledDebt = Math.mulDiv(borrowAmount, RAY, borrowIndex);
            pool.borrow(borrowAmount, account);
        }

        _requireHealthy(account);
        emit OpenAccount(account, onBehalf, collateralAmount, borrowAmount);
    }

    /// @notice Repays the full debt from the account's balance and returns all assets to the owner.
    function closeCreditAccount(address account) external nonReentrant {
        Account storage a = _authorized(account);
        _accrueIndex();

        uint256 debt = _debt(a);
        uint256 principal = a.facePrincipal;
        uint256 interest = debt - principal;

        if (debt > 0) {
            // Pull what is owed from the account and repay the pool.
            MarginAccount(account).transferToken(address(underlying), address(this), debt);
            uint256 poolInterest = Math.min(interest, pool.calcAccruedInterest());
            underlying.forceApprove(address(pool), principal + poolInterest);
            pool.repay(principal, poolInterest);
        }

        a.facePrincipal = 0;
        a.scaledDebt = 0;

        // Return remaining underlying and all collateral to the owner.
        address owner_ = a.owner;
        uint256 leftover = underlying.balanceOf(account);
        if (leftover > 0) MarginAccount(account).transferToken(address(underlying), owner_, leftover);
        uint256 collateral = collateralToken.balanceOf(account);
        if (collateral > 0) MarginAccount(account).transferToken(address(collateralToken), owner_, collateral);

        a.open = false;
        emit CloseAccount(account, owner_);
    }

    // --------------------------------------------------------------------- //
    //                          Collateral and debt                          //
    // --------------------------------------------------------------------- //

    function addCollateral(address account, uint256 amount) external nonReentrant {
        _authorized(account);
        collateralToken.safeTransferFrom(msg.sender, account, amount);
        emit AddCollateral(account, amount);
    }

    function withdrawCollateral(address account, uint256 amount, address to) external nonReentrant {
        _authorized(account);
        _accrueIndex();
        MarginAccount(account).transferToken(address(collateralToken), to, amount);
        _requireHealthy(account);
        emit WithdrawCollateral(account, to, amount);
    }

    function increaseDebt(address account, uint256 amount) external nonReentrant {
        Account storage a = _authorized(account);
        _accrueIndex();
        a.facePrincipal += amount;
        a.scaledDebt += Math.mulDiv(amount, RAY, borrowIndex);
        pool.borrow(amount, account);
        _requireHealthy(account);
        emit IncreaseDebt(account, amount);
    }

    function decreaseDebt(address account, uint256 amount) external nonReentrant {
        Account storage a = _authorized(account);
        _accrueIndex();

        uint256 debt = _debt(a);
        uint256 repayAmount = Math.min(amount, debt);
        uint256 interest = debt - a.facePrincipal;
        uint256 interestPaid = Math.min(repayAmount, interest);
        uint256 principalPaid = repayAmount - interestPaid;

        a.scaledDebt -= Math.mulDiv(repayAmount, RAY, borrowIndex);
        a.facePrincipal -= principalPaid;

        MarginAccount(account).transferToken(address(underlying), address(this), repayAmount);
        uint256 poolInterest = Math.min(interestPaid, pool.calcAccruedInterest());
        underlying.forceApprove(address(pool), principalPaid + poolInterest);
        pool.repay(principalPaid, poolInterest);

        emit DecreaseDebt(account, principalPaid, interestPaid);
    }

    /// @notice Routes a batch of calls through the account, then enforces health exactly once.
    /// @dev The single post-batch health check is what makes batched, leveraged actions safe:
    ///      intermediate states may be unhealthy, but the account cannot end unhealthy. Target
    ///      whitelisting (added with the adapter registry) further constrains what may be called.
    function multicall(address account, MultiCall[] calldata calls) external nonReentrant {
        _authorized(account);
        _accrueIndex();

        uint256 len = calls.length;
        for (uint256 i = 0; i < len; i++) {
            MarginAccount(account).execute(calls[i].target, calls[i].callData);
        }

        _requireHealthy(account);
        emit Multicall(account, len);
    }

    // --------------------------------------------------------------------- //
    //                                Views                                  //
    // --------------------------------------------------------------------- //

    /// @notice Live debt (principal plus accrued interest) of an account, in underlying.
    function calcDebt(address account) public view returns (uint256) {
        return Math.mulDiv(accounts[account].scaledDebt, _currentIndex(), RAY);
    }

    /// @notice Health factor in WAD; 1e18 is the liquidation boundary, above is solvent.
    function calcHealthFactor(address account) public view returns (uint256) {
        uint256 debt = calcDebt(account);
        if (debt == 0) return type(uint256).max;

        uint256 collateralBalance = collateralToken.balanceOf(account);
        uint256 underlyingBalance = underlying.balanceOf(account);
        uint256 collateralValue = Math.mulDiv(collateralBalance, oracle.getPrice(address(collateralToken)), WAD);
        uint256 assetsValue = collateralValue + underlyingBalance;

        uint256 adjusted = Math.mulDiv(assetsValue, liquidationThresholdBps, BPS);
        return Math.mulDiv(adjusted, WAD, debt);
    }

    // --------------------------------------------------------------------- //
    //                              Internals                                //
    // --------------------------------------------------------------------- //

    function _debt(Account storage a) internal view returns (uint256) {
        return Math.mulDiv(a.scaledDebt, borrowIndex, RAY);
    }

    function _currentIndex() internal view returns (uint256) {
        uint256 elapsed = block.timestamp - lastIndexUpdate;
        uint256 borrowed = pool.totalBorrowed();
        if (elapsed == 0 || borrowed == 0) return borrowIndex;

        uint256 liquidity = borrowed + pool.availableLiquidity();
        uint256 ratePerYear = interestRateModel.borrowRatePerYear(borrowed, liquidity);
        uint256 factor = RAY + Math.mulDiv(ratePerYear, elapsed * RAY, WAD * SECONDS_PER_YEAR);
        return Math.mulDiv(borrowIndex, factor, RAY);
    }

    function _accrueIndex() internal {
        borrowIndex = _currentIndex();
        lastIndexUpdate = block.timestamp;
    }

    function _authorized(address account) internal view returns (Account storage a) {
        a = accounts[account];
        if (!a.open) revert UnknownAccount();
        if (msg.sender != a.owner && msg.sender != facade) revert NotAuthorized();
    }

    function _requireHealthy(address account) internal view {
        if (calcHealthFactor(account) < HEALTH_FACTOR_ONE) revert Undercollateralized();
    }
}
