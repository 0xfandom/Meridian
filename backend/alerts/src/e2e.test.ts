import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { SnapshotInputSource } from "./state/source.js";

const WAD = 1_000_000_000_000_000_000n;

// Serialize bigints with the trailing "n" the indexer uses, so the fixture is byte-shaped like a
// real snapshot file and exercises the same parse path the service uses in production.
function serialize(state: unknown): string {
  return JSON.stringify(state, (_k, v) => (typeof v === "bigint" ? `${v}n` : v), 2);
}

/// End-to-end through the real data path: an indexer-shaped snapshot file -> SnapshotInputSource ->
/// rule evaluation -> the /alerts HTTP response. This is what proves the alerts service is wired to
/// the indexer's output, including the per-account health factors that drive the floor rules.
describe("alerts end-to-end from an indexer snapshot", () => {
  it("emits floor, utilization, and liquidation alerts from a real-shaped snapshot file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "alerts-e2e-"));
    const path = join(dir, "indexer-state.json");

    const state = {
      // 960 / 1000 = 96% utilization -> at or above the 95% critical threshold.
      pool: { totalDeposited: 1000n, totalBorrowed: 960n, cumulativeInterestRepaid: 0n },
      accounts: {
        "0x00000000000000000000000000000000000000a1": {
          account: "0x00000000000000000000000000000000000000a1",
          owner: "0x00000000000000000000000000000000000000ee",
          facePrincipal: 100n,
          collateralDeposited: 0n,
          open: true,
          liquidated: false,
          healthFactorWad: 980_000_000_000_000_000n, // 0.98 -> below the 1.0 liquidation floor
        },
        "0x00000000000000000000000000000000000000a2": {
          account: "0x00000000000000000000000000000000000000a2",
          owner: "0x00000000000000000000000000000000000000ee",
          facePrincipal: 100n,
          collateralDeposited: 0n,
          open: true,
          liquidated: false,
          healthFactorWad: 1_030_000_000_000_000_000n, // 1.03 -> below the 1.05 near-floor band
        },
        "0x00000000000000000000000000000000000000a3": {
          account: "0x00000000000000000000000000000000000000a3",
          owner: "0x00000000000000000000000000000000000000ee",
          facePrincipal: 100n,
          collateralDeposited: 0n,
          open: true,
          liquidated: false,
          healthFactorWad: 2n * WAD, // healthy
        },
        "0x00000000000000000000000000000000000000a4": {
          account: "0x00000000000000000000000000000000000000a4",
          owner: "0x00000000000000000000000000000000000000ee",
          facePrincipal: 0n,
          collateralDeposited: 0n,
          open: false,
          liquidated: true,
        },
      },
      liquidations: [
        {
          account: "0x00000000000000000000000000000000000000a4",
          liquidator: "0x00000000000000000000000000000000000000bb",
          debtRepaid: 1n,
          collateralSeized: 1n,
          blockNumber: 3n,
          txHash: "0x0000000000000000000000000000000000000000000000000000000000000abc",
        },
      ],
      lastBlock: 42n,
    };
    writeFileSync(path, serialize(state));

    // Real clock: the file was just written, so the snapshot reads as fresh (no stale alert).
    const source = new SnapshotInputSource(path, () => Date.now());
    const config = loadConfig({} as NodeJS.ProcessEnv);
    const app = createApp({ config, input: () => source.read(0) });

    const body = (await (await app.request("/alerts")).json()) as {
      alerts: { id: string; severity: string }[];
    };
    const ids = body.alerts.map((a) => a.id);

    // Floor rules are now driven by the snapshot's own health factors.
    expect(ids).toContain("accounts_liquidatable");
    expect(ids).toContain("accounts_near_floor");
    // Snapshot-derived rules.
    expect(ids).toContain("utilization_high");
    expect(ids).toContain("new_liquidations"); // 1 total vs 0 previous
    expect(ids).not.toContain("snapshot_stale"); // file is fresh

    const critical = body.alerts.filter((a) => a.severity === "critical").map((a) => a.id);
    expect(critical).toContain("accounts_liquidatable");
    expect(critical).toContain("utilization_high");
  });
});
