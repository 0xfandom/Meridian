import { serve } from "@hono/node-server";
import { WebSocketServer } from "ws";
import type { Server } from "node:http";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { NonceStore } from "./auth/siwe.js";
import { poolView } from "./routes/views.js";
import { toJson } from "./serialize.js";
import { SnapshotSource } from "./state/source.js";
import { Hub } from "./ws/hub.js";

const config = loadConfig();
const source = new SnapshotSource(config.snapshotPath);
const nonces = new NonceStore();
const app = createApp({
  config,
  source,
  nonces,
  now: () => Math.floor(Date.now() / 1000),
});

const server = serve({ fetch: app.fetch, port: config.port }) as unknown as Server;
const hub = new Hub();

const wss = new WebSocketServer({ server, path: "/ws" });
wss.on("connection", (socket) => {
  const subscriber = { send: (data: string) => socket.send(data) };
  hub.add(subscriber);
  socket.on("close", () => hub.remove(subscriber));
});

setInterval(() => {
  hub.broadcast(toJson({ type: "pool", data: poolView(source.refresh()) }));
}, config.wsBroadcastMs);

console.log(`[api] listening on :${config.port}; ws at /ws`);
