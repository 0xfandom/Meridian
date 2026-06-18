package watchdog

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestRunSucceedsAfterRetries(t *testing.T) {
	calls, sleeps := 0, 0
	w := Watchdog{MaxAttempts: 3, Backoff: time.Second, Sleep: func(time.Duration) { sleeps++ }}

	err := w.Run(context.Background(), func(context.Context) error {
		calls++
		if calls < 3 {
			return errors.New("transient")
		}
		return nil
	})

	if err != nil {
		t.Fatalf("expected success, got %v", err)
	}
	if calls != 3 {
		t.Fatalf("expected 3 attempts, got %d", calls)
	}
	if sleeps != 2 {
		t.Fatalf("expected 2 backoff sleeps, got %d", sleeps)
	}
}

func TestRunGivesUpAfterMaxAttempts(t *testing.T) {
	calls := 0
	w := Watchdog{MaxAttempts: 2, Sleep: func(time.Duration) {}}

	err := w.Run(context.Background(), func(context.Context) error {
		calls++
		return errors.New("permanent")
	})

	if err == nil {
		t.Fatal("expected an error after exhausting attempts")
	}
	if calls != 2 {
		t.Fatalf("expected 2 attempts, got %d", calls)
	}
}

func TestRunStopsOnCancelledContext(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	calls := 0

	err := Watchdog{MaxAttempts: 5, Sleep: func(time.Duration) {}}.Run(ctx, func(context.Context) error {
		calls++
		return errors.New("fail")
	})

	if !errors.Is(err, context.Canceled) {
		t.Fatalf("expected context.Canceled, got %v", err)
	}
	if calls != 1 {
		t.Fatalf("expected 1 attempt before cancel check, got %d", calls)
	}
}
