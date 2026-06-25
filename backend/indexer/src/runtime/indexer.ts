import { createPublicClient, http, type PublicClient } from "viem";
import {
  creditManagerAbi,
  creditManagerReadAbi,
  erc20Abi,
  liquidationModuleAbi,
  poolAbi,
  priceOracleAbi,
} from "../abis/meridian.js";
import type { ManifestCollateral } from "../manifest.js";
import type { IndexerConfig } from "../config.js";
import type { Address, IndexedEvent } from "../domain/events.js";
import { applyEvent } from "../domain/reducer.js";
import { type IndexerState, initialState } from "../domain/state.js";
import { JsonSnapshotStore } from "../store/snapshot.js";
import {
  type DecodableLog,
  decodeCreditManagerLog,
  decodeLiquidationModuleLog,
  decodePoolLog,
} from "./decode.js";

const CHUNK = 5_000n;

/// Backfills historical events, then polls the chain tip, folding every event into the indexer
/// state and snapshotting after each pass so a restart resumes from the last fully-scanned block.
export async function runIndexer(config: IndexerConfig): Promise<void> {
  const client = createPublicClient({ transport: http(config.rpcUrl) });
  const store = new JsonSnapshotStore(config.snapshotPath);

  let state = store.read() ?? initialState();
  const start = state.lastBlock > 0n ? state.lastBlock + 1n : config.startBlock;

  const latest = await client.getBlockNumber();
  console.log(`[indexer] backfilling blocks ${start}..${latest}`);
  state = await indexRange(client, config, state, start, latest);
  state = await enrich(client, config, state);
  store.write(state);
  console.log(
    `[indexer] caught up at block ${state.lastBlock}; tracking ${Object.keys(state.accounts).length} accounts`,
  );

  for (;;) {
    await sleep(config.pollIntervalMs);
    const tip = await client.getBlockNumber();
    const from = state.lastBlock + 1n;
    // Re-enrich every poll even with no new events, so health factors track the moving price.
    state = tip < from ? state : await indexRange(client, config, state, from, tip);
    state = await enrich(client, config, state);
    store.write(state);
  }
}

/// Enriches the event-sourced state with live, price-dependent reads: the collateral mark and each
/// open account's health factor. Best-effort — a failed read leaves the prior values in place rather
/// than crashing the indexer. Skipped entirely when the oracle/collateral addresses are not set.
async function enrich(
  client: PublicClient,
  config: IndexerConfig,
  state: IndexerState,
): Promise<IndexerState> {
  if (!config.oracle) return state;
  const oracle = config.oracle;
  const primaryCreditManager = config.markets[0]?.creditManager ?? config.creditManager;

  try {
    // One live mark per distinct collateral token, read from the shared oracle.
    const tokens = [...new Set(config.markets.map((m) => m.collateralToken))];
    const priceEntries = await Promise.all(
      tokens.map((token) =>
        client
          .readContract({ address: oracle, abi: priceOracleAbi, functionName: "getPrice", args: [token] })
          .then((price) => [token, price] as const),
      ),
    );
    const prices = Object.fromEntries(priceEntries) as Record<Address, bigint>;

    const open = Object.values(state.accounts).filter((a) => a.open && !a.liquidated);
    const healths = await Promise.all(
      open.map((a) =>
        client
          .readContract({
            // Each account's health is read from its own market's credit manager.
            address: a.creditManager ?? primaryCreditManager,
            abi: creditManagerReadAbi,
            functionName: "calcHealthFactor",
            args: [a.account],
          })
          .then((hf) => ({ account: a.account, hf }))
          .catch(() => ({ account: a.account, hf: undefined as bigint | undefined })),
      ),
    );
    const healthByAccount = new Map(healths.map((h) => [h.account, h.hf]));

    // For basket-market accounts, read the live balance of every collateral in the set. Keyed by the
    // basket credit manager so each account reads only its own market's assets.
    const basketByManager = new Map<string, ManifestCollateral[]>();
    for (const m of config.markets) {
      if (m.collaterals && m.collaterals.length > 0) {
        basketByManager.set(m.creditManager.toLowerCase(), m.collaterals);
      }
    }
    const basketAccounts = open.filter(
      (a) => a.creditManager && basketByManager.has(a.creditManager.toLowerCase()),
    );
    const collateralReads = await Promise.all(
      basketAccounts.map(async (a) => {
        const set = basketByManager.get((a.creditManager as Address).toLowerCase()) ?? [];
        const balances = await Promise.all(
          set.map((c) =>
            client
              .readContract({
                address: c.collateralToken,
                abi: erc20Abi,
                functionName: "balanceOf",
                args: [a.account],
              })
              .then((amount) => ({
                token: c.collateralToken,
                symbol: c.symbol,
                decimals: c.decimals,
                amount,
              }))
              .catch(() => ({
                token: c.collateralToken,
                symbol: c.symbol,
                decimals: c.decimals,
                amount: 0n,
              })),
          ),
        );
        return { account: a.account, collaterals: balances };
      }),
    );
    const collateralsByAccount = new Map(collateralReads.map((r) => [r.account, r.collaterals]));

    const accounts = Object.fromEntries(
      Object.entries(state.accounts).map(([address, account]) => [
        address,
        account.open && !account.liquidated
          ? {
              ...account,
              healthFactorWad: healthByAccount.get(account.account),
              collaterals: collateralsByAccount.get(account.account) ?? account.collaterals,
            }
          : { ...account, healthFactorWad: undefined },
      ]),
    );

    const primaryToken = config.markets[0]?.collateralToken;
    return {
      ...state,
      prices,
      collateralPriceUsdc: primaryToken ? prices[primaryToken] : state.collateralPriceUsdc,
      accounts,
    };
  } catch {
    return state;
  }
}

