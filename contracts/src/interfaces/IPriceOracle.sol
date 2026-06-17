// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

/// @title IPriceOracle
/// @notice Prices assets in the protocol unit of account (the pool's underlying).
/// @dev Minimal consumer interface. The production oracle (with feed registration,
///      staleness/deviation guards, and haircuts) implements this and adds admin methods.
interface IPriceOracle {
    /// @notice Price of one whole `token` denominated in the unit of account, WAD-scaled (1e18).
    function getPrice(address token) external view returns (uint256);
}
