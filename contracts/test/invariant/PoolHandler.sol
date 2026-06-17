// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Pool} from "../../src/Pool.sol";
import {MockERC20} from "../mocks/MockERC20.sol";

/// @notice Random-walk actor for the pool invariant suite. Acts as both lender and the pool's
///         sole credit manager, exercising deposit/withdraw/borrow/repay and time passage.
contract PoolHandler is Test {
    Pool public immutable pool;
    MockERC20 public immutable asset;

    constructor(Pool pool_, MockERC20 asset_) {
        pool = pool_;
        asset = asset_;
    }

    function deposit(uint256 amount) external {
        amount = bound(amount, 0, 1e24);
        if (amount == 0) return;
        asset.mint(address(this), amount);
        asset.approve(address(pool), amount);
        pool.deposit(amount, address(this));
    }

    function withdraw(uint256 amount) external {
        amount = bound(amount, 0, pool.maxWithdraw(address(this)));
        if (amount == 0) return;
        pool.withdraw(amount, address(this), address(this));
    }

    function borrow(uint256 amount) external {
        amount = bound(amount, 0, pool.availableLiquidity());
        if (amount == 0) return;
        pool.borrow(amount, address(this));
    }

    function repay(uint256 amount) external {
        uint256 principal = bound(amount, 0, pool.totalBorrowed());
        if (principal == 0) return;
        uint256 interest = pool.calcAccruedInterest();
        asset.mint(address(this), principal + interest);
        asset.approve(address(pool), principal + interest);
        pool.repay(principal, interest);
    }

    function passTime(uint256 secondsToWarp) external {
        secondsToWarp = bound(secondsToWarp, 0, 30 days);
        vm.warp(block.timestamp + secondsToWarp);
    }
}
