// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

/// @title ILiquidationTarget
/// @notice Subset of the credit manager the liquidation module needs: read an account's health
///         and execute its liquidation.
interface ILiquidationTarget {
    function calcHealthFactor(address account) external view returns (uint256);

    function liquidate(address account, address liquidator) external;
}
