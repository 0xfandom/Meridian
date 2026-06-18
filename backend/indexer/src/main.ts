import { loadConfig } from "./config.js";
import { runIndexer } from "./runtime/indexer.js";

const config = loadConfig();
if (!config) {
  console.log(
    "[indexer] no RPC configured (set INDEXER_RPC_URL or MAINNET_RPC_URL); nothing to do.",
  );
  process.exit(0);
}

runIndexer(config).catch((error: unknown) => {
  console.error("[indexer] fatal:", error);
  process.exit(1);
});
