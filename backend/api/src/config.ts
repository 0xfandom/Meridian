export interface ApiConfig {
  port: number;
  snapshotPath: string;
  riskParamsPath: string;
  siweDomain: string;
  siweChainId: number;
  sessionSecret: string;
  sessionTtlSeconds: number;
  nonceTtlSeconds: number;
  wsBroadcastMs: number;
}

/// Builds API configuration from the environment, with development-friendly defaults. The session
/// secret must be overridden in any real deployment.
export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  return {
    port: Number(env.API_PORT ?? "3001"),
    snapshotPath: env.INDEXER_SNAPSHOT_PATH ?? "./indexer-state.json",
    riskParamsPath: env.API_RISK_PARAMS_PATH ?? "../../contracts/config/risk-params.json",
    siweDomain: env.API_SIWE_DOMAIN ?? "localhost:3001",
    siweChainId: Number(env.API_SIWE_CHAIN_ID ?? "1"),
    sessionSecret: env.API_SESSION_SECRET ?? "dev-insecure-secret-change-me",
    sessionTtlSeconds: Number(env.API_SESSION_TTL_SECONDS ?? "86400"),
    nonceTtlSeconds: Number(env.API_NONCE_TTL_SECONDS ?? "300"),
    wsBroadcastMs: Number(env.API_WS_BROADCAST_MS ?? "5000"),
  };
}
