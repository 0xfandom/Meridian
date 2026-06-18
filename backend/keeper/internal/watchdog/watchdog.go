// Package watchdog retries a fallible action and gives up after a bounded number of attempts.
package watchdog

import (
	"context"
	"time"
)

// Action is a retryable unit of work.
type Action func(ctx context.Context) error

// Watchdog retries an action up to MaxAttempts times, sleeping Backoff between attempts. Sleep is
// injectable so tests run without real delays.
type Watchdog struct {
	MaxAttempts int
	Backoff     time.Duration
	Sleep       func(time.Duration)
}

// Run executes the action, retrying on error until it succeeds or attempts are exhausted. It
// returns the last error, or nil on success. A context cancellation between attempts stops retries.
func (w Watchdog) Run(ctx context.Context, action Action) error {
	attempts := w.MaxAttempts
	if attempts < 1 {
		attempts = 1
	}
	sleep := w.Sleep
	if sleep == nil {
		sleep = time.Sleep
	}

	var err error
	for attempt := 1; attempt <= attempts; attempt++ {
		if err = action(ctx); err == nil {
			return nil
		}
		if attempt < attempts {
			if ctx.Err() != nil {
				return ctx.Err()
			}
			sleep(w.Backoff)
		}
	}
	return err
}
