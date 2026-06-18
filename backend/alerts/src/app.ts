import { Hono } from "hono";
import type { AlertsConfig } from "./config.js";
import { renderMetrics } from "./metrics.js";
import { evaluate } from "./rules/rules.js";
import type { AlertInput } from "./rules/types.js";

export interface AppDeps {
  config: AlertsConfig;
  input: () => AlertInput;
}

/// Exposes health, the current alerts, and Prometheus metrics derived from the latest snapshot view.
export function createApp(deps: AppDeps): Hono {
  const app = new Hono();
  const { config, input } = deps;

  app.get("/health", (c) => {
    const view = input();
    const healthy = view.secondsSinceSnapshot <= config.rules.snapshotStaleSeconds;
    return c.json({
      status: healthy ? "ok" : "degraded",
      lastBlock: String(view.lastBlock),
      snapshotAgeSeconds: view.secondsSinceSnapshot,
    });
  });

  app.get("/alerts", (c) => {
    const view = input();
    return c.json({ alerts: evaluate(view, config.rules) });
  });

  app.get("/metrics", (c) => {
    const view = input();
    const body = renderMetrics(view, evaluate(view, config.rules));
    return c.body(body, 200, { "content-type": "text/plain; version=0.0.4" });
  });

  return app;
}
