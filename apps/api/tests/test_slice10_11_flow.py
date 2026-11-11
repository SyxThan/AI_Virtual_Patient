"""Cross-slice tests: guest -> claim -> history -> progress (Slice 10 + 11).

Quality-gates: T-E2E-01, T-AUTH-02, T-HIST-01, T-SEC-01 (AVP-120).
In-process only, synthetic users and transcripts only.
"""

from __future__ import annotations

import time
from datetime import timedelta

import pytest

from avp_api.db.repositories.history_repo import InMemoryHistoryRepository
from avp_api.db.repositories.profile_repo import ProfileRecord
from avp_api.routers import debriefs, me, sessions
from tests.test_auth import USER_A, USER_B, _bearer, _signed_in_harness, make_token
from tests.test_me import FakeProfileRepo


def make_h():
    h = _signed_in_harness()
    profiles: dict[str, ProfileRecord] = {}
    h.profiles = profiles
    names_asked: list[str | None] = []
    h.names_asked = names_asked

    def lookup(uid: str | None) -> str | None:
        names_asked.append(uid)
        p = profiles.get(uid) if uid else None
        return p.display_name if p else None

    ov = h.client.app.dependency_overrides
    ov[me.get_profile_repo] = lambda: FakeProfileRepo(h.store, profiles)
    ov[sessions.get_history_repo] = lambda: InMemoryHistoryRepository(
        h.store.sessions, h.store.evals
    )
    ov[debriefs.get_display_name_lookup] = lambda: lookup
    return h


@pytest.fixture
def h():
    return make_h()


def test_guest_session_claimed_appears_in_history(h) -> None:
    sid, guest = h.new_session()
    r1 = h.client.post(
        f"/api/v1/sessions/{sid}/turns",
        json={"text": "Chào chị, bé sốt mấy ngày rồi ạ?"},
        headers=guest,
    )
    assert r1.status_code == 200
    r2 = h.client.post(
        f"/api/v1/sessions/{sid}/turns",
        json={"text": "Bé có nốt phát ban hay loét miệng không chị?"},
        headers=guest,
    )
    assert r2.status_code == 200
    r_finish = h.client.post(f"/api/v1/sessions/{sid}/finish", headers=guest)
    assert r_finish.status_code == 200

    # A's GET /api/v1/sessions does not list it
    r_a_before = h.client.get("/api/v1/sessions", headers=_bearer(USER_A))
    assert r_a_before.status_code == 200
    assert all(item["id"] != sid for item in r_a_before.json()["items"])

    # A claims it (POST /sessions/{id}/claim, Bearer A + X-Guest-Token) -> 200
    r_claim = h.client.post(
        f"/api/v1/sessions/{sid}/claim",
        headers={**_bearer(USER_A), **guest},
    )
    assert r_claim.status_code == 200

    # A's list now contains it with evaluation_status "done"
    r_a_after = h.client.get("/api/v1/sessions", headers=_bearer(USER_A))
    assert r_a_after.status_code == 200
    claimed = next((it for it in r_a_after.json()["items"] if it["id"] == sid), None)
    assert claimed is not None
    assert claimed["evaluation_status"] == "done"

    # its total_score and critical_missed equal those of GET /evaluation
    r_eval = h.client.get(f"/api/v1/sessions/{sid}/evaluation", headers=_bearer(USER_A))
    assert r_eval.status_code == 200
    eval_body = r_eval.json()
    assert claimed["total_score"] == eval_body["total_score"]
    assert claimed["critical_missed"] == eval_body["critical_missed"]


