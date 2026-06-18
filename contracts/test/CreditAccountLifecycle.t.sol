// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {Pool} from "../src/Pool.sol";
import {InterestRateModel} from "../src/InterestRateModel.sol";
import {CreditManager} from "../src/CreditManager.sol";
import {CreditFacade} from "../src/CreditFacade.sol";
import {MarginAccount} from "../src/MarginAccount.sol";
import {RiskConfigurator} from "../src/RiskConfigurator.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockPriceOracle} from "./mocks/MockPriceOracle.sol";

contract CreditAccountLifecycleTest is Test {
    MockERC20 internal usd; // underlying / unit of account (18dp)
    MockERC20 internal weth; // collateral (18dp)
    InterestRateModel internal irm;
    Pool internal pool;
    MockPriceOracle internal oracle;
    MarginAccount internal accountImpl;
    RiskConfigurator internal riskConfigurator;
    CreditManager internal cm;
    CreditFacade internal facade;

    address internal lp = makeAddr("lp");
    address internal borrower = makeAddr("borrower");

    uint256 internal constant WETH_PRICE = 2e18; // 2 USD per WETH
    uint256 internal constant LT_BPS = 8500;
    uint256 internal constant WETH_HAIRCUT_BPS = 1500; // 10_000 - LT_BPS
    uint256 internal constant WETH_MAX_LEVERAGE_BPS = 50_000; // 5x

    function setUp() public {
        usd = new MockERC20("USD", "USD", 18);
        weth = new MockERC20("Wrapped Ether", "WETH", 18);
        irm = new InterestRateModel(0, 400, 6000, 8000);
        pool = new Pool(IERC20(address(usd)), irm, address(this), "Meridian USD Pool", "mUSD");
        oracle = new MockPriceOracle();
        oracle.setPrice(address(weth), WETH_PRICE);
        accountImpl = new MarginAccount();
        riskConfigurator = new RiskConfigurator(address(this));
        riskConfigurator.setCollateral(address(weth), WETH_HAIRCUT_BPS, WETH_MAX_LEVERAGE_BPS);
        cm = new CreditManager(
            pool, IERC20(address(weth)), irm, oracle, riskConfigurator, address(accountImpl), address(this)
        );
        pool.setCreditManager(address(cm), true);
        facade = new CreditFacade(cm);
        cm.setFacade(address(facade));

        // Seed pool liquidity so that an 800 borrow sits at 80% utilization.
        usd.mint(lp, 1000e18);
        vm.startPrank(lp);
        usd.approve(address(pool), type(uint256).max);
        pool.deposit(1000e18, lp);
        vm.stopPrank();

        // Fund borrower with collateral.
        weth.mint(borrower, 1000e18);
        vm.prank(borrower);
        weth.approve(address(cm), type(uint256).max);
    }

    function _open(uint256 collateral, uint256 borrow) internal returns (address account) {
        vm.prank(borrower);
        account = cm.openCreditAccount(collateral, borrow, borrower);
    }

    // ----------------------------- lifecycle ---------------------------- //

    function test_OpenBorrowAccrueClose() public {
        address account = _open(100e18, 800e18); // collateral value 200, borrow 800 -> HF 1.0625

        assertEq(cm.calcDebt(account), 800e18);
        assertGt(cm.calcHealthFactor(account), 1e18);
        assertEq(usd.balanceOf(account), 800e18);
        assertEq(weth.balanceOf(account), 100e18);

        // One year at 80% utilization -> 4% -> 32 USD interest, exactly.
        vm.warp(block.timestamp + 365 days);
        assertEq(cm.calcDebt(account), 832e18);

        // Simulate trading profit so the account can cover principal + interest.
        usd.mint(account, 32e18);

        uint256 borrowerWethBefore = weth.balanceOf(borrower);
        vm.prank(borrower);
        facade.closeCreditAccount(account);

        assertEq(cm.calcDebt(account), 0);
        assertEq(pool.totalBorrowed(), 0);
        assertEq(weth.balanceOf(borrower), borrowerWethBefore + 100e18);
        // Lenders realised the 32 USD of interest.
        assertGt(pool.totalAssets(), 1000e18);
    }

    function test_IncreaseAndDecreaseDebt() public {
        address account = _open(100e18, 400e18);
        assertEq(cm.calcDebt(account), 400e18);

        vm.prank(borrower);
        cm.increaseDebt(account, 400e18);
        assertEq(cm.calcDebt(account), 800e18);
        assertEq(pool.totalBorrowed(), 800e18);

        vm.prank(borrower);
        cm.decreaseDebt(account, 300e18);
        assertEq(cm.calcDebt(account), 500e18);
        assertEq(pool.totalBorrowed(), 500e18);
    }

    // ------------------------------- health ----------------------------- //

    function test_OpenRevertsWhenUndercollateralized() public {
        vm.prank(borrower);
        vm.expectRevert(CreditManager.Undercollateralized.selector);
        cm.openCreditAccount(10e18, 800e18, borrower); // collateral value 20, far below debt
    }

    function test_WithdrawCollateralGatedByHealth() public {
        address account = _open(100e18, 800e18);

        vm.prank(borrower);
        vm.expectRevert(CreditManager.Undercollateralized.selector);
        cm.withdrawCollateral(account, 50e18, borrower);

        vm.prank(borrower);
        cm.withdrawCollateral(account, 5e18, borrower);
        assertEq(weth.balanceOf(account), 95e18);
    }

    // ----------------------- risk configurator wiring ------------------ //

    function test_LiquidationThresholdSourcedFromRiskConfigurator() public view {
        // Threshold is the haircut's complement, read live from the configurator.
        assertEq(cm.liquidationThresholdBps(), LT_BPS);
    }

    function test_RaisingHaircutTightensHealthFactor() public {
        address account = _open(100e18, 800e18); // HF 1.0625 at an 8500 threshold
        assertGt(cm.calcHealthFactor(account), 1e18);

        // Governance raises the WETH haircut from 1500 to 3000 (threshold 8500 -> 7000):
        // adjusted value 1000 * 0.70 = 700 against 800 debt -> HF 0.875, now liquidatable.
        riskConfigurator.setCollateral(address(weth), 3000, WETH_MAX_LEVERAGE_BPS);
        assertEq(cm.liquidationThresholdBps(), 7000);
        assertLt(cm.calcHealthFactor(account), 1e18);
    }

    function test_OnlyOwnerSetsRiskConfigurator() public {
        vm.prank(makeAddr("intruder"));
        vm.expectRevert();
        cm.setRiskConfigurator(riskConfigurator);
    }

    // --------------------------- access control ------------------------- //

    function test_OnlyOwnerOrFacadeCanManage() public {
        address account = _open(100e18, 400e18);

        vm.prank(makeAddr("intruder"));
        vm.expectRevert(CreditManager.NotAuthorized.selector);
        cm.withdrawCollateral(account, 1e18, address(this));
    }

    function test_MarginAccountRejectsNonManager() public {
        address account = _open(100e18, 400e18);

        vm.expectRevert(MarginAccount.NotCreditManager.selector);
        MarginAccount(account).transferToken(address(weth), address(this), 1e18);
    }

    function test_ClonesAreDistinctAndInitialized() public {
        address a1 = _open(100e18, 0);
        address a2 = _open(100e18, 0);

        assertTrue(a1 != a2);
        assertEq(MarginAccount(a1).creditManager(), address(cm));
        assertEq(MarginAccount(a2).creditManager(), address(cm));
    }

    // ------------------------ multicall single check -------------------- //

    function test_MulticallRevertsIfEndStateUnhealthy() public {
        address account = _open(100e18, 800e18);

        // Batch tries to drain collateral out of the account; the single end-of-batch
        // health check must reject it and revert the whole batch.
        CreditManager.MultiCall[] memory calls = new CreditManager.MultiCall[](1);
        calls[0] = CreditManager.MultiCall({
            target: address(weth), callData: abi.encodeWithSelector(IERC20.transfer.selector, borrower, 100e18)
        });

        vm.prank(borrower);
        vm.expectRevert(CreditManager.Undercollateralized.selector);
        facade.multicall(account, calls);

        // Collateral never left the account.
        assertEq(weth.balanceOf(account), 100e18);
    }

    function test_MulticallSucceedsWhenEndStateHealthy() public {
        address account = _open(100e18, 400e18);

        // A harmless approval call that leaves health intact.
        CreditManager.MultiCall[] memory calls = new CreditManager.MultiCall[](1);
        calls[0] = CreditManager.MultiCall({
            target: address(usd), callData: abi.encodeWithSelector(IERC20.approve.selector, address(this), 1e18)
        });

        vm.prank(borrower);
        facade.multicall(account, calls);

        assertEq(usd.allowance(account, address(this)), 1e18);
    }
}
