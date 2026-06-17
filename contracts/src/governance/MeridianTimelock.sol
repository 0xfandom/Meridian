// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";

/// @title MeridianTimelock
/// @notice Timelock that gates every privileged protocol action behind a mandatory delay.
/// @dev A Safe multisig is configured as proposer and executor; the timelock owns the protocol's
///      admin roles, so parameter changes and upgrades are deliberate, queued, and publicly
///      visible before they take effect.
contract MeridianTimelock is TimelockController {
    constructor(uint256 minDelay, address[] memory proposers, address[] memory executors, address admin)
        TimelockController(minDelay, proposers, executors, admin)
    {}
}
