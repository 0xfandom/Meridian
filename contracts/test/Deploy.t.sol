// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {DeployScript} from "../script/Deploy.s.sol";
import {Pool} from "../src/Pool.sol";
import {CreditManager} from "../src/CreditManager.sol";
import {AccessController} from "../src/AccessController.sol";
import {AdapterRegistry} from "../src/AdapterRegistry.sol";
import {WhitelistRegistry} from "../src/WhitelistRegistry.sol";
import {CurveAdapter} from "../src/adapters/CurveAdapter.sol";
import {LstAdapter} from "../src/adapters/LstAdapter.sol";
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

    function test_BasketMarketDeployedAndWired() public view {
        // A distinct credit market that accepts BOTH WETH (primary) and LINK as collateral.
        assertTrue(d.basketCreditManager != address(0));
        assertTrue(d.basketCreditManager != d.creditManager && d.basketCreditManager != d.linkCreditManager);
        assertTrue(Pool(d.pool).isCreditManager(d.basketCreditManager));

        CreditManager cm = CreditManager(d.basketCreditManager);
        assertEq(cm.facade(), d.basketCreditFacade);
        assertEq(cm.liquidationModule(), d.basketLiquidationModule);
        assertEq(address(cm.guardian()), d.guardian);
        assertEq(address(cm.whitelistRegistry()), d.whitelistRegistry);

        // Both collaterals are registered; WETH is the primary, LINK was added.
        assertEq(address(cm.collateralToken()), d.weth);
        assertTrue(cm.isCollateral(d.weth));
        assertTrue(cm.isCollateral(d.link));
        address[] memory set = cm.collateralTokensList();
        assertEq(set.length, 2);
    }

    function test_AdapterRegistryWiredAsGate() public view {
        assertTrue(d.adapterRegistry != address(0));
        // Every credit manager consults the shared adapter registry.
        assertEq(address(CreditManager(d.creditManager).adapterRegistry()), d.adapterRegistry);
        assertEq(address(CreditManager(d.linkCreditManager).adapterRegistry()), d.adapterRegistry);
        // Each market's swap adapter is registered against the router it wraps.
        AdapterRegistry registry = AdapterRegistry(d.adapterRegistry);
        assertTrue(registry.isAdapter(d.swapAdapter));
        assertEq(registry.adapterTarget(d.swapAdapter), d.swapRouter);
        assertTrue(registry.isAdapter(d.linkSwapAdapter));
        assertEq(registry.adapterTarget(d.linkSwapAdapter), d.linkSwapRouter);
    }

    function test_CurveAdapterDeployedWiredAndRegistered() public view {
        assertTrue(d.curveAdapter != address(0) && d.curvePool != address(0) && d.curveLp != address(0));

        // Registered against the (mock) pool it wraps, so it clears the adapter gate.
        AdapterRegistry registry = AdapterRegistry(d.adapterRegistry);
        assertTrue(registry.isAdapter(d.curveAdapter));
        assertEq(registry.adapterTarget(d.curveAdapter), d.curvePool);

        // Its liquidity selectors and the LP-token approve leg are whitelisted.
        WhitelistRegistry whitelist = WhitelistRegistry(d.whitelistRegistry);
        assertTrue(whitelist.isAllowed(d.curveAdapter, CurveAdapter.addLiquidity.selector));
        assertTrue(whitelist.isAllowed(d.curveAdapter, CurveAdapter.removeLiquidityOneCoin.selector));
        assertTrue(whitelist.allowedTarget(d.curveLp));
    }

    function test_LstAdapterDeployedWiredAndRegistered() public view {
        assertTrue(d.lstAdapter != address(0) && d.steth != address(0) && d.wsteth != address(0));

        // Registered against the wrapper it wraps into, so it clears the adapter gate.
        AdapterRegistry registry = AdapterRegistry(d.adapterRegistry);
        assertTrue(registry.isAdapter(d.lstAdapter));
        assertEq(registry.adapterTarget(d.lstAdapter), d.wsteth);

        // wrap/unwrap and both approve legs are whitelisted.
        WhitelistRegistry whitelist = WhitelistRegistry(d.whitelistRegistry);
        assertTrue(whitelist.isAllowed(d.lstAdapter, LstAdapter.wrap.selector));
        assertTrue(whitelist.isAllowed(d.lstAdapter, LstAdapter.unwrap.selector));
        assertTrue(whitelist.allowedTarget(d.steth));
        assertTrue(whitelist.allowedTarget(d.wsteth));
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

        // The basket market is carried under its own key with a collateral set of WETH + LINK.
        assertEq(vm.parseJsonAddress(json, ".basketMarket.creditManager"), d.basketCreditManager);
        assertEq(vm.parseJsonAddress(json, ".basketMarket.primaryCollateral"), d.weth);
        assertEq(vm.parseJsonString(json, ".basketMarket.collaterals[0].symbol"), "WETH");
        assertEq(vm.parseJsonAddress(json, ".basketMarket.collaterals[0].collateralToken"), d.weth);
        assertEq(vm.parseJsonString(json, ".basketMarket.collaterals[1].symbol"), "LINK");
        assertEq(vm.parseJsonAddress(json, ".basketMarket.collaterals[1].collateralToken"), d.link);

        // Shared periphery adapters are carried so the services can read them.
        assertEq(vm.parseJsonAddress(json, ".adapterRegistry"), d.adapterRegistry);
        assertEq(vm.parseJsonAddress(json, ".curveAdapter"), d.curveAdapter);
        assertEq(vm.parseJsonAddress(json, ".lstAdapter"), d.lstAdapter);

        vm.removeFile(path);
    }
}
