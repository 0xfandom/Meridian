// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {CreditManager} from "./CreditManager.sol";
import {MarginAccount} from "./MarginAccount.sol";
import {IPool} from "./interfaces/IPool.sol";
import {IInterestRateModel} from "./interfaces/IInterestRateModel.sol";
import {IPriceOracle} from "./interfaces/IPriceOracle.sol";

/// @title CreditManagerFactory
/// @notice Deploys credit managers that share a single margin-account implementation cloned per
///         borrower, and keeps a registry of every manager it has created.
contract CreditManagerFactory is Ownable {
    /// @notice Shared EIP-1167 implementation that deployed managers clone per account.
    address public immutable accountImplementation;

    address[] public creditManagers;

    event CreditManagerCreated(address indexed creditManager, address indexed pool, address owner);

    constructor(address owner_) Ownable(owner_) {
        accountImplementation = address(new MarginAccount());
    }

    function createCreditManager(
        IPool pool,
        IERC20 collateralToken,
        IInterestRateModel interestRateModel,
        IPriceOracle oracle,
        uint256 liquidationThresholdBps,
        address managerOwner
    ) external onlyOwner returns (address creditManager) {
        creditManager = address(
            new CreditManager(
                pool,
                collateralToken,
                interestRateModel,
                oracle,
                accountImplementation,
                liquidationThresholdBps,
                managerOwner
            )
        );
        creditManagers.push(creditManager);
        emit CreditManagerCreated(creditManager, address(pool), managerOwner);
    }

    function creditManagersLength() external view returns (uint256) {
        return creditManagers.length;
    }
}
