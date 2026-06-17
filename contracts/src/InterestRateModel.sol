// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IInterestRateModel} from "./interfaces/IInterestRateModel.sol";
import {RiskParams} from "./libraries/RiskParams.sol";

/// @title InterestRateModel
/// @notice Two-slope (kinked) utilization-based interest-rate model.
/// @dev Below the optimal utilization the rate rises along `slope1`; above it the rate
///      rises steeply along `slope2`, pricing the scarcity of remaining liquidity.
///      Parameters originate from config/risk-params.json and are immutable per deployment.
contract InterestRateModel is IInterestRateModel {
    /// @notice WAD scale: 1e18 == 100%.
    uint256 internal constant WAD = 1e18;

    /// @notice Base rate per year, in WAD.
    uint256 public immutable baseRatePerYear;
    /// @notice Additional rate per year at the optimal utilization, in WAD.
    uint256 public immutable slope1;
    /// @notice Additional rate per year from optimal to full utilization, in WAD.
    uint256 public immutable slope2;
    /// @notice Utilization at which the slope changes, in WAD.
    uint256 public immutable optimalUtilization;

    /// @param baseRateBps Base borrow rate in basis points.
    /// @param slope1Bps Slope below the optimal utilization, in basis points.
    /// @param slope2Bps Slope above the optimal utilization, in basis points.
    /// @param optimalUtilizationBps Kink point, in basis points.
    constructor(uint256 baseRateBps, uint256 slope1Bps, uint256 slope2Bps, uint256 optimalUtilizationBps) {
        RiskParams.validateInterestRateModel(
            RiskParams.InterestRateModel({
                baseRateBps: baseRateBps,
                slope1Bps: slope1Bps,
                slope2Bps: slope2Bps,
                optimalUtilizationBps: optimalUtilizationBps
            })
        );

        baseRatePerYear = Math.mulDiv(baseRateBps, WAD, RiskParams.BPS);
        slope1 = Math.mulDiv(slope1Bps, WAD, RiskParams.BPS);
        slope2 = Math.mulDiv(slope2Bps, WAD, RiskParams.BPS);
        optimalUtilization = Math.mulDiv(optimalUtilizationBps, WAD, RiskParams.BPS);
    }

    /// @inheritdoc IInterestRateModel
    function borrowRatePerYear(uint256 totalBorrowed, uint256 totalLiquidity) external view returns (uint256) {
        if (totalLiquidity == 0 || totalBorrowed == 0) {
            return baseRatePerYear;
        }

        uint256 utilization = Math.mulDiv(totalBorrowed, WAD, totalLiquidity);

        if (utilization <= optimalUtilization) {
            // base + slope1 * (u / uOptimal)
            return baseRatePerYear + Math.mulDiv(slope1, utilization, optimalUtilization);
        }

        // base + slope1 + slope2 * ((u - uOptimal) / (1 - uOptimal))
        uint256 excessUtilization = Math.mulDiv(utilization - optimalUtilization, WAD, WAD - optimalUtilization);
        return baseRatePerYear + slope1 + Math.mulDiv(slope2, excessUtilization, WAD);
    }
}
