// Package manifest reads the deployment manifest written by the contracts deploy script so the
// keeper can resolve the contracts it watches without addresses being entered by hand.
package manifest

import (
	"encoding/json"
	"fmt"
	"os"
)

// Manifest is the subset of contracts/deployments/<network>.json the keeper needs.
type Manifest struct {
	Network           string `json:"network"`
	ChainID           uint64 `json:"chainId"`
	StartBlock        uint64 `json:"startBlock"`
	CreditManager     string `json:"creditManager"`
	LiquidationModule string `json:"liquidationModule"`
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
