// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {CreditManager} from "../src/CreditManager.sol";
import {Pool} from "../src/Pool.sol";
import {LiquidationModule} from "../src/LiquidationModule.sol";
import {UniswapV3Adapter} from "../src/adapters/UniswapV3Adapter.sol";
import {MockERC20} from "../test/mocks/MockERC20.sol";
import {MockPriceOracle} from "../test/mocks/MockPriceOracle.sol";

/// @title SmokeScript
/// @notice Drives the full lever-then-liquidate flow against a LIVE deployment whose addresses are
///         read from the manifest (deployments/<network>.json). Paired with the deploy script in CI:
///         a fresh anvil, a real broadcast deploy, then this smoke against that deploy. Unlike the
///         in-process Smoke.t.sol, this exercises the broadcast deploy output end to end. Any failed
///         invariant reverts the run, turning the CI job red.
/// @dev    Local only: uses the deterministic anvil dev accounts. Run with:
///         forge script script/Smoke.s.sol:SmokeScript --rpc-url http://127.0.0.1:8545 --broadcast
contract SmokeScript is Script {
    // Deterministic anvil accounts (public keys, local node only). Account 1 is the keeper the deploy
    // grants the role to (script/config/local.json).
    uint256 internal constant DEPLOYER_PK = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
    uint256 internal constant KEEPER_PK = 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d;
    uint256 internal constant BORROWER_PK = 0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a;
    uint256 internal constant LP_PK = 0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6;

    uint24 internal constant FEE = 500;
    uint256 internal constant CRASH_PRICE = 800_000_000; // 800 USDC/WETH, below the liquidation floor

    struct Addrs {
        address usdc;
        address weth;
        address oracle;
        address pool;
        address creditManager;
        address swapAdapter;
        address liquidationModule;
    }

    function run() external {
        Addrs memory a = _readManifest();
        CreditManager cm = CreditManager(a.creditManager);
        Pool pool = Pool(a.pool);

        address lp = vm.addr(LP_PK);
        address borrower = vm.addr(BORROWER_PK);
        address keeper = vm.addr(KEEPER_PK);

        // LP seeds pool liquidity.
        vm.startBroadcast(LP_PK);
        MockERC20(a.usdc).mint(lp, 100_000e6);
        IERC20(a.usdc).approve(a.pool, type(uint256).max);
        pool.deposit(100_000e6, lp);
        vm.stopBroadcast();

        // Borrower opens a credit account and levers the borrowed USDC into WETH through the
        // whitelisted adapter via the gated multicall.
        vm.startBroadcast(BORROWER_PK);
        MockERC20(a.weth).mint(borrower, 10e18);
        IERC20(a.weth).approve(a.creditManager, type(uint256).max);
        address account = cm.openCreditAccount(10e18, 20_000e6, borrower);
        CreditManager.MultiCall[] memory calls = new CreditManager.MultiCall[](2);
        calls[0] = CreditManager.MultiCall({
            target: a.usdc, callData: abi.encodeCall(IERC20.approve, (a.swapAdapter, 20_000e6))
        });
        calls[1] = CreditManager.MultiCall({
            target: a.swapAdapter,
            callData: abi.encodeCall(UniswapV3Adapter.swapExactInputSingle, (a.usdc, a.weth, FEE, 20_000e6, 0))
        });
        cm.multicall(account, calls);
        vm.stopBroadcast();

        require(IERC20(a.usdc).balanceOf(account) == 0, "smoke: USDC not fully swapped");
        require(IERC20(a.weth).balanceOf(account) > 10e18, "smoke: position not levered");
        require(cm.calcHealthFactor(account) > 1e18, "smoke: not healthy after lever");

        // Crash the price below the liquidation floor.
        vm.broadcast(DEPLOYER_PK);
        MockPriceOracle(a.oracle).setPrice(a.weth, CRASH_PRICE);
        require(cm.calcHealthFactor(account) < 1e18, "smoke: not underwater after crash");

        uint256 seized = IERC20(a.weth).balanceOf(account);

        // Keeper funds the repayment and liquidates through the module.
        vm.startBroadcast(KEEPER_PK);
        MockERC20(a.usdc).mint(keeper, 20_000e6);
        IERC20(a.usdc).approve(a.creditManager, type(uint256).max);
        LiquidationModule(a.liquidationModule).liquidate(account);
        vm.stopBroadcast();

        require(cm.calcDebt(account) == 0, "smoke: debt not cleared");
        require(pool.totalBorrowed() == 0, "smoke: pool borrowings not cleared");
        require(IERC20(a.weth).balanceOf(keeper) == seized, "smoke: keeper did not seize the collateral");
        require(pool.totalAssets() >= 100_000e6, "smoke: pool not made whole");
        (,,, bool open) = cm.accounts(account);
        require(!open, "smoke: account not closed");
    }

    function _readManifest() internal view returns (Addrs memory a) {
        string memory network = vm.envOr("NETWORK", string("local"));
        string memory json = vm.readFile(string.concat("deployments/", network, ".json"));
        a = Addrs({
            usdc: vm.parseJsonAddress(json, ".usdc"),
            weth: vm.parseJsonAddress(json, ".weth"),
            oracle: vm.parseJsonAddress(json, ".oracle"),
            pool: vm.parseJsonAddress(json, ".pool"),
            creditManager: vm.parseJsonAddress(json, ".creditManager"),
            swapAdapter: vm.parseJsonAddress(json, ".swapAdapter"),
            liquidationModule: vm.parseJsonAddress(json, ".liquidationModule")
        });
    }
}
