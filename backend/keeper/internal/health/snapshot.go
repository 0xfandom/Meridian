// Package health sources candidate accounts for the keeper from the indexer's snapshot.
package health

import (
	"context"
	"encoding/json"
	"os"
	"sort"

	"meridian/keeper/internal/keeper"
)

// SnapshotLister reads the indexer snapshot and returns accounts that are open and not yet
// liquidated. The snapshot tags bigints with a trailing "n", but those fields are ignored here, so
// the document parses as ordinary JSON.
type SnapshotLister struct {
	Path string
}

type snapshotFile struct {
	Accounts map[string]struct {
		Account       string `json:"account"`
		Open          bool   `json:"open"`
		Liquidated    bool   `json:"liquidated"`
		CreditManager string `json:"creditManager"`
	} `json:"accounts"`
}

// Accounts returns the open, non-liquidated accounts tagged with the credit manager of the market
// they belong to, sorted by address for deterministic order.
func (s SnapshotLister) Accounts(_ context.Context) ([]keeper.Account, error) {
	raw, err := os.ReadFile(s.Path)
	if err != nil {
		return nil, err
	}

	var snapshot snapshotFile
	if err := json.Unmarshal(raw, &snapshot); err != nil {
		return nil, err
	}

	accounts := make([]keeper.Account, 0, len(snapshot.Accounts))
	for _, account := range snapshot.Accounts {
		if account.Open && !account.Liquidated {
			accounts = append(accounts, keeper.Account{
				Address:       account.Account,
				CreditManager: account.CreditManager,
			})
		}
	}
	sort.Slice(accounts, func(i, j int) bool { return accounts[i].Address < accounts[j].Address })
	return accounts, nil
}
