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


def test_cors_headers_present_for_allowed_origins() -> None:
    client = TestClient(create_app())
    for origin in ("http://localhost:3000", "http://127.0.0.1:3000"):
        resp = client.get("/api/v1/health", headers={"Origin": origin})
        assert resp.status_code == 200
        assert resp.headers.get("access-control-allow-origin") == origin
        assert resp.headers.get("access-control-allow-credentials") == "true"
