// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title Guardian
/// @notice Emergency pause authority. A fast guardian key can pause the protocol immediately,
///         while only governance (the timelock owner) can lift the pause.
/// @dev Deliberately asymmetric: pausing must be fast (one key) to stop an active incident,
///      but unpausing must be deliberate (governance) so a compromised guardian cannot resume a
///      paused system. Protected contracts call `ensureNotPaused` as a gate.
contract Guardian is Ownable {
    address public guardian;
    bool public paused;

    event Paused(address indexed by);
    event Unpaused(address indexed by);
    event GuardianSet(address indexed guardian);

    error ZeroAddress();
    error NotGuardian();
    error EnforcedPause();

    constructor(address owner_, address guardian_) Ownable(owner_) {
        if (guardian_ == address(0)) revert ZeroAddress();
        guardian = guardian_;
    }

    modifier onlyGuardian() {
        if (msg.sender != guardian) revert NotGuardian();
        _;
    }

    /// @notice Pauses the protocol. Guardian-only, for incident response.
    function pause() external onlyGuardian {
        paused = true;
        emit Paused(msg.sender);
    }

    /// @notice Lifts the pause. Governance-only.
    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused(msg.sender);
    }

    /// @notice Rotates the guardian key. Governance-only.
    function setGuardian(address guardian_) external onlyOwner {
        if (guardian_ == address(0)) revert ZeroAddress();
        guardian = guardian_;
        emit GuardianSet(guardian_);
    }

    /// @notice Reverts when the protocol is paused. Gate used by protected contracts.
    function ensureNotPaused() external view {
        if (paused) revert EnforcedPause();
    }
}
