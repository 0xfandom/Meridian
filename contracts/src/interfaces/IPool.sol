// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

/// @title IPool
/// @notice Lender-facing pool that supplies liquidity to credit managers.
/// @dev The pool is the single source of truth for accrued interest. Credit managers
///      borrow and repay principal; the interest owed is computed by the pool.
interface IPool {
    /// @notice Underlying asset supplied by lenders and lent to borrowers.
    function asset() external view returns (address);

    /// @notice Draws `amount` of the underlying to `to`. Callable only by a registered credit manager.
    function borrow(uint256 amount, address to) external;

    /// @notice Repays `principal` and `interest`. The caller must have approved `principal + interest`.
    ///         Callable only by a registered credit manager.
    function repay(uint256 principal, uint256 interest) external;

    /// @notice Principal currently lent out across all credit managers.
    function totalBorrowed() external view returns (uint256);

    /// @notice Idle underlying available to borrow or withdraw.
    function availableLiquidity() external view returns (uint256);

    /// @notice Interest accrued and owed to the pool but not yet repaid.
    function calcAccruedInterest() external view returns (uint256);
}
