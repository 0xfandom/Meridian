// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {AccessController} from "../src/AccessController.sol";
import {CreditFacade} from "../src/CreditFacade.sol";
import {CreditManager} from "../src/CreditManager.sol";
import {InterestRateModel} from "../src/InterestRateModel.sol";
import {LiquidationModule} from "../src/LiquidationModule.sol";
import {MarginAccount} from "../src/MarginAccount.sol";
import {Pool} from "../src/Pool.sol";
import {RiskConfigurator} from "../src/RiskConfigurator.sol";
import {WhitelistRegistry} from "../src/WhitelistRegistry.sol";
import {AdapterRegistry} from "../src/AdapterRegistry.sol";
import {ChainlinkPriceOracle} from "../src/ChainlinkPriceOracle.sol";
import {IChainlinkAggregator} from "../src/interfaces/IChainlinkAggregator.sol";
import {UniswapV3Adapter} from "../src/adapters/UniswapV3Adapter.sol";
import {CurveAdapter} from "../src/adapters/CurveAdapter.sol";
import {LstAdapter} from "../src/adapters/LstAdapter.sol";
import {Guardian} from "../src/governance/Guardian.sol";
import {RiskParams} from "../src/libraries/RiskParams.sol";
import {IGuardian} from "../src/interfaces/IGuardian.sol";
import {IInterestRateModel} from "../src/interfaces/IInterestRateModel.sol";
import {ILiquidationTarget} from "../src/interfaces/ILiquidationTarget.sol";
import {IPool} from "../src/interfaces/IPool.sol";
import {IPriceOracle} from "../src/interfaces/IPriceOracle.sol";
import {IRiskConfigurator} from "../src/interfaces/IRiskConfigurator.sol";
import {IUniswapV3SwapRouter} from "../src/interfaces/IUniswapV3SwapRouter.sol";
import {IWhitelistRegistry} from "../src/interfaces/IWhitelistRegistry.sol";
import {IAdapterRegistry} from "../src/interfaces/IAdapterRegistry.sol";
import {IWstETH} from "../src/interfaces/IWstETH.sol";
import {MockERC20} from "../test/mocks/MockERC20.sol";
import {MockPriceOracle} from "../test/mocks/MockPriceOracle.sol";
import {MockSwapRouter} from "../test/mocks/MockSwapRouter.sol";
import {MockCurvePool} from "../test/mocks/MockCurvePool.sol";
import {MockWstETH} from "../test/mocks/MockWstETH.sol";

