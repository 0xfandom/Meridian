// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {CreditManager} from "./CreditManager.sol";

/// @title CreditFacade
/// @notice User-facing entry point to the credit system. Verifies account ownership and
///         forwards to the credit manager, which performs the accounting and health checks.
/// @dev Thin by design: all policy lives in the credit manager. The facade exists so the
///      borrower interacts with one stable surface and can batch actions through `multicall`,
///      which the manager settles with a single health check.
contract CreditFacade {
    CreditManager public immutable creditManager;

    error NotAccountOwner();

    constructor(CreditManager creditManager_) {
        creditManager = creditManager_;
    }

    /// @notice Opens an account for the caller with `collateral` posted and `borrow` drawn.
    function openCreditAccount(uint256 collateral, uint256 borrow) external returns (address account) {
        return creditManager.openCreditAccount(collateral, borrow, msg.sender);
    }

    /// @notice Closes the caller's account, repaying debt and returning remaining assets.
    function closeCreditAccount(address account) external {
        _onlyAccountOwner(account);
        creditManager.closeCreditAccount(account);
    }

    function withdrawCollateral(address account, uint256 amount, address to) external {
        _onlyAccountOwner(account);
        creditManager.withdrawCollateral(account, amount, to);
    }

    function increaseDebt(address account, uint256 amount) external {
        _onlyAccountOwner(account);
        creditManager.increaseDebt(account, amount);
    }

    function decreaseDebt(address account, uint256 amount) external {
        _onlyAccountOwner(account);
        creditManager.decreaseDebt(account, amount);
    }

    /// @notice Batches calls through the account; the manager applies one health check at the end.
    function multicall(address account, CreditManager.MultiCall[] calldata calls) external {
        _onlyAccountOwner(account);
        creditManager.multicall(account, calls);
    }

    function _onlyAccountOwner(address account) internal view {
        (address owner,,, bool open) = creditManager.accounts(account);
        if (!open || owner != msg.sender) revert NotAccountOwner();
    }
}
