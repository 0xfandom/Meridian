"""API tests via the FastAPI test client."""

from __future__ import annotations

from fastapi.testclient import TestClient

from margin_engine.api import create_app
from margin_engine.params import load_params

client = TestClient(create_app(load_params()))


def test_health() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_parameters_expose_thresholds_and_haircuts() -> None:
    body = client.get("/parameters").json()
    assert body["thresholds"]["liquidation"] == "1"
    assert body["collateral"]["WETH"]["haircut"] == "0.1"


def test_risk_endpoint_returns_signals() -> None:
    response = client.post(
        "/risk",
        json={"positions": [{"symbol": "WETH", "quantity": "1", "price": "2000"}], "debt": "1700"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["signal"] == "margin_call"
    assert body["worst_signal"] == "liquidatable"
