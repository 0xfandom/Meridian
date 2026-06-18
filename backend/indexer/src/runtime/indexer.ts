import { createPublicClient, http, type PublicClient } from "viem";
import { creditManagerAbi, liquidationModuleAbi, poolAbi } from "../abis/meridian.js";
import type { IndexerConfig } from "../config.js";
import type { IndexedEvent } from "../domain/events.js";
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
  store.write(state);
  console.log(
    `[indexer] caught up at block ${state.lastBlock}; tracking ${Object.keys(state.accounts).length} accounts`,
  );

  for (;;) {
    await sleep(config.pollIntervalMs);
    const tip = await client.getBlockNumber();
    const from = state.lastBlock + 1n;
    if (tip < from) continue;
    state = await indexRange(client, config, state, from, tip);
    store.write(state);
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
  const [poolLogs, cmLogs, lmLogs] = await Promise.all([
    client.getContractEvents({ abi: poolAbi, address: config.pool, fromBlock, toBlock }),
    client.getContractEvents({
      abi: creditManagerAbi,
      address: config.creditManager,
      fromBlock,
      toBlock,
    }),
    client.getContractEvents({
      abi: liquidationModuleAbi,
      address: config.liquidationModule,
      fromBlock,
      toBlock,
    }),
  ]);

  const events: IndexedEvent[] = [];
  for (const log of poolLogs) push(events, decodePoolLog(log as unknown as DecodableLog));
  for (const log of cmLogs) push(events, decodeCreditManagerLog(log as unknown as DecodableLog));
  for (const log of lmLogs)
    push(events, decodeLiquidationModuleLog(log as unknown as DecodableLog));
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
