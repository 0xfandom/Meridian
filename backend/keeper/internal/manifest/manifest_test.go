package manifest

import (
	"os"
	"path/filepath"
	"testing"
)

const (
	creditManager     = "0x00000000000000000000000000000000000000b2"
	liquidationModule = "0x00000000000000000000000000000000000000c3"
)

func writeManifest(t *testing.T, body string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "local.json")
	if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
		t.Fatalf("write manifest: %v", err)
	}
	return path
}

func TestLoadReadsAddressesAndStartBlock(t *testing.T) {
	path := writeManifest(t, `{
		"network": "local",
		"chainId": 31337,
		"startBlock": 7,
		"creditManager": "`+creditManager+`",
		"liquidationModule": "`+liquidationModule+`"
	}`)

	m, err := Load(path)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if m.CreditManager != creditManager {
		t.Errorf("creditManager = %q, want %q", m.CreditManager, creditManager)
	}
	if m.LiquidationModule != liquidationModule {
		t.Errorf("liquidationModule = %q, want %q", m.LiquidationModule, liquidationModule)
	}
	if m.StartBlock != 7 {
		t.Errorf("startBlock = %d, want 7", m.StartBlock)
	}
	if m.ChainID != 31337 {
		t.Errorf("chainId = %d, want 31337", m.ChainID)
	}
}

func TestLoadRejectsMalformedAddress(t *testing.T) {
	path := writeManifest(t, `{
		"creditManager": "0xnothex",
		"liquidationModule": "`+liquidationModule+`"
	}`)

	if _, err := Load(path); err == nil {
		t.Fatal("expected error for malformed creditManager, got nil")
	}
}

func TestLoadRejectsMissingFile(t *testing.T) {
	if _, err := Load(filepath.Join(t.TempDir(), "absent.json")); err == nil {
		t.Fatal("expected error for missing file, got nil")
	}
}

func TestLoadParsesMarketsArray(t *testing.T) {
	const linkCM = "0x00000000000000000000000000000000000000d4"
	const linkModule = "0x00000000000000000000000000000000000000e5"
	path := writeManifest(t, `{
		"creditManager": "`+creditManager+`",
		"liquidationModule": "`+liquidationModule+`",
		"markets": [
			{ "symbol": "WETH", "creditManager": "`+creditManager+`", "liquidationModule": "`+liquidationModule+`" },
			{ "symbol": "LINK", "creditManager": "`+linkCM+`", "liquidationModule": "`+linkModule+`" }
		]
	}`)

	m, err := Load(path)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if len(m.Markets) != 2 {
		t.Fatalf("markets = %d, want 2", len(m.Markets))
	}
	if m.Markets[1].Symbol != "LINK" || m.Markets[1].CreditManager != linkCM || m.Markets[1].LiquidationModule != linkModule {
		t.Errorf("markets[1] = %+v, want LINK %s/%s", m.Markets[1], linkCM, linkModule)
	}
}

func TestLoadFoldsBasketMarketIntoMarkets(t *testing.T) {
	const basketCM = "0x0000000000000000000000000000000000000f06"
	const basketModule = "0x000000000000000000000000000000000000010A"
	path := writeManifest(t, `{
		"creditManager": "`+creditManager+`",
		"liquidationModule": "`+liquidationModule+`",
		"markets": [
			{ "symbol": "WETH", "creditManager": "`+creditManager+`", "liquidationModule": "`+liquidationModule+`" }
		],
		"basketMarket": { "creditManager": "`+basketCM+`", "liquidationModule": "`+basketModule+`" }
	}`)

	m, err := Load(path)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	// The basket market is appended after the single-collateral markets.
	if len(m.Markets) != 2 {
		t.Fatalf("markets = %d, want 2 (WETH + basket)", len(m.Markets))
	}
	basket := m.Markets[len(m.Markets)-1]
	if basket.CreditManager != basketCM || basket.LiquidationModule != basketModule {
		t.Errorf("basket market = %+v, want %s/%s", basket, basketCM, basketModule)
	}
	if basket.Symbol != "basket" {
		t.Errorf("basket symbol = %q, want defaulted to \"basket\"", basket.Symbol)
	}
}

func TestLoadRejectsMalformedBasketMarket(t *testing.T) {
	path := writeManifest(t, `{
		"creditManager": "`+creditManager+`",
		"liquidationModule": "`+liquidationModule+`",
		"basketMarket": { "creditManager": "0xnothex", "liquidationModule": "`+liquidationModule+`" }
	}`)

	if _, err := Load(path); err == nil {
		t.Fatal("expected error for malformed basketMarket creditManager, got nil")
	}
}

func TestLoadSynthesisesPrimaryMarketWhenAbsent(t *testing.T) {
	path := writeManifest(t, `{
		"creditManager": "`+creditManager+`",
		"liquidationModule": "`+liquidationModule+`"
	}`)

	m, err := Load(path)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if len(m.Markets) != 1 {
		t.Fatalf("markets = %d, want 1 synthesised", len(m.Markets))
	}
	if m.Markets[0].CreditManager != creditManager || m.Markets[0].LiquidationModule != liquidationModule {
		t.Errorf("synthesised market = %+v, want %s/%s", m.Markets[0], creditManager, liquidationModule)
	}
}
