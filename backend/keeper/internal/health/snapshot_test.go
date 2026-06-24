package health

import (
	"context"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"meridian/keeper/internal/keeper"
)

const snapshot = `{
  "pool": { "totalDeposited": "1000n", "totalBorrowed": "700n", "cumulativeInterestRepaid": "0n" },
  "accounts": {
    "0xAAA": { "account": "0xAAA", "owner": "0xowner", "facePrincipal": "700n", "collateralDeposited": "100n", "open": true, "liquidated": false, "creditManager": "0xWETHcm" },
    "0xBBB": { "account": "0xBBB", "owner": "0xowner", "facePrincipal": "0n", "collateralDeposited": "0n", "open": false, "liquidated": true },
    "0xCCC": { "account": "0xCCC", "owner": "0xowner", "facePrincipal": "400n", "collateralDeposited": "50n", "open": true, "liquidated": false, "creditManager": "0xLINKcm" }
  },
  "liquidations": [],
  "lastBlock": "5n"
}`

func TestAccountsReturnsOpenNonLiquidatedWithMarket(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "indexer-state.json")
	if err := os.WriteFile(path, []byte(snapshot), 0o600); err != nil {
		t.Fatal(err)
	}

	got, err := SnapshotLister{Path: path}.Accounts(context.Background())
	if err != nil {
		t.Fatalf("Accounts error: %v", err)
	}
	// 0xBBB is closed + liquidated; each open account carries its market's credit manager.
	want := []keeper.Account{
		{Address: "0xAAA", CreditManager: "0xWETHcm"},
		{Address: "0xCCC", CreditManager: "0xLINKcm"},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("Accounts = %v, want %v", got, want)
	}
}

func TestAccountsErrorsWhenMissing(t *testing.T) {
	_, err := SnapshotLister{Path: filepath.Join(t.TempDir(), "absent.json")}.Accounts(context.Background())
	if err == nil {
		t.Fatal("expected an error for a missing snapshot")
	}
}
