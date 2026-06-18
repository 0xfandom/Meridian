import { readFileSync, statSync } from "node:fs";
import { type AlertInput, WAD } from "../rules/types.js";

const BIGINT_SUFFIX = /^\d+n$/;

interface ProtocolState {
  pool: { totalDeposited: bigint; totalBorrowed: bigint };
  accounts: Record<string, { open: boolean; liquidated: boolean }>;
  liquidations: unknown[];
  lastBlock: bigint;
}

function parse(json: string): ProtocolState {
  return JSON.parse(json, (_key, value) =>
    typeof value === "string" && BIGINT_SUFFIX.test(value) ? BigInt(value.slice(0, -1)) : value,
  ) as ProtocolState;
}

export interface DeriveOptions {
  previousLiquidationsTotal: number;
  secondsSinceSnapshot: number;
  accountHealth?: Record<string, bigint>;
}

/// Reads the indexer snapshot and derives the alert input. Health factors are supplied separately
/// (from the margin engine); without them the account-floor rules are simply quiet.
export class SnapshotInputSource {
  constructor(
    private readonly path: string,
    private readonly now: () => number,
  ) {}

  read(previousLiquidationsTotal: number, accountHealth: Record<string, bigint> = {}): AlertInput {
    const state = parse(readFileSync(this.path, "utf8"));
    const ageSeconds = Math.max(
      0,
      Math.floor(this.now() / 1000 - statSync(this.path).mtimeMs / 1000),
    );
    return derive(state, {
      previousLiquidationsTotal,
      secondsSinceSnapshot: ageSeconds,
      accountHealth,
    });
  }
}

export function derive(state: ProtocolState, options: DeriveOptions): AlertInput {
  const open = Object.values(state.accounts).filter((a) => a.open && !a.liquidated).length;
  return {
    utilizationWad:
      state.pool.totalDeposited === 0n
        ? 0n
        : (state.pool.totalBorrowed * WAD) / state.pool.totalDeposited,
    openAccounts: open,
    liquidationsTotal: state.liquidations.length,
    previousLiquidationsTotal: options.previousLiquidationsTotal,
    accountHealth: options.accountHealth ?? {},
    lastBlock: state.lastBlock,
    secondsSinceSnapshot: options.secondsSinceSnapshot,
  };
}

export type { ProtocolState };
