// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

/// @title ICurvePool
/// @notice Minimal two-coin Curve pool surface used by the adapter.
interface ICurvePool {
    function add_liquidity(uint256[2] calldata amounts, uint256 minMintAmount) external returns (uint256);

    function remove_liquidity_one_coin(uint256 lpAmount, int128 i, uint256 minReceived) external returns (uint256);

    function coins(uint256 i) external view returns (address);

    function lpToken() external view returns (address);
}
