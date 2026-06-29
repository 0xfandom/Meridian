import { readFileSync, statSync } from "node:fs";
import { type AlertInput, WAD } from "../rules/types.js";

const BIGINT_SUFFIX = /^\d+n$/;

interface ProtocolState {
  pool: { totalDeposited: bigint; totalBorrowed: bigint };
  // healthFactorWad is the indexer's live chain read (1e18 = 1.0), present for open accounts.
  accounts: Record<string, { open: boolean; liquidated: boolean; healthFactorWad?: bigint }>;
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

/// Reads the indexer snapshot and derives the alert input. Per-account health factors come from the
/// snapshot itself (the indexer writes a live chain read per open account), so the account-floor
/// rules fire end-to-end. An explicit `accountHealth` override can still be supplied for tests.
export class SnapshotInputSource {
  constructor(
    private readonly path: string,
    private readonly now: () => number,
  ) {}

  read(previousLiquidationsTotal: number, accountHealth?: Record<string, bigint>): AlertInput {
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

/// The health factor of every open, non-liquidated account that carries one, keyed by address. This
/// is what the snapshot already records, so no separate health source is needed.
function healthFromSnapshot(state: ProtocolState): Record<string, bigint> {
  const health: Record<string, bigint> = {};
  for (const [address, account] of Object.entries(state.accounts)) {
    if (account.open && !account.liquidated && account.healthFactorWad !== undefined) {
      health[address] = account.healthFactorWad;
    }
  }
  return health;
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
    accountHealth: options.accountHealth ?? healthFromSnapshot(state),
    lastBlock: state.lastBlock,
    secondsSinceSnapshot: options.secondsSinceSnapshot,
  };
}

export type { ProtocolState };
