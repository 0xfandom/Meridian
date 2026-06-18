// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PoolFactory} from "../src/PoolFactory.sol";
import {CreditManagerFactory} from "../src/CreditManagerFactory.sol";
import {Pool} from "../src/Pool.sol";
import {CreditManager} from "../src/CreditManager.sol";
import {InterestRateModel} from "../src/InterestRateModel.sol";
import {IInterestRateModel} from "../src/interfaces/IInterestRateModel.sol";
import {IPool} from "../src/interfaces/IPool.sol";
import {IPriceOracle} from "../src/interfaces/IPriceOracle.sol";
import {IRiskConfigurator} from "../src/interfaces/IRiskConfigurator.sol";
import {RiskConfigurator} from "../src/RiskConfigurator.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

contract PoolFactoryTest is Test {
    PoolFactory internal factory;
    MockERC20 internal asset;
    InterestRateModel internal irm;

    function setUp() public {
        factory = new PoolFactory(address(this));
        asset = new MockERC20("USD Coin", "USDC", 6);
        irm = new InterestRateModel(0, 400, 6000, 8000);
    }

    function test_CreatePoolDeploysAndRegisters() public {
        address pool = factory.createPool(IERC20(address(asset)), irm, address(this), "Meridian USDC", "mUSDC");
        assertEq(factory.poolsLength(), 1);
        assertEq(factory.pools(0), pool);
        assertEq(Pool(pool).asset(), address(asset));
    }

    function test_OnlyOwnerCanCreate() public {
        vm.prank(makeAddr("intruder"));
        vm.expectRevert();
        factory.createPool(IERC20(address(asset)), irm, address(this), "x", "x");
    }
}

contract CreditManagerFactoryTest is Test {
    CreditManagerFactory internal factory;
    Pool internal pool;
    MockERC20 internal collateral;
    InterestRateModel internal irm;
    RiskConfigurator internal riskConfigurator;

    function setUp() public {
        MockERC20 asset = new MockERC20("USD Coin", "USDC", 6);
        irm = new InterestRateModel(0, 400, 6000, 8000);
        pool = new Pool(IERC20(address(asset)), irm, address(this), "Meridian USDC", "mUSDC");
        collateral = new MockERC20("Wrapped Ether", "WETH", 18);
        riskConfigurator = new RiskConfigurator(address(this));
        riskConfigurator.setCollateral(address(collateral), 1500, 50_000);
        factory = new CreditManagerFactory(address(this));
    }

    function test_DeploysSharedAccountImplementation() public view {
        assertTrue(factory.accountImplementation() != address(0));
    }

    function test_CreateCreditManagerDeploysAndWires() public {
        address cm = factory.createCreditManager(
            IPool(address(pool)),
            IERC20(address(collateral)),
            irm,
            IPriceOracle(makeAddr("oracle")),
            IRiskConfigurator(address(riskConfigurator)),
            address(this)
        );
        assertEq(factory.creditManagersLength(), 1);
        assertEq(address(CreditManager(cm).pool()), address(pool));
        assertEq(address(CreditManager(cm).accountImplementation()), factory.accountImplementation());
    }

    function test_OnlyOwnerCanCreate() public {
        vm.prank(makeAddr("intruder"));
        vm.expectRevert();
        factory.createCreditManager(
            IPool(address(pool)),
            IERC20(address(collateral)),
            irm,
            IPriceOracle(makeAddr("o")),
            IRiskConfigurator(address(riskConfigurator)),
            address(this)
        );
    }
}
