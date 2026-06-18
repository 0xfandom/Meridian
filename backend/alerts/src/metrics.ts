import { type Alert, type AlertInput, type Severity, WAD } from "./rules/types.js";

const SEVERITIES: Severity[] = ["info", "warning", "critical"];

/// Renders the current view and active alerts as Prometheus text-format metrics.
export function renderMetrics(input: AlertInput, alerts: Alert[]): string {
  const lines: string[] = [];

  gauge(
    lines,
    "meridian_pool_utilization_ratio",
    "Pool utilization as a ratio (1.0 == 100%).",
    ratio(input.utilizationWad),
  );
  gauge(lines, "meridian_open_accounts", "Open credit accounts.", input.openAccounts);
  gauge(
    lines,
    "meridian_liquidations_total",
    "Cumulative liquidations observed.",
    input.liquidationsTotal,
  );
  gauge(
    lines,
    "meridian_last_indexed_block",
    "Highest block folded into the snapshot.",
    input.lastBlock,
  );
  gauge(
    lines,
    "meridian_snapshot_age_seconds",
    "Seconds since the snapshot was last written.",
    input.secondsSinceSnapshot,
  );

  const counts: Record<Severity, number> = { info: 0, warning: 0, critical: 0 };
  for (const alert of alerts) counts[alert.severity] += 1;

  lines.push("# HELP meridian_active_alerts Active alerts by severity.");
  lines.push("# TYPE meridian_active_alerts gauge");
  for (const severity of SEVERITIES) {
    lines.push(`meridian_active_alerts{severity="${severity}"} ${counts[severity]}`);
  }

  return `${lines.join("\n")}\n`;
}

function gauge(lines: string[], name: string, help: string, value: string | number | bigint): void {
  lines.push(`# HELP ${name} ${help}`);
  lines.push(`# TYPE ${name} gauge`);
  lines.push(`${name} ${value}`);
}

function ratio(wad: bigint): string {
  const basisPoints = (wad * 10_000n) / WAD;
  return (Number(basisPoints) / 10_000).toString();
}
