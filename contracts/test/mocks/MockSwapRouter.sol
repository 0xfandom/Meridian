// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IUniswapV3SwapRouter} from "../../src/interfaces/IUniswapV3SwapRouter.sol";

/// @notice Uniswap V3 SwapRouter stand-in. Pulls the input from the caller and pays the recipient
///         `amountIn * rate / 1e18` of the output token from its own reserves. For tests only.
contract MockSwapRouter is IUniswapV3SwapRouter {
    using SafeERC20 for IERC20;

    uint256 public rateWad = 1e18;

    function setRate(uint256 rateWad_) external {
        rateWad = rateWad_;
    }

    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut) {
        IERC20(params.tokenIn).safeTransferFrom(msg.sender, address(this), params.amountIn);
        amountOut = (params.amountIn * rateWad) / 1e18;
        require(amountOut >= params.amountOutMinimum, "slippage");
        IERC20(params.tokenOut).safeTransfer(params.recipient, amountOut);
    }
}