def test_after_claim_guest_token_alone_is_denied(h) -> None:
    sid, guest = h.new_session()
    assert (
        h.client.post(
            f"/api/v1/sessions/{sid}/turns",
            json={"text": "Chào chị, bé sốt mấy ngày rồi ạ?"},
            headers=guest,
        ).status_code
        == 200
    )
    assert (
        h.client.post(
            f"/api/v1/sessions/{sid}/turns",
            json={"text": "Bé có giật mình khi ngủ không chị?"},
            headers=guest,
        ).status_code
        == 200
    )
    assert h.client.post(f"/api/v1/sessions/{sid}/finish", headers=guest).status_code == 200

    r_claim = h.client.post(
        f"/api/v1/sessions/{sid}/claim",
        headers={**_bearer(USER_A), **guest},
    )
    assert r_claim.status_code == 200

    # after the claim, X-Guest-Token alone gets 404 on GET /sessions/{id}
    assert h.client.get(f"/api/v1/sessions/{sid}", headers=guest).status_code == 404

    # Bearer A alone gets 200 on GET /sessions/{id}, /turns, /evaluation, /debrief and /debrief/pdf
    a = _bearer(USER_A)
    assert h.client.get(f"/api/v1/sessions/{sid}", headers=a).status_code == 200
    assert h.client.get(f"/api/v1/sessions/{sid}/turns", headers=a).status_code == 200
    assert h.client.get(f"/api/v1/sessions/{sid}/evaluation", headers=a).status_code == 200
    assert h.client.get(f"/api/v1/sessions/{sid}/debrief", headers=a).status_code == 200
    r_pdf = h.client.get(f"/api/v1/sessions/{sid}/debrief/pdf", headers=a)
    assert r_pdf.status_code == 200
    assert "application/pdf" in r_pdf.headers["content-type"]
    assert r_pdf.content.startswith(b"%PDF-")


def test_user_b_cannot_see_or_claim(h) -> None:
    sid, guest = h.new_session()
    assert (
        h.client.post(
            f"/api/v1/sessions/{sid}/turns",
            json={"text": "Chào chị, bé sốt mấy ngày rồi ạ?"},
            headers=guest,
        ).status_code
        == 200
    )
    assert (
        h.client.post(
            f"/api/v1/sessions/{sid}/turns",
            json={"text": "Bé có nốt phát ban ở lòng bàn tay không chị?"},
            headers=guest,
        ).status_code
        == 200
    )
    assert h.client.post(f"/api/v1/sessions/{sid}/finish", headers=guest).status_code == 200

    assert (
        h.client.post(
            f"/api/v1/sessions/{sid}/claim",
            headers={**_bearer(USER_A), **guest},
        ).status_code
        == 200
    )

    b = _bearer(USER_B)
    # B's list is empty
    r_b_list = h.client.get("/api/v1/sessions", headers=b)
    assert r_b_list.status_code == 200
    assert r_b_list.json()["items"] == []

    # B claiming with the right guest token after A's claim gets 404
    r_b_claim = h.client.post(f"/api/v1/sessions/{sid}/claim", headers={**b, **guest})
    assert r_b_claim.status_code == 404

    # B gets 404 on GET /sessions/{id} and /debrief/pdf
    assert h.client.get(f"/api/v1/sessions/{sid}", headers=b).status_code == 404
    assert h.client.get(f"/api/v1/sessions/{sid}/debrief/pdf", headers=b).status_code == 404

    # B's /sessions/progress has no attempts
    r_b_prog = h.client.get("/api/v1/sessions/progress", headers=b)
    assert r_b_prog.status_code == 200
    assert r_b_prog.json()["attempts"] == []


