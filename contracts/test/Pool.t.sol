// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Pool} from "../src/Pool.sol";
import {InterestRateModel} from "../src/InterestRateModel.sol";
import {IPool} from "../src/interfaces/IPool.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockCreditManager} from "./mocks/MockCreditManager.sol";

contract PoolTest is Test {
    MockERC20 internal usdc;
    InterestRateModel internal irm;
    Pool internal pool;
    MockCreditManager internal creditManager;

    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    function setUp() public {
        usdc = new MockERC20("USD Coin", "USDC", 6);
        irm = new InterestRateModel(0, 400, 6000, 8000);
        pool = new Pool(IERC20(address(usdc)), irm, address(this), "Meridian USDC Pool", "mUSDC");
        creditManager = new MockCreditManager(IPool(address(pool)));
        pool.setCreditManager(address(creditManager), true);

        usdc.mint(alice, 1_000_000e6);
        vm.prank(alice);
        usdc.approve(address(pool), type(uint256).max);
    }

    function _deposit(address user, uint256 amount) internal {
        vm.prank(user);
        pool.deposit(amount, user);
    }

    // ----------------------------- deposits ----------------------------- //

    function test_DepositMintsSharesAndCountsAssets() public {
        _deposit(alice, 1000e6);

        assertEq(pool.totalAssets(), 1000e6);
        assertGt(pool.balanceOf(alice), 0);
        assertApproxEqAbs(pool.convertToAssets(pool.balanceOf(alice)), 1000e6, 1);
    }

    function test_WithdrawReturnsAssets() public {
        _deposit(alice, 1000e6);

        vm.prank(alice);
        pool.withdraw(400e6, alice, alice);

        assertEq(usdc.balanceOf(alice), 1_000_000e6 - 1000e6 + 400e6);
        assertApproxEqAbs(pool.totalAssets(), 600e6, 1);
    }

    // ---------------------------- borrowing ----------------------------- //

    function test_OnlyCreditManagerCanBorrow() public {
        _deposit(alice, 1000e6);

        vm.prank(alice);
        vm.expectRevert(Pool.NotCreditManager.selector);
        pool.borrow(100e6, alice);
    }

    function test_BorrowMovesLiquidityNotTotalAssets() public {
        _deposit(alice, 1000e6);

        creditManager.borrow(600e6, bob);

        assertEq(usdc.balanceOf(bob), 600e6);
        assertEq(pool.totalBorrowed(), 600e6);
        assertEq(pool.availableLiquidity(), 400e6);
        assertEq(pool.totalAssets(), 1000e6);
    }

    function test_BorrowRevertsBeyondLiquidity() public {
        _deposit(alice, 1000e6);

        vm.expectRevert(Pool.InsufficientLiquidity.selector);
        creditManager.borrow(1001e6, bob);
    }

    // ------------------- liquidity-gated withdrawals -------------------- //

    function test_WithdrawalIsCappedByAvailableLiquidity() public {
        _deposit(alice, 1000e6);
        creditManager.borrow(600e6, bob);

        assertEq(pool.maxWithdraw(alice), 400e6);

        vm.prank(alice);
        vm.expectRevert();
        pool.withdraw(400e6 + 1, alice, alice);

        vm.prank(alice);
        pool.withdraw(400e6, alice, alice);
        assertEq(pool.availableLiquidity(), 0);
    }

    // ----------------------------- interest ----------------------------- //

    function test_InterestAccruesAndIsRealizedOnRepay() public {
        _deposit(alice, 1000e6);
        creditManager.borrow(800e6, bob); // utilization exactly 80% -> 4% APR

        vm.warp(block.timestamp + 365 days);

        // 800 * 4% * 1yr = 32 USDC, exactly (linear accrual).
        assertEq(pool.calcAccruedInterest(), 32e6);
        assertEq(pool.totalAssets(), 1032e6);
        assertGt(pool.convertToAssets(pool.balanceOf(alice)), 1000e6);

        // Fund the credit manager so it can return principal + interest.
        usdc.mint(address(creditManager), 832e6);
        creditManager.repayWithInterest(800e6);

        assertEq(pool.totalBorrowed(), 0);
        assertEq(pool.calcAccruedInterest(), 0);
        assertEq(pool.availableLiquidity(), 1032e6);

        uint256 aliceShares = pool.balanceOf(alice);
        vm.prank(alice);
        uint256 redeemed = pool.redeem(aliceShares, alice, alice);
        assertGt(redeemed, 1000e6);
        assertLe(redeemed, 1032e6);
    }

    function test_RepayCannotExceedDebt() public {
        _deposit(alice, 1000e6);
        creditManager.borrow(100e6, bob);

        usdc.mint(address(creditManager), 200e6);
        vm.expectRevert(Pool.RepayExceedsDebt.selector);
        creditManager.repay(200e6, 0);
    }

    function test_RepayCannotExceedAccruedInterest() public {
        _deposit(alice, 1000e6);
        creditManager.borrow(800e6, bob);
        vm.warp(block.timestamp + 365 days);

        usdc.mint(address(creditManager), 1000e6);
        vm.expectRevert(Pool.InterestExceedsAccrued.selector);
        creditManager.repay(800e6, 100e6); // accrued is only 32e6
    }

    // --------------------------- share safety --------------------------- //

    function testFuzz_RedeemNeverReturnsMoreThanDepositedWithoutYield(uint256 amount) public {
        amount = bound(amount, 1e6, 1_000_000e6);
        usdc.mint(alice, amount);

        vm.startPrank(alice);
        uint256 shares = pool.deposit(amount, alice);
        uint256 out = pool.redeem(shares, alice, alice);
        vm.stopPrank();

        assertLe(out, amount);
    }

    function test_FirstDepositorInflationIsUnprofitable() public {
        address attacker = makeAddr("attacker");
        address victim = makeAddr("victim");
        usdc.mint(attacker, 2000e6);
        usdc.mint(victim, 1000e6);

        // Attacker seeds 1 wei then donates a large amount directly to the pool.
        vm.startPrank(attacker);
        usdc.approve(address(pool), type(uint256).max);
        pool.deposit(1, attacker);
        usdc.transfer(address(pool), 1000e6);
        vm.stopPrank();

        // Victim deposits.
        vm.startPrank(victim);
        usdc.approve(address(pool), type(uint256).max);
        pool.deposit(1000e6, victim);
        vm.stopPrank();

        // Attacker redeems everything; they must not extract more than they put in (1 + donation).
        vm.startPrank(attacker);
        uint256 attackerOut = pool.redeem(pool.balanceOf(attacker), attacker, attacker);
        vm.stopPrank();

        assertLe(attackerOut, 1000e6 + 1);
    }
}
