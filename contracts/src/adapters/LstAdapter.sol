// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IWstETH} from "../interfaces/IWstETH.sol";

/// @title LstAdapter
/// @notice Constrained gateway to a wrapped liquid-staking token. A margin account wraps and
///         unwraps through this adapter, which pulls the input from the calling account and
///         returns the result to that account.
contract LstAdapter {
    using SafeERC20 for IERC20;

    IERC20 public immutable stakedToken; // e.g. stETH
    IWstETH public immutable wrappedToken; // e.g. wstETH

    error ZeroAddress();

    constructor(IERC20 stakedToken_, IWstETH wrappedToken_) {
        if (address(stakedToken_) == address(0) || address(wrappedToken_) == address(0)) revert ZeroAddress();
        stakedToken = stakedToken_;
        wrappedToken = wrappedToken_;
    }

    /// @notice Wraps `amount` of the staked token and returns the wrapped token to the caller.
    function wrap(uint256 amount) external returns (uint256 wrapped) {
        stakedToken.safeTransferFrom(msg.sender, address(this), amount);
        stakedToken.forceApprove(address(wrappedToken), amount);
        wrapped = wrappedToken.wrap(amount);
        IERC20(address(wrappedToken)).safeTransfer(msg.sender, wrapped);
    }

    /// @notice Unwraps `amount` of the wrapped token and returns the staked token to the caller.
    function unwrap(uint256 amount) external returns (uint256 unwrapped) {
        IERC20(address(wrappedToken)).safeTransferFrom(msg.sender, address(this), amount);
        unwrapped = wrappedToken.unwrap(amount);
        stakedToken.safeTransfer(msg.sender, unwrapped);
    }
}
