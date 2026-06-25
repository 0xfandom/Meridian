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
  healthFactorWad?: bigint; // live health from the indexer's chain read (1e18 = 1.0)
  // The market this account belongs to (from the indexer). Absent on pre-multi-market snapshots.
  creditManager?: Address;
  collateralToken?: Address;
  symbol?: string;
  // For a basket-market account: the live per-collateral balances from the indexer. Single-collateral
  // accounts use collateralDeposited above; basket consumers read this.
  collaterals?: AccountCollateral[];
}

/// One collateral asset held by an account, with the live balance the indexer read from chain.
export interface AccountCollateral {
  token: Address;
  symbol: string;
  decimals: number;
  amount: bigint;
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
  collateralPriceUsdc?: bigint; // live oracle mark for the primary collateral (6-dp unit)
  prices?: Record<Address, bigint>; // live oracle mark per collateral token (6-dp unit)
}

export function emptyState(): ProtocolState {
  return {
    pool: { totalDeposited: 0n, totalBorrowed: 0n, cumulativeInterestRepaid: 0n },
    accounts: {},
    liquidations: [],
    lastBlock: 0n,
  };
}
