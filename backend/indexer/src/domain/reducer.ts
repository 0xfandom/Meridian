import type { Address, IndexedEvent } from "./events.js";
import { type AccountState, type IndexerState, subFloor } from "./state.js";

/// Pure event reducer: folds one normalized event into the indexer state and returns a new state.
/// Deterministic and side-effect free, so the full history can be replayed and unit-tested without
/// a chain or a database.
export function applyEvent(state: IndexerState, event: IndexedEvent): IndexerState {
  const next: IndexerState = {
    pool: { ...state.pool },
    accounts: { ...state.accounts },
    liquidations: state.liquidations,
    lastBlock: state.lastBlock > event.meta.blockNumber ? state.lastBlock : event.meta.blockNumber,
  };

  switch (event.kind) {
    case "deposit":
      next.pool.totalDeposited += event.assets;
      break;
    case "withdraw":
      next.pool.totalDeposited = subFloor(next.pool.totalDeposited, event.assets);
      break;
    case "borrow":
      next.pool.totalBorrowed += event.amount;
      break;
    case "repay":
      next.pool.totalBorrowed = subFloor(next.pool.totalBorrowed, event.principal);
      next.pool.cumulativeInterestRepaid += event.interest;
      break;
    case "openAccount":
      next.accounts[event.account] = {
        account: event.account,
        owner: event.owner,
        facePrincipal: event.borrowed,
        collateralDeposited: event.collateral,
        open: true,
        liquidated: false,
        creditManager: event.creditManager,
        collateralToken: event.collateralToken,
        symbol: event.symbol,
      };
      break;
    case "increaseDebt":
      upsert(next, event.account, (a) => ({ ...a, facePrincipal: a.facePrincipal + event.amount }));
      break;
    case "decreaseDebt":
      upsert(next, event.account, (a) => ({
        ...a,
        facePrincipal: subFloor(a.facePrincipal, event.principalRepaid),
      }));
      break;
    case "addCollateral":
      upsert(next, event.account, (a) => ({
        ...a,
        collateralDeposited: a.collateralDeposited + event.amount,
      }));
      break;
    case "withdrawCollateral":
      upsert(next, event.account, (a) => ({
        ...a,
        collateralDeposited: subFloor(a.collateralDeposited, event.amount),
      }));
      break;
    case "liquidate":
      upsert(next, event.account, (a) => ({
        ...a,
        facePrincipal: 0n,
        open: false,
        liquidated: true,
      }));
      next.liquidations = [
        ...state.liquidations,
        {
          account: event.account,
          liquidator: event.liquidator,
          debtRepaid: event.debtRepaid,
          collateralSeized: event.collateralSeized,
          blockNumber: event.meta.blockNumber,
          txHash: event.meta.txHash,
        },
      ];
      break;
    case "closeAccount":
      upsert(next, event.account, (a) => ({ ...a, open: false }));
      break;
    case "liquidated":
      // Module-level confirmation of a keeper liquidation; the economic record comes from the
      // credit manager's Liquidate event, so this only marks the account.
      upsert(next, event.account, (a) => ({ ...a, liquidated: true }));
      break;
  }

  return next;
}

/// Replays a full event log from an initial state.
export function reduce(state: IndexerState, events: IndexedEvent[]): IndexerState {
  return events.reduce(applyEvent, state);
}

function upsert(
  state: IndexerState,
  account: Address,
  update: (a: AccountState) => AccountState,
): void {
  const existing = state.accounts[account] ?? blankAccount(account);
  state.accounts[account] = update(existing);
}

function blankAccount(account: Address): AccountState {
  return {
    account,
    owner: "0x0000000000000000000000000000000000000000",
    facePrincipal: 0n,
    collateralDeposited: 0n,
    open: true,
    liquidated: false,
  };
}
