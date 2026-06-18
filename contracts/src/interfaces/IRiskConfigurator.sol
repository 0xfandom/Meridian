// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

/// @title IRiskConfigurator
/// @notice Minimal view surface of the on-chain risk-parameter store consumed by the credit
///         system. The credit manager reads per-collateral haircuts to derive the liquidation
///         loan-to-value applied in health-factor checks, replacing a fixed deploy-time constant
///         with a governance-controlled parameter.
interface IRiskConfigurator {
    /// @notice Haircut applied to a supported collateral, in basis points (10_000 = 100%).
    /// @dev Reverts if the token is not a supported collateral.
    function haircutBps(address token) external view returns (uint256);

    /// @notice Maximum leverage for a supported collateral, in basis points (10_000 = 1x).
    function maxLeverageBps(address token) external view returns (uint256);

    /// @notice Whether a collateral token is configured and usable.
    function isSupported(address token) external view returns (bool);
}
