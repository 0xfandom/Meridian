// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {InterestRateModel} from "../src/InterestRateModel.sol";
import {RiskParams} from "../src/libraries/RiskParams.sol";

contract InterestRateModelTest is Test {
    uint256 internal constant WAD = 1e18;

    // base 0%, slope1 4%, slope2 60%, optimal utilization 80% (from risk-params.json).
    InterestRateModel internal irm;

    function setUp() public {
        irm = new InterestRateModel(0, 400, 6000, 8000);
    }

    function test_ConstructorScalesParamsToWad() public view {
        assertEq(irm.baseRatePerYear(), 0);
        assertEq(irm.slope1(), 0.04e18);
        assertEq(irm.slope2(), 0.6e18);
        assertEq(irm.optimalUtilization(), 0.8e18);
    }

    function test_BaseRateAtZeroUtilization() public view {
        assertEq(irm.borrowRatePerYear(0, 100), 0);
        assertEq(irm.borrowRatePerYear(0, 0), 0);
    }

    function test_RateBelowOptimalIsLinear() public view {
        // u = 0.4 -> slope1 * (0.4 / 0.8) = 0.04 * 0.5 = 0.02
        assertEq(irm.borrowRatePerYear(40, 100), 0.02e18);
    }

    function test_RateAtOptimalUtilization() public view {
        // u = 0.8 -> base + slope1 = 0.04
        assertEq(irm.borrowRatePerYear(80, 100), 0.04e18);
    }

    function test_RateAtFullUtilization() public view {
        // u = 1.0 -> base + slope1 + slope2 = 0.64
        assertEq(irm.borrowRatePerYear(100, 100), 0.64e18);
    }

    function test_ConstructorRejectsInvalidCurve() public {
        // slope2 <= slope1 is invalid.
        vm.expectRevert(RiskParams.InvalidInterestRateModel.selector);
        new InterestRateModel(0, 500, 400, 8000);
    }

    function testFuzz_RateIsMonotonicInUtilization(uint256 borrowedA, uint256 borrowedB) public view {
        uint256 liquidity = 1e24;
        borrowedA = bound(borrowedA, 0, liquidity);
        borrowedB = bound(borrowedB, 0, liquidity);
        vm.assume(borrowedA <= borrowedB);

        assertLe(irm.borrowRatePerYear(borrowedA, liquidity), irm.borrowRatePerYear(borrowedB, liquidity));
    }
}
