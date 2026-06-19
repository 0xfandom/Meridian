// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {CreditManager} from "../src/CreditManager.sol";
import {Pool} from "../src/Pool.sol";
import {UniswapV3Adapter} from "../src/adapters/UniswapV3Adapter.sol";
import {MockERC20} from "../test/mocks/MockERC20.sol";
import {MockPriceOracle} from "../test/mocks/MockPriceOracle.sol";

/// @title SeedScript
/// @notice Populates a LIVE local deployment (addresses read from the manifest) with a realistic
///         book so the whole stack lights up: an LP seeds liquidity and three borrowers open
///         leveraged accounts spanning healthy, warning, and margin-call health bands. The keeper is
///         pre-funded and pre-approved so a live keeper can liquidate without manual setup.
/// @dev    Local only; uses deterministic anvil dev accounts. Run after the deploy script:
///           forge script script/Seed.s.sol:SeedScript --rpc-url http://127.0.0.1:8545 --broadcast
///         Then drive a liquidation cascade by crashing the price:
///           forge script script/Seed.s.sol:SeedScript --sig "crash()" \
///             --rpc-url http://127.0.0.1:8545 --broadcast
contract SeedScript is Script {
    // Deterministic anvil accounts (public keys, local node only).
    uint256 internal constant DEPLOYER_PK = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
    uint256 internal constant KEEPER_PK = 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d;
    uint256 internal constant LP_PK = 0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a;
    uint256 internal constant BORROWER_A_PK = 0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6;
    uint256 internal constant BORROWER_B_PK = 0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a;
    uint256 internal constant BORROWER_C_PK = 0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba;

    uint24 internal constant FEE = 500;
    uint256 internal constant COLLATERAL = 10e18; // each borrower posts 10 WETH
    uint256 internal constant LP_DEPOSIT = 500_000e6;
    uint256 internal constant CRASH_PRICE = 1_500_000_000; // 1500 USDC/WETH (25% drop) -> cascade

    struct Addrs {
        address usdc;
        address weth;
        address oracle;
        address pool;
        address creditManager;
        address swapAdapter;
    }

    /// @notice Seeds pool liquidity and three leveraged accounts across the health bands.
    function run() external {
        Addrs memory a = _readManifest();

        _seedLiquidity(a);
        _fundKeeper(a);

        // Borrow sizes against 10 WETH (20k) collateral at 2000 USDC/WETH set the resting health:
        //   20k  -> HF 1.80 (healthy), 80k -> HF 1.125 (warning), 120k -> HF 1.05 (margin call).
        address healthy = _openLevered(a, BORROWER_A_PK, 20_000e6);
        address warning = _openLevered(a, BORROWER_B_PK, 80_000e6);
        address marginCall = _openLevered(a, BORROWER_C_PK, 120_000e6);

        CreditManager cm = CreditManager(a.creditManager);
        console2.log("Seeded Meridian book:");
        console2.log("  pool liquidity (USDC) ", Pool(a.pool).totalAssets());
        console2.log("  healthy     account   ", healthy, cm.calcHealthFactor(healthy));
        console2.log("  warning     account   ", warning, cm.calcHealthFactor(warning));
        console2.log("  margin-call account   ", marginCall, cm.calcHealthFactor(marginCall));
    }

    /// @notice Crashes the WETH price below the floor so the levered accounts become liquidatable.
    function crash() external {
        Addrs memory a = _readManifest();
        vm.broadcast(DEPLOYER_PK);
        MockPriceOracle(a.oracle).setPrice(a.weth, CRASH_PRICE);
        console2.log("Crashed WETH price to (USDC, 6dp)", CRASH_PRICE);
    }

    function _seedLiquidity(Addrs memory a) internal {
        address lp = vm.addr(LP_PK);
        vm.startBroadcast(LP_PK);
        MockERC20(a.usdc).mint(lp, LP_DEPOSIT);
        IERC20(a.usdc).approve(a.pool, type(uint256).max);
        Pool(a.pool).deposit(LP_DEPOSIT, lp);
        vm.stopBroadcast();
    }

    /// @dev Pre-funds and pre-approves the keeper so a live keeper can fund the repayment shortfall
    ///      and seize collateral without any manual setup during the demo.
    function _fundKeeper(Addrs memory a) internal {
        address keeper = vm.addr(KEEPER_PK);
        vm.startBroadcast(KEEPER_PK);
        MockERC20(a.usdc).mint(keeper, 1_000_000e6);
        IERC20(a.usdc).approve(a.creditManager, type(uint256).max);
        vm.stopBroadcast();
    }

    /// @dev Opens a credit account and levers the borrowed USDC into WETH through the whitelisted
    ///      adapter, exactly as a borrower would.
    function _openLevered(Addrs memory a, uint256 borrowerPk, uint256 borrow) internal returns (address account) {
        address borrower = vm.addr(borrowerPk);
        CreditManager cm = CreditManager(a.creditManager);

        vm.startBroadcast(borrowerPk);
        MockERC20(a.weth).mint(borrower, COLLATERAL);
        IERC20(a.weth).approve(a.creditManager, type(uint256).max);
        account = cm.openCreditAccount(COLLATERAL, borrow, borrower);

        CreditManager.MultiCall[] memory calls = new CreditManager.MultiCall[](2);
        calls[0] = CreditManager.MultiCall({
            target: a.usdc, callData: abi.encodeCall(IERC20.approve, (a.swapAdapter, borrow))
        });
        calls[1] = CreditManager.MultiCall({
            target: a.swapAdapter,
            callData: abi.encodeCall(UniswapV3Adapter.swapExactInputSingle, (a.usdc, a.weth, FEE, borrow, 0))
        });
        cm.multicall(account, calls);
        vm.stopBroadcast();
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
            swapAdapter: vm.parseJsonAddress(json, ".swapAdapter")
        });
    }
}
