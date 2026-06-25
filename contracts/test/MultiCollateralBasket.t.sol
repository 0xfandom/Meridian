// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {Pool} from "../src/Pool.sol";
import {InterestRateModel} from "../src/InterestRateModel.sol";
import {CreditManager} from "../src/CreditManager.sol";
import {MarginAccount} from "../src/MarginAccount.sol";
import {RiskConfigurator} from "../src/RiskConfigurator.sol";
import {AccessController} from "../src/AccessController.sol";
import {LiquidationModule} from "../src/LiquidationModule.sol";
import {ILiquidationTarget} from "../src/interfaces/ILiquidationTarget.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockPriceOracle} from "./mocks/MockPriceOracle.sol";

/// @notice v1 multi-collateral basket: a single account holds several collateral assets, valued as
///         the sum of each asset's haircut-adjusted value over debt. WETH is the primary; LINK (18dp)
///         and a deliberately 8-decimal asset are added by governance to prove per-asset decimals and
///         haircuts. No correlation netting — that is a later version.
contract MultiCollateralBasketTest is Test {
    MockERC20 internal usd;
    MockERC20 internal weth; // primary, 18dp
    MockERC20 internal link; // 18dp
    MockERC20 internal wbtc; // 8dp — proves the decimals fix
    InterestRateModel internal irm;
    Pool internal pool;
    MockPriceOracle internal oracle;
    MarginAccount internal accountImpl;
    RiskConfigurator internal riskConfigurator;
    AccessController internal access;
    LiquidationModule internal module;
    CreditManager internal cm;

    address internal lp = makeAddr("lp");
    address internal borrower = makeAddr("borrower");
    address internal keeper = makeAddr("keeper");

    // Prices in 18dp USD: WETH $2, LINK $5, WBTC $100.
    uint256 internal constant WETH_PRICE = 2e18;
    uint256 internal constant LINK_PRICE = 5e18;
    uint256 internal constant WBTC_PRICE = 100e18;

    function setUp() public {
        usd = new MockERC20("USD", "USD", 18);
        weth = new MockERC20("Wrapped Ether", "WETH", 18);
        link = new MockERC20("Chainlink", "LINK", 18);
        wbtc = new MockERC20("Wrapped BTC", "WBTC", 8);

        irm = new InterestRateModel(0, 400, 6000, 8000);
        pool = new Pool(IERC20(address(usd)), irm, address(this), "Meridian USD Pool", "mUSD");

        oracle = new MockPriceOracle();
        oracle.setPrice(address(weth), WETH_PRICE);
        oracle.setPrice(address(link), LINK_PRICE);
        oracle.setPrice(address(wbtc), WBTC_PRICE);

        accountImpl = new MarginAccount();
        riskConfigurator = new RiskConfigurator(address(this));
        // haircut bps -> liquidation threshold = BPS - haircut.
        riskConfigurator.setCollateral(address(weth), 1500, 50_000); // LT 8500
        riskConfigurator.setCollateral(address(link), 2000, 50_000); // LT 8000
        riskConfigurator.setCollateral(address(wbtc), 4000, 50_000); // LT 6000

        cm = new CreditManager(
            pool, IERC20(address(weth)), irm, oracle, riskConfigurator, address(accountImpl), address(this)
        );
        cm.addCollateralToken(address(link));
        cm.addCollateralToken(address(wbtc));
        pool.setCreditManager(address(cm), true);

        access = new AccessController(address(this));
        module = new LiquidationModule(access, ILiquidationTarget(address(cm)), address(this));
        cm.setLiquidationModule(address(module));
        access.grantRole(AccessController.Role.Keeper, keeper);

        usd.mint(lp, 100_000e18);
        vm.startPrank(lp);
        usd.approve(address(pool), type(uint256).max);
        pool.deposit(100_000e18, lp);
        vm.stopPrank();

        weth.mint(borrower, 1000e18);
        link.mint(borrower, 1000e18);
        wbtc.mint(borrower, 1000e8);
        vm.startPrank(borrower);
        weth.approve(address(cm), type(uint256).max);
        link.approve(address(cm), type(uint256).max);
        wbtc.approve(address(cm), type(uint256).max);
        vm.stopPrank();
    }

    /// Opens a primary-WETH account and adds LINK + WBTC, forming a three-asset basket.
    function _openBasket() internal returns (address account) {
        vm.startPrank(borrower);
        account = cm.openCreditAccount(100e18, 800e18, borrower); // 100 WETH + 800 USD drawn
        cm.addCollateral(account, address(link), 50e18); // 50 LINK
        cm.addCollateral(account, address(wbtc), 2e8); // 2 WBTC
        vm.stopPrank();
    }

    function test_BasketHealthSumsEachAssetByItsOwnHaircut() public {
        address account = _openBasket();

        // Account holds: 800 USD, 100 WETH ($200), 50 LINK ($250), 2 WBTC ($200). Debt 800.
        //   USD : 800 * 0.85 (primary LT) = 680
        //   WETH: 200 * 0.85             = 170
        //   LINK: 250 * 0.80             = 200
        //   WBTC: 200 * 0.60             = 120
        //   adjusted = 1170 ; HF = 1170 / 800 = 1.4625
        assertEq(cm.calcHealthFactor(account), 1.4625e18);
    }

    function test_EightDecimalCollateralValuedByItsUnitNotWad() public {
        // A WBTC-only basket: open a tiny WETH position to satisfy open, then lean on WBTC.
        vm.startPrank(borrower);
        address account = cm.openCreditAccount(1e18, 0, borrower); // 1 WETH, no debt
        cm.addCollateral(account, address(wbtc), 5e8); // 5 WBTC = $500
        cm.increaseDebt(account, 100e18); // borrow 100 USD
        vm.stopPrank();

        // Assets: 1 WETH ($2), 5 WBTC ($500), 100 USD. Debt 100.
        //   USD : 100 * 0.85 = 85 ; WETH: 2 * 0.85 = 1.7 ; WBTC: 500 * 0.60 = 300 -> 386.7
        //   HF = 386.7 / 100 = 3.867
        // A naive /WAD on the 8dp balance would undervalue WBTC by 1e10 and crater this number.
        assertEq(cm.calcHealthFactor(account), 3.867e18);
    }

    function test_LiquidationSeizesEveryBasketAsset() public {
        address account = _openBasket();

        // Crash all three collaterals so the basket goes underwater (only the stable USD draw,
        // weighted at 0.85, is left to back the 800 debt -> HF ~0.85).
        oracle.setPrice(address(weth), 0.2e18);
        oracle.setPrice(address(link), 0.5e18);
        oracle.setPrice(address(wbtc), 1e18);
        assertLt(cm.calcHealthFactor(account), 1e18);

        usd.mint(keeper, 10_000e18);
        vm.prank(keeper);
        usd.approve(address(cm), type(uint256).max);

        uint256 poolAssetsBefore = pool.totalAssets();
        vm.prank(keeper);
        module.liquidate(account);

        // Pool made whole, debt cleared.
        assertEq(cm.calcDebt(account), 0);
        assertEq(pool.totalBorrowed(), 0);
        assertGe(pool.totalAssets(), poolAssetsBefore);

        // Keeper seized all three collaterals.
        assertEq(weth.balanceOf(keeper), 100e18);
        assertEq(link.balanceOf(keeper), 50e18);
        assertEq(wbtc.balanceOf(keeper), 2e8);

        (,,, bool open) = cm.accounts(account);
        assertFalse(open);
    }

    function test_CloseReturnsEveryBasketAssetToOwner() public {
        address account = _openBasket();

        uint256 wethBefore = weth.balanceOf(borrower);
        uint256 linkBefore = link.balanceOf(borrower);
        uint256 wbtcBefore = wbtc.balanceOf(borrower);

        // Fund the small accrued-interest dust so close can repay, then close.
        usd.mint(account, 1e18);
        vm.prank(borrower);
        cm.closeCreditAccount(account);

        assertEq(weth.balanceOf(borrower), wethBefore + 100e18);
        assertEq(link.balanceOf(borrower), linkBefore + 50e18);
        assertEq(wbtc.balanceOf(borrower), wbtcBefore + 2e8);
    }

    function test_WithdrawOneCollateralRechecksHealth() public {
        // Open and lever: draw 400 USD, then simulate deploying it into collateral so the account is
        // collateral-backed with no stable USD cushion. Holds 100 WETH, 50 LINK, 2 WBTC; debt 400.
        vm.startPrank(borrower);
        address account = cm.openCreditAccount(100e18, 400e18, borrower);
        cm.addCollateral(account, address(link), 50e18);
        cm.addCollateral(account, address(wbtc), 2e8);
        vm.stopPrank();

        vm.prank(address(cm));
        MarginAccount(account).transferToken(address(usd), address(0x5152), 400e18);

        // adjusted = WETH 170 + LINK 200 + WBTC 120 = 490 ; debt 400 -> HF 1.225.
        assertGt(cm.calcHealthFactor(account), 1e18);

        // Withdrawing all WBTC drops adjusted to 370 (< 400 debt) -> health re-check reverts.
        vm.prank(borrower);
        vm.expectRevert(CreditManager.Undercollateralized.selector);
        cm.withdrawCollateral(account, address(wbtc), 2e8, borrower);

        // A small LINK withdrawal that keeps health above 1 succeeds.
        vm.prank(borrower);
        cm.withdrawCollateral(account, address(link), 1e18, borrower);
        assertGt(cm.calcHealthFactor(account), 1e18);
    }

    function test_AddingUnregisteredCollateralReverts() public {
        address account = _openBasket();
        MockERC20 stray = new MockERC20("Stray", "STRAY", 18);
        stray.mint(borrower, 10e18);
        vm.startPrank(borrower);
        stray.approve(address(cm), type(uint256).max);
        vm.expectRevert(abi.encodeWithSelector(CreditManager.NotCollateral.selector, address(stray)));
        cm.addCollateral(account, address(stray), 10e18);
        vm.stopPrank();
    }

    function test_GovernanceCollateralSet() public {
        // Primary is always present and cannot be removed.
        assertTrue(cm.isCollateral(address(weth)));
        vm.expectRevert(CreditManager.CannotRemovePrimary.selector);
        cm.removeCollateralToken(address(weth));

        // Duplicate add and underlying add are rejected.
        vm.expectRevert(abi.encodeWithSelector(CreditManager.AlreadyCollateral.selector, address(link)));
        cm.addCollateralToken(address(link));
        vm.expectRevert(abi.encodeWithSelector(CreditManager.NotCollateral.selector, address(usd)));
        cm.addCollateralToken(address(usd));

        // Remove LINK; it stops being collateral and leaves the list.
        cm.removeCollateralToken(address(link));
        assertFalse(cm.isCollateral(address(link)));
        address[] memory list = cm.collateralTokensList();
        assertEq(list.length, 2); // weth + wbtc
        for (uint256 i = 0; i < list.length; i++) {
            assertTrue(list[i] != address(link));
        }
    }

    function test_OnlyOwnerManagesCollateralSet() public {
        MockERC20 other = new MockERC20("Other", "OTH", 18);
        vm.prank(borrower);
        vm.expectRevert();
        cm.addCollateralToken(address(other));
    }
}
