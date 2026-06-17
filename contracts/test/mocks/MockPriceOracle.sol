// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {IPriceOracle} from "../../src/interfaces/IPriceOracle.sol";

/// @notice Settable price oracle for tests. Prices are WAD-scaled, in the unit of account.
contract MockPriceOracle is IPriceOracle {
    mapping(address token => uint256 price) public price;

    function setPrice(address token, uint256 price_) external {
        price[token] = price_;
    }

    function getPrice(address token) external view returns (uint256) {
        return price[token];
    }
}
