// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title AdapterRegistry
/// @notice Registry of approved adapters and the external protocol each one wraps. The credit
///         system only routes margin-account calls through adapters listed here.
contract AdapterRegistry is Ownable {
    mapping(address adapter => bool registered) public isAdapter;
    mapping(address adapter => address target) public adapterTarget;

    event AdapterRegistered(address indexed adapter, address indexed target);
    event AdapterUnregistered(address indexed adapter);

    error ZeroAddress();

    constructor(address owner_) Ownable(owner_) {}

    function registerAdapter(address adapter, address target) external onlyOwner {
        if (adapter == address(0) || target == address(0)) revert ZeroAddress();
        isAdapter[adapter] = true;
        adapterTarget[adapter] = target;
        emit AdapterRegistered(adapter, target);
    }

    function unregisterAdapter(address adapter) external onlyOwner {
        isAdapter[adapter] = false;
        delete adapterTarget[adapter];
        emit AdapterUnregistered(adapter);
    }
}
