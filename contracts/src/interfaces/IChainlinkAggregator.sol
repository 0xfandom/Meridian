// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

/// @title IChainlinkAggregator
/// @notice Minimal subset of the Chainlink AggregatorV3 interface used by the price oracle.
interface IChainlinkAggregator {
    function decimals() external view returns (uint8);

    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
}
