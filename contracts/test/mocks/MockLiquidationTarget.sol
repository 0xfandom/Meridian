// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {ILiquidationTarget} from "../../src/interfaces/ILiquidationTarget.sol";

/// @notice Settable-health credit manager stand-in that records liquidations, for tests.
contract MockLiquidationTarget is ILiquidationTarget {
    mapping(address account => uint256 healthFactor) public health;
    address public lastLiquidatedAccount;
    address public lastLiquidator;

    function setHealth(address account, uint256 healthFactor) external {
        health[account] = healthFactor;
    }

    function calcHealthFactor(address account) external view returns (uint256) {
        return health[account];
    }

    function liquidate(address account, address liquidator) external {
        lastLiquidatedAccount = account;
        lastLiquidator = liquidator;
    }
}
