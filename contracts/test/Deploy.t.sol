// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {DeployScript} from "../script/Deploy.s.sol";
import {Pool} from "../src/Pool.sol";
import {CreditManager} from "../src/CreditManager.sol";
import {AccessController} from "../src/AccessController.sol";
import {MockPriceOracle} from "./mocks/MockPriceOracle.sol";

/// @notice Runs the deployment script and asserts every wiring step was applied, so deployment
///         drift is caught by the contracts CI job.
contract DeployScriptTest is Test {
    address internal constant LOCAL_KEEPER = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;

    DeployScript.Deployment internal d;

    function setUp() public {
        d = new DeployScript().deployLocal();
    }

    function test_DeploysEveryContract() public view {
        assertTrue(d.usdc != address(0));
        assertTrue(d.weth != address(0));
        assertTrue(d.pool != address(0));
        assertTrue(d.creditManager != address(0));
        assertTrue(d.liquidationModule != address(0));
    }

    function test_PoolWiredToCreditManagerAndGuardian() public view {
        assertTrue(Pool(d.pool).isCreditManager(d.creditManager));
        assertEq(address(Pool(d.pool).guardian()), d.guardian);
    }

    function test_CreditManagerWiring() public view {
        CreditManager cm = CreditManager(d.creditManager);
        assertEq(cm.facade(), d.creditFacade);
        assertEq(address(cm.guardian()), d.guardian);
        assertEq(address(cm.whitelistRegistry()), d.whitelistRegistry);
        assertEq(address(cm.riskConfigurator()), d.riskConfigurator);
        assertEq(cm.liquidationModule(), d.liquidationModule);
    }

    function test_RiskParametersApplied() public view {
        // WETH haircut is 1000 bps, so the liquidation threshold is 10000 - 1000 = 9000.
        assertEq(CreditManager(d.creditManager).liquidationThresholdBps(), 9000);
        assertEq(MockPriceOracle(d.oracle).getPrice(d.weth), 2_000_000_000);
    }

    function test_KeeperRoleGranted() public view {
        assertTrue(AccessController(d.accessController).isKeeper(LOCAL_KEEPER));
    }
}
