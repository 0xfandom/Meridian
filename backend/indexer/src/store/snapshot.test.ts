import { describe, expect, it } from "vitest";
import type { Address } from "../domain/events.js";
import { initialState } from "../domain/state.js";
import { deserializeState, serializeState } from "./snapshot.js";

const ACCOUNT = "0x00000000000000000000000000000000000000A1" as Address;
const OWNER = "0x00000000000000000000000000000000000000B2" as Address;
const TX = `0x${"cd".repeat(32)}` as Address;

describe("snapshot serialization", () => {
  it("round-trips state including bigints", () => {
    const state = initialState();
    state.pool.totalBorrowed = 700n;
    state.pool.totalDeposited = 1000n;
    state.lastBlock = 42n;
    state.accounts[ACCOUNT] = {
      account: ACCOUNT,
      owner: OWNER,
      facePrincipal: 700n,
      collateralDeposited: 100n,
      open: true,
      liquidated: false,
    };
    state.liquidations.push({
      account: ACCOUNT,
      liquidator: OWNER,
      debtRepaid: 700n,
      collateralSeized: 100n,
      blockNumber: 42n,
      txHash: TX,
    });

    const restored = deserializeState(serializeState(state));

    expect(restored).toEqual(state);
    expect(restored.pool.totalBorrowed).toBe(700n);
    expect(restored.accounts[ACCOUNT]!.facePrincipal).toBe(700n);
    expect(restored.liquidations[0]!.blockNumber).toBe(42n);
    expect(restored.accounts[ACCOUNT]!.owner).toBe(OWNER); // hex strings untouched
  });
});
