// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MeridianTimelock} from "../src/governance/MeridianTimelock.sol";
import {Guardian} from "../src/governance/Guardian.sol";

contract GuardianTest is Test {
    Guardian internal guard;
    address internal guardianKey = makeAddr("guardian");
    address internal governance = makeAddr("governance");

    function setUp() public {
        guard = new Guardian(governance, guardianKey);
    }

    function test_GuardianCanPause() public {
        vm.prank(guardianKey);
        guard.pause();
        assertTrue(guard.paused());

        vm.expectRevert(Guardian.EnforcedPause.selector);
        guard.ensureNotPaused();
    }

    function test_NonGuardianCannotPause() public {
        vm.prank(makeAddr("intruder"));
        vm.expectRevert(Guardian.NotGuardian.selector);
        guard.pause();
    }

    function test_OnlyGovernanceCanUnpause() public {
        vm.prank(guardianKey);
        guard.pause();

        // Guardian cannot unpause.
        vm.prank(guardianKey);
        vm.expectRevert();
        guard.unpause();

        // Governance can.
        vm.prank(governance);
        guard.unpause();
        assertFalse(guard.paused());
        guard.ensureNotPaused();
    }

    function test_OnlyGovernanceRotatesGuardian() public {
        address newGuardian = makeAddr("newGuardian");
        vm.prank(governance);
        guard.setGuardian(newGuardian);
        assertEq(guard.guardian(), newGuardian);
    }
}

contract MeridianTimelockTest is Test {
    MeridianTimelock internal timelock;
    Guardian internal guard;

    uint256 internal constant DELAY = 2 days;
    address internal multisig = makeAddr("multisig");

    function setUp() public {
        address[] memory proposers = new address[](1);
        address[] memory executors = new address[](1);
        proposers[0] = multisig;
        executors[0] = multisig;
        timelock = new MeridianTimelock(DELAY, proposers, executors, address(0));

        // Guardian is owned by the timelock, so privileged changes flow through governance.
        guard = new Guardian(address(timelock), makeAddr("guardian"));
    }

    function test_ScheduledActionExecutesOnlyAfterDelay() public {
        address newGuardian = makeAddr("newGuardian");
        bytes memory data = abi.encodeCall(Guardian.setGuardian, (newGuardian));

        vm.prank(multisig);
        timelock.schedule(address(guard), 0, data, bytes32(0), bytes32(0), DELAY);

        // Too early.
        vm.prank(multisig);
        vm.expectRevert();
        timelock.execute(address(guard), 0, data, bytes32(0), bytes32(0));

        // After the delay it executes and the guardian rotates.
        vm.warp(block.timestamp + DELAY);
        vm.prank(multisig);
        timelock.execute(address(guard), 0, data, bytes32(0), bytes32(0));

        assertEq(guard.guardian(), newGuardian);
    }

    function test_MinDelayIsEnforced() public view {
        assertEq(timelock.getMinDelay(), DELAY);
    }
}
