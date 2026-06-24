package keeper

import (
	"context"
	"errors"
	"math/big"
	"reflect"
	"strings"
	"testing"

	"meridian/keeper/internal/detector"
	"meridian/keeper/internal/watchdog"
)

type fakeLister struct{ accounts []Account }

func (f fakeLister) Accounts(context.Context) ([]Account, error) { return f.accounts, nil }

type fakeHealth struct {
	values map[string]*big.Int
	// creditManagerFor records the credit manager each account was health-checked against.
	creditManagerFor map[string]string
}

func (f fakeHealth) HealthFactor(_ context.Context, account, creditManager string) (*big.Int, error) {
	if f.creditManagerFor != nil {
		f.creditManagerFor[account] = creditManager
	}
	v, ok := f.values[account]
	if !ok {
		return nil, errors.New("unknown account")
	}
	return v, nil
}

type fakeLiquidator struct {
	called    []string
	modules   map[string]string // account -> liquidation module it was routed to
	failFirst int
}

func (f *fakeLiquidator) Liquidate(_ context.Context, account, liquidationModule string) (string, error) {
	f.called = append(f.called, account)
	if f.modules != nil {
		f.modules[account] = liquidationModule
	}
	if f.failFirst > 0 {
		f.failFirst--
		return "", errors.New("submit failed")
	}
	return "0xtx", nil
}

// names builds an account slice from bare addresses (no market tag) for the single-market tests.
func names(addrs ...string) []Account {
	out := make([]Account, len(addrs))
	for i, a := range addrs {
		out[i] = Account{Address: a}
	}
	return out
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
	lister := fakeLister{accounts: names("0xhealthy", "0xunderwater")}
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
	lister := fakeLister{accounts: names("0xunderwater")}
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
	lister := fakeLister{accounts: names("0xunderwater")}
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
	lister := fakeLister{accounts: names("0xunderwater", "0xunreadable")}
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

// Each account is health-checked against its own market's credit manager and liquidated through
// that market's liquidation module; untagged accounts fall back to the defaults.
func TestTickRoutesEachAccountToItsMarket(t *testing.T) {
	const (
		wethCM     = "0xWETHcm"
		linkCM     = "0xLINKcm"
		wethModule = "0xWETHmod"
		linkModule = "0xLINKmod"
	)
	lister := fakeLister{accounts: []Account{
		{Address: "0xweth", CreditManager: wethCM},
		{Address: "0xlink", CreditManager: linkCM},
		{Address: "0xlegacy"}, // no market tag -> defaults
	}}
	health := fakeHealth{
		values: map[string]*big.Int{
			"0xweth":   wad("0.8"),
			"0xlink":   wad("0.7"),
			"0xlegacy": wad("0.9"),
		},
		creditManagerFor: map[string]string{},
	}
	liq := &fakeLiquidator{modules: map[string]string{}}

	k := Keeper{
		Lister:                   lister,
		Health:                   health,
		Liquidator:               liq,
		Watchdog:                 watchdog.Watchdog{MaxAttempts: 3},
		Markets:                  map[string]string{strings.ToLower(wethCM): wethModule, strings.ToLower(linkCM): linkModule},
		DefaultCreditManager:     wethCM,
		DefaultLiquidationModule: wethModule,
	}
	if _, err := k.Tick(context.Background()); err != nil {
		t.Fatalf("Tick error: %v", err)
	}

	if health.creditManagerFor["0xlink"] != linkCM {
		t.Errorf("link account checked against %q, want %q", health.creditManagerFor["0xlink"], linkCM)
	}
	if health.creditManagerFor["0xlegacy"] != wethCM {
		t.Errorf("legacy account checked against %q, want default %q", health.creditManagerFor["0xlegacy"], wethCM)
	}
	if liq.modules["0xlink"] != linkModule {
		t.Errorf("link account liquidated via %q, want %q", liq.modules["0xlink"], linkModule)
	}
	if liq.modules["0xweth"] != wethModule {
		t.Errorf("weth account liquidated via %q, want %q", liq.modules["0xweth"], wethModule)
	}
	if liq.modules["0xlegacy"] != wethModule {
		t.Errorf("legacy account liquidated via %q, want default %q", liq.modules["0xlegacy"], wethModule)
	}
}
