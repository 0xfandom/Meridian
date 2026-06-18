"""FastAPI surface for the margin engine."""

from __future__ import annotations

from fastapi import FastAPI

from .engine import assess
from .models import Portfolio, RiskResult
from .params import RiskParams, load_params


def create_app(params: RiskParams | None = None) -> FastAPI:
    risk = params if params is not None else load_params()
    app = FastAPI(title="Meridian Margin Engine", version="0.0.0")

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/parameters")
    def parameters() -> dict[str, object]:
        return {
            "thresholds": {
                "warning": str(risk.thresholds.warning),
                "marginCall": str(risk.thresholds.margin_call),
                "liquidation": str(risk.thresholds.liquidation),
            },
            "collateral": {
                symbol: {"haircut": str(param.haircut), "maxLeverage": str(param.max_leverage)}
                for symbol, param in risk.collateral.items()
            },
        }

    @app.post("/risk")
    def risk_assessment(portfolio: Portfolio) -> RiskResult:
        return assess(portfolio, risk)

    return app


app = create_app()
