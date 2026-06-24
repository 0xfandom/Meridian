import { readFileSync } from "node:fs";
import type { Address } from "./state/types.js";

/// One credit market from the manifest: a collateral asset and its per-market contracts. The facade
/// and swap adapter let a client open and lever a position in this market.
export interface DeploymentMarket {
  symbol: string;
  collateralToken: Address;
  creditManager: Address;
  creditFacade: Address;
  liquidationModule: Address;
  swapAdapter: Address;
  decimals: number;
}

/// The contract addresses a client needs to interact with a deployment. The deploy script writes
/// the full manifest (every contract address plus chain metadata) to
/// contracts/deployments/<network>.json; this endpoint re-exposes it so the web app can discover
/// addresses at runtime instead of baking them into the build.
export interface DeploymentInfo {
  network: string;
  chainId: number;
  startBlock: number;
  addresses: Record<string, string>;
  markets: DeploymentMarket[];
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

  return { network, chainId, startBlock, addresses, markets: parseMarkets(raw.markets) };
}

/// Parses the manifest's markets array, skipping any entry with a malformed address rather than
/// throwing. Returns an empty list when the manifest predates multi-market support.
function parseMarkets(raw: unknown): DeploymentMarket[] {
  if (!Array.isArray(raw)) return [];
  const markets: DeploymentMarket[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const m = entry as Record<string, unknown>;
    const collateralToken = m.collateralToken;
    const creditManager = m.creditManager;
    const creditFacade = m.creditFacade;
    const liquidationModule = m.liquidationModule;
    const swapAdapter = m.swapAdapter;
    if (
      typeof collateralToken !== "string" ||
      !ADDRESS_RE.test(collateralToken) ||
      typeof creditManager !== "string" ||
      !ADDRESS_RE.test(creditManager) ||
      typeof creditFacade !== "string" ||
      !ADDRESS_RE.test(creditFacade) ||
      typeof liquidationModule !== "string" ||
      !ADDRESS_RE.test(liquidationModule) ||
      typeof swapAdapter !== "string" ||
      !ADDRESS_RE.test(swapAdapter)
    ) {
      continue;
    }
    markets.push({
      symbol: typeof m.symbol === "string" ? m.symbol : "",
      collateralToken: collateralToken as Address,
      creditManager: creditManager as Address,
      creditFacade: creditFacade as Address,
      liquidationModule: liquidationModule as Address,
      swapAdapter: swapAdapter as Address,
      decimals: typeof m.decimals === "number" ? m.decimals : 18,
    });
  }
  return markets;
}
