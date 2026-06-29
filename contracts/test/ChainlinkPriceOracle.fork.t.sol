// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ChainlinkPriceOracle} from "../src/ChainlinkPriceOracle.sol";
import {IChainlinkAggregator} from "../src/interfaces/IChainlinkAggregator.sol";

/// @notice Validates that ChainlinkPriceOracle resolves real, live Chainlink feeds on a mainnet fork,
///         normalising prices to the USDC unit of account (6 decimals) exactly as the deploy's
///         USE_CHAINLINK path wires them. Skips automatically when MAINNET_RPC_URL is not set, so CI
///         without an RPC stays green while the test still runs locally on a fork.
contract ChainlinkPriceOracleForkTest is Test {
    // Canonical mainnet Chainlink aggregators (both report 8 decimals).
    address internal constant ETH_USD_FEED = 0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419;
    address internal constant LINK_USD_FEED = 0x2c1d072e956AFFC0D435Cb7AC38EF18d24d9127c;
    // Token keys the feeds are registered under (the canonical mainnet tokens).
    address internal constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    address internal constant LINK = 0x514910771AF9Ca656af840dff83E8264EcF986CA;

    uint8 internal constant UOA_DECIMALS = 6; // USDC-denominated system
    uint256 internal constant STALENESS = 1 days;

    bool internal forked;
    ChainlinkPriceOracle internal oracle;

    function setUp() public {
        string memory rpc = vm.envOr("MAINNET_RPC_URL", string(""));
        if (bytes(rpc).length == 0) {
            return;
        }
        vm.createSelectFork(rpc);
        forked = true;

        oracle = new ChainlinkPriceOracle(address(this), UOA_DECIMALS);
        oracle.setFeed(WETH, IChainlinkAggregator(ETH_USD_FEED), STALENESS);
        oracle.setFeed(LINK, IChainlinkAggregator(LINK_USD_FEED), STALENESS);
    }

    function test_ResolvesEthUsdFromLiveFeed() public {
        if (!forked) {
            vm.skip(true);
            return;
        }

        // Price is scaled to 6 decimals, so a dollar value of $X reads as X * 1e6. Bound it to a wide
        // but sane band (between $100 and $1,000,000) rather than a brittle exact value.
        uint256 price = oracle.getPrice(WETH);
        assertGt(price, 100e6, "ETH price implausibly low");
        assertLt(price, 1_000_000e6, "ETH price implausibly high");
    }

    function test_ResolvesLinkUsdFromLiveFeed() public {
        if (!forked) {
            vm.skip(true);
            return;
        }

        uint256 price = oracle.getPrice(LINK);
        assertGt(price, 1e5, "LINK price implausibly low"); // > $0.10
        assertLt(price, 10_000e6, "LINK price implausibly high"); // < $10,000
    }

    function test_StaleFeedReverts() public {
        if (!forked) {
            vm.skip(true);
            return;
        }

        // Move well past the staleness window so the latest round is considered stale.
        vm.warp(block.timestamp + STALENESS + 2 days);
        vm.expectRevert(ChainlinkPriceOracle.StalePrice.selector);
        oracle.getPrice(WETH);
    }

    function test_UnregisteredTokenReverts() public {
        if (!forked) {
            vm.skip(true);
            return;
        }

        vm.expectRevert(ChainlinkPriceOracle.FeedNotSet.selector);
        oracle.getPrice(makeAddr("unlisted"));
    }
}
