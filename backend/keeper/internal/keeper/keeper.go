// Package keeper orchestrates one detection-and-liquidation pass over candidate accounts.
package keeper

import (
	"context"
	"log/slog"
	"math/big"

	"meridian/keeper/internal/detector"
	"meridian/keeper/internal/watchdog"
)

// AccountLister yields the accounts worth checking (open, not yet liquidated).
type AccountLister interface {
	Accounts(ctx context.Context) ([]string, error)
}

// HealthChecker reads an account's current health factor (WAD) from the chain.
type HealthChecker interface {
	HealthFactor(ctx context.Context, account string) (*big.Int, error)
}

// Liquidator submits a liquidation for an account and returns the transaction hash.
type Liquidator interface {
	Liquidate(ctx context.Context, account string) (string, error)
}

// Keeper wires the candidate source, on-chain health reads, and submission together. The on-chain
// LiquidationModule re-checks the floor, so a stale health read can only ever cause a no-op revert,
// never an unsafe liquidation.
type Keeper struct {
	Lister     AccountLister
	Health     HealthChecker
	Liquidator Liquidator
	Watchdog   watchdog.Watchdog
	DryRun     bool
	Logger     *slog.Logger
}

// Tick runs one pass: list candidates, read each health factor, detect those below the floor, and
// submit liquidations (skipping submission in dry-run mode). It returns the accounts acted on.
func (k Keeper) Tick(ctx context.Context) ([]string, error) {
	accounts, err := k.Lister.Accounts(ctx)
	if err != nil {
		return nil, err
	}

	candidates := make([]detector.Candidate, 0, len(accounts))
	for _, account := range accounts {
		health, err := k.Health.HealthFactor(ctx, account)
		if err != nil {
			k.logger().Warn("health check failed", "account", account, "err", err)
			continue
		}
		candidates = append(candidates, detector.Candidate{Account: account, Health: health})
	}

	targets := detector.Liquidatable(candidates)
	acted := make([]string, 0, len(targets))
	for _, account := range targets {
		if k.DryRun {
			k.logger().Info("dry-run: would liquidate", "account", account)
			acted = append(acted, account)
			continue
		}

		account := account
		err := k.Watchdog.Run(ctx, func(ctx context.Context) error {
			tx, err := k.Liquidator.Liquidate(ctx, account)
			if err != nil {
				return err
			}
			k.logger().Info("liquidation submitted", "account", account, "tx", tx)
			return nil
		})
		if err != nil {
			k.logger().Error("liquidation failed", "account", account, "err", err)
			continue
		}
		acted = append(acted, account)
	}
	return acted, nil
}

func (k Keeper) logger() *slog.Logger {
	if k.Logger != nil {
		return k.Logger
	}
	return slog.Default()
}
