// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {IPool} from "./interfaces/IPool.sol";
import {IInterestRateModel} from "./interfaces/IInterestRateModel.sol";

/// @title Pool
/// @notice ERC-4626 lending pool. Lenders deposit the underlying for yield-bearing shares;
///         registered credit managers borrow against that liquidity and repay with interest.
/// @dev Interest accrues linearly on the outstanding principal at the rate produced by the
///      interest-rate model, and is folded into `totalAssets` so the share price rises over time.
///      Withdrawals are capped at the idle (un-borrowed) liquidity. The pool is the single source
///      of truth for accrued interest; per-account debt accounting lives in the credit manager.
contract Pool is ERC4626, Ownable, ReentrancyGuard, IPool {
    using SafeERC20 for IERC20;

    /// @notice WAD scale: 1e18 == 100%.
    uint256 internal constant WAD = 1e18;
    /// @notice Seconds in a year, used to prorate the annual rate.
    uint256 internal constant SECONDS_PER_YEAR = 365 days;

    /// @notice Interest-rate model that prices utilization.
    IInterestRateModel public immutable interestRateModel;

    /// @notice Principal currently lent out across all credit managers.
    uint256 public totalBorrowed;
    /// @notice Timestamp interest was last folded into the stored figure.
    uint256 public lastUpdate;
    /// @notice Interest accrued and owed to the pool but not yet repaid.
    uint256 private _storedInterest;

    /// @notice Credit managers permitted to borrow and repay.
    mapping(address account => bool enabled) public isCreditManager;

    event Borrow(address indexed creditManager, address indexed to, uint256 amount);
    event Repay(address indexed creditManager, uint256 principal, uint256 interest);
    event CreditManagerSet(address indexed creditManager, bool enabled);

    error ZeroAddress();
    error NotCreditManager();
    error InsufficientLiquidity();
    error RepayExceedsDebt();
    error InterestExceedsAccrued();

    modifier onlyCreditManager() {
        if (!isCreditManager[msg.sender]) revert NotCreditManager();
        _;
    }

    constructor(
        IERC20 asset_,
        IInterestRateModel interestRateModel_,
        address owner_,
        string memory name_,
        string memory symbol_
    ) ERC20(name_, symbol_) ERC4626(asset_) Ownable(owner_) {
        if (address(interestRateModel_) == address(0)) revert ZeroAddress();
        interestRateModel = interestRateModel_;
        lastUpdate = block.timestamp;
    }

    // --------------------------------------------------------------------- //
    //                          Credit manager admin                         //
    // --------------------------------------------------------------------- //

    /// @notice Enables or disables a credit manager's borrow/repay access.
    function setCreditManager(address creditManager, bool enabled) external onlyOwner {
        if (creditManager == address(0)) revert ZeroAddress();
        isCreditManager[creditManager] = enabled;
        emit CreditManagerSet(creditManager, enabled);
    }

    // --------------------------------------------------------------------- //
    //                            Borrow / repay                             //
    // --------------------------------------------------------------------- //

    /// @inheritdoc IPool
    function borrow(uint256 amount, address to) external onlyCreditManager nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        _accrue();
        if (amount > availableLiquidity()) revert InsufficientLiquidity();

        totalBorrowed += amount;
        IERC20(asset()).safeTransfer(to, amount);

        emit Borrow(msg.sender, to, amount);
    }

    /// @inheritdoc IPool
    function repay(uint256 principal, uint256 interest) external onlyCreditManager nonReentrant {
        _accrue();
        if (principal > totalBorrowed) revert RepayExceedsDebt();
        if (interest > _storedInterest) revert InterestExceedsAccrued();

        totalBorrowed -= principal;
        _storedInterest -= interest;
        IERC20(asset()).safeTransferFrom(msg.sender, address(this), principal + interest);

        emit Repay(msg.sender, principal, interest);
    }

    // --------------------------------------------------------------------- //
    //                               Accounting                              //
    // --------------------------------------------------------------------- //

    /// @inheritdoc IPool
    function availableLiquidity() public view returns (uint256) {
        return IERC20(asset()).balanceOf(address(this));
    }

    /// @inheritdoc IPool
    function calcAccruedInterest() public view returns (uint256) {
        return _storedInterest + _pendingInterest();
    }

    /// @inheritdoc ERC4626
    function totalAssets() public view override returns (uint256) {
        return availableLiquidity() + totalBorrowed + _storedInterest + _pendingInterest();
    }

    /// @inheritdoc IPool
    function asset() public view override(ERC4626, IPool) returns (address) {
        return ERC4626.asset();
    }

    /// @notice Interest accrued since the last update but not yet folded into the stored figure.
    function _pendingInterest() internal view returns (uint256) {
        uint256 borrowed = totalBorrowed;
        if (borrowed == 0) return 0;

        uint256 elapsed = block.timestamp - lastUpdate;
        if (elapsed == 0) return 0;

        uint256 liquidity = borrowed + availableLiquidity();
        uint256 ratePerYear = interestRateModel.borrowRatePerYear(borrowed, liquidity);
        return Math.mulDiv(borrowed, ratePerYear * elapsed, WAD * SECONDS_PER_YEAR);
    }

    /// @notice Folds pending interest into the stored figure and stamps the update time.
    function _accrue() internal {
        uint256 pending = _pendingInterest();
        if (pending != 0) _storedInterest += pending;
        lastUpdate = block.timestamp;
    }

    // --------------------------------------------------------------------- //
    //                       Liquidity-gated withdrawals                     //
    // --------------------------------------------------------------------- //

    /// @inheritdoc ERC4626
    function maxWithdraw(address owner) public view override returns (uint256) {
        return Math.min(super.maxWithdraw(owner), availableLiquidity());
    }

    /// @inheritdoc ERC4626
    function maxRedeem(address owner) public view override returns (uint256) {
        return Math.min(super.maxRedeem(owner), convertToShares(availableLiquidity()));
    }

    /// @inheritdoc ERC4626
    function _deposit(address caller, address receiver, uint256 assets, uint256 shares) internal override {
        _accrue();
        super._deposit(caller, receiver, assets, shares);
    }

    /// @inheritdoc ERC4626
    function _withdraw(address caller, address receiver, address owner, uint256 assets, uint256 shares)
        internal
        override
    {
        _accrue();
        if (assets > availableLiquidity()) revert InsufficientLiquidity();
        super._withdraw(caller, receiver, owner, assets, shares);
    }

    /// @dev Virtual-share offset that resists first-depositor share-inflation attacks.
    function _decimalsOffset() internal pure override returns (uint8) {
        return 6;
    }
}
