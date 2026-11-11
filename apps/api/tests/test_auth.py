"""Supabase JWT verification tests (T-AUTH-01, T-SEC-01; AVP-106).

Keys are generated in the test and the JWKS is served by a fake fetch: no
network, no real Supabase project, synthetic users and transcripts only.
"""

from __future__ import annotations

import logging
import time
from contextlib import contextmanager

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec, rsa
from fastapi import HTTPException
from starlette.websockets import WebSocketDisconnect

from avp_api import auth
from avp_api.auth import SupabaseJwtVerifier
from avp_api.providers.llm import FakeLLMProvider
from avp_api.providers.stt import FakeSTTProvider
from avp_api.providers.tts import FakeTTSProvider
from avp_api.routers import debriefs
from avp_api.routers import websocket as ws_router
from tests.test_e2e_flow import make_harness
from tests.test_evaluation_api import FakeSessionRepo, FakeTurnRepo

SUPABASE_URL = "https://example-project.supabase.co"
ISS = f"{SUPABASE_URL}/auth/v1"
USER_A = "11111111-1111-4111-8111-111111111111"
USER_B = "22222222-2222-4222-8222-222222222222"

RSA_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
OTHER_RSA_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
EC_KEY = ec.generate_private_key(ec.SECP256R1())
DISPLAY_NAMES: dict[str | None, str] = {}  # PDF name lookup fake (tests/test_me.py fills it)


def _jwk(public_key, kid: str, alg: str) -> dict:
    algo = jwt.algorithms.RSAAlgorithm if alg == "RS256" else jwt.algorithms.ECAlgorithm
    d = algo.to_jwk(public_key, as_dict=True)
    d.update({"kid": kid, "alg": alg, "use": "sig"})
    return d


class FakeJwks:
    def __init__(self, *keys: dict) -> None:
        self.keys = list(keys)
        self.calls = 0
        self.fail = False

    def __call__(self, url: str) -> dict:
        assert url == f"{ISS}/.well-known/jwks.json"
        self.calls += 1
        if self.fail:
            raise OSError("jwks down")
        return {"keys": list(self.keys)}


class Clock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


def make_token(
    sub: str = USER_A,
    *,
    key=RSA_KEY,
    kid: str = "rsa-1",
    alg: str = "RS256",
    iss: str = ISS,
    aud: str = "authenticated",
    exp_in: int = 3600,
) -> str:
    now = int(time.time())
    claims = {"sub": sub, "iss": iss, "aud": aud, "iat": now, "exp": now + exp_in,
              "role": "authenticated", "email": "synthetic@example.test"}  # fmt: skip
    return jwt.encode(claims, key, algorithm=alg, headers={"kid": kid})


def make_verifier(jwks: FakeJwks | None = None, **kw) -> tuple[SupabaseJwtVerifier, FakeJwks]:
    jwks = jwks or FakeJwks(_jwk(RSA_KEY.public_key(), "rsa-1", "RS256"))
    return SupabaseJwtVerifier(SUPABASE_URL, fetch=jwks, **kw), jwks


def _code(exc: pytest.ExceptionInfo) -> tuple[int, str]:
    return exc.value.status_code, exc.value.detail["code"]


# --- verifier unit tests ------------------------------------------------------------


def test_valid_rs256_token_returns_sub() -> None:
    v, _ = make_verifier()
    assert v.verify(make_token()) == USER_A


def test_valid_es256_token_returns_sub() -> None:
    v, _ = make_verifier(FakeJwks(_jwk(EC_KEY.public_key(), "ec-1", "ES256")))
    assert v.verify(make_token(USER_B, key=EC_KEY, kid="ec-1", alg="ES256")) == USER_B


@pytest.mark.parametrize(
    "token_kw",
    [
        {"exp_in": -3600},  # expired
        {"key": OTHER_RSA_KEY},  # wrong signature (same kid)
        {"iss": "https://evil.supabase.co/auth/v1"},  # wrong issuer
        {"aud": "anon"},  # wrong audience
        {"kid": "unknown-kid"},  # no such key
        {"sub": "not-a-uuid"},
    ],
    ids=["expired", "bad-signature", "wrong-iss", "wrong-aud", "unknown-kid", "bad-sub"],
)
def test_bad_tokens_are_401_auth_invalid(token_kw: dict) -> None:
    v, _ = make_verifier()
    with pytest.raises(HTTPException) as ei:
        v.verify(make_token(**token_kw))
    assert _code(ei) == (401, "AUTH_INVALID")


