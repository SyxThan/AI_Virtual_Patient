"""Cross-slice tests for Slice 12 (guide, exam limit) and Slice 13 (delete, privacy).

Quality gates: T-PRIV-01, T-SEC-01, T-UX-02, T-SESSION-01. Synthetic data only.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from avp_api import auth
from avp_api.config import get_settings
from avp_api.db.repositories.history_repo import InMemoryHistoryRepository
from avp_api.routers import debriefs, guide, me, sessions
from tests.test_auth import (
    DISPLAY_NAMES,
    USER_A,
    USER_B,
    _bearer,
    make_verifier,
)
from tests.test_e2e_flow import make_harness
from tests.test_evaluation_api import CASE, FakeSessionRepo
from tests.test_me import FakeProfileRepo
from tests.test_privacy import FakePrivacyRepo, _children, _session_with_data


def make_h(run_jobs: bool = True):
    h = make_harness(run_jobs=run_jobs)
    verifier, _ = make_verifier()
    ov = h.client.app.dependency_overrides
    ov[auth.get_verifier] = lambda: verifier
    ov[debriefs.get_display_name_lookup] = lambda: DISPLAY_NAMES.get
    h.profiles = {}
    h.deleter_calls = []
    h.deleter = None
    ov[sessions.get_privacy_repo] = lambda: FakePrivacyRepo(h)
    ov[me.get_privacy_repo] = lambda: FakePrivacyRepo(h)
    ov[me.get_profile_repo] = lambda: FakeProfileRepo(h.store, h.profiles)
    ov[me.get_account_deleter] = lambda: h.deleter
    ov[guide.get_session_repo] = lambda: FakeSessionRepo(h.store)
    ov[sessions.get_history_repo] = lambda: InMemoryHistoryRepository(
        h.store.sessions, h.store.evals, {("case-01-hfmd", 1): CASE}
    )
    return h


@pytest.fixture
def h():
    return make_h()


def test_exam_limit_blocks_turns_actions_and_vitals_but_not_finish(h, monkeypatch) -> None:
    monkeypatch.setattr(get_settings(), "exam_time_limit_s", 60)
    r = h.client.post("/api/v1/sessions", json={"consent": True, "mode": "exam"})
    assert r.status_code == 201
    sid = r.json()["id"]
    guest = {"X-Guest-Token": r.json()["guest_token"]}

    h.store.sessions[sid].started_at = datetime.now(UTC) - timedelta(seconds=120)

    # POST /turns
    r_turn = h.client.post(
        f"/api/v1/sessions/{sid}/turns",
        json={"text": "Chào chị, bé sốt mấy ngày rồi ạ?"},
        headers=guest,
    )
    assert r_turn.status_code == 409
    assert r_turn.json()["error"]["code"] == "TIME_LIMIT_REACHED"

    # POST /actions
    r_act = h.client.post(
        f"/api/v1/sessions/{sid}/actions",
        json={"action": "examine_region", "region": "mouth_throat"},
        headers=guest,
    )
    assert r_act.status_code == 409
    assert r_act.json()["error"]["code"] == "TIME_LIMIT_REACHED"

    # POST /vitals/events
    r_vit = h.client.post(
        f"/api/v1/sessions/{sid}/vitals/events",
        json={"event": "ORDER_ANTIPYRETIC"},
        headers=guest,
    )
    assert r_vit.status_code == 409
    assert r_vit.json()["error"]["code"] == "TIME_LIMIT_REACHED"

    # No new turn is stored
    assert len([t for t in h.store.turns if t.session_id == sid]) == 0

    # GET /guide returns time_limit_s == 60
    r_guide = h.client.get(f"/api/v1/sessions/{sid}/guide", headers=guest)
    assert r_guide.status_code == 200
    assert r_guide.json()["time_limit_s"] == 60

    # POST /finish returns 200 and GET /evaluation returns 200 with status "done"
    r_fin = h.client.post(f"/api/v1/sessions/{sid}/finish", headers=guest)
    assert r_fin.status_code == 200
    r_eval = h.client.get(f"/api/v1/sessions/{sid}/evaluation", headers=guest)
    assert r_eval.status_code == 200
    assert r_eval.json()["status"] == "done"


def test_guided_mode_never_limited(h, monkeypatch) -> None:
    monkeypatch.setattr(get_settings(), "exam_time_limit_s", 60)
    r = h.client.post("/api/v1/sessions", json={"consent": True, "mode": "guided"})
    assert r.status_code == 201
    sid = r.json()["id"]
    guest = {"X-Guest-Token": r.json()["guest_token"]}

    h.store.sessions[sid].started_at = datetime.now(UTC) - timedelta(seconds=120)

    r_turn = h.client.post(
        f"/api/v1/sessions/{sid}/turns",
        json={"text": "Chào chị, bé sốt mấy ngày rồi ạ?"},
        headers=guest,
    )
    assert r_turn.status_code == 200

    r_act = h.client.post(
        f"/api/v1/sessions/{sid}/actions",
        json={"action": "examine_region", "region": "mouth_throat"},
        headers=guest,
    )
    assert r_act.status_code == 200

    r_vit = h.client.post(
        f"/api/v1/sessions/{sid}/vitals/events",
        json={"event": "ORDER_ANTIPYRETIC"},
        headers=guest,
    )
    assert r_vit.status_code == 200


def test_no_limit_by_default(h, monkeypatch) -> None:
    monkeypatch.setattr(get_settings(), "exam_time_limit_s", None)
    r = h.client.post("/api/v1/sessions", json={"consent": True, "mode": "exam"})
    assert r.status_code == 201
    sid = r.json()["id"]
    guest = {"X-Guest-Token": r.json()["guest_token"]}

    h.store.sessions[sid].started_at = datetime.now(UTC) - timedelta(hours=10)

    r_turn = h.client.post(
        f"/api/v1/sessions/{sid}/turns",
        json={"text": "Chào chị, bé sốt mấy ngày rồi ạ?"},
        headers=guest,
    )
    assert r_turn.status_code == 200


def test_guide_checklist_by_mode(h) -> None:
    # Guided: items is non-empty and every item has criterion_id, domain and title.
    # The response's review status is "draft".
    r_g = h.client.post("/api/v1/sessions", json={"consent": True, "mode": "guided"})
    assert r_g.status_code == 201
    sid_g = r_g.json()["id"]
    guest_g = {"X-Guest-Token": r_g.json()["guest_token"]}

    res_g = h.client.get(f"/api/v1/sessions/{sid_g}/guide", headers=guest_g)
    assert res_g.status_code == 200
    body_g = res_g.json()
    assert len(body_g["items"]) > 0
    for item in body_g["items"]:
        assert item["criterion_id"]
        assert item["domain"]
        assert item["title"]
    assert body_g["review_status"] == "draft"

    # Exam: items == []
    r_e = h.client.post("/api/v1/sessions", json={"consent": True, "mode": "exam"})
    assert r_e.status_code == 201
    sid_e = r_e.json()["id"]
    guest_e = {"X-Guest-Token": r_e.json()["guest_token"]}

    res_e = h.client.get(f"/api/v1/sessions/{sid_e}/guide", headers=guest_e)
    assert res_e.status_code == 200
    assert res_e.json()["items"] == []

    # A wrong guest token and USER_B's bearer get 404 on /guide
    assert (
        h.client.get(
            f"/api/v1/sessions/{sid_g}/guide", headers={"X-Guest-Token": "bad-token"}
        ).status_code
        == 404
    )
    assert (
        h.client.get(f"/api/v1/sessions/{sid_g}/guide", headers=_bearer(USER_B)).status_code == 404
    )
    assert (
        h.client.get(
            f"/api/v1/sessions/{sid_e}/guide", headers={"X-Guest-Token": "bad-token"}
        ).status_code
        == 404
    )
    assert (
        h.client.get(f"/api/v1/sessions/{sid_e}/guide", headers=_bearer(USER_B)).status_code == 404
    )


def test_delete_signed_in_session_removes_it_everywhere(h) -> None:
    a = _bearer(USER_A)
    sid, _ = _session_with_data(h, a)
    assert h.client.get(f"/api/v1/sessions/{sid}/guide", headers=a).status_code == 200

    r_del = h.client.delete(f"/api/v1/sessions/{sid}", headers=a)
    assert r_del.status_code == 204

    routes = [
        f"/api/v1/sessions/{sid}",
        f"/api/v1/sessions/{sid}/guide",
        f"/api/v1/sessions/{sid}/turns",
        f"/api/v1/sessions/{sid}/vitals",
        f"/api/v1/sessions/{sid}/evaluation",
        f"/api/v1/sessions/{sid}/debrief",
        f"/api/v1/sessions/{sid}/debrief/pdf",
    ]
    for route in routes:
        assert h.client.get(route, headers=a).status_code == 404

    r_list = h.client.get("/api/v1/sessions", headers=a)
    assert r_list.status_code == 200
    assert sid not in [item["id"] for item in r_list.json()["items"]]

    r_prog = h.client.get("/api/v1/sessions/progress", headers=a)
    assert r_prog.status_code == 200
    assert len(r_prog.json()["attempts"]) == 0

    assert _children(h, sid) == {"turns": 0, "evaluations": 0, "jobs": 0, "debriefs": 0}


def test_delete_me_keeps_other_users_data(h) -> None:
    a, b = _bearer(USER_A), _bearer(USER_B)
    a1, _ = _session_with_data(h, a)
    a2, _ = _session_with_data(h, a)
    b1, _ = _session_with_data(h, b)

    r_del = h.client.delete("/api/v1/me", headers=a)
    assert r_del.status_code == 200
    data = r_del.json()
    assert data["sessions_deleted"] == 2
    assert data["account_deleted"] is False

    r_list_a = h.client.get("/api/v1/sessions", headers=a)
    assert r_list_a.status_code == 200
    assert r_list_a.json()["items"] == []

    assert h.client.get(f"/api/v1/sessions/{b1}", headers=b).status_code == 200
    r_list_b = h.client.get("/api/v1/sessions", headers=b)
    assert r_list_b.status_code == 200
    assert any(item["id"] == b1 for item in r_list_b.json()["items"])


def test_guest_delete_then_claim_is_404(h) -> None:
    sid, guest = h.new_session()
    token = guest["X-Guest-Token"]

    r_del = h.client.delete(f"/api/v1/sessions/{sid}", headers=guest)
    assert r_del.status_code == 204

    r_claim = h.client.post(
        f"/api/v1/sessions/{sid}/claim",
        headers={**_bearer(USER_A), "X-Guest-Token": token},
    )
    assert r_claim.status_code == 404


def test_delete_while_evaluation_pending_does_not_crash() -> None:
    h = make_h(run_jobs=False)
    sid, guest = h.new_session()
    r_fin = h.client.post(f"/api/v1/sessions/{sid}/finish", headers=guest)
    assert r_fin.status_code == 200
    assert len(h.store.jobs) == 1
    job_id = h.store.jobs[0].id

    r_del = h.client.delete(f"/api/v1/sessions/{sid}", headers=guest)
    assert r_del.status_code == 204

    if h.store.jobs:
        h.run_job(h.store.jobs[0].id)
    else:
        h.run_job(job_id)
