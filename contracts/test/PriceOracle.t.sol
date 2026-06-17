// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PriceOracle} from "../src/PriceOracle.sol";
import {IChainlinkAggregator} from "../src/interfaces/IChainlinkAggregator.sol";
import {MockAggregator} from "./mocks/MockAggregator.sol";

contract PriceOracleTest is Test {
    PriceOracle internal oracle;
    MockAggregator internal feed;
    address internal token = makeAddr("token");

    uint256 internal constant STALENESS = 3600;

    function setUp() public {
        vm.warp(1_000_000); // move off genesis so staleness math is meaningful
        oracle = new PriceOracle(address(this));
        feed = new MockAggregator(8, 2000e8, block.timestamp);
        oracle.setFeed(token, IChainlinkAggregator(address(feed)), STALENESS);
    }

    function test_GetPriceScalesEightDecimalsToWad() public view {
        assertEq(oracle.getPrice(token), 2000e18);
    }

    function test_GetPriceScalesEighteenDecimalFeed() public {
        MockAggregator f18 = new MockAggregator(18, 1500e18, block.timestamp);
        address t2 = makeAddr("t2");
        oracle.setFeed(t2, IChainlinkAggregator(address(f18)), STALENESS);
        assertEq(oracle.getPrice(t2), 1500e18);
    }

    function test_RevertsOnUnsetFeed() public {
        vm.expectRevert(PriceOracle.FeedNotSet.selector);
        oracle.getPrice(makeAddr("unknown"));
    }

    function test_RevertsOnNonPositivePrice() public {
        feed.set(0, block.timestamp);
        vm.expectRevert(PriceOracle.InvalidPrice.selector);
        oracle.getPrice(token);
    }

    function test_RevertsOnStalePrice() public {
        feed.set(2000e8, block.timestamp);
        vm.warp(block.timestamp + STALENESS + 1);
        vm.expectRevert(PriceOracle.StalePrice.selector);
        oracle.getPrice(token);
    }

    function test_OnlyOwnerCanSetFeed() public {
        vm.prank(makeAddr("intruder"));
        vm.expectRevert();
        oracle.setFeed(token, IChainlinkAggregator(address(feed)), STALENESS);
    }
}
