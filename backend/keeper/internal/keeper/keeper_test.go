package keeper

import (
	"context"
	"errors"
	"math/big"
	"reflect"
	"testing"

	"meridian/keeper/internal/detector"
	"meridian/keeper/internal/watchdog"
)

type fakeLister struct{ accounts []string }

func (f fakeLister) Accounts(context.Context) ([]string, error) { return f.accounts, nil }

type fakeHealth struct{ values map[string]*big.Int }

func (f fakeHealth) HealthFactor(_ context.Context, account string) (*big.Int, error) {
	v, ok := f.values[account]
	if !ok {
		return nil, errors.New("unknown account")
	}
	return v, nil
}

type fakeLiquidator struct {
	called    []string
	failFirst int
}

func (f *fakeLiquidator) Liquidate(_ context.Context, account string) (string, error) {
	f.called = append(f.called, account)
	if f.failFirst > 0 {
		f.failFirst--
		return "", errors.New("submit failed")
	}
	return "0xtx", nil
}

func wad(mult string) *big.Int {
	f, _, _ := big.ParseFloat(mult, 10, 0, big.ToNearestEven)
	out, _ := new(big.Float).Mul(f, new(big.Float).SetInt(detector.Threshold)).Int(nil)
	return out
}

func newKeeper(lister fakeLister, health fakeHealth, liq *fakeLiquidator, dryRun bool) Keeper {
	return Keeper{
		Lister:     lister,
		Health:     health,
		Liquidator: liq,
		Watchdog:   watchdog.Watchdog{MaxAttempts: 3},
		DryRun:     dryRun,
	}
}

func TestTickLiquidatesOnlyUnderwaterAccounts(t *testing.T) {
	lister := fakeLister{accounts: []string{"0xhealthy", "0xunderwater"}}
	health := fakeHealth{values: map[string]*big.Int{"0xhealthy": wad("1.4"), "0xunderwater": wad("0.8")}}
	liq := &fakeLiquidator{}

	acted, err := newKeeper(lister, health, liq, false).Tick(context.Background())
	if err != nil {
		t.Fatalf("Tick error: %v", err)
	}
	if !reflect.DeepEqual(acted, []string{"0xunderwater"}) {
		t.Fatalf("acted = %v, want [0xunderwater]", acted)
	}
	if !reflect.DeepEqual(liq.called, []string{"0xunderwater"}) {
		t.Fatalf("liquidator called for %v, want [0xunderwater]", liq.called)
	}
}

func TestTickDryRunDoesNotSubmit(t *testing.T) {
	lister := fakeLister{accounts: []string{"0xunderwater"}}
	health := fakeHealth{values: map[string]*big.Int{"0xunderwater": wad("0.5")}}
	liq := &fakeLiquidator{}

	acted, err := newKeeper(lister, health, liq, true).Tick(context.Background())
	if err != nil {
		t.Fatalf("Tick error: %v", err)
	}
	if len(acted) != 1 {
		t.Fatalf("dry-run should report 1 target, got %v", acted)
	}
	if len(liq.called) != 0 {
		t.Fatalf("dry-run must not submit, but liquidator was called %v", liq.called)
	}
}

func TestTickRetriesTransientSubmitFailure(t *testing.T) {
	lister := fakeLister{accounts: []string{"0xunderwater"}}
	health := fakeHealth{values: map[string]*big.Int{"0xunderwater": wad("0.9")}}
	liq := &fakeLiquidator{failFirst: 1} // first submit fails, retry succeeds

	acted, err := newKeeper(lister, health, liq, false).Tick(context.Background())
	if err != nil {
		t.Fatalf("Tick error: %v", err)
	}
	if len(acted) != 1 {
		t.Fatalf("expected the retried account to be acted on, got %v", acted)
	}
	if len(liq.called) != 2 {
		t.Fatalf("expected 2 submit attempts, got %d", len(liq.called))
	}
}

func TestTickSkipsAccountsWithFailedHealthRead(t *testing.T) {
	lister := fakeLister{accounts: []string{"0xunderwater", "0xunreadable"}}
	health := fakeHealth{values: map[string]*big.Int{"0xunderwater": wad("0.7")}}
	liq := &fakeLiquidator{}

	acted, err := newKeeper(lister, health, liq, false).Tick(context.Background())
	if err != nil {
		t.Fatalf("Tick error: %v", err)
	}
	if !reflect.DeepEqual(acted, []string{"0xunderwater"}) {
		t.Fatalf("acted = %v, want [0xunderwater]", acted)
	}
}
