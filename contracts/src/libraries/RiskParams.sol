// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

/// @title RiskParams
/// @notice Canonical risk-parameter schema shared by the on-chain RiskConfigurator
///         and the off-chain margin engine. Values originate from
///         `config/risk-params.json` and are expressed in basis points (10_000 = 100%).
///         Health factors use the same scale, where 10_000 represents a health factor of 1.0.
/// @dev Pure schema + validation. No storage; intended to be embedded by configuration
///      contracts and mirrored by the off-chain engine.
library RiskParams {
    /// @notice Basis-point denominator. 10_000 bps = 100%.
    uint256 internal constant BPS = 10_000;

    /// @notice Health-factor thresholds that drive UI warnings, margin calls, and liquidation.
    struct HealthThresholds {
        uint256 warningBps;
        uint256 marginCallBps;
        uint256 liquidationBps;
    }

    /// @notice Per-asset collateral configuration.
    struct Collateral {
        string symbol;
        uint256 haircutBps;
        uint256 maxLeverageBps;
    }

    /// @notice Utilization-driven interest-rate model parameters.
    struct InterestRateModel {
        uint256 baseRateBps;
        uint256 slope1Bps;
        uint256 slope2Bps;
        uint256 optimalUtilizationBps;
    }

    error InvalidThresholds();
    error InvalidCollateral();
    error InvalidInterestRateModel();

    /// @notice Reverts unless warning > marginCall > liquidation and liquidation is at least 1.0.
    function validateThresholds(HealthThresholds memory t) internal pure {
        bool ordered = t.warningBps > t.marginCallBps && t.marginCallBps > t.liquidationBps;
        if (!ordered || t.liquidationBps < BPS) {
            revert InvalidThresholds();
        }
    }

    /// @notice Reverts unless the haircut is within (0, 100%) and leverage is at least 1x.
    function validateCollateral(Collateral memory c) internal pure {
        if (c.haircutBps == 0 || c.haircutBps >= BPS || c.maxLeverageBps < BPS) {
            revert InvalidCollateral();
        }
    }

    /// @notice Reverts unless optimal utilization is within (0, 100%) and slope2 exceeds slope1.
    function validateInterestRateModel(InterestRateModel memory m) internal pure {
        bool optimalInRange = m.optimalUtilizationBps > 0 && m.optimalUtilizationBps < BPS;
        if (!optimalInRange || m.slope2Bps <= m.slope1Bps) {
            revert InvalidInterestRateModel();
        }
    }
}
