import { describe, expect, it } from "vitest";
import { renderMetrics } from "./metrics.js";
import type { Alert, AlertInput } from "./rules/types.js";

const input: AlertInput = {
  utilizationWad: 950_000_000_000_000_000n, // 0.95
  openAccounts: 3,
  liquidationsTotal: 2,
  previousLiquidationsTotal: 1,
  accountHealth: {},
  lastBlock: 1234n,
  secondsSinceSnapshot: 7,
};

const alerts: Alert[] = [
  { id: "utilization_high", severity: "critical", summary: "x", labels: {} },
];

describe("renderMetrics", () => {
  it("emits gauges and alert counts", () => {
    const text = renderMetrics(input, alerts);
    expect(text).toContain("meridian_pool_utilization_ratio 0.95");
    expect(text).toContain("meridian_open_accounts 3");
    expect(text).toContain("meridian_liquidations_total 2");
    expect(text).toContain("meridian_last_indexed_block 1234");
    expect(text).toContain('meridian_active_alerts{severity="critical"} 1');
    expect(text).toContain('meridian_active_alerts{severity="warning"} 0');
  });
});
