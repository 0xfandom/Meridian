import { readFileSync } from "node:fs";
import type { Address } from "./domain/events.js";

/// The subset of the deployment manifest the indexer needs. The deploy script writes the full file
/// (every contract address plus chain metadata) to contracts/deployments/<network>.json; we read
/// only the watched contracts and the block to backfill from.
export interface DeploymentManifest {
  network: string;
  chainId: number;
  startBlock: bigint;
  pool: Address;
  creditManager: Address;
  liquidationModule: Address;
  oracle: Address;
  collateralToken: Address;
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
  };
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
