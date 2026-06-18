import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ALERT_IDS } from "./rules/types.js";

interface Runbook {
  title: string;
  severity: string;
  steps: string[];
}

const runbooks = JSON.parse(readFileSync(join(process.cwd(), "runbooks.json"), "utf8")) as Record<
  string,
  Runbook
>;

describe("runbooks", () => {
  it("provides a runbook with steps for every alert id", () => {
    for (const id of ALERT_IDS) {
      const runbook = runbooks[id];
      if (!runbook) throw new Error(`missing runbook for ${id}`);
      expect(runbook.title.length).toBeGreaterThan(0);
      expect(Array.isArray(runbook.steps)).toBe(true);
      expect(runbook.steps.length).toBeGreaterThan(0);
    }
  });

  it("does not define runbooks for unknown alert ids", () => {
    const known = new Set<string>(ALERT_IDS);
    for (const id of Object.keys(runbooks)) {
      expect(known.has(id), `unexpected runbook ${id}`).toBe(true);
    }
  });
});
