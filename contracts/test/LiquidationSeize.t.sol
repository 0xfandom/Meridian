// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {Pool} from "../src/Pool.sol";
import {InterestRateModel} from "../src/InterestRateModel.sol";
import {CreditManager} from "../src/CreditManager.sol";
import {MarginAccount} from "../src/MarginAccount.sol";
import {RiskConfigurator} from "../src/RiskConfigurator.sol";
import {AccessController} from "../src/AccessController.sol";
import {LiquidationModule} from "../src/LiquidationModule.sol";
import {ILiquidationTarget} from "../src/interfaces/ILiquidationTarget.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockPriceOracle} from "./mocks/MockPriceOracle.sol";

/// @notice End-to-end liquidation against the real credit manager: an account is driven underwater
///         and a keeper liquidates it through the module, seizing collateral and making the pool whole.
contract LiquidationSeizeTest is Test {
    MockERC20 internal usd;
    MockERC20 internal weth;
    InterestRateModel internal irm;
    Pool internal pool;
    MockPriceOracle internal oracle;
    MarginAccount internal accountImpl;
    RiskConfigurator internal riskConfigurator;
    AccessController internal access;
    LiquidationModule internal module;
    CreditManager internal cm;

    address internal lp = makeAddr("lp");
    address internal borrower = makeAddr("borrower");
    address internal keeper = makeAddr("keeper");
    address internal sink = makeAddr("sink");

    function setUp() public {
        usd = new MockERC20("USD", "USD", 18);
        weth = new MockERC20("Wrapped Ether", "WETH", 18);
        irm = new InterestRateModel(0, 400, 6000, 8000);
        pool = new Pool(IERC20(address(usd)), irm, address(this), "Meridian USD Pool", "mUSD");
        oracle = new MockPriceOracle();
        oracle.setPrice(address(weth), 2e18);
        accountImpl = new MarginAccount();
        riskConfigurator = new RiskConfigurator(address(this));
        riskConfigurator.setCollateral(address(weth), 1500, 50_000); // haircut 15% -> LT 8500
        cm = new CreditManager(
            pool, IERC20(address(weth)), irm, oracle, riskConfigurator, address(accountImpl), address(this)
        );
        pool.setCreditManager(address(cm), true);

        access = new AccessController(address(this));
        module = new LiquidationModule(access, ILiquidationTarget(address(cm)), address(this));
        cm.setLiquidationModule(address(module));
        access.grantRole(AccessController.Role.Keeper, keeper);

        usd.mint(lp, 1000e18);
        vm.startPrank(lp);
        usd.approve(address(pool), type(uint256).max);
        pool.deposit(1000e18, lp);
        vm.stopPrank();

        weth.mint(borrower, 1000e18);
        vm.prank(borrower);
        weth.approve(address(cm), type(uint256).max);
    }

    function _openLeveraged() internal returns (address account) {
        // Open with 100 WETH collateral (200 USD) and an 800 USD borrow -> HF 1.0625.
        vm.prank(borrower);
        account = cm.openCreditAccount(100e18, 800e18, borrower);

        // Simulate deploying the borrowed USD into more WETH (a leveraged swap): move the 800 USD
        // out and credit 400 WETH in. The account now holds 500 WETH and no USD, same total value.
        vm.startPrank(address(cm));
        MarginAccount(account).transferToken(address(usd), sink, 800e18);
        vm.stopPrank();
        weth.mint(account, 400e18);
    }

    function test_KeeperLiquidatesUnderwaterAccountAndPoolIsWhole() public {
        address account = _openLeveraged();

        // WETH falls from 2.0 to 1.7: collateral 500 * 1.7 = 850 USD against 800 debt.
        // HF = 850 * 0.85 / 800 = 0.903 -> liquidatable, and collateral still exceeds the debt.
        oracle.setPrice(address(weth), 1.7e18);
        assertLt(cm.calcHealthFactor(account), 1e18);

        // Keeper funds the repayment (the account holds no USD after the swap).
        usd.mint(keeper, 800e18);
        vm.prank(keeper);
        usd.approve(address(cm), type(uint256).max);

        uint256 poolAssetsBefore = pool.totalAssets();

        vm.prank(keeper);
        module.liquidate(account);

        // Debt cleared and the pool's principal returned in full.
        assertEq(cm.calcDebt(account), 0);
        assertEq(pool.totalBorrowed(), 0);
        assertGe(pool.totalAssets(), poolAssetsBefore);

        // Keeper paid 800 USD and seized all 500 WETH (worth 850) -> ~50 USD incentive.
        assertEq(usd.balanceOf(keeper), 0);
        assertEq(weth.balanceOf(keeper), 500e18);

        // Account is closed.
        (,,, bool open) = cm.accounts(account);
        assertFalse(open);
    }

    function test_SelfFundedRepaymentNeedsNoKeeperCapital() public {
        // No leverage swap: the account keeps its 800 USD borrow.
        vm.prank(borrower);
        address account = cm.openCreditAccount(100e18, 800e18, borrower);

        // Drop WETH to 1.0: assets 100 + 800 = 900, HF = 900 * 0.85 / 800 = 0.956 -> liquidatable.
        oracle.setPrice(address(weth), 1e18);
        assertLt(cm.calcHealthFactor(account), 1e18);

        // Keeper holds no USD; the account's own balance covers the debt.
        vm.prank(keeper);
        module.liquidate(account);

        assertEq(cm.calcDebt(account), 0);
        assertEq(pool.totalBorrowed(), 0);
        assertEq(weth.balanceOf(keeper), 100e18); // seized collateral
        assertEq(usd.balanceOf(keeper), 0); // paid nothing
    }

    function test_DirectLiquidateRejectsNonModule() public {
        address account = _openLeveraged();
        oracle.setPrice(address(weth), 1.7e18);

        vm.prank(keeper);
        vm.expectRevert(CreditManager.NotLiquidator.selector);
        cm.liquidate(account, keeper);
    }

    function test_HealthyAccountCannotBeLiquidated() public {
        vm.prank(borrower);
        address account = cm.openCreditAccount(100e18, 400e18, borrower); // HF well above 1

        vm.prank(keeper);
        vm.expectRevert(LiquidationModule.NotLiquidatable.selector);
        module.liquidate(account);
    }
}
