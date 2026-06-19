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
