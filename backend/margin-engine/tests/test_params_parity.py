"""Parity guard: the engine must read the same risk parameters as the on-chain config."""

from __future__ import annotations

from decimal import Decimal

import pytest

from margin_engine.params import load_params


def test_thresholds_match_source() -> None:
    params = load_params()
    assert params.thresholds.warning == Decimal("1.2")
    assert params.thresholds.margin_call == Decimal("1.1")
    assert params.thresholds.liquidation == Decimal("1")


def test_collateral_haircuts_match_source() -> None:
    params = load_params()
    assert params.haircut("USDC") == Decimal("0.02")
    assert params.haircut("WETH") == Decimal("0.1")
    assert params.haircut("WBTC") == Decimal("0.12")
    assert params.haircut("wstETH") == Decimal("0.15")
    assert params.collateral["WETH"].max_leverage == Decimal("5")
    assert params.collateral["wstETH"].max_leverage == Decimal("3")


def test_unsupported_collateral_raises() -> None:
    params = load_params()
    with pytest.raises(KeyError):
        params.haircut("DOGE")
