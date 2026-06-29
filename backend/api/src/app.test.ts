import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";
import { createApp } from "./app.js";
import { NonceStore } from "./auth/siwe.js";
import { loadConfig } from "./config.js";
import { SnapshotSource } from "./state/source.js";

const NOW = 1_700_000_000;
const user = privateKeyToAccount(
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
);
const ACCOUNT = "0x00000000000000000000000000000000000000A1";
const OWNER = "0x00000000000000000000000000000000000000B2";

function snapshotJson(): string {
  return JSON.stringify({
    pool: { totalDeposited: "1000n", totalBorrowed: "700n", cumulativeInterestRepaid: "32n" },
    accounts: {
      [ACCOUNT]: {
        account: ACCOUNT,
        owner: OWNER,
        facePrincipal: "700n",
        collateralDeposited: "100n",
        open: true,
        liquidated: false,
      },
    },
    liquidations: [],
    lastBlock: "5n",
  });
}

function buildApp() {
  const dir = mkdtempSync(join(tmpdir(), "meridian-api-"));
  const snapPath = join(dir, "indexer-state.json");
  writeFileSync(snapPath, snapshotJson());
  const config = loadConfig({
    INDEXER_SNAPSHOT_PATH: snapPath,
    API_SIWE_DOMAIN: "example.com",
    API_SIWE_CHAIN_ID: "1",
    API_SESSION_SECRET: "test-secret",
  } as NodeJS.ProcessEnv);
  return createApp({
    config,
    source: new SnapshotSource(snapPath),
    nonces: new NonceStore(),
    now: () => NOW,
  });
}

