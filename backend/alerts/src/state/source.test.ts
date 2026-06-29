import { describe, expect, it } from "vitest";
import { type ProtocolState, derive } from "./source.js";

const state: ProtocolState = {
  pool: { totalDeposited: 1000n, totalBorrowed: 900n },
  accounts: {
    "0xa": { open: true, liquidated: false },
    "0xb": { open: false, liquidated: true },
  },
  liquidations: [{}, {}],
  lastBlock: 10n,
};

describe("derive", () => {
  it("computes utilization, open accounts, and liquidation total", () => {
    const input = derive(state, { previousLiquidationsTotal: 1, secondsSinceSnapshot: 3 });
    expect(input.utilizationWad).toBe(900_000_000_000_000_000n); // 0.9
    expect(input.openAccounts).toBe(1);
    expect(input.liquidationsTotal).toBe(2);
    expect(input.previousLiquidationsTotal).toBe(1);
    expect(input.secondsSinceSnapshot).toBe(3);
  });

  it("derives account health from the snapshot's per-account health factors", () => {
    const withHealth: ProtocolState = {
      pool: { totalDeposited: 1000n, totalBorrowed: 100n },
      accounts: {
        "0xopen": { open: true, liquidated: false, healthFactorWad: 1_020_000_000_000_000_000n },
        "0xclosed": { open: false, liquidated: false, healthFactorWad: 5n },
        "0xliq": { open: true, liquidated: true, healthFactorWad: 1n },
        "0xnohealth": { open: true, liquidated: false },
      },
      liquidations: [],
      lastBlock: 12n,
    };
    const input = derive(withHealth, { previousLiquidationsTotal: 0, secondsSinceSnapshot: 1 });
    // Only the open, non-liquidated account that carries a health factor is included.
    expect(input.accountHealth).toEqual({ "0xopen": 1_020_000_000_000_000_000n });
  });

  it("prefers an explicit accountHealth override when supplied", () => {
    const override = { "0xz": 999n };
    const input = derive(state, {
      previousLiquidationsTotal: 0,
      secondsSinceSnapshot: 1,
      accountHealth: override,
    });
    expect(input.accountHealth).toBe(override);
  });

  it("is zero utilization with no deposits", () => {
    const empty: ProtocolState = {
      pool: { totalDeposited: 0n, totalBorrowed: 0n },
      accounts: {},
      liquidations: [],
      lastBlock: 0n,
    };
    expect(
      derive(empty, { previousLiquidationsTotal: 0, secondsSinceSnapshot: 0 }).utilizationWad,
    ).toBe(0n);
  });
});
