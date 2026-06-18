export type Address = `0x${string}`;

/// Provenance shared by every indexed event, used for ordering and idempotency.
export interface EventMeta {
  blockNumber: bigint;
  logIndex: number;
  txHash: Address;
}

/// Normalized, source-agnostic events the reducer understands. The runtime decodes raw chain logs
/// into these so the state logic never depends on viem or ABI shapes.
export type IndexedEvent =
  | ({ kind: "deposit"; owner: Address; assets: bigint; shares: bigint } & WithMeta)
  | ({ kind: "withdraw"; owner: Address; assets: bigint; shares: bigint } & WithMeta)
  | ({ kind: "borrow"; creditManager: Address; to: Address; amount: bigint } & WithMeta)
  | ({ kind: "repay"; creditManager: Address; principal: bigint; interest: bigint } & WithMeta)
  | ({
      kind: "openAccount";
      account: Address;
      owner: Address;
      collateral: bigint;
      borrowed: bigint;
    } & WithMeta)
  | ({ kind: "increaseDebt"; account: Address; amount: bigint } & WithMeta)
  | ({
      kind: "decreaseDebt";
      account: Address;
      principalRepaid: bigint;
      interestPaid: bigint;
    } & WithMeta)
  | ({ kind: "addCollateral"; account: Address; amount: bigint } & WithMeta)
  | ({ kind: "withdrawCollateral"; account: Address; to: Address; amount: bigint } & WithMeta)
  | ({
      kind: "liquidate";
      account: Address;
      liquidator: Address;
      debtRepaid: bigint;
      collateralSeized: bigint;
    } & WithMeta)
  | ({ kind: "closeAccount"; account: Address; owner: Address } & WithMeta)
  | ({ kind: "liquidated"; account: Address; keeper: Address } & WithMeta);

export type WithMeta = { meta: EventMeta };

export type EventKind = IndexedEvent["kind"];
