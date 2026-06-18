// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

/// @title IGuardian
/// @notice View surface of the emergency pause authority consumed by protected contracts.
///         The pool and credit manager call `ensureNotPaused` to gate risk-increasing actions
///         while an incident is being handled.
interface IGuardian {
    /// @notice Whether the protocol is currently paused.
    function paused() external view returns (bool);

    /// @notice Reverts when the protocol is paused; otherwise returns normally.
    function ensureNotPaused() external view;
}
