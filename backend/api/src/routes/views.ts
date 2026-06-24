import type { DeploymentInfo } from "../deployment.js";
import type { AccountState, Address, LiquidationRecord, ProtocolState } from "../state/types.js";

const WAD = 1_000_000_000_000_000_000n; // 1e18

export interface PoolView {
  totalDeposited: bigint;
  totalBorrowed: bigint;
  cumulativeInterestRepaid: bigint;
  utilizationWad: bigint;
  collateralPriceUsdc: bigint; // primary market's mark, kept for back-compat
  prices: Record<Address, bigint>; // live mark per collateral token (6-dp unit)
  lastBlock: bigint;
}

export function poolView(state: ProtocolState): PoolView {
  const { totalDeposited, totalBorrowed, cumulativeInterestRepaid } = state.pool;
  return {
    totalDeposited,
    totalBorrowed,
    cumulativeInterestRepaid,
    utilizationWad: totalDeposited === 0n ? 0n : (totalBorrowed * WAD) / totalDeposited,
    collateralPriceUsdc: state.collateralPriceUsdc ?? 0n,
    prices: state.prices ?? {},
    lastBlock: state.lastBlock,
  };
}

/// A credit market joined with its live collateral mark. The market list comes from the deployment
/// manifest; the price comes from the indexer snapshot.
export interface MarketView {
  symbol: string;
  collateralToken: Address;
  creditManager: Address;
  liquidationModule: Address;
  decimals: number;
  priceUsdc: bigint;
}

export function marketViews(deployment: DeploymentInfo | null, state: ProtocolState): MarketView[] {
  if (!deployment) return [];
  return deployment.markets.map((m) => ({
    symbol: m.symbol,
    collateralToken: m.collateralToken,
    creditManager: m.creditManager,
    liquidationModule: m.liquidationModule,
    decimals: m.decimals,
    priceUsdc: state.prices?.[m.collateralToken] ?? 0n,
  }));
}

export function accountList(state: ProtocolState): AccountState[] {
  return Object.values(state.accounts);
}

export function findAccount(state: ProtocolState, address: string): AccountState | null {
  const target = address.toLowerCase();
  for (const account of Object.values(state.accounts)) {
    if (account.account.toLowerCase() === target) return account;
  }
  return null;
}

export function openPositions(state: ProtocolState): AccountState[] {
  return Object.values(state.accounts).filter((a) => a.open);
}

export function liquidationList(state: ProtocolState): LiquidationRecord[] {
  return state.liquidations;
}

export function isAddress(value: string): value is Address {
  return /^0x[0-9a-fA-F]{40}$/.test(value);
}
