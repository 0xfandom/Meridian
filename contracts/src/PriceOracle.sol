// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IPriceOracle} from "./interfaces/IPriceOracle.sol";
import {IChainlinkAggregator} from "./interfaces/IChainlinkAggregator.sol";

/// @title PriceOracle
/// @notice Prices assets from Chainlink feeds, normalised to WAD, with staleness and
///         positivity guards. Feeds are registered by governance per asset.
/// @dev Returns the raw market price; risk discounts (haircuts) are applied by the risk
///      layer, not here, so the oracle stays a single, auditable price source.
contract PriceOracle is IPriceOracle, Ownable {
    uint256 internal constant WAD = 1e18;

    struct Feed {
        IChainlinkAggregator aggregator;
        uint8 decimals;
        uint256 stalenessThreshold;
    }

    mapping(address token => Feed feed) public feeds;

    event FeedSet(address indexed token, address indexed aggregator, uint256 stalenessThreshold);

    error ZeroAddress();
    error FeedNotSet();
    error StalePrice();
    error InvalidPrice();

    constructor(address owner_) Ownable(owner_) {}

    /// @notice Registers or replaces the Chainlink feed for `token`.
    function setFeed(address token, IChainlinkAggregator aggregator, uint256 stalenessThreshold) external onlyOwner {
        if (token == address(0) || address(aggregator) == address(0)) revert ZeroAddress();
        feeds[token] =
            Feed({aggregator: aggregator, decimals: aggregator.decimals(), stalenessThreshold: stalenessThreshold});
        emit FeedSet(token, address(aggregator), stalenessThreshold);
    }

    /// @inheritdoc IPriceOracle
    function getPrice(address token) external view returns (uint256) {
        Feed memory feed = feeds[token];
        if (address(feed.aggregator) == address(0)) revert FeedNotSet();

        (, int256 answer,, uint256 updatedAt,) = feed.aggregator.latestRoundData();
        if (answer <= 0 || updatedAt == 0) revert InvalidPrice();
        if (block.timestamp - updatedAt > feed.stalenessThreshold) revert StalePrice();

        uint256 price = uint256(answer);
        if (feed.decimals < 18) {
            price *= 10 ** (18 - feed.decimals);
        } else if (feed.decimals > 18) {
            price /= 10 ** (feed.decimals - 18);
        }
        return price;
    }
}
