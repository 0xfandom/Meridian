// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Pool} from "../../src/Pool.sol";
import {InterestRateModel} from "../../src/InterestRateModel.sol";
import {MockERC20} from "../mocks/MockERC20.sol";
import {PoolHandler} from "./PoolHandler.sol";

/// @notice Core solvency invariants of the pool under random sequences of lender and borrower
///         actions and time passage.
contract PoolInvariantTest is Test {
    Pool internal pool;
    MockERC20 internal asset;
    PoolHandler internal handler;

    function setUp() public {
        asset = new MockERC20("USD Coin", "USDC", 18);
        InterestRateModel irm = new InterestRateModel(0, 400, 6000, 8000);
        pool = new Pool(IERC20(address(asset)), irm, address(this), "Meridian USDC Pool", "mUSDC");
        handler = new PoolHandler(pool, asset);
        pool.setCreditManager(address(handler), true);
        targetContract(address(handler));
    }

    /// @notice Reported idle liquidity always equals the pool's actual token balance.
    function invariant_AvailableLiquidityMatchesBalance() public view {
        assertEq(pool.availableLiquidity(), asset.balanceOf(address(pool)));
    }

    /// @notice Total assets always cover the outstanding borrowed principal.
    function invariant_AssetsCoverBorrowed() public view {
        assertGe(pool.totalAssets(), pool.totalBorrowed());
    }

    /// @notice The redeemable value of all shares never exceeds the pool's total assets.
    function invariant_ShareValueDoesNotExceedAssets() public view {
        assertLe(pool.convertToAssets(pool.totalSupply()), pool.totalAssets() + 1);
    }
}
