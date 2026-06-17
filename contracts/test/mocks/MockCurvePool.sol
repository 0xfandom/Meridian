// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ICurvePool} from "../../src/interfaces/ICurvePool.sol";
import {MockERC20} from "./MockERC20.sol";

/// @notice Two-coin Curve pool stand-in. LP is minted 1:1 against deposited value and a single-coin
///         withdrawal returns the coin 1:1 against burned LP. For tests only.
contract MockCurvePool is ICurvePool {
    address[2] private _coins;
    MockERC20 private _lp;

    constructor(address coin0, address coin1, MockERC20 lp) {
        _coins[0] = coin0;
        _coins[1] = coin1;
        _lp = lp;
    }

    function coins(uint256 i) external view returns (address) {
        return _coins[i];
    }

    function lpToken() external view returns (address) {
        return address(_lp);
    }

    function add_liquidity(uint256[2] calldata amounts, uint256 minMintAmount) external returns (uint256 minted) {
        for (uint256 i = 0; i < 2; i++) {
            if (amounts[i] > 0) {
                IERC20(_coins[i]).transferFrom(msg.sender, address(this), amounts[i]);
            }
        }
        minted = amounts[0] + amounts[1];
        require(minted >= minMintAmount, "slippage");
        _lp.mint(msg.sender, minted);
    }

    function remove_liquidity_one_coin(uint256 lpAmount, int128 i, uint256 minReceived) external returns (uint256 out) {
        IERC20(address(_lp)).transferFrom(msg.sender, address(this), lpAmount);
        out = lpAmount;
        require(out >= minReceived, "slippage");
        IERC20(_coins[uint256(int256(i))]).transfer(msg.sender, out);
    }
}
