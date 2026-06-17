// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

/// @title IWstETH
/// @notice Wrap/unwrap surface for a wrapped liquid-staking token (e.g. wstETH over stETH).
interface IWstETH {
    function wrap(uint256 amount) external returns (uint256);

    function unwrap(uint256 amount) external returns (uint256);
}
