// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {AccessController} from "./AccessController.sol";
import {ILiquidationTarget} from "./interfaces/ILiquidationTarget.sol";

/// @title LiquidationModule
/// @notice On-chain liquidation floor. Permissioned keepers may liquidate any account whose
///         health factor has fallen below 1, regardless of off-chain systems.
/// @dev Authority lives on chain: the module reads health straight from the credit manager and
///      never trusts an external signal to decide solvency.
contract LiquidationModule is Ownable {
    uint256 internal constant HEALTH_FACTOR_ONE = 1e18;

    AccessController public accessController;
    ILiquidationTarget public creditManager;

    event Liquidated(address indexed account, address indexed keeper);
    event AccessControllerSet(address indexed accessController);
    event CreditManagerSet(address indexed creditManager);

    error ZeroAddress();
    error NotKeeper();
    error NotLiquidatable();

    constructor(AccessController accessController_, ILiquidationTarget creditManager_, address owner_) Ownable(owner_) {
        if (address(accessController_) == address(0) || address(creditManager_) == address(0)) revert ZeroAddress();
        accessController = accessController_;
        creditManager = creditManager_;
    }

    /// @notice Liquidates `account` if it is below the health floor. Keeper-only.
    function liquidate(address account) external {
        if (!accessController.isKeeper(msg.sender)) revert NotKeeper();
        if (creditManager.calcHealthFactor(account) >= HEALTH_FACTOR_ONE) revert NotLiquidatable();

        creditManager.liquidate(account, msg.sender);
        emit Liquidated(account, msg.sender);
    }

    function setAccessController(AccessController accessController_) external onlyOwner {
        if (address(accessController_) == address(0)) revert ZeroAddress();
        accessController = accessController_;
        emit AccessControllerSet(address(accessController_));
    }

    function setCreditManager(ILiquidationTarget creditManager_) external onlyOwner {
        if (address(creditManager_) == address(0)) revert ZeroAddress();
        creditManager = creditManager_;
        emit CreditManagerSet(address(creditManager_));
    }
}
