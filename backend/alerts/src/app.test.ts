import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import type { AlertInput } from "./rules/types.js";

const healthy: AlertInput = {
  utilizationWad: 100_000_000_000_000_000n,
  openAccounts: 1,
  liquidationsTotal: 0,
  previousLiquidationsTotal: 0,
  accountHealth: {},
  lastBlock: 50n,
  secondsSinceSnapshot: 5,
};

function appWith(view: AlertInput) {
  return createApp({ config: loadConfig({} as NodeJS.ProcessEnv), input: () => view });
}

describe("alerts app", () => {
  it("reports healthy status and no alerts", async () => {
    const app = appWith(healthy);
    const health = (await (await app.request("/health")).json()) as Record<string, unknown>;
    expect(health).toMatchObject({ status: "ok", lastBlock: "50" });
    const alerts = (await (await app.request("/alerts")).json()) as { alerts: unknown[] };
    expect(alerts.alerts).toEqual([]);
  });

  it("serves Prometheus metrics", async () => {
    const res = await appWith(healthy).request("/metrics");
    expect(res.headers.get("content-type")).toContain("text/plain");
    expect(await res.text()).toContain("meridian_open_accounts 1");
  });

  it("degrades and alerts when the snapshot is stale", async () => {
    const app = appWith({ ...healthy, secondsSinceSnapshot: 999 });
    const health = (await (await app.request("/health")).json()) as { status: string };
    expect(health.status).toBe("degraded");
    const alerts = (await (await app.request("/alerts")).json()) as { alerts: { id: string }[] };
    expect(alerts.alerts.some((a) => a.id === "snapshot_stale")).toBe(true);
  });
});