def test_hs256_token_is_rejected_even_with_matching_kid() -> None:
    v, _ = make_verifier()
    token = make_token(key="a-shared-secret-of-sufficient-length-123", alg="HS256")
    with pytest.raises(HTTPException) as ei:
        v.verify(token)
    assert _code(ei) == (401, "AUTH_INVALID")


def test_alg_none_and_garbage_are_rejected() -> None:
    v, _ = make_verifier()
    unsigned = jwt.encode({"sub": USER_A, "iss": ISS, "aud": "authenticated",
                           "exp": int(time.time()) + 60}, None, algorithm="none",
                          headers={"kid": "rsa-1"})  # fmt: skip
    for token in (unsigned, "not.a.jwt", "garbage"):
        with pytest.raises(HTTPException) as ei:
            v.verify(token)
        assert _code(ei) == (401, "AUTH_INVALID")


def test_key_algorithm_must_match_header() -> None:
    # An RSA public key published as RS256 cannot be used to verify an ES256 header.
    v, _ = make_verifier()
    token = make_token(key=EC_KEY, kid="rsa-1", alg="ES256")
    with pytest.raises(HTTPException) as ei:
        v.verify(token)
    assert _code(ei) == (401, "AUTH_INVALID")


def test_jwks_cached_within_ttl_and_refetched_after() -> None:
    clock = Clock()
    v, jwks = make_verifier(cache_ttl_s=600, clock=clock)
    v.verify(make_token())
    v.verify(make_token())
    assert jwks.calls == 1
    clock.now += 601
    v.verify(make_token())
    assert jwks.calls == 2


def test_unknown_kid_refetches_once_for_key_rotation() -> None:
    clock = Clock()
    jwks = FakeJwks(_jwk(RSA_KEY.public_key(), "rsa-1", "RS256"))
    v, _ = make_verifier(jwks, clock=clock)
    v.verify(make_token())
    assert jwks.calls == 1
    # Rotation: a new key is published; the next token uses it.
    jwks.keys.append(_jwk(OTHER_RSA_KEY.public_key(), "rsa-2", "RS256"))
    clock.now += 31
    assert v.verify(make_token(key=OTHER_RSA_KEY, kid="rsa-2")) == USER_A
    assert jwks.calls == 2
    # A burst of random kids does not hammer the JWKS endpoint.
    for i in range(5):
        with pytest.raises(HTTPException):
            v.verify(make_token(kid=f"random-{i}"))
    assert jwks.calls == 2


def test_jwks_unreachable_is_503_and_stale_keys_keep_working() -> None:
    clock = Clock()
    v, jwks = make_verifier(clock=clock)
    jwks.fail = True
    with pytest.raises(HTTPException) as ei:
        v.verify(make_token())
    assert _code(ei) == (503, "AUTH_UNAVAILABLE")
    jwks.fail = False
    v.verify(make_token())  # cache filled
    jwks.fail = True
    clock.now += 10_000  # TTL expired and the endpoint is down: stale keys still verify
    assert v.verify(make_token()) == USER_A


def test_first_seen_sub_creates_profile_once() -> None:
    seen: list[str] = []
    v, _ = make_verifier(on_first_seen=seen.append)
    v.verify(make_token(USER_A))
    v.verify(make_token(USER_A))
    v.verify(make_token(USER_B))
    assert seen == [USER_A, USER_B]


def test_profile_upsert_failure_does_not_block_sign_in() -> None:
    def boom(_uid: str) -> None:
        raise RuntimeError("db down")

    v, _ = make_verifier(on_first_seen=boom)
    assert v.verify(make_token()) == USER_A


def test_get_verifier_without_supabase_url_refuses_bearer(monkeypatch) -> None:
    from avp_api.config import get_settings

    monkeypatch.delenv("SUPABASE_URL", raising=False)
    get_settings.cache_clear()
    monkeypatch.setattr(get_settings(), "supabase_url", None)
    try:
        assert isinstance(auth.get_verifier(), auth.UnconfiguredVerifier)
        monkeypatch.setattr(get_settings(), "supabase_url", SUPABASE_URL)
        v = auth.get_verifier()
        assert isinstance(v, SupabaseJwtVerifier) and v.issuer == ISS
        assert auth.get_verifier() is v  # one cached instance shares the JWKS cache
    finally:
        auth._VERIFIERS.clear()
        get_settings.cache_clear()


