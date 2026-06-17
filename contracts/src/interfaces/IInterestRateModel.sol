// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

/// @title IInterestRateModel
/// @notice Computes the per-annum borrow rate for a pool from its utilization.
interface IInterestRateModel {
    /// @notice Returns the borrow rate per year, in WAD (1e18 = 100% APR).
    /// @param totalBorrowed Principal currently lent out by the pool.
    /// @param totalLiquidity Borrowed principal plus idle cash (the utilization denominator).
    function borrowRatePerYear(uint256 totalBorrowed, uint256 totalLiquidity) external view returns (uint256);
}
