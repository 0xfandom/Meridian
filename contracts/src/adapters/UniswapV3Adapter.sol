// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IUniswapV3SwapRouter} from "../interfaces/IUniswapV3SwapRouter.sol";

/// @title UniswapV3Adapter
/// @notice Constrained gateway to the Uniswap V3 SwapRouter. A margin account calls this adapter
///         (via its own `execute`), the adapter pulls the input from the calling account, swaps,
///         and routes the output straight back to that account.
/// @dev The recipient is forced to the caller (the margin account), so proceeds can never be
///      diverted elsewhere. The account must approve the adapter for the input amount.
contract UniswapV3Adapter {
    using SafeERC20 for IERC20;

    IUniswapV3SwapRouter public immutable router;

    error ZeroAddress();

    constructor(IUniswapV3SwapRouter router_) {
        if (address(router_) == address(0)) revert ZeroAddress();
        router = router_;
    }

    /// @notice Swaps `amountIn` of `tokenIn` for `tokenOut`, returning the output to the caller.
    function swapExactInputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint256 amountOutMin)
        external
        returns (uint256 amountOut)
    {
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        IERC20(tokenIn).forceApprove(address(router), amountIn);

        amountOut = router.exactInputSingle(
            IUniswapV3SwapRouter.ExactInputSingleParams({
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                fee: fee,
                recipient: msg.sender,
                deadline: block.timestamp,
                amountIn: amountIn,
                amountOutMinimum: amountOutMin,
                sqrtPriceLimitX96: 0
            })
        );
    }
}