describe("API routes", () => {
  it("serves health and pool views", async () => {
    const app = buildApp();

    const health = await app.request("/health");
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ status: "ok", lastBlock: "5" });

    const pools = (await (await app.request("/pools")).json()) as Record<string, string>;
    expect(pools.totalBorrowed).toBe("700");
    expect(pools.utilizationWad).toBe("700000000000000000");
  });

  it("serves account and position lookups", async () => {
    const app = buildApp();

    expect((await (await app.request("/accounts")).json()) as unknown[]).toHaveLength(1);
    expect((await app.request(`/accounts/${ACCOUNT}`)).status).toBe(200);
    expect((await app.request("/accounts/not-an-address")).status).toBe(400);
    expect((await app.request("/accounts/0x0000000000000000000000000000000000000999")).status).toBe(
      404,
    );
    expect((await (await app.request("/positions")).json()) as unknown[]).toHaveLength(1);
    expect((await (await app.request("/liquidations")).json()) as unknown[]).toHaveLength(0);
  });

  it("serves the deployment manifest when configured, 503 otherwise", async () => {
    expect((await buildApp().request("/deployment")).status).toBe(503);

    const dir = mkdtempSync(join(tmpdir(), "meridian-api-deploy-"));
    const snapPath = join(dir, "indexer-state.json");
    writeFileSync(snapPath, snapshotJson());
    const manifestPath = join(dir, "local.json");
    writeFileSync(
      manifestPath,
      JSON.stringify({
        network: "local",
        chainId: 31337,
        startBlock: 0,
        pool: "0x8A791620dd6260079BF849Dc5567aDC3F2FdC318",
      }),
    );
    const app = createApp({
      config: loadConfig({
        INDEXER_SNAPSHOT_PATH: snapPath,
        MERIDIAN_DEPLOYMENT: manifestPath,
        API_SESSION_SECRET: "test-secret",
      } as NodeJS.ProcessEnv),
      source: new SnapshotSource(snapPath),
      nonces: new NonceStore(),
      now: () => NOW,
    });

    const res = await app.request("/deployment");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { chainId: number; addresses: Record<string, string> };
    expect(body.chainId).toBe(31337);
    expect(body.addresses.pool).toBe("0x8A791620dd6260079BF849Dc5567aDC3F2FdC318");
  });

  it("serves per-market data: /markets, pool prices, and account market tags", async () => {
    const dir = mkdtempSync(join(tmpdir(), "meridian-api-mkts-"));
    const snapPath = join(dir, "indexer-state.json");
    const WETH = "0x000000000000000000000000000000000000aaaa";
    const LINK = "0x000000000000000000000000000000000000bbbb";
    const WCM = "0x000000000000000000000000000000000000cccc";
    const LCM = "0x000000000000000000000000000000000000dddd";
    const WLM = "0x000000000000000000000000000000000000eeee";
    const LLM = "0x000000000000000000000000000000000000ffff";
    writeFileSync(
      snapPath,
      JSON.stringify({
        pool: { totalDeposited: "1000n", totalBorrowed: "700n", cumulativeInterestRepaid: "0n" },
        accounts: {
          [ACCOUNT]: {
            account: ACCOUNT,
            owner: OWNER,
            facePrincipal: "700n",
            collateralDeposited: "100n",
            open: true,
            liquidated: false,
            symbol: "LINK",
            collateralToken: LINK,
            creditManager: LCM,
          },
        },
        liquidations: [],
        lastBlock: "5n",
        collateralPriceUsdc: "1676738970n",
        prices: { [WETH]: "1676738970n", [LINK]: "7619119n" },
      }),
    );
    const manifestPath = join(dir, "local.json");
    writeFileSync(
      manifestPath,
      JSON.stringify({
        network: "local",
        chainId: 31337,
        startBlock: 0,
        pool: "0x8A791620dd6260079BF849Dc5567aDC3F2FdC318",
        markets: [
          {
            symbol: "WETH",
            decimals: 18,
            collateralToken: WETH,
            creditManager: WCM,
            creditFacade: "0x0000000000000000000000000000000000000a01",
            liquidationModule: WLM,
            swapAdapter: "0x0000000000000000000000000000000000000a02",
          },
          {
            symbol: "LINK",
            decimals: 18,
            collateralToken: LINK,
            creditManager: LCM,
            creditFacade: "0x0000000000000000000000000000000000000a03",
            liquidationModule: LLM,
            swapAdapter: "0x0000000000000000000000000000000000000a04",
          },
        ],
      }),
    );
    const app = createApp({
      config: loadConfig({
        INDEXER_SNAPSHOT_PATH: snapPath,
        MERIDIAN_DEPLOYMENT: manifestPath,
        API_SESSION_SECRET: "test-secret",
      } as NodeJS.ProcessEnv),
      source: new SnapshotSource(snapPath),
      nonces: new NonceStore(),
      now: () => NOW,
    });

    const markets = (await (await app.request("/markets")).json()) as Array<Record<string, string>>;
    expect(markets).toHaveLength(2);
    const link = markets.find((m) => m.symbol === "LINK");
    expect(link?.priceUsdc).toBe("7619119");
    expect(link?.creditManager).toBe(LCM);
    expect(link?.creditFacade).toBe("0x0000000000000000000000000000000000000a03");
    expect(link?.swapAdapter).toBe("0x0000000000000000000000000000000000000a04");

    const pools = (await (await app.request("/pools")).json()) as {
      prices: Record<string, string>;
    };
    expect(pools.prices[WETH]).toBe("1676738970");
    expect(pools.prices[LINK]).toBe("7619119");

    const accounts = (await (await app.request("/accounts")).json()) as Array<
      Record<string, string>
    >;
    expect(accounts[0]?.symbol).toBe("LINK");
    expect(accounts[0]?.collateralToken).toBe(LINK);
  });

  it("serves the basket market's collaterals and a basket account's per-asset balances", async () => {
    const dir = mkdtempSync(join(tmpdir(), "meridian-api-basket-"));
    const snapPath = join(dir, "indexer-state.json");
    const WETH = "0x000000000000000000000000000000000000aaaa";
    const LINK = "0x000000000000000000000000000000000000bbbb";
    const BCM = "0x000000000000000000000000000000000000ccdd"; // basket credit manager
    writeFileSync(
      snapPath,
      JSON.stringify({
        pool: { totalDeposited: "1000n", totalBorrowed: "700n", cumulativeInterestRepaid: "0n" },
        accounts: {
          [ACCOUNT]: {
            account: ACCOUNT,
            owner: OWNER,
            facePrincipal: "700n",
            collateralDeposited: "0n",
            open: true,
            liquidated: false,
            symbol: "BASKET",
            collateralToken: WETH,
            creditManager: BCM,
            collaterals: [
              { token: WETH, symbol: "WETH", decimals: 18, amount: "5000000000000000000n" },
              { token: LINK, symbol: "LINK", decimals: 18, amount: "100000000000000000000n" },
            ],
          },
        },
        liquidations: [],
        lastBlock: "5n",
        prices: { [WETH]: "2000000000n", [LINK]: "8000000n" },
      }),
    );
    const manifestPath = join(dir, "local.json");
    writeFileSync(
      manifestPath,
      JSON.stringify({
        network: "local",
        chainId: 31337,
        startBlock: 0,
        pool: "0x8A791620dd6260079BF849Dc5567aDC3F2FdC318",
        markets: [],
        basketMarket: {
          creditManager: BCM,
          creditFacade: "0x0000000000000000000000000000000000000b01",
          liquidationModule: "0x0000000000000000000000000000000000000b02",
          swapAdapter: "0x0000000000000000000000000000000000000b03",
          primaryCollateral: WETH,
          collaterals: [
            { symbol: "WETH", collateralToken: WETH, decimals: 18 },
            { symbol: "LINK", collateralToken: LINK, decimals: 18 },
          ],
        },
      }),
    );
    const app = createApp({
      config: loadConfig({
        INDEXER_SNAPSHOT_PATH: snapPath,
        MERIDIAN_DEPLOYMENT: manifestPath,
        API_SESSION_SECRET: "test-secret",
      } as NodeJS.ProcessEnv),
      source: new SnapshotSource(snapPath),
      nonces: new NonceStore(),
      now: () => NOW,
    });

    const markets = (await (await app.request("/markets")).json()) as Array<{
      symbol: string;
      collaterals?: Array<{ symbol: string; priceUsdc: string }>;
    }>;
    const basket = markets.find((m) => m.symbol === "BASKET");
    expect(basket?.collaterals).toHaveLength(2);
    expect(basket?.collaterals?.find((c) => c.symbol === "LINK")?.priceUsdc).toBe("8000000");

    const accounts = (await (await app.request("/accounts")).json()) as Array<{
      symbol: string;
      collaterals?: Array<{ symbol: string; amount: string }>;
    }>;
    expect(accounts[0]?.symbol).toBe("BASKET");
    expect(accounts[0]?.collaterals).toHaveLength(2);
    expect(accounts[0]?.collaterals?.[1]?.symbol).toBe("LINK");
    expect(accounts[0]?.collaterals?.[1]?.amount).toBe("100000000000000000000");
  });

  it("runs the SIWE login flow and authorizes /me", async () => {
    const app = buildApp();

    const { nonce } = (await (await app.request("/auth/nonce", { method: "POST" })).json()) as {
      nonce: string;
    };
    const message = createSiweMessage({
      address: user.address,
      domain: "example.com",
      uri: "https://example.com",
      version: "1",
      chainId: 1,
      nonce,
      issuedAt: new Date(NOW * 1000),
    });
    const signature = await user.signMessage({ message });

    const verifyRes = await app.request("/auth/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message, signature }),
    });
    expect(verifyRes.status).toBe(200);
    const { token, address } = (await verifyRes.json()) as { token: string; address: string };
    expect(address.toLowerCase()).toBe(user.address.toLowerCase());

    const me = await app.request("/me", { headers: { authorization: `Bearer ${token}` } });
    expect(me.status).toBe(200);
    expect(((await me.json()) as { address: string }).address).toBe(user.address.toLowerCase());

    expect((await app.request("/me")).status).toBe(401);
  });
});
