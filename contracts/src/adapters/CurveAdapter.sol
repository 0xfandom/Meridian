// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ICurvePool} from "../interfaces/ICurvePool.sol";

/// @title CurveAdapter
/// @notice Constrained gateway to a two-coin Curve pool. A margin account routes liquidity
///         operations through this adapter, which pulls inputs from the calling account and
///         returns all proceeds (LP tokens or withdrawn coin) to that account.
contract CurveAdapter {
    using SafeERC20 for IERC20;

    /// @notice Adds liquidity to `pool` and returns the LP tokens to the caller.
    function addLiquidity(address pool, uint256[2] calldata amounts, uint256 minLpOut)
        external
        returns (uint256 lpAmount)
    {
        for (uint256 i = 0; i < 2; i++) {
            if (amounts[i] > 0) {
                address coin = ICurvePool(pool).coins(i);
                IERC20(coin).safeTransferFrom(msg.sender, address(this), amounts[i]);
                IERC20(coin).forceApprove(pool, amounts[i]);
            }
        }

        lpAmount = ICurvePool(pool).add_liquidity(amounts, minLpOut);

        IERC20 lpToken = IERC20(ICurvePool(pool).lpToken());
        lpToken.safeTransfer(msg.sender, lpToken.balanceOf(address(this)));
    }

    /// @notice Burns LP for a single coin and returns it to the caller.
    function removeLiquidityOneCoin(address pool, uint256 lpAmount, int128 i, uint256 minOut)
        external
        returns (uint256 amountOut)
    {
        IERC20 lpToken = IERC20(ICurvePool(pool).lpToken());
        lpToken.safeTransferFrom(msg.sender, address(this), lpAmount);
        lpToken.forceApprove(pool, lpAmount);

        amountOut = ICurvePool(pool).remove_liquidity_one_coin(lpAmount, i, minOut);

        IERC20 coin = IERC20(ICurvePool(pool).coins(uint256(int256(i))));
        coin.safeTransfer(msg.sender, coin.balanceOf(address(this)));
    }
}
