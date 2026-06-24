// Package keeper orchestrates one detection-and-liquidation pass over candidate accounts.
package keeper

import (
	"context"
	"log/slog"
	"math/big"
	"strings"

	"meridian/keeper/internal/detector"
	"meridian/keeper/internal/watchdog"
)

// Account is a candidate to check, tagged with the credit manager of the market it belongs to.
// CreditManager is empty on snapshots written before per-account market tagging, in which case the
// keeper falls back to its default market.
type Account struct {
	Address       string
	CreditManager string
}

// AccountLister yields the accounts worth checking (open, not yet liquidated).
type AccountLister interface {
	Accounts(ctx context.Context) ([]Account, error)
}

// HealthChecker reads an account's current health factor (WAD) from the given market's credit
// manager.
type HealthChecker interface {
	HealthFactor(ctx context.Context, account, creditManager string) (*big.Int, error)
}

// Liquidator submits a liquidation for an account through the given market's liquidation module and
// returns the transaction hash.
type Liquidator interface {
	Liquidate(ctx context.Context, account, liquidationModule string) (string, error)
}

// Keeper wires the candidate source, on-chain health reads, and submission together. The on-chain
// LiquidationModule re-checks the floor, so a stale health read can only ever cause a no-op revert,
// never an unsafe liquidation.
//
// Multi-market routing: each account is health-checked against its own market's credit manager and
// liquidated through that market's liquidation module. Markets maps a credit manager to its
// liquidation module; the Default* fields cover accounts whose snapshot has no market tag.
type Keeper struct {
	Lister                   AccountLister
	Health                   HealthChecker
	Liquidator               Liquidator
	Watchdog                 watchdog.Watchdog
	Markets                  map[string]string // creditManager (lowercased) -> liquidationModule
	DefaultCreditManager     string
	DefaultLiquidationModule string
	DryRun                   bool
	Logger                   *slog.Logger
}

// Tick runs one pass: list candidates, read each health factor, detect those below the floor, and
// submit liquidations (skipping submission in dry-run mode). It returns the accounts acted on.
func (k Keeper) Tick(ctx context.Context) ([]string, error) {
	accounts, err := k.Lister.Accounts(ctx)
	if err != nil {
		return nil, err
	}

	candidates := make([]detector.Candidate, 0, len(accounts))
	moduleByAccount := make(map[string]string, len(accounts))
	for _, account := range accounts {
		creditManager := account.CreditManager
		if creditManager == "" {
			creditManager = k.DefaultCreditManager
		}
		health, err := k.Health.HealthFactor(ctx, account.Address, creditManager)
		if err != nil {
			k.logger().Warn("health check failed", "account", account.Address, "err", err)
			continue
		}
		candidates = append(candidates, detector.Candidate{Account: account.Address, Health: health})
		moduleByAccount[account.Address] = k.moduleFor(creditManager)
	}

	targets := detector.Liquidatable(candidates)
	acted := make([]string, 0, len(targets))
	for _, account := range targets {
		module := moduleByAccount[account]
		if k.DryRun {
			k.logger().Info("dry-run: would liquidate", "account", account, "module", module)
			acted = append(acted, account)
			continue
		}

		account := account
		err := k.Watchdog.Run(ctx, func(ctx context.Context) error {
			tx, err := k.Liquidator.Liquidate(ctx, account, module)
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

// moduleFor returns the liquidation module for an account's credit manager, falling back to the
// default when the market is unknown (e.g. an untagged account on a fresh keeper).
func (k Keeper) moduleFor(creditManager string) string {
	if module, ok := k.Markets[strings.ToLower(creditManager)]; ok {
		return module
	}
	return k.DefaultLiquidationModule
}

func (k Keeper) logger() *slog.Logger {
	if k.Logger != nil {
		return k.Logger
	}
	return slog.Default()
}
