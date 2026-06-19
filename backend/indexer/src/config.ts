import type { Address } from "./domain/events.js";
import { type DeploymentManifest, loadManifest } from "./manifest.js";

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
/// service can no-op cleanly (CI, fresh checkouts) rather than crash. When MERIDIAN_DEPLOYMENT points
/// at a deployment manifest its addresses and start block are used; explicit env vars still override.
export function loadConfig(env: NodeJS.ProcessEnv = process.env): IndexerConfig | null {
  const rpcUrl = env.INDEXER_RPC_URL ?? env.MAINNET_RPC_URL ?? "";
  if (!rpcUrl) return null;

  const manifest = env.MERIDIAN_DEPLOYMENT ? loadManifest(env.MERIDIAN_DEPLOYMENT) : null;

  return {
    rpcUrl,
    pool: resolveAddress(env, "MERIDIAN_POOL_ADDRESS", manifest?.pool),
    creditManager: resolveAddress(env, "MERIDIAN_CREDIT_MANAGER_ADDRESS", manifest?.creditManager),
    liquidationModule: resolveAddress(
      env,
      "MERIDIAN_LIQUIDATION_MODULE_ADDRESS",
      manifest?.liquidationModule,
    ),
    startBlock: resolveStartBlock(env, manifest),
    pollIntervalMs: Number(env.INDEXER_POLL_INTERVAL_MS ?? "4000"),
    snapshotPath: env.INDEXER_SNAPSHOT_PATH ?? "./indexer-state.json",
  };
}

function resolveAddress(
  env: NodeJS.ProcessEnv,
  key: string,
  fallback: Address | undefined,
): Address {
  const value = env[key] ?? fallback;
  if (!value || !ADDRESS_RE.test(value)) {
    throw new Error(
      `indexer: ${key} must be set to a 20-byte hex address (env or deployment manifest)`,
    );
  }
  return value as Address;
}

function resolveStartBlock(env: NodeJS.ProcessEnv, manifest: DeploymentManifest | null): bigint {
  if (env.INDEXER_START_BLOCK !== undefined) return BigInt(env.INDEXER_START_BLOCK);
  if (manifest) return manifest.startBlock;
  return 0n;
}
