"""Smoke test for the app factory and the health route (hot-path-free)."""

from __future__ import annotations

from fastapi.testclient import TestClient

from avp_api.main import create_app


def test_health_ok() -> None:
    client = TestClient(create_app())
    resp = client.get("/api/v1/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_unknown_route_uses_error_shape() -> None:
    client = TestClient(create_app())
    resp = client.get("/api/v1/does-not-exist")
    assert resp.status_code == 404
    body = resp.json()
    assert "error" in body
    assert set(body["error"]) == {"code", "message"}
