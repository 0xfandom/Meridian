import { readFileSync } from "node:fs";

/// The contract addresses a client needs to interact with a deployment. The deploy script writes
/// the full manifest (every contract address plus chain metadata) to
/// contracts/deployments/<network>.json; this endpoint re-exposes it so the web app can discover
/// addresses at runtime instead of baking them into the build.
export interface DeploymentInfo {
  network: string;
  chainId: number;
  startBlock: number;
  addresses: Record<string, string>;
}

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/// Reads the deployment manifest at `path` and returns the chain metadata plus every well-formed
/// address field. Returns null when no path is configured or the file cannot be read/parsed, so the
/// API can run (and tests can build the app) without a deployment present. Malformed address values
/// are skipped rather than throwing — a partial manifest still serves the addresses it does have.
export function loadDeployment(path: string | undefined): DeploymentInfo | null {
  if (!path) return null;

  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }

  const addresses: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string" && ADDRESS_RE.test(value)) addresses[key] = value;
  }

  const network = typeof raw.network === "string" ? raw.network : "unknown";
  const chainId = typeof raw.chainId === "number" ? raw.chainId : 0;
  const startBlock = typeof raw.startBlock === "number" ? raw.startBlock : 0;

  return { network, chainId, startBlock, addresses };
}
