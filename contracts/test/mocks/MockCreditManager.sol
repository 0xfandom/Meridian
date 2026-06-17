// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IPool} from "../../src/interfaces/IPool.sol";

/// @notice Stand-in for the credit manager built in a later issue. Exercises the pool's
///         borrow/repay path so the pool can be tested in isolation.
contract MockCreditManager {
    IPool public immutable pool;

    constructor(IPool pool_) {
        pool = pool_;
    }

    function borrow(uint256 amount, address to) external {
        pool.borrow(amount, to);
    }

    /// @notice Repays principal plus all interest the pool currently reports as owed.
    function repayWithInterest(uint256 principal) external {
        uint256 interest = pool.calcAccruedInterest();
        IERC20(pool.asset()).approve(address(pool), principal + interest);
        pool.repay(principal, interest);
    }

    function repay(uint256 principal, uint256 interest) external {
        IERC20(pool.asset()).approve(address(pool), principal + interest);
        pool.repay(principal, interest);
    }
}
