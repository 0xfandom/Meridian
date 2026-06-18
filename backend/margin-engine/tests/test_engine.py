"""Unit tests for the risk pipeline with deterministic fixtures."""

from __future__ import annotations

from decimal import Decimal

from margin_engine.engine import assess
from margin_engine.models import Portfolio, Position, Signal, StressScenario
from margin_engine.params import load_params

PARAMS = load_params()


def _weth(quantity: str, price: str) -> Position:
    return Position(symbol="WETH", quantity=Decimal(quantity), price=Decimal(price))


def test_healthy_portfolio() -> None:
    portfolio = Portfolio(positions=[_weth("1", "2000")], debt=Decimal(1000))
    result = assess(portfolio, PARAMS, scenarios=[])
    assert result.gross_value == Decimal(2000)
    assert result.adjusted_value == Decimal(1800)  # 10% WETH haircut
    assert result.health_factor == Decimal("1.8")
    assert result.signal == Signal.HEALTHY


def test_margin_call_band() -> None:
    portfolio = Portfolio(positions=[_weth("1", "2000")], debt=Decimal(1700))
    result = assess(portfolio, PARAMS, scenarios=[])
    # 1800 / 1700 = 1.0588, between liquidation (1.0) and margin call (1.1).
    assert result.signal == Signal.MARGIN_CALL


def test_no_debt_is_healthy() -> None:
    portfolio = Portfolio(positions=[_weth("1", "2000")], debt=Decimal(0))
    result = assess(portfolio, PARAMS, scenarios=[])
    assert result.health_factor is None
    assert result.signal == Signal.HEALTHY


def test_stress_worsens_signal() -> None:
    portfolio = Portfolio(positions=[_weth("1", "2000")], debt=Decimal(1700))
    result = assess(portfolio, PARAMS)  # default scenarios
    # Spot is a margin call; a 20% WETH drop pushes adjusted value to 1440, health 0.847.
    assert any(s.signal == Signal.LIQUIDATABLE for s in result.stressed)
    assert result.worst_signal == Signal.LIQUIDATABLE


def test_custom_scenario_overrides_defaults() -> None:
    portfolio = Portfolio(positions=[_weth("1", "2000")], debt=Decimal(1000))
    scenario = StressScenario(name="crash", shocks={"WETH": Decimal("-0.5")})
    result = assess(portfolio, PARAMS, scenarios=[scenario])
    # WETH halves to 1000, adjusted 900, health 0.9 -> liquidatable under stress.
    assert result.stressed[0].signal == Signal.LIQUIDATABLE
    assert result.worst_signal == Signal.LIQUIDATABLE
