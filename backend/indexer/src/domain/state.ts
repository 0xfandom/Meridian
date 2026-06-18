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
