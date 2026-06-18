import { readFileSync, statSync } from "node:fs";
import { type ProtocolState, emptyState } from "./types.js";

const BIGINT_SUFFIX = /^\d+n$/;

/// Parses an indexer snapshot, restoring bigints tagged with a trailing "n".
export function parseSnapshot(json: string): ProtocolState {
  return JSON.parse(json, (_key, value) =>
    typeof value === "string" && BIGINT_SUFFIX.test(value) ? BigInt(value.slice(0, -1)) : value,
  ) as ProtocolState;
}

/// Reads the indexer's snapshot file and caches it, reloading only when the file's mtime changes.
/// Falls back to empty state when the snapshot is absent (fresh environment, indexer not yet run).
export class SnapshotSource {
  private cache: ProtocolState = emptyState();
  private mtimeMs = 0;

  constructor(private readonly path: string) {}

  get(): ProtocolState {
    return this.cache;
  }

  /// Reloads from disk if the snapshot changed; returns the current state either way.
  refresh(): ProtocolState {
    try {
      const mtime = statSync(this.path).mtimeMs;
      if (mtime !== this.mtimeMs) {
        this.cache = parseSnapshot(readFileSync(this.path, "utf8"));
        this.mtimeMs = mtime;
      }
    } catch {
      // Missing or unreadable snapshot: keep serving the last good (or empty) state.
    }
    return this.cache;
  }
}