# --- HTTP: user A vs user B on every session route (T-SEC-01, T-AUTH-01) ----------


def _signed_in_harness():
    h = make_harness()
    verifier, _ = make_verifier()
    ov = h.client.app.dependency_overrides
    ov[auth.get_verifier] = lambda: verifier
    ov[debriefs.get_display_name_lookup] = lambda: DISPLAY_NAMES.get
    return h


def _bearer(sub: str) -> dict:
    return {"Authorization": f"Bearer {make_token(sub)}"}


SESSION_ROUTES = [
    ("GET", "/api/v1/sessions/{id}", None),
    ("GET", "/api/v1/sessions/{id}/turns", None),
    ("POST", "/api/v1/sessions/{id}/turns", {"text": "Chào chị, bé sốt mấy ngày rồi ạ?"}),
    (
        "POST",
        "/api/v1/sessions/{id}/actions",
        {"action": "examine_region", "region": "mouth_throat"},
    ),  # fmt: skip
    ("GET", "/api/v1/sessions/{id}/vitals", None),
    ("POST", "/api/v1/sessions/{id}/vitals/events", {"event": "TIME_TICK"}),
    ("POST", "/api/v1/sessions/{id}/finish", None),
    ("GET", "/api/v1/sessions/{id}/evaluation", None),
    ("POST", "/api/v1/sessions/{id}/evaluation/retry", None),
    ("GET", "/api/v1/sessions/{id}/debrief", None),
    ("GET", "/api/v1/sessions/{id}/debrief/pdf", None),
]


def test_signed_in_session_stores_user_and_no_guest_token() -> None:
    h = _signed_in_harness()
    r = h.client.post("/api/v1/sessions", json={"consent": True}, headers=_bearer(USER_A))
    assert r.status_code == 201
    body = r.json()
    assert body["guest_token"] is None and "X-Guest-Token" not in r.headers
    rec = h.store.sessions[body["id"]]
    assert rec.user_id == USER_A and rec.guest_token_hash is None


@pytest.mark.parametrize(("method", "path", "payload"), SESSION_ROUTES)
def test_user_b_gets_404_on_user_a_session(method: str, path: str, payload: dict | None) -> None:
    h = _signed_in_harness()
    r = h.client.post("/api/v1/sessions", json={"consent": True}, headers=_bearer(USER_A))
    sid = r.json()["id"]
    for q in ("Chào chị, bé sốt mấy ngày rồi ạ?", "Bé có loét miệng không chị?"):
        assert h.client.post(f"/api/v1/sessions/{sid}/turns", json={"text": q},
                             headers=_bearer(USER_A)).status_code == 200  # fmt: skip
    url = path.format(id=sid)
    kw = {"json": payload} if payload is not None else {}

    r_b = h.client.request(method, url, headers=_bearer(USER_B), **kw)
    assert r_b.status_code == 404, r_b.text
    r_guest = h.client.request(method, url, **kw)
    assert r_guest.status_code == 404
    r_bad = h.client.request(method, url, headers={"Authorization": "Bearer nope"}, **kw)
    assert r_bad.status_code == 401 and r_bad.json()["error"]["code"] == "AUTH_INVALID"
    r_exp = h.client.request(
        method, url, headers={"Authorization": f"Bearer {make_token(exp_in=-60)}"}, **kw
    )
    assert r_exp.status_code == 401 and r_exp.json()["error"]["code"] == "AUTH_INVALID"
    # The owner is never refused for ownership reasons.
    r_a = h.client.request(method, url, headers=_bearer(USER_A), **kw)
    assert r_a.status_code not in (401, 403, 404), r_a.text


def test_full_signed_in_flow_reaches_pdf() -> None:
    h = _signed_in_harness()
    a = _bearer(USER_A)
    sid = h.client.post("/api/v1/sessions", json={"consent": True}, headers=a).json()["id"]
    assert h.client.post(f"/api/v1/sessions/{sid}/turns", json={"text": "Bé sốt mấy ngày ạ?"},
                         headers=a).status_code == 200  # fmt: skip
    assert h.client.post(f"/api/v1/sessions/{sid}/finish", headers=a).status_code == 200
    r = h.client.get(f"/api/v1/sessions/{sid}/debrief/pdf", headers=a)
    assert r.status_code == 200 and r.content.startswith(b"%PDF-")


