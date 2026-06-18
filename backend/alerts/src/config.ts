import { type AlertConfig, defaultConfig } from "./rules/types.js";

export interface AlertsConfig {
  port: number;
  snapshotPath: string;
  pollMs: number;
  rules: AlertConfig;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AlertsConfig {
  return {
    port: Number(env.ALERTS_PORT ?? "3002"),
    snapshotPath: env.INDEXER_SNAPSHOT_PATH ?? "./indexer-state.json",
    pollMs: Number(env.ALERTS_POLL_MS ?? "5000"),
    rules: defaultConfig(),
  };
}
