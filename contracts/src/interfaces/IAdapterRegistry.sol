// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

/// @title IAdapterRegistry
/// @notice View surface of the adapter allowlist consumed by the credit manager. Every routed
///         margin-account call other than a token approve must target an adapter registered here,
///         so an account can only ever invoke vetted adapter contracts.
interface IAdapterRegistry {
    /// @notice True when `adapter` is a registered, approved adapter.
    function isAdapter(address adapter) external view returns (bool);

    /// @notice The external protocol the adapter wraps, or the zero address when not registered.
    function adapterTarget(address adapter) external view returns (address);
}
