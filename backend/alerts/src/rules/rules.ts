import { type Alert, type AlertConfig, type AlertInput, WAD } from "./types.js";

/// Pure rule evaluation: maps a point-in-time view of the protocol to the set of active alerts.
/// Deterministic and side-effect free, so the whole rule set is unit-tested without any I/O.
export function evaluate(input: AlertInput, config: AlertConfig): Alert[] {
  const alerts: Alert[] = [];

  if (input.utilizationWad >= config.utilizationCritWad) {
    alerts.push({
      id: "utilization_high",
      severity: "critical",
      summary: `Pool utilization ${percent(input.utilizationWad)} at or above critical`,
      labels: { utilization: percent(input.utilizationWad) },
    });
  } else if (input.utilizationWad >= config.utilizationWarnWad) {
    alerts.push({
      id: "utilization_high",
      severity: "warning",
      summary: `Pool utilization ${percent(input.utilizationWad)} above warning`,
      labels: { utilization: percent(input.utilizationWad) },
    });
  }

  let nearFloor = 0;
  let liquidatable = 0;
  for (const health of Object.values(input.accountHealth)) {
    if (health < config.liquidationFloorWad) liquidatable += 1;
    else if (health < config.nearFloorWad) nearFloor += 1;
  }
  if (liquidatable > 0) {
    alerts.push({
      id: "accounts_liquidatable",
      severity: "critical",
      summary: `${liquidatable} account(s) below the liquidation floor`,
      labels: { count: String(liquidatable) },
    });
  }
  if (nearFloor > 0) {
    alerts.push({
      id: "accounts_near_floor",
      severity: "warning",
      summary: `${nearFloor} account(s) approaching the liquidation floor`,
      labels: { count: String(nearFloor) },
    });
  }

  if (input.liquidationsTotal > input.previousLiquidationsTotal) {
    const delta = input.liquidationsTotal - input.previousLiquidationsTotal;
    alerts.push({
      id: "new_liquidations",
      severity: "warning",
      summary: `${delta} new liquidation(s) observed`,
      labels: { delta: String(delta), total: String(input.liquidationsTotal) },
    });
  }

  if (input.secondsSinceSnapshot > config.snapshotStaleSeconds) {
    alerts.push({
      id: "snapshot_stale",
      severity: "critical",
      summary: `Indexer snapshot stale for ${input.secondsSinceSnapshot}s (last block ${input.lastBlock})`,
      labels: { ageSeconds: String(input.secondsSinceSnapshot) },
    });
  }

  return alerts;
}

function percent(wad: bigint): string {
  // Two-decimal percentage, computed in integer space to avoid float drift.
  const basisPoints = (wad * 10_000n) / WAD;
  const whole = basisPoints / 100n;
  const frac = basisPoints % 100n;
  return `${whole}.${frac.toString().padStart(2, "0")}%`;
}
