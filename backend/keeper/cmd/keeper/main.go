// Command keeper watches account health and submits liquidations for underwater accounts.
package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"meridian/keeper/internal/chain"
	"meridian/keeper/internal/health"
	"meridian/keeper/internal/keeper"
	"meridian/keeper/internal/manifest"
	"meridian/keeper/internal/watchdog"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))

	rpcURL := firstEnv("KEEPER_RPC_URL", "MAINNET_RPC_URL")
	key := os.Getenv("KEEPER_PRIVATE_KEY")
	module := os.Getenv("MERIDIAN_LIQUIDATION_MODULE_ADDRESS")
	creditManager := os.Getenv("MERIDIAN_CREDIT_MANAGER_ADDRESS")
	snapshot := envDefault("INDEXER_SNAPSHOT_PATH", "./indexer-state.json")

	// Map every market's credit manager to its liquidation module so each account is routed to the
	// right contracts; the default (primary) module/creditManager cover untagged accounts.
	markets := map[string]string{}

	// Fall back to the deployment manifest for any address not set explicitly; env vars win.
	if path := os.Getenv("MERIDIAN_DEPLOYMENT"); path != "" {
		m, err := manifest.Load(path)
		if err != nil {
			logger.Error("failed to load deployment manifest", "err", err)
			os.Exit(1)
		}
		if module == "" {
			module = m.LiquidationModule
		}
		if creditManager == "" {
			creditManager = m.CreditManager
		}
		for _, mkt := range m.Markets {
			markets[strings.ToLower(mkt.CreditManager)] = mkt.LiquidationModule
		}
	}

	if rpcURL == "" || key == "" || module == "" || creditManager == "" {
		logger.Info("keeper not configured (need KEEPER_RPC_URL, KEEPER_PRIVATE_KEY, " +
			"MERIDIAN_LIQUIDATION_MODULE_ADDRESS, MERIDIAN_CREDIT_MANAGER_ADDRESS); nothing to do")
		return
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	client, err := chain.Dial(ctx, rpcURL, key, module, creditManager)
	if err != nil {
		logger.Error("failed to connect", "err", err)
		os.Exit(1)
	}

	k := keeper.Keeper{
		Lister:     health.SnapshotLister{Path: snapshot},
		Health:     client,
		Liquidator: client,
		Watchdog: watchdog.Watchdog{
			MaxAttempts: envInt("KEEPER_MAX_ATTEMPTS", 3),
			Backoff:     time.Duration(envInt("KEEPER_BACKOFF_MS", 1000)) * time.Millisecond,
		},
		Markets:                  markets,
		DefaultCreditManager:     creditManager,
		DefaultLiquidationModule: module,
		DryRun:                   envBool("KEEPER_DRY_RUN", true),
		Logger:                   logger,
	}

	interval := time.Duration(envInt("KEEPER_INTERVAL_MS", 4000)) * time.Millisecond
	logger.Info("keeper started", "from", client.From().Hex(), "dryRun", k.DryRun, "interval", interval.String())

	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		acted, err := k.Tick(ctx)
		if err != nil {
			logger.Warn("tick failed", "err", err)
		} else if len(acted) > 0 {
			logger.Info("acted on accounts", "count", len(acted))
		}
		select {
		case <-ctx.Done():
			logger.Info("shutting down")
			return
		case <-ticker.C:
		}
	}
}

func firstEnv(keys ...string) string {
	for _, key := range keys {
		if value := os.Getenv(key); value != "" {
			return value
		}
	}
	return ""
}

func envDefault(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func envInt(key string, fallback int) int {
	if value, err := strconv.Atoi(os.Getenv(key)); err == nil {
		return value
	}
	return fallback
}

func envBool(key string, fallback bool) bool {
	if value, err := strconv.ParseBool(os.Getenv(key)); err == nil {
		return value
	}
	return fallback
}
