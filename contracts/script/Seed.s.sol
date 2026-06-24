// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {CreditManager} from "../src/CreditManager.sol";
import {Pool} from "../src/Pool.sol";
import {UniswapV3Adapter} from "../src/adapters/UniswapV3Adapter.sol";
import {ChainlinkPriceOracle} from "../src/ChainlinkPriceOracle.sol";
import {MockERC20} from "../test/mocks/MockERC20.sol";
import {MockPriceOracle} from "../test/mocks/MockPriceOracle.sol";
import {MockAggregator} from "../test/mocks/MockAggregator.sol";

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
    uint256 internal constant BORROWER_D_PK = 0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e;

    uint24 internal constant FEE = 500;
    uint256 internal constant COLLATERAL = 10e18; // each WETH borrower posts 10 WETH
    uint256 internal constant LINK_COLLATERAL = 2_000e18; // the LINK borrower posts 2000 LINK
    uint256 internal constant LP_DEPOSIT = 500_000e6;
    uint256 internal constant CRASH_PRICE = 1_500_000_000; // 1500 USDC/WETH (25% drop) -> cascade
    uint256 internal constant CRASH_LINK_PRICE = 5_000_000; // 5 USDC/LINK -> LINK account liquidatable

    struct Addrs {
        address usdc;
        address weth;
        address oracle;
        address pool;
        address creditManager;
        address swapAdapter;
        address link;
        address linkCreditManager;
        address linkSwapAdapter;
    }

    /// @notice Seeds pool liquidity and three leveraged accounts across the health bands.
    function run() external {
        Addrs memory a = _readManifest();

        _seedLiquidity(a);
        _fundKeeper(a);

        // WETH market. Borrow sizes against 10 WETH collateral set the resting health bands; the USDC
        // drawn counts as account assets at open, so even the margin-call size opens above the floor.
        address healthy = _openLevered(a, a.creditManager, a.weth, a.swapAdapter, BORROWER_A_PK, COLLATERAL, 20_000e6);
        address warning = _openLevered(a, a.creditManager, a.weth, a.swapAdapter, BORROWER_B_PK, COLLATERAL, 80_000e6);
        address marginCall =
            _openLevered(a, a.creditManager, a.weth, a.swapAdapter, BORROWER_C_PK, COLLATERAL, 120_000e6);

        // LINK market: one levered account so the book spans both markets. A LINK price crash makes
        // it liquidatable, exercising the keeper's per-market routing.
        address linkAccount =
            _openLevered(a, a.linkCreditManager, a.link, a.linkSwapAdapter, BORROWER_D_PK, LINK_COLLATERAL, 30_000e6);

        CreditManager cm = CreditManager(a.creditManager);
        CreditManager linkCm = CreditManager(a.linkCreditManager);
        console2.log("Seeded Meridian book:");
        console2.log("  pool liquidity (USDC) ", Pool(a.pool).totalAssets());
        console2.log("  healthy     account   ", healthy, cm.calcHealthFactor(healthy));
        console2.log("  warning     account   ", warning, cm.calcHealthFactor(warning));
        console2.log("  margin-call account   ", marginCall, cm.calcHealthFactor(marginCall));
        console2.log("  LINK        account   ", linkAccount, linkCm.calcHealthFactor(linkAccount));
    }

    /// @notice Crashes the WETH price below the floor so the levered accounts become liquidatable.
    /// @dev On a clean local node the oracle is settable, so we just lower the price. On a mainnet
    ///      fork (USE_CHAINLINK=1) the real Chainlink feed can't be moved, so we simulate the drop by
    ///      repointing the oracle's WETH feed to a low mock aggregator (owner-gated, deployer signs).
    function crash() external {
        Addrs memory a = _readManifest();
        if (vm.envOr("USE_CHAINLINK", false)) {
            vm.startBroadcast(DEPLOYER_PK);
            // Mock aggregators carry 8 decimals, so scale the 6-dp crash prices by 1e2.
            MockAggregator wethCrashed = new MockAggregator(8, int256(CRASH_PRICE * 1e2), block.timestamp);
            ChainlinkPriceOracle(a.oracle).setFeed(a.weth, wethCrashed, 7 days);
            MockAggregator linkCrashed = new MockAggregator(8, int256(CRASH_LINK_PRICE * 1e2), block.timestamp);
            ChainlinkPriceOracle(a.oracle).setFeed(a.link, linkCrashed, 7 days);
            vm.stopBroadcast();
        } else {
            vm.startBroadcast(DEPLOYER_PK);
            MockPriceOracle(a.oracle).setPrice(a.weth, CRASH_PRICE);
            MockPriceOracle(a.oracle).setPrice(a.link, CRASH_LINK_PRICE);
            vm.stopBroadcast();
        }
        console2.log("Crashed WETH price to (USDC, 6dp)", CRASH_PRICE);
        console2.log("Crashed LINK price to (USDC, 6dp)", CRASH_LINK_PRICE);
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
        // The keeper funds repayment shortfalls through each market's credit manager, so it approves
        // every market it might liquidate in (not just the primary one).
        IERC20(a.usdc).approve(a.creditManager, type(uint256).max);
        IERC20(a.usdc).approve(a.linkCreditManager, type(uint256).max);
        vm.stopBroadcast();
    }

    /// @dev Opens a credit account in the given market and levers the borrowed USDC into that
    ///      market's collateral through its whitelisted adapter, exactly as a borrower would.
    function _openLevered(
        Addrs memory a,
        address creditManager,
        address collateralToken,
        address swapAdapter,
        uint256 borrowerPk,
        uint256 collateral,
        uint256 borrow
    ) internal returns (address account) {
        address borrower = vm.addr(borrowerPk);
        CreditManager cm = CreditManager(creditManager);

        vm.startBroadcast(borrowerPk);
        MockERC20(collateralToken).mint(borrower, collateral);
        IERC20(collateralToken).approve(creditManager, type(uint256).max);
        account = cm.openCreditAccount(collateral, borrow, borrower);

        CreditManager.MultiCall[] memory calls = new CreditManager.MultiCall[](2);
        calls[0] =
            CreditManager.MultiCall({target: a.usdc, callData: abi.encodeCall(IERC20.approve, (swapAdapter, borrow))});
        calls[1] = CreditManager.MultiCall({
            target: swapAdapter,
            callData: abi.encodeCall(UniswapV3Adapter.swapExactInputSingle, (a.usdc, collateralToken, FEE, borrow, 0))
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
            swapAdapter: vm.parseJsonAddress(json, ".swapAdapter"),
            link: vm.parseJsonAddress(json, ".markets[1].collateralToken"),
            linkCreditManager: vm.parseJsonAddress(json, ".markets[1].creditManager"),
            linkSwapAdapter: vm.parseJsonAddress(json, ".markets[1].swapAdapter")
        });
    }
}
