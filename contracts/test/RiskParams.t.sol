// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {RiskParams} from "../src/libraries/RiskParams.sol";

/// @notice Validates that config/risk-params.json is well-formed and satisfies the
///         invariants enforced by the RiskParams schema. Keeps the canonical config
///         and the on-chain schema in lockstep.
contract RiskParamsTest is Test {
    using stdJson for string;

    string internal json;

    function setUp() public {
        json = vm.readFile("config/risk-params.json");
    }

    function test_ThresholdsAreValidAndOrdered() public view {
        RiskParams.HealthThresholds memory t = RiskParams.HealthThresholds({
            warningBps: json.readUint(".healthFactor.warningBps"),
            marginCallBps: json.readUint(".healthFactor.marginCallBps"),
            liquidationBps: json.readUint(".healthFactor.liquidationBps")
        });

        // Reverts on any violation; passing means the config is valid.
        RiskParams.validateThresholds(t);

        assertGt(t.warningBps, t.marginCallBps);
        assertGt(t.marginCallBps, t.liquidationBps);
        assertGe(t.liquidationBps, RiskParams.BPS);
    }

    function test_InterestRateModelIsValid() public view {
        RiskParams.InterestRateModel memory m = RiskParams.InterestRateModel({
            baseRateBps: json.readUint(".interestRateModel.baseRateBps"),
            slope1Bps: json.readUint(".interestRateModel.slope1Bps"),
            slope2Bps: json.readUint(".interestRateModel.slope2Bps"),
            optimalUtilizationBps: json.readUint(".interestRateModel.optimalUtilizationBps")
        });

        RiskParams.validateInterestRateModel(m);

        assertGt(m.slope2Bps, m.slope1Bps);
        assertLt(m.optimalUtilizationBps, RiskParams.BPS);
    }

    function test_EveryCollateralEntryIsValid() public view {
        string[] memory symbols = json.readStringArray(".collateral.symbols");
        uint256[] memory haircuts = json.readUintArray(".collateral.haircutBps");
        uint256[] memory leverages = json.readUintArray(".collateral.maxLeverageBps");

        assertGt(symbols.length, 0, "no collateral configured");
        assertEq(symbols.length, haircuts.length, "haircut count mismatch");
        assertEq(symbols.length, leverages.length, "leverage count mismatch");

        for (uint256 i = 0; i < symbols.length; i++) {
            RiskParams.Collateral memory c =
                RiskParams.Collateral({symbol: symbols[i], haircutBps: haircuts[i], maxLeverageBps: leverages[i]});
            RiskParams.validateCollateral(c);
        }
    }
}
