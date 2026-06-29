// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {IPool} from "./interfaces/IPool.sol";
import {IInterestRateModel} from "./interfaces/IInterestRateModel.sol";
import {IPriceOracle} from "./interfaces/IPriceOracle.sol";
import {IRiskConfigurator} from "./interfaces/IRiskConfigurator.sol";
import {IGuardian} from "./interfaces/IGuardian.sol";
import {IWhitelistRegistry} from "./interfaces/IWhitelistRegistry.sol";
import {IAdapterRegistry} from "./interfaces/IAdapterRegistry.sol";
import {ILiquidationTarget} from "./interfaces/ILiquidationTarget.sol";
import {MarginAccount} from "./MarginAccount.sol";

/// @title CreditManager
/// @notice Owns the lifecycle and risk accounting of margin accounts: it clones accounts,
///         draws and repays principal from the pool, tracks per-account debt via a borrow
///         index, and enforces account health on every value-reducing action.
/// @dev Debt uses Aave-style scaled balances: a per-account scaled figure multiplied by a
///      cumulative index gives the live debt; the difference from the outstanding face
///      principal is the accrued interest. The pool remains the authority for lender-side
///      interest, so interest paid on repayment is clamped to what the pool reports as owed.
contract CreditManager is Ownable, ReentrancyGuard, ILiquidationTarget {
    using SafeERC20 for IERC20;

    uint256 internal constant WAD = 1e18;
    uint256 internal constant RAY = 1e27;
    uint256 internal constant BPS = 1e4;
    uint256 internal constant SECONDS_PER_YEAR = 365 days;
    uint256 internal constant HEALTH_FACTOR_ONE = 1e18;

    IPool public immutable pool;
    IERC20 public immutable underlying;
    /// @notice The primary collateral, fixed at deployment. It seeds the collateral set and anchors
    ///         the threshold applied to drawn underlying held in an account.
    IERC20 public immutable collateralToken;
    IInterestRateModel public immutable interestRateModel;
    address public immutable accountImplementation;

    /// @notice The set of collateral assets this manager accepts. Always contains the primary
    ///         `collateralToken`; governance may register additional 18-or-other-decimal assets so a
    ///         single account can hold a basket valued as the sum of its haircut-adjusted parts.
    address[] public collateralTokens;
    mapping(address token => bool) public isCollateral;
    /// @notice 10**decimals for each registered collateral, cached so health math need not re-read it.
    mapping(address token => uint256) public collateralUnit;

    IPriceOracle public oracle;
    IRiskConfigurator public riskConfigurator;
    IGuardian public guardian;
    IWhitelistRegistry public whitelistRegistry;
    IAdapterRegistry public adapterRegistry;
    address public liquidationModule;
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
    event Liquidate(address indexed account, address indexed liquidator, uint256 debtRepaid, uint256 collateralSeized);
    event OracleSet(address indexed oracle);
    event RiskConfiguratorSet(address indexed riskConfigurator);
    event GuardianSet(address indexed guardian);
    event WhitelistRegistrySet(address indexed whitelistRegistry);
    event AdapterRegistrySet(address indexed adapterRegistry);
    event LiquidationModuleSet(address indexed liquidationModule);
    event FacadeSet(address indexed facade);
    event CollateralTokenAdded(address indexed token);
    event CollateralTokenRemoved(address indexed token);

    error ZeroAddress();
    error NotAuthorized();
    error NotLiquidator();
    error NotLiquidatable();
    error UnknownAccount();
    error AccountNotEmpty();
    error Undercollateralized();
    error CallNotWhitelisted(address target, bytes4 selector);
    error TargetNotAdapter(address target);
    error NotCollateral(address token);
    error AlreadyCollateral(address token);
    error CannotRemovePrimary();

    /// @dev Reverts when a guardian is set and the protocol is paused. Debt repayment, collateral
    ///      top-ups, and account closure are intentionally left ungated so positions can always be
    ///      de-risked during an incident.
    modifier whenNotPaused() {
        IGuardian g = guardian;
        if (address(g) != address(0)) g.ensureNotPaused();
        _;
    }

    constructor(
        IPool pool_,
        IERC20 collateralToken_,
        IInterestRateModel interestRateModel_,
        IPriceOracle oracle_,
        IRiskConfigurator riskConfigurator_,
        address accountImplementation_,
        address owner_
    ) Ownable(owner_) {
        if (
            address(pool_) == address(0) || address(collateralToken_) == address(0)
                || address(interestRateModel_) == address(0) || address(oracle_) == address(0)
                || address(riskConfigurator_) == address(0) || accountImplementation_ == address(0)
        ) revert ZeroAddress();

        pool = pool_;
        underlying = IERC20(pool_.asset());
        collateralToken = collateralToken_;
        interestRateModel = interestRateModel_;
        oracle = oracle_;
        riskConfigurator = riskConfigurator_;
        accountImplementation = accountImplementation_;
        lastIndexUpdate = block.timestamp;

        _registerCollateral(address(collateralToken_));
    }

    // --------------------------------------------------------------------- //
    //                                 Admin                                 //
    // --------------------------------------------------------------------- //

    function setOracle(IPriceOracle oracle_) external onlyOwner {
        if (address(oracle_) == address(0)) revert ZeroAddress();
        oracle = oracle_;
        emit OracleSet(address(oracle_));
    }

    function setRiskConfigurator(IRiskConfigurator riskConfigurator_) external onlyOwner {
        if (address(riskConfigurator_) == address(0)) revert ZeroAddress();
        riskConfigurator = riskConfigurator_;
        emit RiskConfiguratorSet(address(riskConfigurator_));
    }

    /// @notice Sets (or clears) the emergency pause authority. Clearing it removes the gate.
    function setGuardian(IGuardian guardian_) external onlyOwner {
        guardian = guardian_;
        emit GuardianSet(address(guardian_));
    }

    /// @notice Sets (or clears) the multicall allowlist. When unset, multicall targets are
    ///         unrestricted; once set, every routed call must be an allowed (target, selector).
    function setWhitelistRegistry(IWhitelistRegistry whitelistRegistry_) external onlyOwner {
        whitelistRegistry = whitelistRegistry_;
        emit WhitelistRegistrySet(address(whitelistRegistry_));
    }

    /// @notice Sets (or clears) the adapter allowlist. When unset, the adapter gate is off; once set,
    ///         every routed call other than a token approve must target a registered adapter. This is
    ///         an independent second gate alongside the whitelist: a call must satisfy both.
    function setAdapterRegistry(IAdapterRegistry adapterRegistry_) external onlyOwner {
        adapterRegistry = adapterRegistry_;
        emit AdapterRegistrySet(address(adapterRegistry_));
    }

    /// @notice Sets the module permitted to trigger liquidations. Until set, liquidation is
    ///         disabled, since no caller can satisfy the liquidation-module check.
    function setLiquidationModule(address liquidationModule_) external onlyOwner {
        if (liquidationModule_ == address(0)) revert ZeroAddress();
        liquidationModule = liquidationModule_;
        emit LiquidationModuleSet(liquidationModule_);
    }

    function setFacade(address facade_) external onlyOwner {
        if (facade_ == address(0)) revert ZeroAddress();
        facade = facade_;
        emit FacadeSet(facade_);
    }

    /// @notice Registers an additional collateral asset. Its oracle price and haircut must already be
    ///         configured, or health math will read a zero price/threshold for it. Decimals are read
    ///         once and cached. Governance owns this; it widens what a single account may post.
    function addCollateralToken(address token) external onlyOwner {
        if (token == address(0)) revert ZeroAddress();
        if (token == address(underlying)) revert NotCollateral(token);
        if (isCollateral[token]) revert AlreadyCollateral(token);
        _registerCollateral(token);
        emit CollateralTokenAdded(token);
    }

    /// @notice De-registers a non-primary collateral. Any balance an account already holds stops
    ///         counting toward its health, so governance must account for open positions first.
    function removeCollateralToken(address token) external onlyOwner {
        if (token == address(collateralToken)) revert CannotRemovePrimary();
        if (!isCollateral[token]) revert NotCollateral(token);

        isCollateral[token] = false;
        delete collateralUnit[token];
        uint256 len = collateralTokens.length;
        for (uint256 i = 0; i < len; i++) {
            if (collateralTokens[i] == token) {
                collateralTokens[i] = collateralTokens[len - 1];
                collateralTokens.pop();
                break;
            }
        }
        emit CollateralTokenRemoved(token);
    }

    /// @notice The full collateral set, for off-chain indexing and UIs.
    function collateralTokensList() external view returns (address[] memory) {
        return collateralTokens;
    }

    function _registerCollateral(address token) internal {
        isCollateral[token] = true;
        collateralTokens.push(token);
        collateralUnit[token] = 10 ** IERC20Metadata(token).decimals();
    }

    // --------------------------------------------------------------------- //
    //                              Lifecycle                                //
    // --------------------------------------------------------------------- //

    /// @notice Clones an account for `onBehalf`, pulls collateral, and draws `borrowAmount`.
    function openCreditAccount(uint256 collateralAmount, uint256 borrowAmount, address onBehalf)
        external
        nonReentrant
        whenNotPaused
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

        // Return remaining underlying and every collateral in the basket to the owner.
        address owner_ = a.owner;
        uint256 leftover = underlying.balanceOf(account);
        if (leftover > 0) MarginAccount(account).transferToken(address(underlying), owner_, leftover);
        _sweepCollateral(account, owner_);

        a.open = false;
        emit CloseAccount(account, owner_);
    }

    /// @notice Liquidates an underwater account. Callable only by the liquidation module, which
    ///         gates on keeper authority; the manager independently re-checks the health floor.
    /// @dev The pool is always made whole: the account's own underlying repays its debt first and
    ///      the keeper funds any shortfall. In exchange the keeper seizes all collateral, whose
    ///      surplus over the debt is bounded by the collateral haircut and forms the liquidation
    ///      incentive. Any underlying left in the account after repayment returns to the owner.
    ///      Not pausable: liquidation must remain available during an incident.
    function liquidate(address account, address liquidator) external override nonReentrant {
        if (msg.sender != liquidationModule) revert NotLiquidator();
        Account storage a = accounts[account];
        if (!a.open) revert UnknownAccount();
        _accrueIndex();

        if (calcHealthFactor(account) >= HEALTH_FACTOR_ONE) revert NotLiquidatable();

        uint256 debt = _debt(a);
        uint256 principal = a.facePrincipal;

        if (debt > 0) {
            uint256 fromAccount = Math.min(underlying.balanceOf(account), debt);
            if (fromAccount > 0) {
                MarginAccount(account).transferToken(address(underlying), address(this), fromAccount);
            }
            uint256 shortfall = debt - fromAccount;
            if (shortfall > 0) {
                underlying.safeTransferFrom(liquidator, address(this), shortfall);
            }

            uint256 interest = debt - principal;
            uint256 poolInterest = Math.min(interest, pool.calcAccruedInterest());
            underlying.forceApprove(address(pool), principal + poolInterest);
            pool.repay(principal, poolInterest);
        }

        a.facePrincipal = 0;
        a.scaledDebt = 0;
        a.open = false;

        address owner_ = a.owner;

        // Seize every collateral in the basket; report the primary's amount on the event.
        uint256 primarySeized = collateralToken.balanceOf(account);
        _sweepCollateral(account, liquidator);

        uint256 leftover = underlying.balanceOf(account);
        if (leftover > 0) {
            MarginAccount(account).transferToken(address(underlying), owner_, leftover);
        }

        emit Liquidate(account, liquidator, debt, primarySeized);
    }

    // --------------------------------------------------------------------- //
    //                          Collateral and debt                          //
    // --------------------------------------------------------------------- //

    /// @notice Tops up the account's primary collateral.
    function addCollateral(address account, uint256 amount) external nonReentrant {
        _addCollateral(account, address(collateralToken), amount);
    }

    /// @notice Tops up any registered collateral, letting an account hold a basket.
    function addCollateral(address account, address token, uint256 amount) external nonReentrant {
        if (!isCollateral[token]) revert NotCollateral(token);
        _addCollateral(account, token, amount);
    }

    /// @notice Withdraws the account's primary collateral, re-checking health after.
    function withdrawCollateral(address account, uint256 amount, address to) external nonReentrant whenNotPaused {
        _withdrawCollateral(account, address(collateralToken), amount, to);
    }

    /// @notice Withdraws any registered collateral, re-checking health after.
    function withdrawCollateral(address account, address token, uint256 amount, address to)
        external
        nonReentrant
        whenNotPaused
    {
        if (!isCollateral[token]) revert NotCollateral(token);
        _withdrawCollateral(account, token, amount, to);
    }

    function _addCollateral(address account, address token, uint256 amount) internal {
        _authorized(account);
        IERC20(token).safeTransferFrom(msg.sender, account, amount);
        emit AddCollateral(account, amount);
    }

    function _withdrawCollateral(address account, address token, uint256 amount, address to) internal {
        _authorized(account);
        _accrueIndex();
        MarginAccount(account).transferToken(token, to, amount);
        _requireHealthy(account);
        emit WithdrawCollateral(account, to, amount);
    }

    /// @dev Transfers every registered collateral the account holds to `to`. Used by close (to the
    ///      owner) and liquidation (to the keeper); identical to a single transfer for a lone primary.
    function _sweepCollateral(address account, address to) internal {
        address[] memory tokens = collateralTokens;
        for (uint256 i = 0; i < tokens.length; i++) {
            uint256 balance = IERC20(tokens[i]).balanceOf(account);
            if (balance > 0) MarginAccount(account).transferToken(tokens[i], to, balance);
        }
    }

    function increaseDebt(address account, uint256 amount) external nonReentrant whenNotPaused {
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
    ///      intermediate states may be unhealthy, but the account cannot end unhealthy. When a
    ///      whitelist registry is set, every call must target an allowed (target, selector) pair,
    ///      constraining an account to sanctioned protocols and methods.
    function multicall(address account, MultiCall[] calldata calls) external nonReentrant whenNotPaused {
        _authorized(account);
        _accrueIndex();

        IWhitelistRegistry registry = whitelistRegistry;
        IAdapterRegistry adapters = adapterRegistry;
        uint256 len = calls.length;
        for (uint256 i = 0; i < len; i++) {
            address target = calls[i].target;
            bytes calldata callData = calls[i].callData;
            bytes4 selector = callData.length >= 4 ? bytes4(callData[:4]) : bytes4(0);
            if (address(registry) != address(0)) {
                if (!registry.isAllowed(target, selector)) revert CallNotWhitelisted(target, selector);
            }
            // Independent second gate: every routed call must hit a registered adapter, except the
            // token-approve leg that funds an adapter (its target is the token, not the adapter).
            if (address(adapters) != address(0) && selector != IERC20.approve.selector) {
                if (!adapters.isAdapter(target)) revert TargetNotAdapter(target);
            }
            MarginAccount(account).execute(target, callData);
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

    /// @notice Liquidation loan-to-value for the primary collateral, in basis points. Also the
    ///         threshold applied to drawn underlying held in an account (see calcHealthFactor).
    function liquidationThresholdBps() public view returns (uint256) {
        return liquidationThresholdBps(address(collateralToken));
    }

    /// @notice Liquidation loan-to-value for a specific collateral, in basis points, sourced from the
    ///         risk configurator: the haircut's complement (BPS - haircut). Governance owns the
    ///         haircut, so the threshold can be tuned per collateral without redeploying.
    function liquidationThresholdBps(address token) public view returns (uint256) {
        return BPS - riskConfigurator.haircutBps(token);
    }

    /// @notice Health factor in WAD; 1e18 is the liquidation boundary, above is solvent.
    /// @dev Sums each collateral's value (balance x price / its unit) weighted by that collateral's
    ///      own threshold, plus drawn underlying weighted by the primary threshold, over live debt.
    ///      A single-collateral account (the set holds only the primary) reduces exactly to the
    ///      legacy (collateral + underlying) x threshold / debt.
    function calcHealthFactor(address account) public view override returns (uint256) {
        uint256 debt = calcDebt(account);
        if (debt == 0) return type(uint256).max;

        // Drawn underlying held in the account, weighted by the primary collateral's threshold.
        uint256 adjusted = Math.mulDiv(underlying.balanceOf(account), liquidationThresholdBps(), BPS);

        address[] memory tokens = collateralTokens;
        for (uint256 i = 0; i < tokens.length; i++) {
            address token = tokens[i];
            uint256 balance = IERC20(token).balanceOf(account);
            if (balance == 0) continue;
            uint256 value = Math.mulDiv(balance, oracle.getPrice(token), collateralUnit[token]);
            adjusted += Math.mulDiv(value, liquidationThresholdBps(token), BPS);
        }

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
