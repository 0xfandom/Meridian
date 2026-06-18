// Package health sources candidate accounts for the keeper from the indexer's snapshot.
package health

import (
	"context"
	"encoding/json"
	"os"
	"sort"
)

// SnapshotLister reads the indexer snapshot and returns accounts that are open and not yet
// liquidated. The snapshot tags bigints with a trailing "n", but those fields are ignored here, so
// the document parses as ordinary JSON.
type SnapshotLister struct {
	Path string
}

type snapshotFile struct {
	Accounts map[string]struct {
		Account    string `json:"account"`
		Open       bool   `json:"open"`
		Liquidated bool   `json:"liquidated"`
	} `json:"accounts"`
}

// Accounts returns the addresses of open, non-liquidated accounts, sorted for deterministic order.
func (s SnapshotLister) Accounts(_ context.Context) ([]string, error) {
	raw, err := os.ReadFile(s.Path)
	if err != nil {
		return nil, err
	}

	var snapshot snapshotFile
	if err := json.Unmarshal(raw, &snapshot); err != nil {
		return nil, err
	}

	accounts := make([]string, 0, len(snapshot.Accounts))
	for _, account := range snapshot.Accounts {
		if account.Open && !account.Liquidated {
			accounts = append(accounts, account.Account)
		}
	}
	sort.Strings(accounts)
	return accounts, nil
}