async function indexRange(
  client: PublicClient,
  config: IndexerConfig,
  state: IndexerState,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<IndexerState> {
  let next = state;
  for (let start = fromBlock; start <= toBlock; start += CHUNK) {
    const end = start + CHUNK - 1n < toBlock ? start + CHUNK - 1n : toBlock;
    const events = await collectEvents(client, config, start, end);
    events.sort(compareEvents);
    for (const event of events) next = applyEvent(next, event);
    if (next.lastBlock < end) next = { ...next, lastBlock: end };
  }
  return next;
}

async function collectEvents(
  client: PublicClient,
  config: IndexerConfig,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<IndexedEvent[]> {
  // The pool is shared across markets; the credit manager and liquidation module are per-market.
  const poolLogsP = client.getContractEvents({
    abi: poolAbi,
    address: config.pool,
    fromBlock,
    toBlock,
  });
  const marketLogsP = config.markets.map(async (market) => {
    const [cmLogs, lmLogs] = await Promise.all([
      client.getContractEvents({ abi: creditManagerAbi, address: market.creditManager, fromBlock, toBlock }),
      client.getContractEvents({
        abi: liquidationModuleAbi,
        address: market.liquidationModule,
        fromBlock,
        toBlock,
      }),
    ]);
    return { market, cmLogs, lmLogs };
  });
  const [poolLogs, marketResults] = await Promise.all([poolLogsP, Promise.all(marketLogsP)]);

  const events: IndexedEvent[] = [];
  for (const log of poolLogs) push(events, decodePoolLog(log as unknown as DecodableLog));
  for (const { market, cmLogs, lmLogs } of marketResults) {
    const tag = {
      creditManager: market.creditManager,
      collateralToken: market.collateralToken,
      symbol: market.symbol,
    };
    for (const log of cmLogs) push(events, decodeCreditManagerLog(log as unknown as DecodableLog, tag));
    for (const log of lmLogs)
      push(events, decodeLiquidationModuleLog(log as unknown as DecodableLog));
  }
  return events;
}

function push(events: IndexedEvent[], event: IndexedEvent | null): void {
  if (event) events.push(event);
}

function compareEvents(a: IndexedEvent, b: IndexedEvent): number {
  if (a.meta.blockNumber !== b.meta.blockNumber) {
    return a.meta.blockNumber < b.meta.blockNumber ? -1 : 1;
  }
  return a.meta.logIndex - b.meta.logIndex;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
