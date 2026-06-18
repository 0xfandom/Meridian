// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

/// @title IWhitelistRegistry
/// @notice View surface of the call allowlist consumed by the credit manager. Each multicall
///         routed through a margin account is checked against this so an account can only ever
///         touch sanctioned targets and function selectors.
interface IWhitelistRegistry {
    /// @notice True only when both the target and the exact selector are enabled.
    function isAllowed(address target, bytes4 selector) external view returns (bool);
}
