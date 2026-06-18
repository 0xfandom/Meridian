// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {Pool} from "../src/Pool.sol";
import {InterestRateModel} from "../src/InterestRateModel.sol";
import {CreditManager} from "../src/CreditManager.sol";
import {MarginAccount} from "../src/MarginAccount.sol";
import {RiskConfigurator} from "../src/RiskConfigurator.sol";
import {WhitelistRegistry} from "../src/WhitelistRegistry.sol";
import {AccessController} from "../src/AccessController.sol";
import {LiquidationModule} from "../src/LiquidationModule.sol";
import {UniswapV3Adapter} from "../src/adapters/UniswapV3Adapter.sol";
import {IUniswapV3SwapRouter} from "../src/interfaces/IUniswapV3SwapRouter.sol";
import {IWhitelistRegistry} from "../src/interfaces/IWhitelistRegistry.sol";
import {ILiquidationTarget} from "../src/interfaces/ILiquidationTarget.sol";
import {MockPriceOracle} from "./mocks/MockPriceOracle.sol";

/// @notice Full-stack proof on a mainnet fork: a borrower opens a credit account, levers up by
///         swapping the borrowed USDC into WETH through the whitelisted Uniswap adapter via
///         multicall, is then driven underwater by a price move, and is liquidated by a keeper
///         through the module. Verifies the pool is made whole and the position is seized.
///         Self-skips without an RPC so CI stays green.
contract LeverageLiquidationForkTest is Test {
    address internal constant USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
    address internal constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    address internal constant SWAP_ROUTER = 0xE592427A0AEce92De3Edee1F18E0157C05861564;
    uint24 internal constant FEE = 500;

    // WETH collateral priced in USDC's 6-decimal unit of account.
    uint256 internal constant PRICE_HEALTHY = 5000e6; // keeps the levered position solvent
    uint256 internal constant PRICE_CRASH = 500e6; // forces the health factor below 1

    bool internal forked;

    Pool internal pool;
    CreditManager internal cm;
    MockPriceOracle internal oracle;
    RiskConfigurator internal riskConfigurator;
    WhitelistRegistry internal whitelist;
    AccessController internal access;
    LiquidationModule internal module;
    UniswapV3Adapter internal adapter;

    address internal lp = makeAddr("lp");
    address internal borrower = makeAddr("borrower");
    address internal keeper = makeAddr("keeper");

    function setUp() public {
        string memory rpc = vm.envOr("MAINNET_RPC_URL", string(""));
        if (bytes(rpc).length == 0) return;
        vm.createSelectFork(rpc);
        forked = true;

        InterestRateModel irm = new InterestRateModel(0, 400, 6000, 8000);
        pool = new Pool(IERC20(USDC), irm, address(this), "Meridian USDC Pool", "mUSDC");
        oracle = new MockPriceOracle();
        oracle.setPrice(WETH, PRICE_HEALTHY);
        riskConfigurator = new RiskConfigurator(address(this));
        riskConfigurator.setCollateral(WETH, 1500, 50_000); // 15% haircut -> 8500 liquidation threshold
        MarginAccount accountImpl = new MarginAccount();
        cm = new CreditManager(pool, IERC20(WETH), irm, oracle, riskConfigurator, address(accountImpl), address(this));
        pool.setCreditManager(address(cm), true);

        adapter = new UniswapV3Adapter(IUniswapV3SwapRouter(SWAP_ROUTER));
        whitelist = new WhitelistRegistry(address(this));
        whitelist.setTarget(USDC, true);
        whitelist.setSelector(USDC, IERC20.approve.selector, true);
        whitelist.setTarget(address(adapter), true);
        whitelist.setSelector(address(adapter), UniswapV3Adapter.swapExactInputSingle.selector, true);
        cm.setWhitelistRegistry(IWhitelistRegistry(address(whitelist)));

        access = new AccessController(address(this));
        module = new LiquidationModule(access, ILiquidationTarget(address(cm)), address(this));
        cm.setLiquidationModule(address(module));
        access.grantRole(AccessController.Role.Keeper, keeper);

        // LP supplies pool liquidity.
        deal(USDC, lp, 100_000e6);
        vm.startPrank(lp);
        IERC20(USDC).approve(address(pool), type(uint256).max);
        pool.deposit(100_000e6, lp);
        vm.stopPrank();

        // Borrower funds collateral.
        deal(WETH, borrower, 10e18);
        vm.prank(borrower);
        IERC20(WETH).approve(address(cm), type(uint256).max);
    }

    function test_LeverageThenLiquidate() public {
        if (!forked) {
            vm.skip(true);
            return;
        }

        // Open: 10 WETH collateral, borrow 40k USDC.
        vm.prank(borrower);
        address account = cm.openCreditAccount(10e18, 40_000e6, borrower);
        assertEq(IERC20(USDC).balanceOf(account), 40_000e6);

        // Lever up: approve the adapter and swap the borrowed USDC into WETH, both routed through
        // the account by multicall and gated by the whitelist. Ends with a single health check.
        CreditManager.MultiCall[] memory calls = new CreditManager.MultiCall[](2);
        calls[0] = CreditManager.MultiCall({
            target: USDC, callData: abi.encodeCall(IERC20.approve, (address(adapter), 40_000e6))
        });
        calls[1] = CreditManager.MultiCall({
            target: address(adapter),
            callData: abi.encodeCall(UniswapV3Adapter.swapExactInputSingle, (USDC, WETH, FEE, 40_000e6, 0))
        });
        vm.prank(borrower);
        cm.multicall(account, calls);

        // The borrowed USDC is now WETH held by the account.
        assertEq(IERC20(USDC).balanceOf(account), 0);
        uint256 seizedWeth = IERC20(WETH).balanceOf(account);
        assertGt(seizedWeth, 10e18);
        assertGt(cm.calcHealthFactor(account), 1e18);

        // Price crash pushes the account below the liquidation floor.
        oracle.setPrice(WETH, PRICE_CRASH);
        assertLt(cm.calcHealthFactor(account), 1e18);

        // Keeper funds the repayment (the account holds no USDC after the swap).
        deal(USDC, keeper, 40_000e6);
        vm.prank(keeper);
        IERC20(USDC).approve(address(cm), type(uint256).max);

        vm.prank(keeper);
        module.liquidate(account);

        // Pool made whole, debt cleared, keeper holds the seized WETH, account closed.
        assertEq(cm.calcDebt(account), 0);
        assertEq(pool.totalBorrowed(), 0);
        assertEq(IERC20(WETH).balanceOf(keeper), seizedWeth);
        assertEq(IERC20(USDC).balanceOf(keeper), 0);
        assertGe(pool.totalAssets(), 100_000e6);
        (,,, bool open) = cm.accounts(account);
        assertFalse(open);
    }
}
