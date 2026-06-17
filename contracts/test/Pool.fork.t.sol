// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Pool} from "../src/Pool.sol";
import {InterestRateModel} from "../src/InterestRateModel.sol";
import {IPool} from "../src/interfaces/IPool.sol";
import {MockCreditManager} from "./mocks/MockCreditManager.sol";

/// @notice Exercises the full deposit -> borrow -> accrue -> repay -> redeem lifecycle against
///         real mainnet USDC on a fork. Skips automatically when MAINNET_RPC_URL is not set,
///         so CI without an RPC stays green while the test still runs locally on a fork.
contract PoolForkTest is Test {
    address internal constant USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;

    bool internal forked;
    Pool internal pool;
    MockCreditManager internal creditManager;

    address internal lender = makeAddr("lender");
    address internal borrower = makeAddr("borrower");

    function setUp() public {
        string memory rpc = vm.envOr("MAINNET_RPC_URL", string(""));
        if (bytes(rpc).length == 0) {
            return;
        }
        vm.createSelectFork(rpc);
        forked = true;

        InterestRateModel irm = new InterestRateModel(0, 400, 6000, 8000);
        pool = new Pool(IERC20(USDC), irm, address(this), "Meridian USDC Pool", "mUSDC");
        creditManager = new MockCreditManager(IPool(address(pool)));
        pool.setCreditManager(address(creditManager), true);
    }

    function test_ForkLifecycleAccruesRealYield() public {
        if (!forked) {
            vm.skip(true);
            return;
        }

        deal(USDC, lender, 1_000_000e6);

        vm.startPrank(lender);
        IERC20(USDC).approve(address(pool), type(uint256).max);
        pool.deposit(1_000_000e6, lender);
        vm.stopPrank();

        creditManager.borrow(800_000e6, borrower);
        assertEq(IERC20(USDC).balanceOf(borrower), 800_000e6);

        vm.warp(block.timestamp + 30 days);
        uint256 accrued = pool.calcAccruedInterest();
        assertGt(accrued, 0);

        deal(USDC, address(creditManager), 800_000e6 + accrued);
        creditManager.repayWithInterest(800_000e6);

        assertEq(pool.totalBorrowed(), 0);

        vm.startPrank(lender);
        uint256 redeemed = pool.redeem(pool.balanceOf(lender), lender, lender);
        vm.stopPrank();

        assertGt(redeemed, 1_000_000e6);
    }
}
