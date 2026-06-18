// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {Pool} from "../src/Pool.sol";
import {InterestRateModel} from "../src/InterestRateModel.sol";
import {CreditManager} from "../src/CreditManager.sol";
import {CreditFacade} from "../src/CreditFacade.sol";
import {MarginAccount} from "../src/MarginAccount.sol";
import {RiskConfigurator} from "../src/RiskConfigurator.sol";
import {Guardian} from "../src/governance/Guardian.sol";
import {IGuardian} from "../src/interfaces/IGuardian.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockPriceOracle} from "./mocks/MockPriceOracle.sol";

/// @notice Verifies the emergency pause gates risk-increasing flows in the pool and credit
///         manager while leaving de-risking flows (repay, top-up, close) open.
contract GuardianPauseTest is Test {
    MockERC20 internal usd;
    MockERC20 internal weth;
    InterestRateModel internal irm;
    Pool internal pool;
    MockPriceOracle internal oracle;
    MarginAccount internal accountImpl;
    RiskConfigurator internal riskConfigurator;
    CreditManager internal cm;
    CreditFacade internal facade;
    Guardian internal guardian;

    address internal lp = makeAddr("lp");
    address internal borrower = makeAddr("borrower");

    uint256 internal constant WETH_PRICE = 2e18;

    function setUp() public {
        usd = new MockERC20("USD", "USD", 18);
        weth = new MockERC20("Wrapped Ether", "WETH", 18);
        irm = new InterestRateModel(0, 400, 6000, 8000);
        pool = new Pool(IERC20(address(usd)), irm, address(this), "Meridian USD Pool", "mUSD");
        oracle = new MockPriceOracle();
        oracle.setPrice(address(weth), WETH_PRICE);
        accountImpl = new MarginAccount();
        riskConfigurator = new RiskConfigurator(address(this));
        riskConfigurator.setCollateral(address(weth), 1500, 50_000);
        cm = new CreditManager(
            pool, IERC20(address(weth)), irm, oracle, riskConfigurator, address(accountImpl), address(this)
        );
        pool.setCreditManager(address(cm), true);
        facade = new CreditFacade(cm);
        cm.setFacade(address(facade));

        // This contract is both governance owner and the guardian key, so it can pause directly.
        guardian = new Guardian(address(this), address(this));
        pool.setGuardian(IGuardian(address(guardian)));
        cm.setGuardian(IGuardian(address(guardian)));

        usd.mint(lp, 1000e18);
        vm.startPrank(lp);
        usd.approve(address(pool), type(uint256).max);
        pool.deposit(1000e18, lp);
        vm.stopPrank();

        weth.mint(borrower, 1000e18);
        vm.prank(borrower);
        weth.approve(address(cm), type(uint256).max);
    }

    function _open(uint256 collateral, uint256 borrow) internal returns (address account) {
        vm.prank(borrower);
        account = cm.openCreditAccount(collateral, borrow, borrower);
    }

    // ------------------------------- pool gates ------------------------------ //

    function test_PausedBlocksDeposit() public {
        guardian.pause();
        usd.mint(lp, 1e18);
        vm.startPrank(lp);
        vm.expectRevert(Guardian.EnforcedPause.selector);
        pool.deposit(1e18, lp);
        vm.stopPrank();
    }

    function test_PausedBlocksWithdraw() public {
        guardian.pause();
        vm.prank(lp);
        vm.expectRevert(Guardian.EnforcedPause.selector);
        pool.withdraw(1e18, lp, lp);
    }

    function test_PausedBlocksBorrow() public {
        guardian.pause();
        vm.prank(borrower);
        vm.expectRevert(Guardian.EnforcedPause.selector);
        cm.openCreditAccount(100e18, 400e18, borrower);
    }

    // --------------------------- credit manager gates ------------------------ //

    function test_PausedBlocksIncreaseDebtWithdrawAndMulticall() public {
        address account = _open(100e18, 400e18);
        guardian.pause();

        vm.prank(borrower);
        vm.expectRevert(Guardian.EnforcedPause.selector);
        cm.increaseDebt(account, 100e18);

        vm.prank(borrower);
        vm.expectRevert(Guardian.EnforcedPause.selector);
        cm.withdrawCollateral(account, 1e18, borrower);

        CreditManager.MultiCall[] memory calls = new CreditManager.MultiCall[](1);
        calls[0] = CreditManager.MultiCall({
            target: address(usd), callData: abi.encodeWithSelector(IERC20.approve.selector, address(this), 1e18)
        });
        vm.prank(borrower);
        vm.expectRevert(Guardian.EnforcedPause.selector);
        facade.multicall(account, calls);
    }

    // ----------------------- de-risking stays available ---------------------- //

    function test_PausedAllowsRepayTopUpAndClose() public {
        address account = _open(100e18, 800e18);
        guardian.pause();

        // Add collateral: risk-reducing, must stay open.
        vm.prank(borrower);
        cm.addCollateral(account, 10e18);
        assertEq(weth.balanceOf(account), 110e18);

        // Repay part of the debt: risk-reducing, must stay open.
        vm.prank(borrower);
        cm.decreaseDebt(account, 300e18);
        assertEq(cm.calcDebt(account), 500e18);

        // Close the account fully: risk-reducing, must stay open.
        vm.prank(borrower);
        facade.closeCreditAccount(account);
        assertEq(cm.calcDebt(account), 0);
    }

    // -------------------------------- recovery ------------------------------- //

    function test_UnpauseRestoresAccess() public {
        guardian.pause();
        guardian.unpause();

        usd.mint(lp, 1e18);
        vm.startPrank(lp);
        pool.deposit(1e18, lp);
        vm.stopPrank();

        address account = _open(100e18, 400e18);
        assertEq(cm.calcDebt(account), 400e18);
    }

    function test_OnlyOwnerSetsGuardianOnPool() public {
        vm.prank(makeAddr("intruder"));
        vm.expectRevert();
        pool.setGuardian(IGuardian(address(guardian)));
    }
}
