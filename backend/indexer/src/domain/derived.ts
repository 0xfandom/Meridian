import type { AccountState, IndexerState } from "./state.js";

const WAD = 1_000_000_000_000_000_000n; // 1e18

/// Event-derived pool utilization in WAD (1e18 == 100%): borrowed principal over deposited assets.
/// An approximation for dashboards; the precise figure that folds in interest is read on chain.
export function utilizationWad(state: IndexerState): bigint {
  if (state.pool.totalDeposited === 0n) return 0n;
  return (state.pool.totalBorrowed * WAD) / state.pool.totalDeposited;
}

export function openAccounts(state: IndexerState): AccountState[] {
  return Object.values(state.accounts).filter((a) => a.open);
}

export function liquidatedAccounts(state: IndexerState): AccountState[] {
  return Object.values(state.accounts).filter((a) => a.liquidated);
}
