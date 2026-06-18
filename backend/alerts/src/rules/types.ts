export type Severity = "info" | "warning" | "critical";

export interface Alert {
  id: AlertId;
  severity: Severity;
  summary: string;
  labels: Record<string, string>;
}

/// Everything the rules need to evaluate the protocol's health for one moment in time.
export interface AlertInput {
  utilizationWad: bigint; // 1e18 == 100%
  openAccounts: number;
  liquidationsTotal: number;
  previousLiquidationsTotal: number;
  accountHealth: Record<string, bigint>; // account -> health factor (WAD)
  lastBlock: bigint;
  secondsSinceSnapshot: number;
}

export interface AlertConfig {
  utilizationWarnWad: bigint;
  utilizationCritWad: bigint;
  liquidationFloorWad: bigint;
  nearFloorWad: bigint;
  snapshotStaleSeconds: number;
}

export const ALERT_IDS = [
  "utilization_high",
  "accounts_near_floor",
  "accounts_liquidatable",
  "new_liquidations",
  "snapshot_stale",
] as const;

export type AlertId = (typeof ALERT_IDS)[number];

export const WAD = 1_000_000_000_000_000_000n;

export function defaultConfig(): AlertConfig {
  return {
    utilizationWarnWad: 850_000_000_000_000_000n, // 0.85
    utilizationCritWad: 950_000_000_000_000_000n, // 0.95
    liquidationFloorWad: WAD, // 1.0
    nearFloorWad: 1_050_000_000_000_000_000n, // 1.05
    snapshotStaleSeconds: 60,
  };
}
