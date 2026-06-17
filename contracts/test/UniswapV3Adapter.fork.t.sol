// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {UniswapV3Adapter} from "../src/adapters/UniswapV3Adapter.sol";
import {IUniswapV3SwapRouter} from "../src/interfaces/IUniswapV3SwapRouter.sol";
import {MarginAccount} from "../src/MarginAccount.sol";

/// @notice Swaps real USDC for WETH through the adapter on a mainnet fork, proving an account can
///         route a live Uniswap V3 trade and receive the proceeds. Self-skips without an RPC.
contract UniswapV3AdapterForkTest is Test {
    address internal constant USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
    address internal constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    address internal constant SWAP_ROUTER = 0xE592427A0AEce92De3Edee1F18E0157C05861564;
    uint24 internal constant FEE = 500;

    bool internal forked;
    UniswapV3Adapter internal adapter;
    MarginAccount internal account;

    function setUp() public {
        string memory rpc = vm.envOr("MAINNET_RPC_URL", string(""));
        if (bytes(rpc).length == 0) return;
        vm.createSelectFork(rpc);
        forked = true;

        adapter = new UniswapV3Adapter(IUniswapV3SwapRouter(SWAP_ROUTER));
        account = new MarginAccount();
        account.initialize(address(this));
    }

    function test_ForkSwapUsdcForWeth() public {
        if (!forked) {
            vm.skip(true);
            return;
        }

        deal(USDC, address(account), 10_000e6);

        account.approveToken(USDC, address(adapter), 10_000e6);
        bytes memory data = abi.encodeCall(UniswapV3Adapter.swapExactInputSingle, (USDC, WETH, FEE, 10_000e6, 0));
        account.execute(address(adapter), data);

        assertGt(IERC20(WETH).balanceOf(address(account)), 0);
        assertEq(IERC20(USDC).balanceOf(address(account)), 0);
    }
}