def test_guest_flow_unchanged_when_auth_is_configured() -> None:
    h = _signed_in_harness()
    sid, guest = h.new_session()
    assert h.client.get(f"/api/v1/sessions/{sid}", headers=guest).status_code == 200
    # A signed-in user without the guest token cannot open the guest's session.
    assert h.client.get(f"/api/v1/sessions/{sid}", headers=_bearer(USER_B)).status_code == 404


# --- WebSocket auth with access_token -------------------------------------------------


def _ws_harness():
    h = _signed_in_harness()
    s = h.store

    @contextmanager
    def factory():
        yield FakeSessionRepo(s), FakeTurnRepo(s)

    ov = h.client.app.dependency_overrides
    ov[ws_router.get_repo_factory] = lambda: factory
    ov[ws_router.get_ws_llm] = lambda: FakeLLMProvider()
    ov[ws_router.get_ws_stt] = lambda: FakeSTTProvider()
    ov[ws_router.get_ws_tts] = lambda: FakeTTSProvider()
    return h


def test_ws_access_token_owner_gets_ready_and_turn_is_attributed() -> None:
    h = _ws_harness()
    sid = h.client.post("/api/v1/sessions", json={"consent": True},
                        headers=_bearer(USER_A)).json()["id"]  # fmt: skip
    with h.client.websocket_connect(f"/ws/sessions/{sid}") as ws:
        ws.send_json({"type": "auth", "access_token": make_token(USER_A)})
        assert ws.receive_json() == {"type": "ready"}
        ws.send_json({"type": "text", "text": "Chào chị, bé sốt mấy ngày rồi ạ?"})
        assert ws.receive_json()["speaker"] == "student"
        assert ws.receive_json()["speaker"] == "patient"
    assert [t.speaker for t in h.store.turns if t.session_id == sid] == ["student", "patient"]


@pytest.mark.parametrize(
    "first",
    [
        {"type": "auth", "access_token": "BOB"},  # user B, replaced below
        {"type": "auth", "access_token": "garbage"},
        {"type": "auth", "access_token": "EXPIRED"},
        {"type": "auth", "token": "not-a-guest-token"},
        {"type": "auth"},
    ],
    ids=["user-b", "garbage", "expired", "guest-miss", "empty"],
)
def test_ws_foreign_or_bad_token_is_refused(first: dict) -> None:
    h = _ws_harness()
    sid = h.client.post("/api/v1/sessions", json={"consent": True},
                        headers=_bearer(USER_A)).json()["id"]  # fmt: skip
    msg = dict(first)
    if msg.get("access_token") == "BOB":
        msg["access_token"] = make_token(USER_B)
    elif msg.get("access_token") == "EXPIRED":
        msg["access_token"] = make_token(USER_A, exp_in=-60)
    with h.client.websocket_connect(f"/ws/sessions/{sid}") as ws:
        ws.send_json(msg)
        with pytest.raises(WebSocketDisconnect) as ei:
            ws.receive_json()
    assert ei.value.code == 1008


def test_ws_guest_token_still_works() -> None:
    h = _ws_harness()
    sid, guest = h.new_session()
    with h.client.websocket_connect(f"/ws/sessions/{sid}") as ws:
        ws.send_json({"type": "auth", "token": guest["X-Guest-Token"]})
        assert ws.receive_json() == {"type": "ready"}


# --- the token never appears in logs ------------------------------------------------


def test_tokens_never_logged(caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.DEBUG)
    h = _ws_harness()
    good, expired = make_token(USER_A), make_token(USER_A, exp_in=-60)
    forged = make_token(USER_A, key=OTHER_RSA_KEY)
    sid = h.client.post("/api/v1/sessions", json={"consent": True},
                        headers={"Authorization": f"Bearer {good}"}).json()["id"]  # fmt: skip
    for tok in (good, expired, forged, "garbage-token-xyz"):
        h.client.get(f"/api/v1/sessions/{sid}", headers={"Authorization": f"Bearer {tok}"})
        with h.client.websocket_connect(f"/ws/sessions/{sid}") as ws:
            ws.send_json({"type": "auth", "access_token": tok})
            try:
                ws.receive_json()
            except WebSocketDisconnect:
                pass
    text = caplog.text
    assert caplog.records, "expected some auth log records to inspect"
    for tok in (good, expired, forged, "garbage-token-xyz"):
        assert tok not in text
        assert tok.split(".")[-1] not in text  # not even the signature segment
