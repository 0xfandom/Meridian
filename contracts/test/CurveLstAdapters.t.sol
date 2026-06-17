// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {CurveAdapter} from "../src/adapters/CurveAdapter.sol";
import {LstAdapter} from "../src/adapters/LstAdapter.sol";
import {IWstETH} from "../src/interfaces/IWstETH.sol";
import {MarginAccount} from "../src/MarginAccount.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockCurvePool} from "./mocks/MockCurvePool.sol";
import {MockWstETH} from "./mocks/MockWstETH.sol";

contract CurveAdapterTest is Test {
    MockERC20 internal coin0;
    MockERC20 internal coin1;
    MockERC20 internal lp;
    MockCurvePool internal pool;
    CurveAdapter internal adapter;
    MarginAccount internal account;

    function setUp() public {
        coin0 = new MockERC20("USDC", "USDC", 18);
        coin1 = new MockERC20("USDT", "USDT", 18);
        lp = new MockERC20("Curve LP", "crvLP", 18);
        pool = new MockCurvePool(address(coin0), address(coin1), lp);
        adapter = new CurveAdapter();
        account = new MarginAccount();
        account.initialize(address(this));
    }

    function test_AddLiquidityReturnsLpToAccount() public {
        coin0.mint(address(account), 100e18);
        coin1.mint(address(account), 100e18);
        account.approveToken(address(coin0), address(adapter), 100e18);
        account.approveToken(address(coin1), address(adapter), 100e18);

        bytes memory data =
            abi.encodeCall(CurveAdapter.addLiquidity, (address(pool), [uint256(100e18), uint256(100e18)], 0));
        account.execute(address(adapter), data);

        assertEq(lp.balanceOf(address(account)), 200e18);
        assertEq(coin0.balanceOf(address(account)), 0);
    }

    function test_RemoveLiquidityOneCoinReturnsCoin() public {
        // Seed the account with LP and the pool with coin0 reserves to pay out.
        lp.mint(address(account), 50e18);
        coin0.mint(address(pool), 50e18);
        account.approveToken(address(lp), address(adapter), 50e18);

        bytes memory data = abi.encodeCall(CurveAdapter.removeLiquidityOneCoin, (address(pool), 50e18, int128(0), 0));
        account.execute(address(adapter), data);

        assertEq(coin0.balanceOf(address(account)), 50e18);
        assertEq(lp.balanceOf(address(account)), 0);
    }
}

contract LstAdapterTest is Test {
    MockERC20 internal steth;
    MockWstETH internal wsteth;
    LstAdapter internal adapter;
    MarginAccount internal account;

    function setUp() public {
        steth = new MockERC20("Staked Ether", "stETH", 18);
        wsteth = new MockWstETH(IERC20(address(steth)));
        adapter = new LstAdapter(IERC20(address(steth)), IWstETH(address(wsteth)));
        account = new MarginAccount();
        account.initialize(address(this));
    }

    function test_WrapReturnsWrappedToAccount() public {
        steth.mint(address(account), 10e18);
        account.approveToken(address(steth), address(adapter), 10e18);

        account.execute(address(adapter), abi.encodeCall(LstAdapter.wrap, (10e18)));

        assertEq(wsteth.balanceOf(address(account)), 10e18);
        assertEq(steth.balanceOf(address(account)), 0);
    }

    function test_UnwrapReturnsStakedToAccount() public {
        // First wrap, then unwrap the full position.
        steth.mint(address(account), 10e18);
        account.approveToken(address(steth), address(adapter), 10e18);
        account.execute(address(adapter), abi.encodeCall(LstAdapter.wrap, (10e18)));

        account.approveToken(address(wsteth), address(adapter), 10e18);
        account.execute(address(adapter), abi.encodeCall(LstAdapter.unwrap, (10e18)));

        assertEq(steth.balanceOf(address(account)), 10e18);
        assertEq(wsteth.balanceOf(address(account)), 0);
    }
}
