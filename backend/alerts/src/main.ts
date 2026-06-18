import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import type { AlertInput } from "./rules/types.js";
import { SnapshotInputSource } from "./state/source.js";

const config = loadConfig();
const source = new SnapshotInputSource(config.snapshotPath, () => Date.now());

let previousLiquidations = 0;

function staleEmptyView(): AlertInput {
  return {
    utilizationWad: 0n,
    openAccounts: 0,
    liquidationsTotal: 0,
    previousLiquidationsTotal: 0,
    accountHealth: {},
    lastBlock: 0n,
    secondsSinceSnapshot: Number.MAX_SAFE_INTEGER,
  };
}

const input = (): AlertInput => {
  try {
    return source.read(previousLiquidations);
  } catch {
    return staleEmptyView(); // no snapshot yet -> liveness alert fires
  }
};

// Advance the liquidation baseline on a timer so new_liquidations is edge-triggered per poll, not
// consumed by every scrape.
setInterval(() => {
  try {
    previousLiquidations = source.read(previousLiquidations).liquidationsTotal;
  } catch {
    // snapshot not readable yet
  }
}, config.pollMs);

serve({ fetch: createApp({ config, input }).fetch, port: config.port });
console.log(`[alerts] listening on :${config.port}; /alerts /metrics /health`);
