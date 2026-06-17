// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Pool} from "./Pool.sol";
import {IInterestRateModel} from "./interfaces/IInterestRateModel.sol";

/// @title PoolFactory
/// @notice Deploys lending pools and keeps a registry of every pool it has created.
contract PoolFactory is Ownable {
    address[] public pools;

    event PoolCreated(address indexed pool, address indexed asset, address owner);

    constructor(address owner_) Ownable(owner_) {}

    function createPool(
        IERC20 asset,
        IInterestRateModel interestRateModel,
        address poolOwner,
        string calldata name,
        string calldata symbol
    ) external onlyOwner returns (address pool) {
        pool = address(new Pool(asset, interestRateModel, poolOwner, name, symbol));
        pools.push(pool);
        emit PoolCreated(pool, address(asset), poolOwner);
    }

    function poolsLength() external view returns (uint256) {
        return pools.length;
    }
}
