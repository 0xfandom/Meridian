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

    function test_LinkMarketDeployedAndWired() public view {
        // A distinct collateral and credit market from WETH, sharing the one USDC pool.
        assertTrue(d.link != address(0) && d.link != d.weth);
        assertTrue(d.linkCreditManager != address(0) && d.linkCreditManager != d.creditManager);
        assertTrue(Pool(d.pool).isCreditManager(d.linkCreditManager));

        CreditManager cm = CreditManager(d.linkCreditManager);
        assertEq(cm.facade(), d.linkCreditFacade);
        assertEq(cm.liquidationModule(), d.linkLiquidationModule);
        assertEq(address(cm.guardian()), d.guardian);
        assertEq(address(cm.whitelistRegistry()), d.whitelistRegistry);
        // LINK haircut is 2000 bps, so the liquidation threshold is 10000 - 2000 = 8000.
        assertEq(cm.liquidationThresholdBps(), 8000);
        assertEq(MockPriceOracle(d.oracle).getPrice(d.link), 8_000_000);
    }

    /// @notice The manifest round-trips: writing it and parsing it back yields the same addresses and
    ///         chain metadata the services need to start with no manual address entry.
    function test_ManifestRoundTrips() public {
        DeployScript script = new DeployScript();
        string memory network = "manifest-test";
        string memory path = string.concat("deployments/", network, ".json");

        script.writeManifest(network, d, 1234);

        string memory json = vm.readFile(path);
        assertEq(vm.parseJsonUint(json, ".chainId"), block.chainid);
        assertEq(vm.parseJsonUint(json, ".startBlock"), 1234);
        assertEq(vm.parseJsonAddress(json, ".pool"), d.pool);
        assertEq(vm.parseJsonAddress(json, ".creditManager"), d.creditManager);
        assertEq(vm.parseJsonAddress(json, ".liquidationModule"), d.liquidationModule);

        // The markets array carries every market as real JSON objects.
        assertEq(vm.parseJsonString(json, ".markets[0].symbol"), "WETH");
        assertEq(vm.parseJsonAddress(json, ".markets[0].creditManager"), d.creditManager);
        assertEq(vm.parseJsonString(json, ".markets[1].symbol"), "LINK");
        assertEq(vm.parseJsonAddress(json, ".markets[1].creditManager"), d.linkCreditManager);
        assertEq(vm.parseJsonAddress(json, ".markets[1].collateralToken"), d.link);

        vm.removeFile(path);
    }
}
