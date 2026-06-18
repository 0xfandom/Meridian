// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IWhitelistRegistry} from "./interfaces/IWhitelistRegistry.sol";

/// @title WhitelistRegistry
/// @notice Allowlist of external call targets and the specific function selectors permitted on
///         them. The credit system consults this before routing a margin-account call, so an
///         account can only ever touch sanctioned protocols and methods.
/// @dev A call is permitted only when both the target and the exact selector are enabled,
///      keeping the surface deliberately narrow.
contract WhitelistRegistry is Ownable, IWhitelistRegistry {
    mapping(address target => bool allowed) public allowedTarget;
    mapping(address target => mapping(bytes4 selector => bool allowed)) public allowedSelector;

    event TargetSet(address indexed target, bool allowed);
    event SelectorSet(address indexed target, bytes4 indexed selector, bool allowed);

    error ZeroAddress();

    constructor(address owner_) Ownable(owner_) {}

    function setTarget(address target, bool allowed) external onlyOwner {
        if (target == address(0)) revert ZeroAddress();
        allowedTarget[target] = allowed;
        emit TargetSet(target, allowed);
    }

    function setSelector(address target, bytes4 selector, bool allowed) external onlyOwner {
        if (target == address(0)) revert ZeroAddress();
        allowedSelector[target][selector] = allowed;
        emit SelectorSet(target, selector, allowed);
    }

    /// @notice True only when both the target and the selector are enabled.
    function isAllowed(address target, bytes4 selector) external view override returns (bool) {
        return allowedTarget[target] && allowedSelector[target][selector];
    }
}
