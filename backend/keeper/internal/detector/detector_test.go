package detector

import (
	"math/big"
	"reflect"
	"testing"
)

func wad(multiplier string) *big.Int {
	f, _, _ := big.ParseFloat(multiplier, 10, 0, big.ToNearestEven)
	scaled := new(big.Float).Mul(f, new(big.Float).SetInt(Threshold))
	out, _ := scaled.Int(nil)
	return out
}

func TestLiquidatableSelectsBelowFloor(t *testing.T) {
	candidates := []Candidate{
		{Account: "0xhealthy", Health: wad("1.5")},
		{Account: "0xboundary", Health: new(big.Int).Set(Threshold)}, // exactly 1.0 is not liquidatable
		{Account: "0xunderwater", Health: wad("0.9")},
		{Account: "0xzero", Health: big.NewInt(0)},
	}

	got := Liquidatable(candidates)
	want := []string{"0xunderwater", "0xzero"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("Liquidatable = %v, want %v", got, want)
	}
}

func TestLiquidatableSkipsNilHealth(t *testing.T) {
	got := Liquidatable([]Candidate{{Account: "0xunknown", Health: nil}})
	if len(got) != 0 {
		t.Fatalf("expected no targets for nil health, got %v", got)
	}
}
