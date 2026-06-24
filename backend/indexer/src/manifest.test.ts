import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";
import { loadManifest } from "./manifest.js";

const POOL = "0x00000000000000000000000000000000000000a1";
const CREDIT_MANAGER = "0x00000000000000000000000000000000000000b2";
const LIQUIDATION_MODULE = "0x00000000000000000000000000000000000000c3";
const ORACLE = "0x00000000000000000000000000000000000000d4";
const WETH = "0x00000000000000000000000000000000000000e5";
const LINK = "0x00000000000000000000000000000000000000f6";
const LINK_CREDIT_MANAGER = "0x0000000000000000000000000000000000000a07";
const LINK_LIQUIDATION_MODULE = "0x0000000000000000000000000000000000000b08";

function writeManifest(dir: string, body: Record<string, unknown>): string {
  const path = join(dir, "local.json");
  writeFileSync(path, JSON.stringify(body));
  return path;
}

const validBody = {
  network: "local",
  chainId: 31337,
  startBlock: 7,
  pool: POOL,
  creditManager: CREDIT_MANAGER,
  liquidationModule: LIQUIDATION_MODULE,
  oracle: ORACLE,
  weth: WETH,
  markets: [
    {
      symbol: "WETH",
      collateralToken: WETH,
      creditManager: CREDIT_MANAGER,
      liquidationModule: LIQUIDATION_MODULE,
    },
    {
      symbol: "LINK",
      collateralToken: LINK,
      creditManager: LINK_CREDIT_MANAGER,
      liquidationModule: LINK_LIQUIDATION_MODULE,
    },
  ],
};

describe("deployment manifest", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "meridian-manifest-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("loads addresses and start block from a manifest", () => {
    const manifest = loadManifest(writeManifest(dir, validBody));
    expect(manifest.pool).toBe(POOL);
    expect(manifest.creditManager).toBe(CREDIT_MANAGER);
    expect(manifest.liquidationModule).toBe(LIQUIDATION_MODULE);
    expect(manifest.oracle).toBe(ORACLE);
    expect(manifest.collateralToken).toBe(WETH);
    expect(manifest.startBlock).toBe(7n);
    expect(manifest.chainId).toBe(31337);
  });

  it("rejects a malformed address", () => {
    const path = writeManifest(dir, { ...validBody, pool: "0xnothex" });
    expect(() => loadManifest(path)).toThrow(/pool must be a 20-byte hex address/);
  });

  it("parses every market from the markets array", () => {
    const manifest = loadManifest(writeManifest(dir, validBody));
    expect(manifest.markets).toHaveLength(2);
    expect(manifest.markets[0]).toEqual({
      symbol: "WETH",
      collateralToken: WETH,
      creditManager: CREDIT_MANAGER,
      liquidationModule: LIQUIDATION_MODULE,
    });
    expect(manifest.markets[1]).toEqual({
      symbol: "LINK",
      collateralToken: LINK,
      creditManager: LINK_CREDIT_MANAGER,
      liquidationModule: LINK_LIQUIDATION_MODULE,
    });
  });

  it("synthesises a primary market from the flat fields when markets is absent", () => {
    const { markets, ...flat } = validBody;
    void markets;
    const manifest = loadManifest(writeManifest(dir, flat));
    expect(manifest.markets).toEqual([
      {
        symbol: "primary",
        collateralToken: WETH,
        creditManager: CREDIT_MANAGER,
        liquidationModule: LIQUIDATION_MODULE,
      },
    ]);
  });

  it("exposes every market to the indexer config", () => {
    const path = writeManifest(dir, validBody);
    const config = loadConfig({
      INDEXER_RPC_URL: "http://localhost:8545",
      MERIDIAN_DEPLOYMENT: path,
    });
    expect(config?.markets).toHaveLength(2);
    expect(config?.markets[1]?.symbol).toBe("LINK");
    expect(config?.markets[1]?.creditManager).toBe(LINK_CREDIT_MANAGER);
  });

  it("feeds the indexer config when MERIDIAN_DEPLOYMENT is set", () => {
    const path = writeManifest(dir, validBody);
    const config = loadConfig({
      INDEXER_RPC_URL: "http://localhost:8545",
      MERIDIAN_DEPLOYMENT: path,
    });
    expect(config).not.toBeNull();
    expect(config?.pool).toBe(POOL);
    expect(config?.creditManager).toBe(CREDIT_MANAGER);
    expect(config?.startBlock).toBe(7n);
  });

  it("lets explicit env vars override the manifest", () => {
    const path = writeManifest(dir, validBody);
    const override = "0x00000000000000000000000000000000000000d4";
    const config = loadConfig({
      INDEXER_RPC_URL: "http://localhost:8545",
      MERIDIAN_DEPLOYMENT: path,
      MERIDIAN_POOL_ADDRESS: override,
      INDEXER_START_BLOCK: "99",
    });
    expect(config?.pool).toBe(override);
    expect(config?.startBlock).toBe(99n);
  });
});
