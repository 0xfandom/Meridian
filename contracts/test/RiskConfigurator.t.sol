// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {RiskConfigurator} from "../src/RiskConfigurator.sol";
import {RiskParams} from "../src/libraries/RiskParams.sol";

contract RiskConfiguratorTest is Test {
    RiskConfigurator internal config;
    address internal weth = makeAddr("weth");

    function setUp() public {
        config = new RiskConfigurator(address(this));
    }

    function test_SetAndReadThresholds() public {
        config.setThresholds(
            RiskParams.HealthThresholds({warningBps: 12_000, marginCallBps: 11_000, liquidationBps: 10_000})
        );
        (uint256 warning, uint256 marginCall, uint256 liquidation) = config.thresholds();
        assertEq(warning, 12_000);
        assertEq(marginCall, 11_000);
        assertEq(liquidation, 10_000);
    }

    function test_RejectsUnorderedThresholds() public {
        vm.expectRevert(RiskParams.InvalidThresholds.selector);
        config.setThresholds(
            RiskParams.HealthThresholds({warningBps: 10_000, marginCallBps: 11_000, liquidationBps: 12_000})
        );
    }

    function test_SetAndReadInterestRateModel() public {
        config.setInterestRateModel(
            RiskParams.InterestRateModel({baseRateBps: 0, slope1Bps: 400, slope2Bps: 6000, optimalUtilizationBps: 8000})
        );
        (uint256 base, uint256 slope1, uint256 slope2, uint256 optimal) = config.interestRateModel();
        assertEq(base, 0);
        assertEq(slope1, 400);
        assertEq(slope2, 6000);
        assertEq(optimal, 8000);
    }

    function test_SetAndReadCollateral() public {
        config.setCollateral(weth, 1000, 50_000);
        assertTrue(config.isSupported(weth));
        assertEq(config.haircutBps(weth), 1000);
        assertEq(config.maxLeverageBps(weth), 50_000);
    }

    function test_RejectsInvalidCollateral() public {
        vm.expectRevert(RiskParams.InvalidCollateral.selector);
        config.setCollateral(weth, 0, 50_000); // zero haircut invalid
    }

    function test_UnsupportedCollateralReverts() public {
        vm.expectRevert(RiskConfigurator.UnsupportedCollateral.selector);
        config.haircutBps(makeAddr("unknown"));
    }

    function test_RemoveCollateral() public {
        config.setCollateral(weth, 1000, 50_000);
        config.removeCollateral(weth);
        assertFalse(config.isSupported(weth));
    }

    function test_OnlyOwnerCanConfigure() public {
        vm.prank(makeAddr("intruder"));
        vm.expectRevert();
        config.setCollateral(weth, 1000, 50_000);
    }
}
