export type Address = `0x${string}`;

/// Snapshot shape produced by the indexer. Mirrored here so the API builds and runs standalone,
/// without a compile-time dependency on the indexer package. A shared types package is the natural
/// follow-up once a second consumer needs the same shapes.
export interface PoolState {
  totalDeposited: bigint;
  totalBorrowed: bigint;
  cumulativeInterestRepaid: bigint;
}

export interface AccountState {
  account: Address;
  owner: Address;
  facePrincipal: bigint;
  collateralDeposited: bigint;
  open: boolean;
  liquidated: boolean;
}

export interface LiquidationRecord {
  account: Address;
  liquidator: Address;
  debtRepaid: bigint;
  collateralSeized: bigint;
  blockNumber: bigint;
  txHash: Address;
}

export interface ProtocolState {
  pool: PoolState;
  accounts: Record<Address, AccountState>;
  liquidations: LiquidationRecord[];
  lastBlock: bigint;
}

export function emptyState(): ProtocolState {
  return {
    pool: { totalDeposited: 0n, totalBorrowed: 0n, cumulativeInterestRepaid: 0n },
    accounts: {},
    liquidations: [],
    lastBlock: 0n,
  };
}
