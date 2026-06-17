// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {RiskParams} from "./libraries/RiskParams.sol";

/// @title RiskConfigurator
/// @notice On-chain store of risk parameters consumed by the credit system: per-collateral
///         haircuts and leverage caps, the health-factor thresholds, and the interest-rate
///         model curve. Every setter validates against the RiskParams invariants.
/// @dev Owned by governance (a timelock in production), so parameter changes are deliberate
///      and auditable.
contract RiskConfigurator is Ownable {
    struct CollateralConfig {
        uint256 haircutBps;
        uint256 maxLeverageBps;
        bool supported;
    }

    RiskParams.HealthThresholds public thresholds;
    RiskParams.InterestRateModel public interestRateModel;
    mapping(address token => CollateralConfig config) public collateral;

    event ThresholdsSet(uint256 warningBps, uint256 marginCallBps, uint256 liquidationBps);
    event InterestRateModelSet(uint256 baseRateBps, uint256 slope1Bps, uint256 slope2Bps, uint256 optimalUtilBps);
    event CollateralSet(address indexed token, uint256 haircutBps, uint256 maxLeverageBps);
    event CollateralRemoved(address indexed token);

    error ZeroAddress();
    error UnsupportedCollateral();

    constructor(address owner_) Ownable(owner_) {}

    function setThresholds(RiskParams.HealthThresholds calldata thresholds_) external onlyOwner {
        RiskParams.validateThresholds(thresholds_);
        thresholds = thresholds_;
        emit ThresholdsSet(thresholds_.warningBps, thresholds_.marginCallBps, thresholds_.liquidationBps);
    }

    function setInterestRateModel(RiskParams.InterestRateModel calldata model) external onlyOwner {
        RiskParams.validateInterestRateModel(model);
        interestRateModel = model;
        emit InterestRateModelSet(model.baseRateBps, model.slope1Bps, model.slope2Bps, model.optimalUtilizationBps);
    }

    function setCollateral(address token, uint256 haircutBps, uint256 maxLeverageBps) external onlyOwner {
        if (token == address(0)) revert ZeroAddress();
        RiskParams.validateCollateral(
            RiskParams.Collateral({symbol: "", haircutBps: haircutBps, maxLeverageBps: maxLeverageBps})
        );
        collateral[token] = CollateralConfig({haircutBps: haircutBps, maxLeverageBps: maxLeverageBps, supported: true});
        emit CollateralSet(token, haircutBps, maxLeverageBps);
    }

    function removeCollateral(address token) external onlyOwner {
        delete collateral[token];
        emit CollateralRemoved(token);
    }

    /// @notice Haircut for a supported collateral, in basis points.
    function haircutBps(address token) external view returns (uint256) {
        CollateralConfig memory config = collateral[token];
        if (!config.supported) revert UnsupportedCollateral();
        return config.haircutBps;
    }

    /// @notice Maximum leverage for a supported collateral, in basis points.
    function maxLeverageBps(address token) external view returns (uint256) {
        CollateralConfig memory config = collateral[token];
        if (!config.supported) revert UnsupportedCollateral();
        return config.maxLeverageBps;
    }

    function isSupported(address token) external view returns (bool) {
        return collateral[token].supported;
    }
}
