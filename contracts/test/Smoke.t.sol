// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {DeployScript} from "../script/Deploy.s.sol";
import {Pool} from "../src/Pool.sol";
import {CreditManager} from "../src/CreditManager.sol";
import {LiquidationModule} from "../src/LiquidationModule.sol";
import {UniswapV3Adapter} from "../src/adapters/UniswapV3Adapter.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockPriceOracle} from "./mocks/MockPriceOracle.sol";

/// @notice Post-deploy smoke: drives the full lever-then-liquidate lifecycle against the exact
///         contracts the deploy script wires, proving a fresh local deployment liquidates end to end
///         and the pool is made whole. This is the local stand-in for the testnet liquidation gate;
///         it exercises the real deployed wiring rather than a hand-built fixture.
contract SmokeTest is Test {
    // The deploy grants the keeper role to this well-known anvil account (script/config/local.json).
    address internal constant KEEPER = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;
    uint24 internal constant FEE = 500;
    uint256 internal constant CRASH_PRICE = 800_000_000; // 800 USDC/WETH, below the liquidation floor

    DeployScript.Deployment internal d;
    address internal lp = makeAddr("lp");
    address internal borrower = makeAddr("borrower");

    function setUp() public {
        d = new DeployScript().deployLocal();
    }

    function test_LeverThenLiquidateAgainstDeploy() public {
        Pool pool = Pool(d.pool);
        CreditManager cm = CreditManager(d.creditManager);

        // LP seeds pool liquidity.
        MockERC20(d.usdc).mint(lp, 100_000e6);
        vm.startPrank(lp);
        IERC20(d.usdc).approve(d.pool, type(uint256).max);
        pool.deposit(100_000e6, lp);
        vm.stopPrank();

        // Borrower funds WETH collateral, opens a leveraged account, and levers up by swapping the
        // borrowed USDC into WETH through the whitelisted adapter via the gated multicall.
        MockERC20(d.weth).mint(borrower, 10e18);
        vm.startPrank(borrower);
        IERC20(d.weth).approve(d.creditManager, type(uint256).max);
        address account = cm.openCreditAccount(10e18, 20_000e6, borrower);

        CreditManager.MultiCall[] memory calls = new CreditManager.MultiCall[](2);
        calls[0] = CreditManager.MultiCall({
            target: d.usdc, callData: abi.encodeCall(IERC20.approve, (d.swapAdapter, 20_000e6))
        });
        calls[1] = CreditManager.MultiCall({
            target: d.swapAdapter,
            callData: abi.encodeCall(UniswapV3Adapter.swapExactInputSingle, (d.usdc, d.weth, FEE, 20_000e6, 0))
        });
        cm.multicall(account, calls);
        vm.stopPrank();

        uint256 seized = IERC20(d.weth).balanceOf(account);
        assertEq(IERC20(d.usdc).balanceOf(account), 0, "USDC fully swapped");
        assertGt(seized, 10e18, "position levered up");
        assertGt(cm.calcHealthFactor(account), 1e18, "healthy after lever");

        // Price crash drives the account below the liquidation floor.
        MockPriceOracle(d.oracle).setPrice(d.weth, CRASH_PRICE);
        assertLt(cm.calcHealthFactor(account), 1e18, "underwater after crash");

        // Keeper funds the repayment (the account holds no USDC) and liquidates through the module.
        MockERC20(d.usdc).mint(KEEPER, 20_000e6);
        vm.startPrank(KEEPER);
        IERC20(d.usdc).approve(d.creditManager, type(uint256).max);
        LiquidationModule(d.liquidationModule).liquidate(account);
        vm.stopPrank();

        // Pool made whole, debt cleared, keeper holds the seized collateral, account closed.
        assertEq(cm.calcDebt(account), 0, "debt cleared");
        assertEq(pool.totalBorrowed(), 0, "pool borrowings cleared");
        assertEq(IERC20(d.weth).balanceOf(KEEPER), seized, "keeper seized the WETH");
        assertGe(pool.totalAssets(), 100_000e6, "pool made whole");
        (,,, bool open) = cm.accounts(account);
        assertFalse(open, "account closed");
    }
}
