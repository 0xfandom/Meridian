import type { Address, EventMeta, IndexedEvent } from "../domain/events.js";

/// Minimal structural view of a decoded viem log. Decoding lives at the I/O boundary, so it reads
/// args loosely and hands fully-typed IndexedEvents to the domain layer.
export interface DecodableLog {
  eventName?: string;
  args?: Record<string, unknown>;
  blockNumber?: bigint | null;
  logIndex?: number | null;
  transactionHash?: Address | null;
}

function metaOf(log: DecodableLog): EventMeta | null {
  if (log.blockNumber == null || log.logIndex == null || !log.transactionHash) return null;
  return { blockNumber: log.blockNumber, logIndex: log.logIndex, txHash: log.transactionHash };
}

const big = (v: unknown): bigint => v as bigint;
const addr = (v: unknown): Address => v as Address;

export function decodePoolLog(log: DecodableLog): IndexedEvent | null {
  const meta = metaOf(log);
  const a = log.args;
  if (!meta || !a) return null;
  switch (log.eventName) {
    case "Deposit":
      return {
        kind: "deposit",
        owner: addr(a.owner),
        assets: big(a.assets),
        shares: big(a.shares),
        meta,
      };
    case "Withdraw":
      return {
        kind: "withdraw",
        owner: addr(a.owner),
        assets: big(a.assets),
        shares: big(a.shares),
        meta,
      };
    case "Borrow":
      return {
        kind: "borrow",
        creditManager: addr(a.creditManager),
        to: addr(a.to),
        amount: big(a.amount),
        meta,
      };
    case "Repay":
      return {
        kind: "repay",
        creditManager: addr(a.creditManager),
        principal: big(a.principal),
        interest: big(a.interest),
        meta,
      };
    default:
      return null;
  }
}

/// The market a credit-manager log belongs to, stamped onto account-creating events so the reducer
/// and enrichment know which collateral and credit manager an account uses.
export interface MarketTag {
  creditManager: Address;
  collateralToken: Address;
  symbol: string;
}

export function decodeCreditManagerLog(log: DecodableLog, market?: MarketTag): IndexedEvent | null {
  const meta = metaOf(log);
  const a = log.args;
  if (!meta || !a) return null;
  switch (log.eventName) {
    case "OpenAccount":
      return {
        kind: "openAccount",
        account: addr(a.account),
        owner: addr(a.owner),
        collateral: big(a.collateral),
        borrowed: big(a.borrowed),
        creditManager: market?.creditManager,
        collateralToken: market?.collateralToken,
        symbol: market?.symbol,
        meta,
      };
    case "IncreaseDebt":
      return { kind: "increaseDebt", account: addr(a.account), amount: big(a.amount), meta };
    case "DecreaseDebt":
      return {
        kind: "decreaseDebt",
        account: addr(a.account),
        principalRepaid: big(a.principalRepaid),
        interestPaid: big(a.interestPaid),
        meta,
      };
    case "AddCollateral":
      return { kind: "addCollateral", account: addr(a.account), amount: big(a.amount), meta };
    case "WithdrawCollateral":
      return {
        kind: "withdrawCollateral",
        account: addr(a.account),
        to: addr(a.to),
        amount: big(a.amount),
        meta,
      };
    case "Liquidate":
      return {
        kind: "liquidate",
        account: addr(a.account),
        liquidator: addr(a.liquidator),
        debtRepaid: big(a.debtRepaid),
        collateralSeized: big(a.collateralSeized),
        meta,
      };
    case "CloseAccount":
      return { kind: "closeAccount", account: addr(a.account), owner: addr(a.owner), meta };
    default:
      return null;
  }
}

export function decodeLiquidationModuleLog(log: DecodableLog): IndexedEvent | null {
  const meta = metaOf(log);
  const a = log.args;
  if (!meta || !a) return null;
  if (log.eventName === "Liquidated") {
    return { kind: "liquidated", account: addr(a.account), keeper: addr(a.keeper), meta };
  }
  return null;
}
