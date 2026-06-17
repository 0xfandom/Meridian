// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {WhitelistRegistry} from "../src/WhitelistRegistry.sol";
import {AccessController} from "../src/AccessController.sol";
import {LiquidationModule} from "../src/LiquidationModule.sol";
import {ILiquidationTarget} from "../src/interfaces/ILiquidationTarget.sol";
import {MockLiquidationTarget} from "./mocks/MockLiquidationTarget.sol";

contract WhitelistRegistryTest is Test {
    WhitelistRegistry internal registry;
    address internal target = makeAddr("target");
    bytes4 internal constant SELECTOR = bytes4(keccak256("swap(uint256)"));

    function setUp() public {
        registry = new WhitelistRegistry(address(this));
    }

    function test_RequiresBothTargetAndSelector() public {
        assertFalse(registry.isAllowed(target, SELECTOR));

        registry.setTarget(target, true);
        assertFalse(registry.isAllowed(target, SELECTOR)); // target alone is not enough

        registry.setSelector(target, SELECTOR, true);
        assertTrue(registry.isAllowed(target, SELECTOR));
    }

    function test_DisablingTargetRevokesAccess() public {
        registry.setTarget(target, true);
        registry.setSelector(target, SELECTOR, true);
        registry.setTarget(target, false);
        assertFalse(registry.isAllowed(target, SELECTOR));
    }

    function test_OnlyOwnerCanConfigure() public {
        vm.prank(makeAddr("intruder"));
        vm.expectRevert();
        registry.setTarget(target, true);
    }
}

contract AccessControllerTest is Test {
    AccessController internal access;
    address internal user = makeAddr("user");

    function setUp() public {
        access = new AccessController(address(this));
    }

    function test_GrantAndRevoke() public {
        assertFalse(access.isBorrower(user));
        access.grantRole(AccessController.Role.Borrower, user);
        assertTrue(access.isBorrower(user));
        access.revokeRole(AccessController.Role.Borrower, user);
        assertFalse(access.isBorrower(user));
    }

    function test_OpenModeGrantsToEveryone() public {
        assertFalse(access.isLender(user));
        access.setOpenMode(AccessController.Role.Lender, true);
        assertTrue(access.isLender(user));
        assertTrue(access.isLender(makeAddr("anyone")));
    }

    function test_OnlyOwnerCanGrant() public {
        vm.prank(makeAddr("intruder"));
        vm.expectRevert();
        access.grantRole(AccessController.Role.Keeper, user);
    }
}

contract LiquidationModuleTest is Test {
    AccessController internal access;
    MockLiquidationTarget internal manager;
    LiquidationModule internal module;

    address internal keeper = makeAddr("keeper");
    address internal account = makeAddr("account");

    function setUp() public {
        access = new AccessController(address(this));
        manager = new MockLiquidationTarget();
        module = new LiquidationModule(access, ILiquidationTarget(address(manager)), address(this));
        access.grantRole(AccessController.Role.Keeper, keeper);
    }

    function test_NonKeeperCannotLiquidate() public {
        manager.setHealth(account, 0.9e18);
        vm.prank(makeAddr("intruder"));
        vm.expectRevert(LiquidationModule.NotKeeper.selector);
        module.liquidate(account);
    }

    function test_HealthyAccountIsNotLiquidatable() public {
        manager.setHealth(account, 1.2e18);
        vm.prank(keeper);
        vm.expectRevert(LiquidationModule.NotLiquidatable.selector);
        module.liquidate(account);
    }

    function test_KeeperLiquidatesUnhealthyAccount() public {
        manager.setHealth(account, 0.95e18);
        vm.prank(keeper);
        module.liquidate(account);

        assertEq(manager.lastLiquidatedAccount(), account);
        assertEq(manager.lastLiquidator(), keeper);
    }

    function test_BoundaryAtExactlyOneIsNotLiquidatable() public {
        manager.setHealth(account, 1e18);
        vm.prank(keeper);
        vm.expectRevert(LiquidationModule.NotLiquidatable.selector);
        module.liquidate(account);
    }
}
