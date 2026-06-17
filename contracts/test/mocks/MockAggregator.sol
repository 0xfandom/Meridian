// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {IChainlinkAggregator} from "../../src/interfaces/IChainlinkAggregator.sol";

/// @notice Settable Chainlink aggregator stand-in for tests.
contract MockAggregator is IChainlinkAggregator {
    uint8 private _decimals;
    int256 private _answer;
    uint256 private _updatedAt;

    constructor(uint8 decimals_, int256 answer_, uint256 updatedAt_) {
        _decimals = decimals_;
        _answer = answer_;
        _updatedAt = updatedAt_;
    }

    function set(int256 answer_, uint256 updatedAt_) external {
        _answer = answer_;
        _updatedAt = updatedAt_;
    }

    function decimals() external view returns (uint8) {
        return _decimals;
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (1, _answer, _updatedAt, _updatedAt, 1);
    }
}