/// @title DeployScript
/// @notice Deploys the full Meridian system and applies every wiring step. The local profile
///         (chain id 31337) deploys mock USDC, WETH, LINK, and a settable oracle so the system is
///         self-contained on a vanilla anvil node; public networks supply real token and feed
///         addresses via config and are a follow-up.
/// @dev The system is multi-market: one shared USDC pool, oracle, and risk configurator, with one
///      single-collateral credit market (CreditManager + CreditFacade + LiquidationModule + mock DEX)
///      per asset, plus one basket market whose CreditManager accepts several collaterals at once.
///      WETH and LINK ship as single-collateral markets; the basket market accepts both. The credit
///      manager values each collateral by its own decimals, so a non-18-decimal asset is fine on-chain
///      (the local mock DEX, however, still pays 18-decimal collateral for the lever path).
/// @dev Run locally with: forge script script/Deploy.s.sol:DeployScript
///      Broadcast to anvil with: forge script script/Deploy.s.sol:DeployScript \
///        --rpc-url http://127.0.0.1:8545 --broadcast --private-key <anvil_key>
contract DeployScript is Script {
    uint256 internal constant LOCAL_CHAIN_ID = 31_337;
    uint256 internal constant COLLATERAL_WAD = 1e18; // every collateral is 18-decimal (see contract note)

    struct Config {
        address keeper;
        uint256 wethPriceInUsdc;
        uint256 warningBps;
        uint256 marginCallBps;
        uint256 liquidationBps;
        uint256 baseRateBps;
        uint256 slope1Bps;
        uint256 slope2Bps;
        uint256 optimalUtilizationBps;
        uint256 wethHaircutBps;
        uint256 wethMaxLeverageBps;
        uint256 linkPriceInUsdc;
        uint256 linkHaircutBps;
        uint256 linkMaxLeverageBps;
    }

    /// @dev One credit market bound to a single collateral asset. The pool, oracle, and risk
    ///      configurator are shared across markets. Used only as a local return/serialisation type;
    ///      Deployment stores the addresses flat so it can be copied to storage in tests.
    struct Market {
        string symbol;
        address collateralToken;
        address creditManager;
        address creditFacade;
        address liquidationModule;
        address swapRouter;
        address swapAdapter;
    }

    struct Deployment {
        address usdc;
        address oracle;
        address interestRateModel;
        address pool;
        address riskConfigurator;
        address accountImplementation;
        address guardian;
        address whitelistRegistry;
        address adapterRegistry;
        address accessController;
        // Shared periphery adapters (local: wrapped over mock venues), registered in the adapter
        // registry and whitelisted so any market's account can route these ops through both gates.
        address curveAdapter;
        address curvePool;
        address curveLp;
        address lstAdapter;
        address steth;
        address wsteth;
        // Primary (WETH) market; the flat fields are also what the off-chain services read today.
        address weth;
        address creditManager;
        address creditFacade;
        address liquidationModule;
        address swapRouter;
        address swapAdapter;
        // LINK market.
        address link;
        address linkCreditManager;
        address linkCreditFacade;
        address linkLiquidationModule;
        address linkSwapRouter;
        address linkSwapAdapter;
        // Basket market: one credit manager accepting both WETH (primary) and LINK as collateral.
        address basketCreditManager;
        address basketCreditFacade;
        address basketLiquidationModule;
        address basketSwapRouter;
        address basketSwapAdapter;
    }

    function run() external returns (Deployment memory deployment) {
        string memory network = block.chainid == LOCAL_CHAIN_ID ? "local" : vm.envString("NETWORK");
        Config memory config = _readConfig(network);
        address deployer = msg.sender;

        vm.startBroadcast();
        deployment = _deploy(config, deployer);
        vm.stopBroadcast();

        writeManifest(network, deployment, block.number);
        _log(network, deployment);
    }

    /// @notice Broadcast-free local deployment for tests: the caller is both owner and deployer, so
    ///         the owner-gated wiring setters execute against a consistent sender.
    function deployLocal() external returns (Deployment memory) {
        return _deploy(_readConfig("local"), address(this));
    }

    function _deploy(Config memory config, address deployer) internal returns (Deployment memory d) {
        require(block.chainid == LOCAL_CHAIN_ID, "DeployScript: only the local profile is implemented");

        // --- Mock collateral assets (local only); both 18-decimal ---
        d.usdc = address(new MockERC20("USD Coin", "USDC", 6));
        d.weth = address(new MockERC20("Wrapped Ether", "WETH", 18));
        d.link = address(new MockERC20("Chainlink", "LINK", 18));

        // --- Oracle (shared) ---
        // Default: a settable mock price. On a mainnet fork (USE_CHAINLINK=1) deploy the real
        // ChainlinkPriceOracle and read each collateral from its live feed (ETH_USD_FEED,
        // LINK_USD_FEED). The mock routers' rates derive from the *PriceInUsdc config values, so we
        // pin those to the live prices here to keep valuation and the local swap venues consistent.
        if (vm.envOr("USE_CHAINLINK", false)) {
            ChainlinkPriceOracle oracle = new ChainlinkPriceOracle(deployer, 6);
            config.wethPriceInUsdc = _wireFeed(oracle, d.weth, vm.envAddress("ETH_USD_FEED"));
            config.linkPriceInUsdc = _wireFeed(oracle, d.link, vm.envAddress("LINK_USD_FEED"));
            d.oracle = address(oracle);
        } else {
            MockPriceOracle oracle = new MockPriceOracle();
            oracle.setPrice(d.weth, config.wethPriceInUsdc);
            oracle.setPrice(d.link, config.linkPriceInUsdc);
            d.oracle = address(oracle);
        }

        // --- Risk (shared thresholds + IRM, plus per-collateral parameters) ---
        d.riskConfigurator = address(new RiskConfigurator(deployer));
        _configureRisk(RiskConfigurator(d.riskConfigurator), config);
        RiskConfigurator(d.riskConfigurator).setCollateral(d.weth, config.wethHaircutBps, config.wethMaxLeverageBps);
        RiskConfigurator(d.riskConfigurator).setCollateral(d.link, config.linkHaircutBps, config.linkMaxLeverageBps);

        // --- Core shared infrastructure ---
        d.interestRateModel = address(
            new InterestRateModel(config.baseRateBps, config.slope1Bps, config.slope2Bps, config.optimalUtilizationBps)
        );
        d.pool = address(
            new Pool(IERC20(d.usdc), IInterestRateModel(d.interestRateModel), deployer, "Meridian USDC Pool", "mUSDC")
        );
        d.accountImplementation = address(new MarginAccount());

        // --- Safety and access (shared) ---
        d.guardian = address(new Guardian(deployer, deployer));
        d.whitelistRegistry = address(new WhitelistRegistry(deployer));
        d.adapterRegistry = address(new AdapterRegistry(deployer));
        d.accessController = address(new AccessController(deployer));
        Pool(d.pool).setGuardian(IGuardian(d.guardian));
        AccessController(d.accessController).grantRole(AccessController.Role.Keeper, config.keeper);
        // The USDC approve leg of the lever path is shared by every market's adapter.
        WhitelistRegistry(d.whitelistRegistry).setTarget(d.usdc, true);
        WhitelistRegistry(d.whitelistRegistry).setSelector(d.usdc, IERC20.approve.selector, true);

        // --- Markets (one credit market per collateral, sharing the infrastructure above) ---
        Market memory weth = _deployMarket(d, "WETH", d.weth, deployer, config.wethPriceInUsdc);
        d.creditManager = weth.creditManager;
        d.creditFacade = weth.creditFacade;
        d.liquidationModule = weth.liquidationModule;
        d.swapRouter = weth.swapRouter;
        d.swapAdapter = weth.swapAdapter;

        Market memory link = _deployMarket(d, "LINK", d.link, deployer, config.linkPriceInUsdc);
        d.linkCreditManager = link.creditManager;
        d.linkCreditFacade = link.creditFacade;
        d.linkLiquidationModule = link.liquidationModule;
        d.linkSwapRouter = link.swapRouter;
        d.linkSwapAdapter = link.swapAdapter;

        // Basket market: a WETH-primary credit manager that also accepts LINK, so one account can hold
        // both. Its own mock DEX levers into WETH; the LINK market's adapter (whitelisted globally) can
        // lever into LINK. LINK's price and haircut are already configured on the shared oracle/risk.
        Market memory basket = _deployMarket(d, "BASKET", d.weth, deployer, config.wethPriceInUsdc);
        CreditManager(basket.creditManager).addCollateralToken(d.link);
        d.basketCreditManager = basket.creditManager;
        d.basketCreditFacade = basket.creditFacade;
        d.basketLiquidationModule = basket.liquidationModule;
        d.basketSwapRouter = basket.swapRouter;
        d.basketSwapAdapter = basket.swapAdapter;

        // --- Shared periphery adapters (Curve liquidity + LST wrap, registered + gated like swaps) ---
        (d.curveAdapter, d.curvePool, d.curveLp) = _deployCurve(d);
        (d.lstAdapter, d.steth, d.wsteth) = _deployLst(d);
    }

    /// @notice Deploys the shared Curve adapter over a local mock two-coin (USDC/WETH) pool, whitelists
    ///         its liquidity selectors and the LP-token approve leg, and registers the adapter so any
    ///         market's margin account can route Curve liquidity through the same whitelist + adapter
    ///         gates as the swap adapter. The pool is a mock locally; a real Curve pool address is
    ///         supplied by config on public networks (a follow-up, like the other live venues).
    /// @dev This wires the adapter as a sanctioned action surface. Valuing a Curve LP position as
    ///      account collateral (oracle price + risk haircut for the LP) is a separate strategy and is
    ///      not configured here.
    function _deployCurve(Deployment memory d) internal returns (address adapter, address pool, address lp) {
        MockERC20 lpToken = new MockERC20("Curve USDC/WETH LP", "crvUSDCWETH", 18);
        MockCurvePool curvePool = new MockCurvePool(d.usdc, d.weth, lpToken);
        // Seed both coins so single-coin withdrawals can pay out locally.
        MockERC20(d.usdc).mint(address(curvePool), 1_000_000e6);
        MockERC20(d.weth).mint(address(curvePool), 1_000_000e18);
        CurveAdapter curveAdapter = new CurveAdapter();

        WhitelistRegistry whitelist = WhitelistRegistry(d.whitelistRegistry);
        whitelist.setTarget(address(curveAdapter), true);
        whitelist.setSelector(address(curveAdapter), CurveAdapter.addLiquidity.selector, true);
        whitelist.setSelector(address(curveAdapter), CurveAdapter.removeLiquidityOneCoin.selector, true);
        // LP-token approve leg (account -> adapter) for the withdraw path; mirrors the global USDC approve.
        whitelist.setTarget(address(lpToken), true);
        whitelist.setSelector(address(lpToken), IERC20.approve.selector, true);

        AdapterRegistry(d.adapterRegistry).registerAdapter(address(curveAdapter), address(curvePool));

        adapter = address(curveAdapter);
        pool = address(curvePool);
        lp = address(lpToken);
    }

    /// @notice Deploys the shared LST adapter over a local mock staked token (stETH) and its wrapper
    ///         (wstETH), whitelists wrap/unwrap and both approve legs, and registers the adapter so any
    ///         margin account can route wrap/unwrap through the whitelist + adapter gates. Mock tokens
    ///         locally; real stETH/wstETH addresses are config-supplied on public networks (a follow-up).
    /// @dev Like Curve, this wires the adapter as a sanctioned action surface; pricing wstETH as account
    ///      collateral (oracle + haircut) is a separate strategy and is not configured here.
    function _deployLst(Deployment memory d) internal returns (address adapter, address staked, address wrapped) {
        MockERC20 steth = new MockERC20("Staked Ether", "stETH", 18);
        MockWstETH wsteth = new MockWstETH(IERC20(address(steth)));
        // Seed the wrapper with stETH so unwraps can pay out locally.
        steth.mint(address(wsteth), 1_000_000e18);
        LstAdapter lstAdapter = new LstAdapter(IERC20(address(steth)), IWstETH(address(wsteth)));

        WhitelistRegistry whitelist = WhitelistRegistry(d.whitelistRegistry);
        whitelist.setTarget(address(lstAdapter), true);
        whitelist.setSelector(address(lstAdapter), LstAdapter.wrap.selector, true);
        whitelist.setSelector(address(lstAdapter), LstAdapter.unwrap.selector, true);
        // Approve legs (account -> adapter): stETH for wrap, wstETH for unwrap. Mirror the global USDC approve.
        whitelist.setTarget(address(steth), true);
        whitelist.setSelector(address(steth), IERC20.approve.selector, true);
        whitelist.setTarget(address(wsteth), true);
        whitelist.setSelector(address(wsteth), IERC20.approve.selector, true);

        // The wrapped token is the external protocol the adapter wraps.
        AdapterRegistry(d.adapterRegistry).registerAdapter(address(lstAdapter), address(wsteth));

        adapter = address(lstAdapter);
        staked = address(steth);
        wrapped = address(wsteth);
    }

    /// @notice Reads a Chainlink feed, registers it on the oracle for `token`, and returns the live
    ///         price normalised to the unit of account (USDC, 6 decimals) for the local DEX rate.
    function _wireFeed(ChainlinkPriceOracle oracle, address token, address feed)
        internal
        returns (uint256 priceInUsdc)
    {
        uint8 feedDecimals = IChainlinkAggregator(feed).decimals();
        (, int256 answer,,,) = IChainlinkAggregator(feed).latestRoundData();
        require(answer > 0, "DeployScript: bad price feed");
        // answer > 0 is checked above, so the cast cannot truncate or wrap.
        // forge-lint: disable-next-line(unsafe-typecast)
        priceInUsdc = (uint256(answer) * 1e6) / (10 ** feedDecimals);
        oracle.setFeed(token, IChainlinkAggregator(feed), 7 days);
    }

    /// @notice Deploys and fully wires one credit market for `collateralToken`: a CreditManager bound
    ///         to the shared pool/oracle/risk configurator, its CreditFacade and LiquidationModule, and
    ///         a mock DEX (router + Uniswap adapter) so the market is leverage-capable locally. The
    ///         borrowed-USDC -> collateral lever path is whitelisted exactly as the live system would.
    /// @dev Collateral is assumed 18-decimal, so the mock router rate converts 6-dp USDC into 18-dp
    ///      collateral at the oracle price; this matches CreditManager's WAD-based valuation.
    function _deployMarket(
        Deployment memory d,
        string memory symbol,
        address collateralToken,
        address deployer,
        uint256 priceInUsdc
    ) internal returns (Market memory m) {
        CreditManager cm = new CreditManager(
            IPool(d.pool),
            IERC20(collateralToken),
            IInterestRateModel(d.interestRateModel),
            IPriceOracle(d.oracle),
            IRiskConfigurator(d.riskConfigurator),
            d.accountImplementation,
            deployer
        );
        CreditFacade facade = new CreditFacade(cm);
        LiquidationModule liquidation =
            new LiquidationModule(AccessController(d.accessController), ILiquidationTarget(address(cm)), deployer);

        // Mock DEX: pays out `collateralToken` for USDC at the oracle price, from its own reserves.
        MockSwapRouter router = new MockSwapRouter();
        router.setRate((COLLATERAL_WAD * 1e18) / priceInUsdc);
        MockERC20(collateralToken).mint(address(router), 1_000_000e18);
        UniswapV3Adapter adapter = new UniswapV3Adapter(IUniswapV3SwapRouter(address(router)));

        // Wire the credit manager to the shared safety/governance modules.
        Pool(d.pool).setCreditManager(address(cm), true);
        cm.setFacade(address(facade));
        cm.setGuardian(IGuardian(d.guardian));
        cm.setWhitelistRegistry(IWhitelistRegistry(d.whitelistRegistry));
        cm.setAdapterRegistry(IAdapterRegistry(d.adapterRegistry));
        cm.setLiquidationModule(address(liquidation));

        // Whitelist this market's lever leg (USDC approve is whitelisted once, globally).
        WhitelistRegistry whitelist = WhitelistRegistry(d.whitelistRegistry);
        whitelist.setTarget(address(adapter), true);
        whitelist.setSelector(address(adapter), UniswapV3Adapter.swapExactInputSingle.selector, true);

        // Register the adapter so it passes the credit manager's adapter gate: the adapter wraps the
        // (mock) swap router, which is the external protocol it routes into.
        AdapterRegistry(d.adapterRegistry).registerAdapter(address(adapter), address(router));

        m = Market({
            symbol: symbol,
            collateralToken: collateralToken,
            creditManager: address(cm),
            creditFacade: address(facade),
            liquidationModule: address(liquidation),
            swapRouter: address(router),
            swapAdapter: address(adapter)
        });
    }

    function _configureRisk(RiskConfigurator riskConfigurator, Config memory config) internal {
        riskConfigurator.setThresholds(
            RiskParams.HealthThresholds({
                warningBps: config.warningBps,
                marginCallBps: config.marginCallBps,
                liquidationBps: config.liquidationBps
            })
        );
        riskConfigurator.setInterestRateModel(
            RiskParams.InterestRateModel({
                baseRateBps: config.baseRateBps,
                slope1Bps: config.slope1Bps,
                slope2Bps: config.slope2Bps,
                optimalUtilizationBps: config.optimalUtilizationBps
            })
        );
    }

    /// @notice Writes deployments/<network>.json with the chain id, deploy block, and every contract
    ///         address. This manifest is the single source of truth the off-chain services read so no
    ///         address is ever entered by hand. The file is a generated artifact and is gitignored.
    /// @dev The flat top-level fields describe the primary market for back-compat; the `markets` array
    ///      lists every market. Services read the flat fields until they migrate to the array.
    function writeManifest(string memory network, Deployment memory d, uint256 startBlock) public {
        string memory obj = "meridian";
        vm.serializeString(obj, "network", network);
        vm.serializeUint(obj, "chainId", block.chainid);
        vm.serializeUint(obj, "startBlock", startBlock);
        vm.serializeAddress(obj, "usdc", d.usdc);
        vm.serializeAddress(obj, "weth", d.weth);
        vm.serializeAddress(obj, "oracle", d.oracle);
        vm.serializeAddress(obj, "interestRateModel", d.interestRateModel);
        vm.serializeAddress(obj, "pool", d.pool);
        vm.serializeAddress(obj, "riskConfigurator", d.riskConfigurator);
        vm.serializeAddress(obj, "accountImplementation", d.accountImplementation);
        vm.serializeAddress(obj, "creditManager", d.creditManager);
        vm.serializeAddress(obj, "creditFacade", d.creditFacade);
        vm.serializeAddress(obj, "guardian", d.guardian);
        vm.serializeAddress(obj, "whitelistRegistry", d.whitelistRegistry);
        vm.serializeAddress(obj, "adapterRegistry", d.adapterRegistry);
        vm.serializeAddress(obj, "curveAdapter", d.curveAdapter);
        vm.serializeAddress(obj, "curvePool", d.curvePool);
        vm.serializeAddress(obj, "curveLp", d.curveLp);
        vm.serializeAddress(obj, "lstAdapter", d.lstAdapter);
        vm.serializeAddress(obj, "steth", d.steth);
        vm.serializeAddress(obj, "wsteth", d.wsteth);
        vm.serializeAddress(obj, "accessController", d.accessController);
        vm.serializeAddress(obj, "liquidationModule", d.liquidationModule);
        vm.serializeAddress(obj, "swapRouter", d.swapRouter);
        string memory json = vm.serializeAddress(obj, "swapAdapter", d.swapAdapter);

        string memory path = string.concat("deployments/", network, ".json");
        vm.writeJson(json, path);

        // Inject the markets array as real JSON objects (vm.serialize on a string[] would escape them).
        Market[] memory markets = _markets(d);
        string memory marketsJson = "[";
        for (uint256 i = 0; i < markets.length; i++) {
            if (i > 0) marketsJson = string.concat(marketsJson, ",");
            marketsJson = string.concat(marketsJson, _serializeMarket(markets[i], i));
        }
        marketsJson = string.concat(marketsJson, "]");
        vm.writeJson(marketsJson, path, ".markets");

        // Basket market under its own key, additive to the single-collateral `markets` array so the
        // services that only read `markets` are unaffected until they learn to read baskets.
        string memory bk = "basketMarket";
        vm.serializeAddress(bk, "creditManager", d.basketCreditManager);
        vm.serializeAddress(bk, "creditFacade", d.basketCreditFacade);
        vm.serializeAddress(bk, "liquidationModule", d.basketLiquidationModule);
        vm.serializeAddress(bk, "swapRouter", d.basketSwapRouter);
        vm.serializeAddress(bk, "primaryCollateral", d.weth);
        string memory basketJson = vm.serializeAddress(bk, "swapAdapter", d.basketSwapAdapter);
        vm.writeJson(basketJson, path, ".basketMarket");

        // Inject the collateral set as real JSON objects (same reason the markets array is injected raw).
        string memory collateralsJson = string.concat(
            "[",
            '{"symbol":"WETH","collateralToken":"',
            vm.toString(d.weth),
            '","decimals":18},',
            '{"symbol":"LINK","collateralToken":"',
            vm.toString(d.link),
            '","decimals":18}',
            "]"
        );
        vm.writeJson(collateralsJson, path, ".basketMarket.collaterals");
    }

    /// @dev Rebuilds the market list from the flat Deployment fields for serialisation and logging.
    function _markets(Deployment memory d) internal pure returns (Market[] memory markets) {
        markets = new Market[](2);
        markets[0] = Market({
            symbol: "WETH",
            collateralToken: d.weth,
            creditManager: d.creditManager,
            creditFacade: d.creditFacade,
            liquidationModule: d.liquidationModule,
            swapRouter: d.swapRouter,
            swapAdapter: d.swapAdapter
        });
        markets[1] = Market({
            symbol: "LINK",
            collateralToken: d.link,
            creditManager: d.linkCreditManager,
            creditFacade: d.linkCreditFacade,
            liquidationModule: d.linkLiquidationModule,
            swapRouter: d.linkSwapRouter,
            swapAdapter: d.linkSwapAdapter
        });
    }

    function _serializeMarket(Market memory m, uint256 i) internal returns (string memory) {
        string memory key = string.concat("market", vm.toString(i));
        vm.serializeString(key, "symbol", m.symbol);
        vm.serializeUint(key, "decimals", uint256(18));
        vm.serializeAddress(key, "collateralToken", m.collateralToken);
        vm.serializeAddress(key, "creditManager", m.creditManager);
        vm.serializeAddress(key, "creditFacade", m.creditFacade);
        vm.serializeAddress(key, "liquidationModule", m.liquidationModule);
        vm.serializeAddress(key, "swapRouter", m.swapRouter);
        return vm.serializeAddress(key, "swapAdapter", m.swapAdapter);
    }

    function _readConfig(string memory network) internal view returns (Config memory config) {
        string memory json = vm.readFile(string.concat("script/config/", network, ".json"));
        config = Config({
            keeper: vm.parseJsonAddress(json, ".keeper"),
            wethPriceInUsdc: vm.parseJsonUint(json, ".wethPriceInUsdc"),
            warningBps: vm.parseJsonUint(json, ".warningBps"),
            marginCallBps: vm.parseJsonUint(json, ".marginCallBps"),
            liquidationBps: vm.parseJsonUint(json, ".liquidationBps"),
            baseRateBps: vm.parseJsonUint(json, ".baseRateBps"),
            slope1Bps: vm.parseJsonUint(json, ".slope1Bps"),
            slope2Bps: vm.parseJsonUint(json, ".slope2Bps"),
            optimalUtilizationBps: vm.parseJsonUint(json, ".optimalUtilizationBps"),
            wethHaircutBps: vm.parseJsonUint(json, ".wethHaircutBps"),
            wethMaxLeverageBps: vm.parseJsonUint(json, ".wethMaxLeverageBps"),
            linkPriceInUsdc: vm.parseJsonUint(json, ".linkPriceInUsdc"),
            linkHaircutBps: vm.parseJsonUint(json, ".linkHaircutBps"),
            linkMaxLeverageBps: vm.parseJsonUint(json, ".linkMaxLeverageBps")
        });
    }

    function _log(string memory network, Deployment memory d) internal pure {
        console2.log("Meridian deployment (network: %s)", network);
        console2.log("  USDC                ", d.usdc);
        console2.log("  PriceOracle         ", d.oracle);
        console2.log("  InterestRateModel   ", d.interestRateModel);
        console2.log("  Pool                ", d.pool);
        console2.log("  RiskConfigurator    ", d.riskConfigurator);
        console2.log("  MarginAccountImpl   ", d.accountImplementation);
        console2.log("  Guardian            ", d.guardian);
        console2.log("  WhitelistRegistry   ", d.whitelistRegistry);
        console2.log("  AdapterRegistry     ", d.adapterRegistry);
        console2.log("  CurveAdapter        ", d.curveAdapter);
        console2.log("  CurvePool (mock)    ", d.curvePool);
        console2.log("  LstAdapter          ", d.lstAdapter);
        console2.log("  wstETH (mock)       ", d.wsteth);
        console2.log("  AccessController    ", d.accessController);
        Market[] memory markets = _markets(d);
        for (uint256 i = 0; i < markets.length; i++) {
            Market memory m = markets[i];
            console2.log("  -- market: %s --", m.symbol);
            console2.log("    collateral        ", m.collateralToken);
            console2.log("    CreditManager     ", m.creditManager);
            console2.log("    CreditFacade      ", m.creditFacade);
            console2.log("    LiquidationModule ", m.liquidationModule);
            console2.log("    SwapRouter (mock) ", m.swapRouter);
            console2.log("    SwapAdapter       ", m.swapAdapter);
        }
    }
}
