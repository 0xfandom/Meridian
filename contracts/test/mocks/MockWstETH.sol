// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IWstETH} from "../../src/interfaces/IWstETH.sol";

/// @notice Wrapped-staking-token stand-in that wraps/unwraps 1:1 against a backing token. Tests only.
contract MockWstETH is ERC20, IWstETH {
    IERC20 public immutable staked;

    constructor(IERC20 staked_) ERC20("Wrapped stETH", "wstETH") {
        staked = staked_;
    }

    function wrap(uint256 amount) external returns (uint256) {
        staked.transferFrom(msg.sender, address(this), amount);
        _mint(msg.sender, amount);
        return amount;
    }

    function unwrap(uint256 amount) external returns (uint256) {
        _burn(msg.sender, amount);
        staked.transfer(msg.sender, amount);
        return amount;
    }
}
