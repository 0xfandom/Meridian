"""Pydantic models for the margin-engine API and pipeline."""

from __future__ import annotations

from decimal import Decimal
from enum import StrEnum

from pydantic import BaseModel, Field


class Signal(StrEnum):
    """Risk signal emitted for a portfolio, ordered from safest to most severe."""

    HEALTHY = "healthy"
    WARNING = "warning"
    MARGIN_CALL = "margin_call"
    LIQUIDATABLE = "liquidatable"


class Position(BaseModel):
    """A single collateral holding marked in the USD unit of account."""

    symbol: str
    quantity: Decimal = Field(ge=0)
    price: Decimal = Field(ge=0)


class Portfolio(BaseModel):
    """Collateral positions held against a USD-denominated debt."""

    positions: list[Position]
    debt: Decimal = Field(ge=0)


class StressScenario(BaseModel):
    """A named set of fractional price shocks per symbol, e.g. {"WETH": -0.2}."""

    name: str
    shocks: dict[str, Decimal]


class StressedResult(BaseModel):
    """Outcome of re-pricing a portfolio under one stress scenario."""

    scenario: str
    health_factor: Decimal | None
    signal: Signal


class RiskResult(BaseModel):
    """Full risk assessment of a portfolio: spot, stressed, and the worst signal."""

    gross_value: Decimal
    adjusted_value: Decimal
    debt: Decimal
    health_factor: Decimal | None
    signal: Signal
    stressed: list[StressedResult]
    worst_signal: Signal
