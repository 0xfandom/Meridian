import { readFileSync, writeFileSync } from "node:fs";
import type { IndexerState } from "../domain/state.js";

const BIGINT_SUFFIX = /^\d+n$/;

/// Serializes indexer state to JSON, tagging bigints with a trailing "n" so they survive the round
/// trip (JSON has no bigint). Hex address/hash strings are untouched.
export function serializeState(state: IndexerState): string {
  return JSON.stringify(
    state,
    (_key, value) => (typeof value === "bigint" ? `${value}n` : value),
    2,
  );
}

export function deserializeState(json: string): IndexerState {
  return JSON.parse(json, (_key, value) =>
    typeof value === "string" && BIGINT_SUFFIX.test(value) ? BigInt(value.slice(0, -1)) : value,
  ) as IndexerState;
}

/// Disk-backed snapshot of the latest state, so a restart resumes from the last indexed block.
export class JsonSnapshotStore {
  constructor(private readonly path: string) {}

  write(state: IndexerState): void {
    writeFileSync(this.path, serializeState(state));
  }

  read(): IndexerState | null {
    try {
      return deserializeState(readFileSync(this.path, "utf8"));
    } catch {
      return null;
    }
  }
}
