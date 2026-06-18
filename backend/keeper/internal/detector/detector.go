// Package detector decides which accounts are liquidatable from their health factors.
package detector

import "math/big"

// Threshold is the health-factor floor in WAD (1e18). An account whose health factor is strictly
// below this is liquidatable, matching the on-chain LiquidationModule floor.
var Threshold = new(big.Int).Exp(big.NewInt(10), big.NewInt(18), nil)

// Candidate pairs an account with its current health factor (WAD).
type Candidate struct {
	Account string
	Health  *big.Int
}

// Liquidatable returns the accounts whose health factor is strictly below the floor, preserving
// input order. Candidates with a nil health factor are skipped.
func Liquidatable(candidates []Candidate) []string {
	out := make([]string, 0)
	for _, c := range candidates {
		if c.Health != nil && c.Health.Cmp(Threshold) < 0 {
			out = append(out, c.Account)
		}
	}
	return out
}
