import { describe, expect, it } from "vitest";
import type { Address, EventMeta, IndexedEvent } from "./events.js";
import { utilizationWad } from "./derived.js";
import { applyEvent, reduce } from "./reducer.js";
import { initialState } from "./state.js";

const ACCOUNT = "0x00000000000000000000000000000000000000A1" as Address;
const OWNER = "0x00000000000000000000000000000000000000B2" as Address;
const KEEPER = "0x00000000000000000000000000000000000000C3" as Address;
const CM = "0x00000000000000000000000000000000000000D4" as Address;
const TX = `0x${"ab".repeat(32)}` as Address;

function meta(block: number, logIndex = 0): EventMeta {
  return { blockNumber: BigInt(block), logIndex, txHash: TX };
}

describe("applyEvent", () => {
  it("folds a full account lifecycle into pool and account state", () => {
    const events: IndexedEvent[] = [
      { kind: "deposit", owner: OWNER, assets: 1000n, shares: 1000n, meta: meta(1) },
      { kind: "borrow", creditManager: CM, to: ACCOUNT, amount: 800n, meta: meta(2) },
      {
        kind: "openAccount",
        account: ACCOUNT,
        owner: OWNER,
        collateral: 100n,
        borrowed: 800n,
        meta: meta(2, 1),
      },
      { kind: "borrow", creditManager: CM, to: ACCOUNT, amount: 200n, meta: meta(3) },
      { kind: "increaseDebt", account: ACCOUNT, amount: 200n, meta: meta(3, 1) },
      { kind: "repay", creditManager: CM, principal: 300n, interest: 32n, meta: meta(4) },
      {
        kind: "decreaseDebt",
        account: ACCOUNT,
        principalRepaid: 300n,
        interestPaid: 32n,
        meta: meta(4, 1),
      },
      {
        kind: "liquidate",
        account: ACCOUNT,
        liquidator: KEEPER,
        debtRepaid: 700n,
        collateralSeized: 100n,
        meta: meta(5),
      },
    ];

    const state = reduce(initialState(), events);

    expect(state.pool.totalDeposited).toBe(1000n);
    expect(state.pool.totalBorrowed).toBe(700n);
    expect(state.pool.cumulativeInterestRepaid).toBe(32n);

    const account = state.accounts[ACCOUNT];
    expect(account).toBeDefined();
    expect(account!.facePrincipal).toBe(0n);
    expect(account!.collateralDeposited).toBe(100n);
    expect(account!.open).toBe(false);
    expect(account!.liquidated).toBe(true);

    expect(state.liquidations).toHaveLength(1);
    expect(state.liquidations[0]!.debtRepaid).toBe(700n);
    expect(state.liquidations[0]!.collateralSeized).toBe(100n);

    expect(state.lastBlock).toBe(5n);
    expect(utilizationWad(state)).toBe(700_000_000_000_000_000n); // 0.70 * 1e18
  });

  it("floors aggregates at zero on over-withdrawal", () => {
    const state = applyEvent(initialState(), {
      kind: "withdraw",
      owner: OWNER,
      assets: 50n,
      shares: 50n,
      meta: meta(1),
    });
    expect(state.pool.totalDeposited).toBe(0n);
    expect(utilizationWad(state)).toBe(0n);
  });

  it("does not mutate the input state", () => {
    const before = initialState();
    const after = applyEvent(before, {
      kind: "deposit",
      owner: OWNER,
      assets: 10n,
      shares: 10n,
      meta: meta(1),
    });
    expect(before.pool.totalDeposited).toBe(0n);
    expect(after.pool.totalDeposited).toBe(10n);
  });
});
