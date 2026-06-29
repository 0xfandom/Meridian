// Package manifest reads the deployment manifest written by the contracts deploy script so the
// keeper can resolve the contracts it watches without addresses being entered by hand.
package manifest

import (
	"encoding/json"
	"fmt"
	"os"
)

// Market is one credit market: the contracts the keeper routes to for a given collateral asset.
type Market struct {
	Symbol            string `json:"symbol"`
	CollateralToken   string `json:"collateralToken"`
	CreditManager     string `json:"creditManager"`
	LiquidationModule string `json:"liquidationModule"`
}

// Manifest is the subset of contracts/deployments/<network>.json the keeper needs. The flat
// creditManager/liquidationModule fields describe the primary market and are kept for back-compat;
// Markets lists every market. Manifests written before multi-market support have no markets array,
// so one is synthesised from the flat fields.
//
// BasketMarket is the multi-collateral market, written under its own key so services that only read
// the single-collateral Markets array are unaffected. The keeper must watch it too, so Load folds it
// into Markets: a basket account is health-checked and liquidated through its own credit manager and
// liquidation module exactly like any other market.
type Manifest struct {
	Network           string   `json:"network"`
	ChainID           uint64   `json:"chainId"`
	StartBlock        uint64   `json:"startBlock"`
	CreditManager     string   `json:"creditManager"`
	LiquidationModule string   `json:"liquidationModule"`
	Markets           []Market `json:"markets"`
	BasketMarket      *Market  `json:"basketMarket"`
}

// Load reads and validates a manifest file, returning a precise error when a required address is
// missing or malformed so a bad manifest fails loudly at startup.
func Load(path string) (Manifest, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return Manifest{}, fmt.Errorf("manifest: read %s: %w", path, err)
	}

	var m Manifest
	if err := json.Unmarshal(data, &m); err != nil {
		return Manifest{}, fmt.Errorf("manifest: parse %s: %w", path, err)
	}

	if !isHexAddress(m.CreditManager) {
		return Manifest{}, fmt.Errorf("manifest %s: creditManager must be a 20-byte hex address", path)
	}
	if !isHexAddress(m.LiquidationModule) {
		return Manifest{}, fmt.Errorf("manifest %s: liquidationModule must be a 20-byte hex address", path)
	}

	// Synthesise a single primary market for manifests written before multi-market support.
	if len(m.Markets) == 0 {
		m.Markets = []Market{{
			Symbol:            "primary",
			CreditManager:     m.CreditManager,
			LiquidationModule: m.LiquidationModule,
		}}
	}
	for i, mkt := range m.Markets {
		if !isHexAddress(mkt.CreditManager) {
			return Manifest{}, fmt.Errorf("manifest %s: markets[%d].creditManager must be a 20-byte hex address", path, i)
		}
		if !isHexAddress(mkt.LiquidationModule) {
			return Manifest{}, fmt.Errorf("manifest %s: markets[%d].liquidationModule must be a 20-byte hex address", path, i)
		}
	}

	// Fold the basket market into Markets so the keeper watches it like any other: a basket account
	// routes to the basket credit manager and liquidation module rather than the default fallback.
	if m.BasketMarket != nil {
		b := *m.BasketMarket
		if !isHexAddress(b.CreditManager) {
			return Manifest{}, fmt.Errorf("manifest %s: basketMarket.creditManager must be a 20-byte hex address", path)
		}
		if !isHexAddress(b.LiquidationModule) {
			return Manifest{}, fmt.Errorf("manifest %s: basketMarket.liquidationModule must be a 20-byte hex address", path)
		}
		if b.Symbol == "" {
			b.Symbol = "basket"
		}
		m.Markets = append(m.Markets, b)
	}

	return m, nil
}

func isHexAddress(s string) bool {
	if len(s) != 42 || s[0] != '0' || (s[1] != 'x' && s[1] != 'X') {
		return false
	}
	for _, c := range s[2:] {
		isDigit := c >= '0' && c <= '9'
		isLower := c >= 'a' && c <= 'f'
		isUpper := c >= 'A' && c <= 'F'
		if !isDigit && !isLower && !isUpper {
			return false
		}
	}
	return true
}
