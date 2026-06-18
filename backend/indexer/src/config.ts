import type { Address } from "./domain/events.js";

export interface IndexerConfig {
  rpcUrl: string;
  pool: Address;
  creditManager: Address;
  liquidationModule: Address;
  startBlock: bigint;
  pollIntervalMs: number;
  snapshotPath: string;
}

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/// Builds indexer configuration from the environment. Returns null when no RPC is configured so the
/// service can no-op cleanly (CI, fresh checkouts) rather than crash.
export function loadConfig(env: NodeJS.ProcessEnv = process.env): IndexerConfig | null {
  const rpcUrl = env.INDEXER_RPC_URL ?? env.MAINNET_RPC_URL ?? "";
  if (!rpcUrl) return null;

  return {
    rpcUrl,
    pool: requireAddress(env, "MERIDIAN_POOL_ADDRESS"),
    creditManager: requireAddress(env, "MERIDIAN_CREDIT_MANAGER_ADDRESS"),
    liquidationModule: requireAddress(env, "MERIDIAN_LIQUIDATION_MODULE_ADDRESS"),
    startBlock: BigInt(env.INDEXER_START_BLOCK ?? "0"),
    pollIntervalMs: Number(env.INDEXER_POLL_INTERVAL_MS ?? "4000"),
    snapshotPath: env.INDEXER_SNAPSHOT_PATH ?? "./indexer-state.json",
  };
}

function requireAddress(env: NodeJS.ProcessEnv, key: string): Address {
  const value = env[key];
  if (!value || !ADDRESS_RE.test(value)) {
    throw new Error(`indexer: ${key} must be set to a 20-byte hex address`);
  }
  return value as Address;
}
