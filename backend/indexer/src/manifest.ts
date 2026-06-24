import { readFileSync } from "node:fs";
import type { Address } from "./domain/events.js";

/// One credit market: a collateral asset and the contracts the indexer watches for it. The pool and
/// oracle are shared across markets and live on the manifest root.
export interface ManifestMarket {
  symbol: string;
  collateralToken: Address;
  creditManager: Address;
  liquidationModule: Address;
}

/// The subset of the deployment manifest the indexer needs. The deploy script writes the full file
/// (every contract address plus chain metadata) to contracts/deployments/<network>.json; we read
/// only the watched contracts and the block to backfill from.
///
/// The flat creditManager/liquidationModule/collateralToken fields describe the primary market and
/// are kept for back-compat; `markets` lists every market. Manifests written before multi-market
/// support have no `markets` array, so one is synthesised from the flat fields.
export interface DeploymentManifest {
  network: string;
  chainId: number;
  startBlock: bigint;
  pool: Address;
  creditManager: Address;
  liquidationModule: Address;
  oracle: Address;
  collateralToken: Address;
  markets: ManifestMarket[];
}

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/// Reads and validates a deployment manifest. Throws with a precise message when a field is missing
/// or malformed so a bad manifest fails loudly at startup rather than producing silent no-ops.
export function loadManifest(path: string): DeploymentManifest {
  const raw = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  return {
    network: requireString(raw, "network", path),
    chainId: requireNumber(raw, "chainId", path),
    startBlock: BigInt(requireNumber(raw, "startBlock", path)),
    pool: requireManifestAddress(raw, "pool", path),
    creditManager: requireManifestAddress(raw, "creditManager", path),
    liquidationModule: requireManifestAddress(raw, "liquidationModule", path),
    oracle: requireManifestAddress(raw, "oracle", path),
    collateralToken: requireManifestAddress(raw, "weth", path),
    markets: parseMarkets(raw, path),
  };
}

/// Reads the `markets` array, or synthesises a single primary market from the flat fields for
/// manifests written before multi-market support.
function parseMarkets(raw: Record<string, unknown>, path: string): ManifestMarket[] {
  const arr = raw.markets;
  if (Array.isArray(arr) && arr.length > 0) {
    return arr.map((entry, i) => {
      const m = entry as Record<string, unknown>;
      const where = `${path} markets[${i}]`;
      return {
        symbol: requireString(m, "symbol", where),
        collateralToken: requireManifestAddress(m, "collateralToken", where),
        creditManager: requireManifestAddress(m, "creditManager", where),
        liquidationModule: requireManifestAddress(m, "liquidationModule", where),
      };
    });
  }
  return [
    {
      symbol: "primary",
      collateralToken: requireManifestAddress(raw, "weth", path),
      creditManager: requireManifestAddress(raw, "creditManager", path),
      liquidationModule: requireManifestAddress(raw, "liquidationModule", path),
    },
  ];
}

function requireString(raw: Record<string, unknown>, key: string, path: string): string {
  const value = raw[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`manifest ${path}: ${key} must be a non-empty string`);
  }
  return value;
}

function requireNumber(raw: Record<string, unknown>, key: string, path: string): number {
  const value = raw[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`manifest ${path}: ${key} must be a number`);
  }
  return value;
}

function requireManifestAddress(raw: Record<string, unknown>, key: string, path: string): Address {
  const value = raw[key];
  if (typeof value !== "string" || !ADDRESS_RE.test(value)) {
    throw new Error(`manifest ${path}: ${key} must be a 20-byte hex address`);
  }
  return value as Address;
}
