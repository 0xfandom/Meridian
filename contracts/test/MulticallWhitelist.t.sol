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
import {WhitelistRegistry} from "../src/WhitelistRegistry.sol";
import {IWhitelistRegistry} from "../src/interfaces/IWhitelistRegistry.sol";
import {AdapterRegistry} from "../src/AdapterRegistry.sol";
import {IAdapterRegistry} from "../src/interfaces/IAdapterRegistry.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockPriceOracle} from "./mocks/MockPriceOracle.sol";

/// @notice Verifies that, once a whitelist registry is attached, multicall only routes calls to
///         sanctioned (target, selector) pairs and rejects everything else.
contract MulticallWhitelistTest is Test {
    MockERC20 internal usd;
    MockERC20 internal weth;
    InterestRateModel internal irm;
    Pool internal pool;
    MockPriceOracle internal oracle;
    MarginAccount internal accountImpl;
    RiskConfigurator internal riskConfigurator;
    WhitelistRegistry internal whitelist;
    AdapterRegistry internal adapters;
    CreditManager internal cm;
    CreditFacade internal facade;

    address internal lp = makeAddr("lp");
    address internal borrower = makeAddr("borrower");

    function setUp() public {
        usd = new MockERC20("USD", "USD", 18);
        weth = new MockERC20("Wrapped Ether", "WETH", 18);
        irm = new InterestRateModel(0, 400, 6000, 8000);
        pool = new Pool(IERC20(address(usd)), irm, address(this), "Meridian USD Pool", "mUSD");
        oracle = new MockPriceOracle();
        oracle.setPrice(address(weth), 2e18);
        accountImpl = new MarginAccount();
        riskConfigurator = new RiskConfigurator(address(this));
        riskConfigurator.setCollateral(address(weth), 1500, 50_000);
        cm = new CreditManager(
            pool, IERC20(address(weth)), irm, oracle, riskConfigurator, address(accountImpl), address(this)
        );
        pool.setCreditManager(address(cm), true);
        facade = new CreditFacade(cm);
        cm.setFacade(address(facade));

        whitelist = new WhitelistRegistry(address(this));
        cm.setWhitelistRegistry(IWhitelistRegistry(address(whitelist)));
        adapters = new AdapterRegistry(address(this));

        usd.mint(lp, 1000e18);
        vm.startPrank(lp);
        usd.approve(address(pool), type(uint256).max);
        pool.deposit(1000e18, lp);
        vm.stopPrank();

        weth.mint(borrower, 1000e18);
        vm.prank(borrower);
        weth.approve(address(cm), type(uint256).max);
    }

    function _open() internal returns (address account) {
        vm.prank(borrower);
        account = cm.openCreditAccount(100e18, 400e18, borrower);
    }

    function _approveCall() internal view returns (CreditManager.MultiCall[] memory calls) {
        calls = new CreditManager.MultiCall[](1);
        calls[0] = CreditManager.MultiCall({
            target: address(usd), callData: abi.encodeWithSelector(IERC20.approve.selector, address(this), 1e18)
        });
    }

    function test_AllowedTargetAndSelectorSucceeds() public {
        address account = _open();
        whitelist.setTarget(address(usd), true);
        whitelist.setSelector(address(usd), IERC20.approve.selector, true);

        vm.prank(borrower);
        facade.multicall(account, _approveCall());
        assertEq(usd.allowance(account, address(this)), 1e18);
    }

    function test_UnlistedTargetReverts() public {
        address account = _open();

        vm.prank(borrower);
        vm.expectRevert(
            abi.encodeWithSelector(CreditManager.CallNotWhitelisted.selector, address(usd), IERC20.approve.selector)
        );
        facade.multicall(account, _approveCall());
    }

    function test_AllowedTargetButUnlistedSelectorReverts() public {
        address account = _open();
        whitelist.setTarget(address(usd), true); // target on, selector still off

        vm.prank(borrower);
        vm.expectRevert(
            abi.encodeWithSelector(CreditManager.CallNotWhitelisted.selector, address(usd), IERC20.approve.selector)
        );
        facade.multicall(account, _approveCall());
    }

    function test_ClearingRegistryRemovesGate() public {
        address account = _open();
        cm.setWhitelistRegistry(IWhitelistRegistry(address(0)));

        // No registry: the same previously-unlisted call now routes freely.
        vm.prank(borrower);
        facade.multicall(account, _approveCall());
        assertEq(usd.allowance(account, address(this)), 1e18);
    }

    function test_OnlyOwnerSetsRegistry() public {
        vm.prank(makeAddr("intruder"));
        vm.expectRevert();
        cm.setWhitelistRegistry(IWhitelistRegistry(address(whitelist)));
    }

    // ----------------------------------------------------------------------- //
    //                          Adapter-registry gate                          //
    // ----------------------------------------------------------------------- //

    /// @dev A non-approve call whose target is not a token approve. `usd.totalSupply()` is harmless
    ///      (view, no state) so it executes cleanly once it clears the gates.
    function _totalSupplyCall() internal view returns (CreditManager.MultiCall[] memory calls) {
        calls = new CreditManager.MultiCall[](1);
        calls[0] = CreditManager.MultiCall({
            target: address(usd), callData: abi.encodeWithSelector(IERC20.totalSupply.selector)
        });
    }

    function test_AdapterGate_UnregisteredNonApproveReverts() public {
        address account = _open();
        cm.setWhitelistRegistry(IWhitelistRegistry(address(0))); // isolate the adapter gate
        cm.setAdapterRegistry(IAdapterRegistry(address(adapters)));

        vm.prank(borrower);
        vm.expectRevert(abi.encodeWithSelector(CreditManager.TargetNotAdapter.selector, address(usd)));
        facade.multicall(account, _totalSupplyCall());
    }

    function test_AdapterGate_RegisteredTargetPasses() public {
        address account = _open();
        cm.setWhitelistRegistry(IWhitelistRegistry(address(0)));
        cm.setAdapterRegistry(IAdapterRegistry(address(adapters)));
        adapters.registerAdapter(address(usd), address(this)); // treat usd as a registered adapter

        // No revert: the call clears the adapter gate and executes.
        vm.prank(borrower);
        facade.multicall(account, _totalSupplyCall());
    }

    function test_AdapterGate_ApproveLegAllowedToNonAdapter() public {
        address account = _open();
        cm.setWhitelistRegistry(IWhitelistRegistry(address(0)));
        cm.setAdapterRegistry(IAdapterRegistry(address(adapters)));

        // The approve leg is carved out: it funds an adapter, so its target is the token, not an adapter.
        vm.prank(borrower);
        facade.multicall(account, _approveCall());
        assertEq(usd.allowance(account, address(this)), 1e18);
    }

    function test_AdapterGate_ComposesWithWhitelist() public {
        address account = _open();
        // Both gates on. A non-approve call must satisfy both: whitelisted AND a registered adapter.
        cm.setAdapterRegistry(IAdapterRegistry(address(adapters)));
        whitelist.setTarget(address(usd), true);
        whitelist.setSelector(address(usd), IERC20.totalSupply.selector, true);

        // Whitelisted but not yet registered: the adapter gate still blocks it.
        vm.prank(borrower);
        vm.expectRevert(abi.encodeWithSelector(CreditManager.TargetNotAdapter.selector, address(usd)));
        facade.multicall(account, _totalSupplyCall());

        // Once registered, the call clears both gates.
        adapters.registerAdapter(address(usd), address(this));
        vm.prank(borrower);
        facade.multicall(account, _totalSupplyCall());
    }

    function test_AdapterGate_ClearingRemovesGate() public {
        address account = _open();
        cm.setWhitelistRegistry(IWhitelistRegistry(address(0)));
        cm.setAdapterRegistry(IAdapterRegistry(address(adapters)));
        cm.setAdapterRegistry(IAdapterRegistry(address(0))); // clear it again

        // Gate off: an unregistered, non-approve target routes freely.
        vm.prank(borrower);
        facade.multicall(account, _totalSupplyCall());
    }

    function test_OnlyOwnerSetsAdapterRegistry() public {
        vm.prank(makeAddr("intruder"));
        vm.expectRevert();
        cm.setAdapterRegistry(IAdapterRegistry(address(adapters)));
    }
}
