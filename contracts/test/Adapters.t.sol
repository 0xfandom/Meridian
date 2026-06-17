// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AdapterRegistry} from "../src/AdapterRegistry.sol";
import {UniswapV3Adapter} from "../src/adapters/UniswapV3Adapter.sol";
import {IUniswapV3SwapRouter} from "../src/interfaces/IUniswapV3SwapRouter.sol";
import {MarginAccount} from "../src/MarginAccount.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockSwapRouter} from "./mocks/MockSwapRouter.sol";

contract AdapterRegistryTest is Test {
    AdapterRegistry internal registry;
    address internal adapter = makeAddr("adapter");
    address internal target = makeAddr("target");

    function setUp() public {
        registry = new AdapterRegistry(address(this));
    }

    function test_RegisterAndUnregister() public {
        registry.registerAdapter(adapter, target);
        assertTrue(registry.isAdapter(adapter));
        assertEq(registry.adapterTarget(adapter), target);

        registry.unregisterAdapter(adapter);
        assertFalse(registry.isAdapter(adapter));
        assertEq(registry.adapterTarget(adapter), address(0));
    }

    function test_OnlyOwnerCanRegister() public {
        vm.prank(makeAddr("intruder"));
        vm.expectRevert();
        registry.registerAdapter(adapter, target);
    }
}

contract UniswapV3AdapterTest is Test {
    MockERC20 internal tokenIn;
    MockERC20 internal tokenOut;
    MockSwapRouter internal router;
    UniswapV3Adapter internal adapter;
    MarginAccount internal account;

    function setUp() public {
        tokenIn = new MockERC20("USD Coin", "USDC", 18);
        tokenOut = new MockERC20("Wrapped Ether", "WETH", 18);
        router = new MockSwapRouter();
        tokenOut.mint(address(router), 1_000_000e18);
        adapter = new UniswapV3Adapter(IUniswapV3SwapRouter(address(router)));

        account = new MarginAccount();
        account.initialize(address(this)); // this test acts as the credit manager
    }

    function test_SwapRoutesOutputBackToAccount() public {
        tokenIn.mint(address(account), 1000e18);

        // Account approves the adapter, then routes the swap through its own execute().
        account.approveToken(address(tokenIn), address(adapter), 1000e18);
        bytes memory data = abi.encodeCall(
            UniswapV3Adapter.swapExactInputSingle, (address(tokenIn), address(tokenOut), uint24(500), 1000e18, 0)
        );
        account.execute(address(adapter), data);

        // 1:1 mock rate: all input converted, output lands in the account, nothing stuck in the adapter.
        assertEq(tokenOut.balanceOf(address(account)), 1000e18);
        assertEq(tokenIn.balanceOf(address(account)), 0);
        assertEq(tokenIn.balanceOf(address(adapter)), 0);
    }

    function test_RespectsMinimumOut() public {
        router.setRate(0.9e18); // 10% worse than expected
        tokenIn.mint(address(account), 1000e18);
        account.approveToken(address(tokenIn), address(adapter), 1000e18);

        bytes memory data = abi.encodeCall(
            UniswapV3Adapter.swapExactInputSingle, (address(tokenIn), address(tokenOut), uint24(500), 1000e18, 1000e18)
        );
        vm.expectRevert();
        account.execute(address(adapter), data);
    }
}
