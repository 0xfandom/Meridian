import type { Address } from "./events.js";

/// Pool-level aggregates derived purely from events. These mirror the direction of the on-chain
/// figures; precise live values (which include share-price interest) come from direct chain reads
/// in the API. The indexer's job is the event-sourced history and per-account bookkeeping.
export interface PoolState {
  totalDeposited: bigint; // gross assets deposited minus assets withdrawn
  totalBorrowed: bigint; // principal currently lent out
  cumulativeInterestRepaid: bigint; // interest returned to the pool over time
}

/// Per-credit-account bookkeeping, keyed by the margin-account clone address.
export interface AccountState {
  account: Address;
  owner: Address;
  facePrincipal: bigint; // outstanding principal drawn from the pool
  collateralDeposited: bigint; // net collateral moved in via events
  open: boolean;
  liquidated: boolean;
  healthFactorWad?: bigint; // live chain read (1e18 = 1.0); set for open accounts only
  // The market this account belongs to. Set from the openAccount event; absent on pre-multi-market
  // snapshots, where enrichment falls back to the primary market.
  creditManager?: Address;
  collateralToken?: Address;
  symbol?: string;
  // For a basket-market account: the live per-collateral balances, read from chain each poll. The
  // single `collateralDeposited` above is event-sourced and only meaningful for one collateral, so
  // basket consumers read this instead.
  collaterals?: AccountCollateral[];
}

/// A live balance of one collateral asset held by an account, read from chain during enrichment.
export interface AccountCollateral {
  token: Address;
  symbol: string;
  decimals: number;
  amount: bigint;
}

/// A recorded liquidation, sourced from the credit manager's economic event.
export interface LiquidationRecord {
  account: Address;
  liquidator: Address;
  debtRepaid: bigint;
  collateralSeized: bigint;
  blockNumber: bigint;
  txHash: Address;
}

export interface IndexerState {
  pool: PoolState;
  accounts: Record<Address, AccountState>;
  liquidations: LiquidationRecord[];
  lastBlock: bigint;
  collateralPriceUsdc?: bigint; // live oracle mark for the primary collateral, in the 6-dp unit
  prices?: Record<Address, bigint>; // live oracle mark per collateral token, in the 6-dp unit
}

export function initialState(): IndexerState {
  return {
    pool: { totalDeposited: 0n, totalBorrowed: 0n, cumulativeInterestRepaid: 0n },
    accounts: {},
    liquidations: [],
    lastBlock: 0n,
  };
}

/// Clamp helper: event-derived subtraction must never drive an aggregate negative.
export function subFloor(a: bigint, b: bigint): bigint {
  return a > b ? a - b : 0n;
}
