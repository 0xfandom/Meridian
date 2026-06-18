import type { AccountState, Address, LiquidationRecord, ProtocolState } from "../state/types.js";

const WAD = 1_000_000_000_000_000_000n; // 1e18

export interface PoolView {
  totalDeposited: bigint;
  totalBorrowed: bigint;
  cumulativeInterestRepaid: bigint;
  utilizationWad: bigint;
  lastBlock: bigint;
}

export function poolView(state: ProtocolState): PoolView {
  const { totalDeposited, totalBorrowed, cumulativeInterestRepaid } = state.pool;
  return {
    totalDeposited,
    totalBorrowed,
    cumulativeInterestRepaid,
    utilizationWad: totalDeposited === 0n ? 0n : (totalBorrowed * WAD) / totalDeposited,
    lastBlock: state.lastBlock,
  };
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
