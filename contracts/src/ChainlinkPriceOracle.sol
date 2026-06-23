// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IPriceOracle} from "./interfaces/IPriceOracle.sol";
import {IChainlinkAggregator} from "./interfaces/IChainlinkAggregator.sol";

/// @title ChainlinkPriceOracle
/// @notice Prices assets from Chainlink feeds, denominated in the protocol's unit of account
///         (the pool's underlying) and normalised to that unit's decimals. Feeds are registered
///         by governance per asset, with staleness and positivity guards.
/// @dev Mirrors PriceOracle, but normalises to a configurable `uoaDecimals` (e.g. 6 for a
///      USDC-denominated system) rather than WAD, matching how CreditManager combines collateral
///      value with the account's underlying balance. Returns the raw market price; haircuts are
///      applied by the risk layer, so this stays a single, auditable price source.
contract ChainlinkPriceOracle is IPriceOracle, Ownable {
    /// @notice Decimals of the unit of account (the pool underlying); getPrice is scaled to this.
    uint8 public immutable uoaDecimals;

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

    constructor(address owner_, uint8 uoaDecimals_) Ownable(owner_) {
        uoaDecimals = uoaDecimals_;
    }

    /// @notice Registers or replaces the Chainlink feed for `token`.
    function setFeed(address token, IChainlinkAggregator aggregator, uint256 stalenessThreshold) external onlyOwner {
        if (token == address(0) || address(aggregator) == address(0)) revert ZeroAddress();
        feeds[token] =
            Feed({aggregator: aggregator, decimals: aggregator.decimals(), stalenessThreshold: stalenessThreshold});
        emit FeedSet(token, address(aggregator), stalenessThreshold);
    }

    /// @inheritdoc IPriceOracle
    /// @notice Price of one whole `token` in the unit of account, scaled to `uoaDecimals`.
    function getPrice(address token) external view returns (uint256) {
        Feed memory feed = feeds[token];
        if (address(feed.aggregator) == address(0)) revert FeedNotSet();

        (, int256 answer,, uint256 updatedAt,) = feed.aggregator.latestRoundData();
        if (answer <= 0 || updatedAt == 0) revert InvalidPrice();
        if (block.timestamp - updatedAt > feed.stalenessThreshold) revert StalePrice();

        uint256 price = uint256(answer);
        if (feed.decimals < uoaDecimals) {
            price *= 10 ** (uoaDecimals - feed.decimals);
        } else if (feed.decimals > uoaDecimals) {
            price /= 10 ** (feed.decimals - uoaDecimals);
        }
        return price;
    }
}
