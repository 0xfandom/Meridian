"""The risk pipeline: ingest a portfolio, mark it, haircut it, stress it, and emit a signal."""

from __future__ import annotations

from decimal import Decimal

from .models import Portfolio, Position, RiskResult, Signal, StressedResult, StressScenario
from .params import RiskParams, Thresholds

_SEVERITY = {
    Signal.HEALTHY: 0,
    Signal.WARNING: 1,
    Signal.MARGIN_CALL: 2,
    Signal.LIQUIDATABLE: 3,
}


def default_scenarios() -> list[StressScenario]:
    """House stress scenarios: a broad risk-off move and a severe drawdown."""
    return [
        StressScenario(
            name="risk_off_20",
            shocks={"WETH": Decimal("-0.20"), "WBTC": Decimal("-0.20"), "wstETH": Decimal("-0.22")},
        ),
        StressScenario(
            name="severe_35",
            shocks={"WETH": Decimal("-0.35"), "WBTC": Decimal("-0.35"), "wstETH": Decimal("-0.38")},
        ),
    ]


def assess(
    portfolio: Portfolio,
    params: RiskParams,
    scenarios: list[StressScenario] | None = None,
) -> RiskResult:
    """Assesses a portfolio at spot and under each scenario, returning the worst signal seen."""
    gross = _gross_value(portfolio.positions)
    adjusted = _adjusted_value(portfolio.positions, params)
    health = _health_factor(adjusted, portfolio.debt)
    signal = _signal(health, params.thresholds)

    stressed: list[StressedResult] = []
    worst = signal
    for scenario in scenarios if scenarios is not None else default_scenarios():
        shocked = [_shock(position, scenario) for position in portfolio.positions]
        scenario_health = _health_factor(_adjusted_value(shocked, params), portfolio.debt)
        scenario_signal = _signal(scenario_health, params.thresholds)
        stressed.append(
            StressedResult(
                scenario=scenario.name, health_factor=scenario_health, signal=scenario_signal
            )
        )
        worst = _worse(worst, scenario_signal)

    return RiskResult(
        gross_value=gross,
        adjusted_value=adjusted,
        debt=portfolio.debt,
        health_factor=health,
        signal=signal,
        stressed=stressed,
        worst_signal=worst,
    )


def _shock(position: Position, scenario: StressScenario) -> Position:
    factor = Decimal(1) + scenario.shocks.get(position.symbol, Decimal(0))
    if factor < 0:
        factor = Decimal(0)
    return Position(
        symbol=position.symbol, quantity=position.quantity, price=position.price * factor
    )


def _gross_value(positions: list[Position]) -> Decimal:
    total = Decimal(0)
    for position in positions:
        total += position.quantity * position.price
    return total


def _adjusted_value(positions: list[Position], params: RiskParams) -> Decimal:
    total = Decimal(0)
    for position in positions:
        haircut = params.haircut(position.symbol)
        total += position.quantity * position.price * (Decimal(1) - haircut)
    return total


def _health_factor(adjusted: Decimal, debt: Decimal) -> Decimal | None:
    if debt == 0:
        return None  # no debt: unbounded health
    return adjusted / debt


def _signal(health: Decimal | None, thresholds: Thresholds) -> Signal:
    if health is None or health >= thresholds.warning:
        return Signal.HEALTHY
    if health >= thresholds.margin_call:
        return Signal.WARNING
    if health >= thresholds.liquidation:
        return Signal.MARGIN_CALL
    return Signal.LIQUIDATABLE


def _worse(a: Signal, b: Signal) -> Signal:
    return a if _SEVERITY[a] >= _SEVERITY[b] else b
