// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title AccessController
/// @notice Per-role allowlists for lenders, borrowers, and liquidation keepers. Each role can
///         be switched to open mode, which grants it to everyone.
/// @dev Open mode is the lever that flips a market from permissioned (institutional) to
///      permissionless (retail) without redeploying the credit system.
contract AccessController is Ownable {
    enum Role {
        Lender,
        Borrower,
        Keeper
    }

    mapping(Role role => mapping(address account => bool granted)) private _granted;
    mapping(Role role => bool open) public openMode;

    event RoleGranted(Role indexed role, address indexed account);
    event RoleRevoked(Role indexed role, address indexed account);
    event OpenModeSet(Role indexed role, bool open);

    constructor(address owner_) Ownable(owner_) {}

    function grantRole(Role role, address account) external onlyOwner {
        _granted[role][account] = true;
        emit RoleGranted(role, account);
    }

    function revokeRole(Role role, address account) external onlyOwner {
        _granted[role][account] = false;
        emit RoleRevoked(role, account);
    }

    function setOpenMode(Role role, bool open) external onlyOwner {
        openMode[role] = open;
        emit OpenModeSet(role, open);
    }

    function hasRole(Role role, address account) public view returns (bool) {
        return openMode[role] || _granted[role][account];
    }

    function isLender(address account) external view returns (bool) {
        return hasRole(Role.Lender, account);
    }

    function isBorrower(address account) external view returns (bool) {
        return hasRole(Role.Borrower, account);
    }

    function isKeeper(address account) external view returns (bool) {
        return hasRole(Role.Keeper, account);
    }
}
