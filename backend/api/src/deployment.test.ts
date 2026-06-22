import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadDeployment } from "./deployment.js";

function writeManifest(body: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), "meridian-deploy-"));
  const path = join(dir, "local.json");
  writeFileSync(path, JSON.stringify(body));
  return path;
}

const POOL = "0x8A791620dd6260079BF849Dc5567aDC3F2FdC318";
const USDC = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

describe("loadDeployment", () => {
  it("returns null when no path is configured", () => {
    expect(loadDeployment(undefined)).toBeNull();
  });

  it("returns null when the file is missing", () => {
    expect(loadDeployment("/no/such/manifest.json")).toBeNull();
  });

  it("returns chain metadata and well-formed addresses", () => {
    const path = writeManifest({
      network: "local",
      chainId: 31337,
      startBlock: 0,
      pool: POOL,
      usdc: USDC,
    });
    const info = loadDeployment(path);
    expect(info).not.toBeNull();
    expect(info?.network).toBe("local");
    expect(info?.chainId).toBe(31337);
    expect(info?.startBlock).toBe(0);
    expect(info?.addresses.pool).toBe(POOL);
    expect(info?.addresses.usdc).toBe(USDC);
  });

  it("skips malformed address fields instead of throwing", () => {
    const path = writeManifest({
      network: "local",
      chainId: 31337,
      startBlock: 0,
      pool: POOL,
      oracle: "not-an-address",
    });
    const info = loadDeployment(path);
    expect(info?.addresses.pool).toBe(POOL);
    expect(info?.addresses.oracle).toBeUndefined();
  });

  it("falls back to defaults for missing metadata", () => {
    const path = writeManifest({ pool: POOL });
    const info = loadDeployment(path);
    expect(info?.network).toBe("unknown");
    expect(info?.chainId).toBe(0);
    expect(info?.addresses.pool).toBe(POOL);
  });
});
