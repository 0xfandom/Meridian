// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";

/// @title MarginAccount
/// @notice Per-borrower account that custodies collateral and borrowed funds and executes
///         calls on the borrower's behalf. Deployed as an EIP-1167 minimal-proxy clone and
///         driven exclusively by its owning credit manager.
/// @dev Holds no logic of its own beyond gated asset movement and call forwarding; all policy
///      (health, whitelisting, debt) lives in the credit manager.
contract MarginAccount {
    using SafeERC20 for IERC20;
    using Address for address;

    /// @notice The credit manager permitted to operate this account.
    address public creditManager;

    error AlreadyInitialized();
    error NotCreditManager();

    modifier onlyCreditManager() {
        if (msg.sender != creditManager) revert NotCreditManager();
        _;
    }

    /// @notice Binds the clone to its credit manager. Callable once.
    function initialize(address creditManager_) external {
        if (creditManager != address(0)) revert AlreadyInitialized();
        creditManager = creditManager_;
    }

    /// @notice Forwards an arbitrary call to `target`. Used to route through adapters.
    function execute(address target, bytes calldata data) external onlyCreditManager returns (bytes memory) {
        return target.functionCall(data);
    }

    /// @notice Transfers `amount` of `token` out of the account.
    function transferToken(address token, address to, uint256 amount) external onlyCreditManager {
        IERC20(token).safeTransfer(to, amount);
    }

    /// @notice Sets `spender`'s allowance over `token` held by the account.
    function approveToken(address token, address spender, uint256 amount) external onlyCreditManager {
        IERC20(token).forceApprove(spender, amount);
    }
}
