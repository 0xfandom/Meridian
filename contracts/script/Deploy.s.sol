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
import {Guardian} from "../src/governance/Guardian.sol";
import {RiskParams} from "../src/libraries/RiskParams.sol";
import {IGuardian} from "../src/interfaces/IGuardian.sol";
import {IInterestRateModel} from "../src/interfaces/IInterestRateModel.sol";
import {ILiquidationTarget} from "../src/interfaces/ILiquidationTarget.sol";
import {IPool} from "../src/interfaces/IPool.sol";
import {IPriceOracle} from "../src/interfaces/IPriceOracle.sol";
import {IRiskConfigurator} from "../src/interfaces/IRiskConfigurator.sol";
import {IWhitelistRegistry} from "../src/interfaces/IWhitelistRegistry.sol";
import {MockERC20} from "../test/mocks/MockERC20.sol";
import {MockPriceOracle} from "../test/mocks/MockPriceOracle.sol";

/// @title DeployScript
/// @notice Deploys the full Meridian system and applies every wiring step. The local profile
///         (chain id 31337) deploys mock USDC, WETH, and a settable oracle so the system is
///         self-contained on a vanilla anvil node; public networks supply real token and feed
///         addresses via config and are a follow-up.
/// @dev Run locally with: forge script script/Deploy.s.sol:DeployScript
///      Broadcast to anvil with: forge script script/Deploy.s.sol:DeployScript \
///        --rpc-url http://127.0.0.1:8545 --broadcast --private-key <anvil_key>
contract DeployScript is Script {
    uint256 internal constant LOCAL_CHAIN_ID = 31_337;

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
    }

    struct Deployment {
        address usdc;
        address weth;
        address oracle;
        address interestRateModel;
        address pool;
        address riskConfigurator;
        address accountImplementation;
        address creditManager;
        address creditFacade;
        address guardian;
        address whitelistRegistry;
        address accessController;
        address liquidationModule;
    }

    function run() external returns (Deployment memory deployment) {
        string memory network = block.chainid == LOCAL_CHAIN_ID ? "local" : vm.envString("NETWORK");
        Config memory config = _readConfig(network);
        address deployer = msg.sender;

        vm.startBroadcast();
        deployment = _deploy(config, deployer);
        vm.stopBroadcast();

        _log(network, deployment);
    }

    /// @notice Broadcast-free local deployment for tests: the caller is both owner and deployer, so
    ///         the owner-gated wiring setters execute against a consistent sender.
    function deployLocal() external returns (Deployment memory) {
        return _deploy(_readConfig("local"), address(this));
    }

    function _deploy(Config memory config, address deployer) internal returns (Deployment memory d) {
        require(block.chainid == LOCAL_CHAIN_ID, "DeployScript: only the local profile is implemented");

        // --- Mock assets and oracle (local only) ---
        d.usdc = address(new MockERC20("USD Coin", "USDC", 6));
        d.weth = address(new MockERC20("Wrapped Ether", "WETH", 18));
        d.oracle = address(new MockPriceOracle());
        MockPriceOracle(d.oracle).setPrice(d.weth, config.wethPriceInUsdc);

        // --- Risk parameters ---
        d.riskConfigurator = address(new RiskConfigurator(deployer));
        _configureRisk(RiskConfigurator(d.riskConfigurator), config, d.weth);

        // --- Core ---
        d.interestRateModel = address(
            new InterestRateModel(config.baseRateBps, config.slope1Bps, config.slope2Bps, config.optimalUtilizationBps)
        );
        d.pool = address(
            new Pool(IERC20(d.usdc), IInterestRateModel(d.interestRateModel), deployer, "Meridian USDC Pool", "mUSDC")
        );
        d.accountImplementation = address(new MarginAccount());
        d.creditManager = address(
            new CreditManager(
                IPool(d.pool),
                IERC20(d.weth),
                IInterestRateModel(d.interestRateModel),
                IPriceOracle(d.oracle),
                IRiskConfigurator(d.riskConfigurator),
                d.accountImplementation,
                deployer
            )
        );
        d.creditFacade = address(new CreditFacade(CreditManager(d.creditManager)));

        // --- Safety and access ---
        d.guardian = address(new Guardian(deployer, deployer));
        d.whitelistRegistry = address(new WhitelistRegistry(deployer));
        d.accessController = address(new AccessController(deployer));
        d.liquidationModule = address(
            new LiquidationModule(AccessController(d.accessController), ILiquidationTarget(d.creditManager), deployer)
        );

        _wire(d, config.keeper);
    }

    function _configureRisk(RiskConfigurator riskConfigurator, Config memory config, address weth) internal {
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
        riskConfigurator.setCollateral(weth, config.wethHaircutBps, config.wethMaxLeverageBps);
    }

    function _wire(Deployment memory d, address keeper) internal {
        Pool(d.pool).setCreditManager(d.creditManager, true);
        Pool(d.pool).setGuardian(IGuardian(d.guardian));

        CreditManager creditManager = CreditManager(d.creditManager);
        creditManager.setFacade(d.creditFacade);
        creditManager.setGuardian(IGuardian(d.guardian));
        creditManager.setWhitelistRegistry(IWhitelistRegistry(d.whitelistRegistry));
        creditManager.setLiquidationModule(d.liquidationModule);

        AccessController(d.accessController).grantRole(AccessController.Role.Keeper, keeper);
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
            wethMaxLeverageBps: vm.parseJsonUint(json, ".wethMaxLeverageBps")
        });
    }

    function _log(string memory network, Deployment memory d) internal pure {
        console2.log("Meridian deployment (network: %s)", network);
        console2.log("  USDC                ", d.usdc);
        console2.log("  WETH                ", d.weth);
        console2.log("  PriceOracle         ", d.oracle);
        console2.log("  InterestRateModel   ", d.interestRateModel);
        console2.log("  Pool                ", d.pool);
        console2.log("  RiskConfigurator    ", d.riskConfigurator);
        console2.log("  MarginAccountImpl   ", d.accountImplementation);
        console2.log("  CreditManager       ", d.creditManager);
        console2.log("  CreditFacade        ", d.creditFacade);
        console2.log("  Guardian            ", d.guardian);
        console2.log("  WhitelistRegistry   ", d.whitelistRegistry);
        console2.log("  AccessController    ", d.accessController);
        console2.log("  LiquidationModule   ", d.liquidationModule);
    }
}
