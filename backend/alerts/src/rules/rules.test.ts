import { describe, expect, it } from "vitest";
import { evaluate } from "./rules.js";
import { type AlertInput, defaultConfig } from "./types.js";

const CONFIG = defaultConfig();

function baseInput(overrides: Partial<AlertInput> = {}): AlertInput {
  return {
    utilizationWad: 100_000_000_000_000_000n, // 0.10
    openAccounts: 1,
    liquidationsTotal: 0,
    previousLiquidationsTotal: 0,
    accountHealth: {},
    lastBlock: 100n,
    secondsSinceSnapshot: 5,
    ...overrides,
  };
}

function ids(input: AlertInput): string[] {
  return evaluate(input, CONFIG)
    .map((a) => a.id)
    .sort();
}

describe("evaluate", () => {
  it("is quiet for a healthy snapshot", () => {
    expect(evaluate(baseInput(), CONFIG)).toEqual([]);
  });

  it("warns then escalates on utilization", () => {
    const warn = evaluate(baseInput({ utilizationWad: 900_000_000_000_000_000n }), CONFIG);
    expect(warn[0]).toMatchObject({ id: "utilization_high", severity: "warning" });

    const crit = evaluate(baseInput({ utilizationWad: 960_000_000_000_000_000n }), CONFIG);
    expect(crit[0]).toMatchObject({ id: "utilization_high", severity: "critical" });
  });

  it("separates near-floor from liquidatable accounts", () => {
    const input = baseInput({
      accountHealth: {
        "0xsafe": 2_000_000_000_000_000_000n, // 2.0
        "0xnear": 1_020_000_000_000_000_000n, // 1.02 -> near floor
        "0xunder": 900_000_000_000_000_000n, // 0.90 -> liquidatable
      },
    });
    expect(ids(input)).toEqual(["accounts_liquidatable", "accounts_near_floor"]);
  });

  it("flags new liquidations by delta", () => {
    const alerts = evaluate(
      baseInput({ liquidationsTotal: 3, previousLiquidationsTotal: 1 }),
      CONFIG,
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ id: "new_liquidations", labels: { delta: "2", total: "3" } });
  });

  it("raises a liveness alert when the snapshot is stale", () => {
    const alerts = evaluate(baseInput({ secondsSinceSnapshot: 120 }), CONFIG);
    expect(alerts[0]).toMatchObject({ id: "snapshot_stale", severity: "critical" });
  });
});
