import { readFileSync } from "node:fs";
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Context } from "hono";
import type { ApiConfig } from "./config.js";
import { issueSession, verifySession } from "./auth/session.js";
import { NonceStore, verifySiwe } from "./auth/siwe.js";
import { toJson } from "./serialize.js";
import { loadDeployment } from "./deployment.js";
import type { SnapshotSource } from "./state/source.js";
import {
  accountList,
  findAccount,
  isAddress,
  liquidationList,
  openPositions,
  poolView,
} from "./routes/views.js";

export interface AppDeps {
  config: ApiConfig;
  source: SnapshotSource;
  nonces: NonceStore;
  now: () => number; // unix seconds, injectable for tests
}

/// Builds the Hono application. All state is read from the snapshot source; writes never touch the
/// chain. Responses go through a bigint-aware serializer.
export function createApp(deps: AppDeps): Hono {
  const app = new Hono();
  const { config, source, nonces, now } = deps;

  // The deployment manifest is static for a given run; load it once at startup.
  const deployment = loadDeployment(config.deploymentPath);

  // Allow browser clients (the web app) to read the API cross-origin. Origin is configurable;
  // defaults to "*" since the read endpoints are public and auth uses bearer tokens, not cookies.
  app.use("*", cors({ origin: config.corsOrigin }));

  app.get("/health", (c) => json(c, { status: "ok", lastBlock: source.refresh().lastBlock }));

  app.get("/pools", (c) => json(c, poolView(source.refresh())));

  app.get("/accounts", (c) => json(c, accountList(source.refresh())));

  app.get("/accounts/:address", (c) => {
    const address = c.req.param("address");
    if (!isAddress(address)) return json(c, { error: "invalid address" }, 400);
    const account = findAccount(source.refresh(), address);
    return account ? json(c, account) : json(c, { error: "not found" }, 404);
  });

  app.get("/positions", (c) => json(c, openPositions(source.refresh())));

  app.get("/liquidations", (c) => json(c, liquidationList(source.refresh())));

  app.get("/deployment", (c) =>
    deployment ? json(c, deployment) : json(c, { error: "deployment manifest unavailable" }, 503),
  );

  app.get("/risk-parameters", (c) => {
    try {
      return c.body(readFileSync(config.riskParamsPath, "utf8"), 200, {
        "content-type": "application/json",
      });
    } catch {
      return json(c, { error: "risk parameters unavailable" }, 503);
    }
  });

  app.post("/auth/nonce", (c) => json(c, { nonce: nonces.issue(now(), config.nonceTtlSeconds) }));

  app.post("/auth/verify", async (c) => {
    const body = await readBody(c);
    const message = typeof body.message === "string" ? body.message : "";
    const signature = typeof body.signature === "string" ? body.signature : "";
    if (!message || !signature.startsWith("0x")) {
      return json(c, { error: "message and signature required" }, 400);
    }

    const result = await verifySiwe({
      message,
      signature: signature as `0x${string}`,
      domain: config.siweDomain,
      chainId: config.siweChainId,
      nonces,
      now: now(),
    });
    if (!result.ok || !result.address)
      return json(c, { error: result.reason ?? "unauthorized" }, 401);

    const token = issueSession(
      result.address,
      config.sessionTtlSeconds,
      config.sessionSecret,
      now(),
    );
    return json(c, { token, address: result.address });
  });

  app.get("/me", (c) => {
    const session = authenticate(c, config, now());
    return session
      ? json(c, { address: session.address })
      : json(c, { error: "unauthorized" }, 401);
  });

  return app;
}

function json(c: Context, data: unknown, status = 200): Response {
  return c.body(toJson(data), status as never, { "content-type": "application/json" });
}

async function readBody(c: Context): Promise<Record<string, unknown>> {
  try {
    return (await c.req.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function authenticate(c: Context, config: ApiConfig, now: number) {
  const header = c.req.header("authorization") ?? "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) return null;
  return verifySession(token, config.sessionSecret, now);
}
