"""Risk parameters loaded from the canonical on-chain source of truth.

The same `contracts/config/risk-params.json` consumed by the on-chain RiskConfigurator is read here,
so the off-chain engine and the contracts can never diverge on haircuts or health thresholds.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path

BPS = Decimal(10_000)

# params.py -> margin_engine -> src -> margin-engine -> backend -> <repo root>
DEFAULT_PARAMS_PATH = (
    Path(__file__).resolve().parents[4] / "contracts" / "config" / "risk-params.json"
)


@dataclass(frozen=True)
class Thresholds:
    """Health-factor thresholds as ratios (1.0 == the liquidation boundary)."""

    warning: Decimal
    margin_call: Decimal
    liquidation: Decimal


@dataclass(frozen=True)
class CollateralParam:
    symbol: str
    haircut: Decimal  # fraction, e.g. 0.10 for a 10% haircut
    max_leverage: Decimal  # multiple, e.g. 5.0 for 5x


@dataclass(frozen=True)
class RiskParams:
    thresholds: Thresholds
    collateral: dict[str, CollateralParam]

    def haircut(self, symbol: str) -> Decimal:
        param = self.collateral.get(symbol)
        if param is None:
            raise KeyError(f"unsupported collateral: {symbol}")
        return param.haircut


def load_params(path: Path | None = None) -> RiskParams:
    source = path or Path(os.environ.get("MERIDIAN_RISK_PARAMS_PATH", str(DEFAULT_PARAMS_PATH)))
    data = json.loads(source.read_text())

    health = data["healthFactor"]
    thresholds = Thresholds(
        warning=Decimal(health["warningBps"]) / BPS,
        margin_call=Decimal(health["marginCallBps"]) / BPS,
        liquidation=Decimal(health["liquidationBps"]) / BPS,
    )

    collateral_data = data["collateral"]
    symbols: list[str] = collateral_data["symbols"]
    haircuts: list[int] = collateral_data["haircutBps"]
    leverages: list[int] = collateral_data["maxLeverageBps"]
    collateral = {
        symbol: CollateralParam(
            symbol=symbol,
            haircut=Decimal(haircuts[index]) / BPS,
            max_leverage=Decimal(leverages[index]) / BPS,
        )
        for index, symbol in enumerate(symbols)
    }

    return RiskParams(thresholds=thresholds, collateral=collateral)
