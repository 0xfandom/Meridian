import { parseAbi } from "viem";

/// Event ABIs for the contracts the indexer follows. Kept as human-readable fragments so the set
/// of indexed events is obvious at a glance and stays in lockstep with the Solidity sources.

export const poolAbi = parseAbi([
  "event Deposit(address indexed sender, address indexed owner, uint256 assets, uint256 shares)",
  "event Withdraw(address indexed sender, address indexed receiver, address indexed owner, uint256 assets, uint256 shares)",
  "event Borrow(address indexed creditManager, address indexed to, uint256 amount)",
  "event Repay(address indexed creditManager, uint256 principal, uint256 interest)",
]);

export const creditManagerAbi = parseAbi([
  "event OpenAccount(address indexed account, address indexed owner, uint256 collateral, uint256 borrowed)",
  "event IncreaseDebt(address indexed account, uint256 amount)",
  "event DecreaseDebt(address indexed account, uint256 principalRepaid, uint256 interestPaid)",
  "event AddCollateral(address indexed account, uint256 amount)",
  "event WithdrawCollateral(address indexed account, address indexed to, uint256 amount)",
  "event Liquidate(address indexed account, address indexed liquidator, uint256 debtRepaid, uint256 collateralSeized)",
  "event CloseAccount(address indexed account, address indexed owner)",
]);

export const liquidationModuleAbi = parseAbi([
  "event Liquidated(address indexed account, address indexed keeper)",
]);
