import type { Address } from "./domain/events.js";
import { type DeploymentManifest, type ManifestCollateral, loadManifest } from "./manifest.js";

/// One credit market the indexer watches: a collateral asset and its credit/liquidation contracts.
/// The pool and oracle are shared and live on the config root. `collaterals` is set for a basket
/// market (its full asset set) and undefined for single-collateral markets.
export interface MarketConfig {
  symbol: string;
  collateralToken: Address;
  creditManager: Address;
  liquidationModule: Address;
  collaterals?: ManifestCollateral[];
}

export interface IndexerConfig {
  rpcUrl: string;
  pool: Address;
  // Every credit market to index. markets[0] is the primary market, mirrored to the flat fields
  // below for any consumer not yet migrated.
  markets: MarketConfig[];
  creditManager: Address;
  liquidationModule: Address;
  startBlock: bigint;
  pollIntervalMs: number;
  snapshotPath: string;
  // Optional: when set the indexer enriches the snapshot with the live collateral marks and
  // per-account health factors each poll. Absent (no manifest) -> enrichment is skipped.
  oracle?: Address;
  collateralToken?: Address;
}

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/// Builds indexer configuration from the environment. Returns null when no RPC is configured so the
/// service can no-op cleanly (CI, fresh checkouts) rather than crash. When MERIDIAN_DEPLOYMENT points
/// at a deployment manifest its addresses and start block are used; explicit env vars still override.
export function loadConfig(env: NodeJS.ProcessEnv = process.env): IndexerConfig | null {
  const rpcUrl = env.INDEXER_RPC_URL ?? env.MAINNET_RPC_URL ?? "";
  if (!rpcUrl) return null;

  const manifest = env.MERIDIAN_DEPLOYMENT ? loadManifest(env.MERIDIAN_DEPLOYMENT) : null;

  const creditManager = resolveAddress(
    env,
    "MERIDIAN_CREDIT_MANAGER_ADDRESS",
    manifest?.creditManager,
  );
  const liquidationModule = resolveAddress(
    env,
    "MERIDIAN_LIQUIDATION_MODULE_ADDRESS",
    manifest?.liquidationModule,
  );
  const collateralToken = resolveOptionalAddress(
    env,
    "MERIDIAN_COLLATERAL_ADDRESS",
    manifest?.collateralToken,
  );

  return {
    rpcUrl,
    pool: resolveAddress(env, "MERIDIAN_POOL_ADDRESS", manifest?.pool),
    markets: resolveMarkets(manifest, { creditManager, liquidationModule, collateralToken }),
    creditManager,
    liquidationModule,
    startBlock: resolveStartBlock(env, manifest),
    pollIntervalMs: Number(env.INDEXER_POLL_INTERVAL_MS ?? "4000"),
    snapshotPath: env.INDEXER_SNAPSHOT_PATH ?? "./indexer-state.json",
    oracle: resolveOptionalAddress(env, "MERIDIAN_ORACLE_ADDRESS", manifest?.oracle),
    collateralToken,
  };
}

/// Builds the market list. Prefers the manifest's markets array; falls back to a single primary
/// market from the resolved addresses. Env overrides of the primary credit/liquidation contracts are
/// applied to markets[0] so they take effect for the watched market, not just the flat fields.
function resolveMarkets(
  manifest: DeploymentManifest | null,
  primary: { creditManager: Address; liquidationModule: Address; collateralToken?: Address },
): MarketConfig[] {
  const markets: MarketConfig[] =
    manifest && manifest.markets.length > 0
      ? manifest.markets.map((m) => ({ ...m }))
      : [
          {
            symbol: "primary",
            collateralToken: primary.collateralToken ?? primary.creditManager,
            creditManager: primary.creditManager,
            liquidationModule: primary.liquidationModule,
          },
        ];

  // Apply the primary env overrides to markets[0] so they take effect for the watched market.
  // markets always has at least one entry (both branches above produce one).
  const first = markets[0] as MarketConfig;
  return [
    {
      symbol: first.symbol,
      collateralToken: primary.collateralToken ?? first.collateralToken,
      creditManager: primary.creditManager,
      liquidationModule: primary.liquidationModule,
      collaterals: first.collaterals,
    },
    ...markets.slice(1),
  ];
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

function resolveOptionalAddress(
  env: NodeJS.ProcessEnv,
  key: string,
  fallback: Address | undefined,
): Address | undefined {
  const value = env[key] ?? fallback;
  if (!value) return undefined;
  if (!ADDRESS_RE.test(value)) {
    throw new Error(`indexer: ${key} must be a 20-byte hex address when set`);
  }
  return value as Address;
}

function resolveStartBlock(env: NodeJS.ProcessEnv, manifest: DeploymentManifest | null): bigint {
  if (env.INDEXER_START_BLOCK !== undefined) return BigInt(env.INDEXER_START_BLOCK);
  if (manifest) return manifest.startBlock;
  return 0n;
}
