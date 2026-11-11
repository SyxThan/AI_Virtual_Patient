"""Profile (/me) and guest-claim tests (T-AUTH-02; AVP-108). In-memory fakes that
mirror the DB rules (sessions_guest_check), synthetic users only."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest

from avp_api.db.repositories.profile_repo import ClaimResult, ProfileRecord
from avp_api.routers import debriefs, me
from avp_api.services.pdf_service import build_report
from tests.test_auth import USER_A, USER_B, _bearer, _signed_in_harness
from tests.test_evaluation_api import CASE, Store
from tests.test_pdf_export import _report_inputs


class FakeProfileRepo:
    """Profiles in a dict; claim mutates the shared session store like the SQL UPDATE."""

    def __init__(self, store: Store, profiles: dict[str, ProfileRecord]) -> None:
        self.store = store
        self.profiles = profiles

    def ensure(self, user_id: str) -> ProfileRecord:
        if user_id not in self.profiles:
            self.profiles[user_id] = ProfileRecord(user_id, None, "student", datetime.now(UTC))
        return self.profiles[user_id]

    def get(self, user_id: str) -> ProfileRecord | None:
        return self.profiles.get(user_id)

    def set_display_name(self, user_id: str, display_name: str | None) -> ProfileRecord:
        self.ensure(user_id).display_name = display_name
        return self.profiles[user_id]

    def claim_session(self, session_id: str, user_id: str, guest_token_hash: str) -> ClaimResult:
        rec = self.store.sessions.get(session_id)
        if rec is None:
            return "not_found"
        if rec.user_id is None and rec.guest_token_hash == guest_token_hash:
            rec.user_id, rec.guest_token_hash = user_id, None
            assert (rec.user_id is None) == (rec.guest_token_hash is not None)  # DB CHECK
            return "claimed"
        return "already_owned" if rec.user_id == user_id else "not_found"


@pytest.fixture
def h():
    h = _signed_in_harness()
    h.profiles = {}
    h.names_asked = []
    ov = h.client.app.dependency_overrides
    ov[me.get_profile_repo] = lambda: FakeProfileRepo(h.store, h.profiles)

    def lookup(uid: str | None) -> str | None:
        h.names_asked.append(uid)
        p = h.profiles.get(uid) if uid else None
        return p.display_name if p else None

    ov[debriefs.get_display_name_lookup] = lambda: lookup
    return h


# --- /me ------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("method", "path", "body"),
    [
        ("GET", "/api/v1/me", None),
        ("PATCH", "/api/v1/me", {"display_name": "Lan"}),
        ("POST", "/api/v1/sessions/00000000-0000-4000-8000-000000000000/claim", None),
    ],
)
def test_guest_gets_401_auth_required(h, method: str, path: str, body: dict | None) -> None:
    kw = {"json": body} if body is not None else {}
    r = h.client.request(method, path, headers={"X-Guest-Token": "anything"}, **kw)
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "AUTH_REQUIRED"


def test_get_me_creates_student_profile(h) -> None:
    r = h.client.get("/api/v1/me", headers=_bearer(USER_A))
    assert r.status_code == 200
    body = r.json()
    assert body["user_id"] == USER_A and body["role"] == "student"
    assert body["display_name"] is None and "email" not in body
    assert list(h.profiles) == [USER_A]


def test_patch_me_strips_and_limits_display_name(h) -> None:
    a = _bearer(USER_A)
    r = h.client.patch("/api/v1/me", json={"display_name": "  Nguyễn   Thị Lan \n"}, headers=a)
    assert r.status_code == 200 and r.json()["display_name"] == "Nguyễn Thị Lan"
    assert h.client.get("/api/v1/me", headers=a).json()["display_name"] == "Nguyễn Thị Lan"

    assert h.client.patch("/api/v1/me", json={"display_name": "x" * 80},
                          headers=a).status_code == 200  # fmt: skip
    too_long = h.client.patch("/api/v1/me", json={"display_name": "x" * 81}, headers=a)
    assert too_long.status_code == 422
    assert h.profiles[USER_A].display_name == "x" * 80  # unchanged by the rejected call

    cleared = h.client.patch("/api/v1/me", json={"display_name": "   "}, headers=a)
    assert cleared.status_code == 200 and cleared.json()["display_name"] is None
    assert h.client.patch("/api/v1/me", json={"role": "admin"}, headers=a).status_code == 422


def test_users_see_only_their_own_profile(h) -> None:
    h.client.patch("/api/v1/me", json={"display_name": "An"}, headers=_bearer(USER_A))
    r = h.client.get("/api/v1/me", headers=_bearer(USER_B))
    assert r.json()["user_id"] == USER_B and r.json()["display_name"] is None


# --- claim ------------------------------------------------------------------------


def _claim(h, sid: str, user: str, guest_token: str | None):
    headers = _bearer(user)
    if guest_token is not None:
        headers["X-Guest-Token"] = guest_token
    return h.client.post(f"/api/v1/sessions/{sid}/claim", headers=headers)


def test_claim_moves_ownership_once_and_is_idempotent(h) -> None:
    sid, guest = h.new_session()
    token = guest["X-Guest-Token"]
    r = _claim(h, sid, USER_A, token)
    assert r.status_code == 200 and r.json() == {"session_id": sid, "status": "claimed"}
    rec = h.store.sessions[sid]
    assert rec.user_id == USER_A and rec.guest_token_hash is None

    again = _claim(h, sid, USER_A, token)
    assert again.status_code == 200 and again.json()["status"] == "already_owned"
    assert h.store.sessions[sid].user_id == USER_A

    # Now reachable with the bearer alone; the old guest token no longer opens it.
    assert h.client.get(f"/api/v1/sessions/{sid}", headers=_bearer(USER_A)).status_code == 200
    assert h.client.get(f"/api/v1/sessions/{sid}", headers=guest).status_code == 404


def test_claim_with_wrong_or_missing_token_is_404_and_unchanged(h) -> None:
    sid, guest = h.new_session()
    before = h.store.sessions[sid].guest_token_hash
    for token in ("not-the-token", None, ""):
        r = _claim(h, sid, USER_A, token)
        assert r.status_code == 404 and r.json()["error"]["code"] == "SESSION_NOT_FOUND"
    rec = h.store.sessions[sid]
    assert rec.user_id is None and rec.guest_token_hash == before
    assert h.client.get(f"/api/v1/sessions/{sid}", headers=guest).status_code == 200


def test_claim_of_session_owned_by_another_user_is_404(h) -> None:
    # B claimed it first; A replays the same guest token.
    sid, guest = h.new_session()
    token = guest["X-Guest-Token"]
    assert _claim(h, sid, USER_B, token).status_code == 200
    assert _claim(h, sid, USER_A, token).status_code == 404
    assert h.store.sessions[sid].user_id == USER_B
    # A session B created while signed in cannot be claimed by A either.
    sid_b = h.client.post("/api/v1/sessions", json={"consent": True},
                          headers=_bearer(USER_B)).json()["id"]  # fmt: skip
    assert _claim(h, sid_b, USER_A, None).status_code == 404
    assert _claim(h, sid_b, USER_A, token).status_code == 404
    assert h.store.sessions[sid_b].user_id == USER_B


def test_claim_unknown_session_is_404(h) -> None:
    _sid, guest = h.new_session()
    for sid in ("00000000-0000-4000-8000-000000000000", "not-a-uuid"):
        assert _claim(h, sid, USER_A, guest["X-Guest-Token"]).status_code == 404


# --- PDF prints display_name (never the email) ----------------------------------------


def test_pdf_uses_owner_display_name(h) -> None:
    a = _bearer(USER_A)
    h.client.patch("/api/v1/me", json={"display_name": "Trần Văn Bình"}, headers=a)
    sid = h.client.post("/api/v1/sessions", json={"consent": True}, headers=a).json()["id"]
    h.client.post(f"/api/v1/sessions/{sid}/turns", json={"text": "Bé sốt mấy ngày ạ?"}, headers=a)
    h.client.post(f"/api/v1/sessions/{sid}/finish", headers=a)
    r = h.client.get(f"/api/v1/sessions/{sid}/debrief/pdf", headers=a)
    assert r.status_code == 200 and r.content.startswith(b"%PDF-")
    assert h.names_asked == [USER_A]


def test_guest_pdf_never_looks_up_a_name(h) -> None:
    sid, guest = h.new_session()
    h.client.post(f"/api/v1/sessions/{sid}/turns", json={"text": "Bé sốt mấy ngày ạ?"},
                  headers=guest)  # fmt: skip
    h.client.post(f"/api/v1/sessions/{sid}/finish", headers=guest)
    # A signed-in user who still holds the guest token is not the owner: no name.
    headers = {**guest, **_bearer(USER_A)}
    assert h.client.get(f"/api/v1/sessions/{sid}/debrief/pdf", headers=headers).status_code == 200
    assert h.client.get(f"/api/v1/sessions/{sid}/debrief/pdf", headers=guest).status_code == 200
    assert h.names_asked == [None, None]


def test_build_report_prints_name_only_when_given() -> None:
    sess, ev, deb = _report_inputs()
    case = CASE
    named = build_report(sess, ev, deb, case, "http://web.test", "Lê Thị Hoa")
    assert ("Học viên:", "Lê Thị Hoa") in named.info
    anon = build_report(sess, ev, deb, case, "http://web.test")
    assert all(k != "Học viên:" for k, _ in anon.info)
    assert "@" not in named.all_text()