def test_signed_in_sessions_ordered_and_progress_matches(h) -> None:
    a = _bearer(USER_A)

    r1 = h.client.post("/api/v1/sessions", json={"consent": True}, headers=a)
    assert r1.status_code == 201
    sid1 = r1.json()["id"]
    assert (
        h.client.post(
            f"/api/v1/sessions/{sid1}/turns",
            json={"text": "Chào chị, bé sốt mấy ngày rồi ạ?"},
            headers=a,
        ).status_code
        == 200
    )
    assert h.client.post(f"/api/v1/sessions/{sid1}/finish", headers=a).status_code == 200

    time.sleep(0.02)

    r2 = h.client.post("/api/v1/sessions", json={"consent": True}, headers=a)
    assert r2.status_code == 201
    sid2 = r2.json()["id"]
    assert (
        h.client.post(
            f"/api/v1/sessions/{sid2}/turns",
            json={"text": "Bé có giật mình khi thiu thiu ngủ không chị?"},
            headers=a,
        ).status_code
        == 200
    )
    assert h.client.post(f"/api/v1/sessions/{sid2}/finish", headers=a).status_code == 200

    if h.store.sessions[sid2].started_at <= h.store.sessions[sid1].started_at:
        h.store.sessions[sid2].started_at = h.store.sessions[sid1].started_at + timedelta(seconds=1)

    # the list is newest first
    r_list = h.client.get("/api/v1/sessions", headers=a)
    assert r_list.status_code == 200
    items = r_list.json()["items"]
    assert [it["id"] for it in items] == [sid2, sid1]

    # progress: 2 attempts, chronological, scores equal each GET /evaluation total_score
    r_eval1 = h.client.get(f"/api/v1/sessions/{sid1}/evaluation", headers=a)
    r_eval2 = h.client.get(f"/api/v1/sessions/{sid2}/evaluation", headers=a)
    assert r_eval1.status_code == 200 and r_eval2.status_code == 200
    eval1 = r_eval1.json()
    eval2 = r_eval2.json()

    r_prog = h.client.get("/api/v1/sessions/progress", headers=a)
    assert r_prog.status_code == 200
    attempts = r_prog.json()["attempts"]
    assert len(attempts) == 2
    assert attempts[0]["session_id"] == sid1
    assert attempts[0]["total_score"] == eval1["total_score"]
    assert attempts[1]["session_id"] == sid2
    assert attempts[1]["total_score"] == eval2["total_score"]


def test_bad_or_missing_bearer(h) -> None:
    routes = ["/api/v1/sessions", "/api/v1/sessions/progress", "/api/v1/me"]
    for path in routes:
        # no header gets 401 with detail code "AUTH_REQUIRED"
        r_none = h.client.get(path)
        assert r_none.status_code == 401
        assert r_none.json()["error"]["code"] == "AUTH_REQUIRED"

        # make_token(USER_A, exp_in=-10) gets 401 with code "AUTH_INVALID"
        expired_token = make_token(USER_A, exp_in=-10)
        r_bad = h.client.get(path, headers={"Authorization": f"Bearer {expired_token}"})
        assert r_bad.status_code == 401
        assert r_bad.json()["error"]["code"] == "AUTH_INVALID"


def test_pdf_uses_display_name_after_claim(h) -> None:
    a = _bearer(USER_A)
    # A sets PATCH /me display_name "Người học thử" and then claims a finished guest session
    r_patch = h.client.patch("/api/v1/me", json={"display_name": "Người học thử"}, headers=a)
    assert r_patch.status_code == 200
    assert r_patch.json()["display_name"] == "Người học thử"

    sid, guest = h.new_session()
    assert (
        h.client.post(
            f"/api/v1/sessions/{sid}/turns",
            json={"text": "Chào chị, bé sốt mấy ngày rồi ạ?"},
            headers=guest,
        ).status_code
        == 200
    )
    assert h.client.post(f"/api/v1/sessions/{sid}/finish", headers=guest).status_code == 200

    r_claim = h.client.post(
        f"/api/v1/sessions/{sid}/claim",
        headers={**a, **guest},
    )
    assert r_claim.status_code == 200

    # GET /debrief/pdf -> 200 application/pdf
    r_pdf = h.client.get(f"/api/v1/sessions/{sid}/debrief/pdf", headers=a)
    assert r_pdf.status_code == 200
    assert "application/pdf" in r_pdf.headers["content-type"]
    assert r_pdf.content.startswith(b"%PDF-")

    # the display-name lookup was called with USER_A
    assert USER_A in h.names_asked
