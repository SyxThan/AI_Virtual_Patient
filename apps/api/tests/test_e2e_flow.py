"""Full-flow and access-control API tests (T-E2E-01, T-SEC-01, T-SESSION-01).

Drives the entire session lifecycle in-process with in-memory fakes and verifies
ownership protection on all session-scoped routes.
"""

from __future__ import annotations

import pytest

from avp_api.routers import vitals
from tests.test_debrief_api import DebriefHarness, _interview
from tests.test_evaluation_api import FakeSessionRepo


def make_harness(run_jobs: bool = True, chain: bool = True) -> DebriefHarness:
    """Create DebriefHarness with vitals router dependency override."""
    h = DebriefHarness(run_jobs=run_jobs, chain=chain)
    h.client.app.dependency_overrides[vitals.get_session_repo] = lambda: FakeSessionRepo(h.store)
    return h


def test_full_flow_session_to_pdf() -> None:
    h = make_harness()

    # 1. POST /api/v1/sessions {"consent": true} -> 201
    r_session = h.client.post("/api/v1/sessions", json={"consent": True})
    assert r_session.status_code == 201
    body = r_session.json()
    sid = body["id"]
    auth = {"X-Guest-Token": body["guest_token"]}

    # 2. POST 3 turns -> 200 each
    questions = [
        "Chào chị, bé bị sốt mấy ngày rồi ạ?",
        "Bé có giật mình khi thiu thiu ngủ không chị?",
        "Bé có nốt phát ban hay loét miệng không chị?",
    ]
    for q in questions:
        r_turn = h.client.post(f"/api/v1/sessions/{sid}/turns", json={"text": q}, headers=auth)
        assert r_turn.status_code == 200

    # 3. POST /actions {"action":"examine_region","region":"mouth_throat"} -> 200
    r_action = h.client.post(
        f"/api/v1/sessions/{sid}/actions",
        json={"action": "examine_region", "region": "mouth_throat"},
        headers=auth,
    )
    assert r_action.status_code == 200

    # 4. GET /vitals -> 200
    r_vitals = h.client.get(f"/api/v1/sessions/{sid}/vitals", headers=auth)
    assert r_vitals.status_code == 200

    # 5. POST /finish -> 200
    r_finish = h.client.post(f"/api/v1/sessions/{sid}/finish", headers=auth)
    assert r_finish.status_code == 200

    # 6. GET /evaluation -> 200 status "done"
    r_eval = h.client.get(f"/api/v1/sessions/{sid}/evaluation", headers=auth)
    assert r_eval.status_code == 200
    assert r_eval.json()["status"] == "done"

    # 7. GET /debrief -> 200 status "done"
    r_debrief = h.client.get(f"/api/v1/sessions/{sid}/debrief", headers=auth)
    assert r_debrief.status_code == 200
    assert r_debrief.json()["status"] == "done"

    # 8. GET /debrief/pdf -> 200, content-type application/pdf, body starts with b"%PDF-"
    r_pdf = h.client.get(f"/api/v1/sessions/{sid}/debrief/pdf", headers=auth)
    assert r_pdf.status_code == 200
    assert r_pdf.headers["content-type"] == "application/pdf"
    assert r_pdf.content.startswith(b"%PDF-")


def test_transcript_persisted_in_order() -> None:
    h = make_harness()
    r_session = h.client.post("/api/v1/sessions", json={"consent": True})
    assert r_session.status_code == 201
    body = r_session.json()
    sid = body["id"]
    auth = {"X-Guest-Token": body["guest_token"]}

    questions = [
        "Chào chị, bé sốt mấy ngày rồi ạ?",
        "Bé có giật mình khi thiu thiu ngủ không chị?",
        "Bé có nốt ban ở lòng bàn tay bàn chân không chị?",
    ]
    for q in questions:
        r_turn = h.client.post(f"/api/v1/sessions/{sid}/turns", json={"text": q}, headers=auth)
        assert r_turn.status_code == 200

    r_turns = h.client.get(f"/api/v1/sessions/{sid}/turns", headers=auth)
    assert r_turns.status_code == 200
    turns = r_turns.json()

    student_turns = [t for t in turns if t["speaker"] == "student"]
    assert [t["text"] for t in student_turns] == questions

    student_indices = [t["turn_idx"] for t in student_turns]
    assert all(x < y for x, y in zip(student_indices, student_indices[1:], strict=False))

    all_indices = [t["turn_idx"] for t in turns]
    assert all(x < y for x, y in zip(all_indices, all_indices[1:], strict=False))


@pytest.mark.parametrize(
    ("method", "path", "payload"),
    [
        ("GET", "/api/v1/sessions/{id}", None),
        ("GET", "/api/v1/sessions/{id}/turns", None),
        ("POST", "/api/v1/sessions/{id}/turns", {"text": "Chào chị, bé sốt mấy ngày rồi ạ?"}),
        (
            "POST",
            "/api/v1/sessions/{id}/actions",
            {"action": "examine_region", "region": "mouth_throat"},
        ),
        ("GET", "/api/v1/sessions/{id}/vitals", None),
        ("POST", "/api/v1/sessions/{id}/vitals/events", {"event": "TIME_TICK"}),
        ("POST", "/api/v1/sessions/{id}/finish", None),
        ("GET", "/api/v1/sessions/{id}/evaluation", None),
        ("POST", "/api/v1/sessions/{id}/evaluation/retry", None),
        ("GET", "/api/v1/sessions/{id}/debrief", None),
        ("GET", "/api/v1/sessions/{id}/debrief/pdf", None),
    ],
)
def test_wrong_token_denied_on_every_session_route(
    method: str, path: str, payload: dict | None
) -> None:
    h = make_harness()
    sid1, _auth1 = h.new_session()
    _sid2, auth2 = h.new_session()
    url = path.format(id=sid1)

    # 1. With header X-Guest-Token "wrong-token" -> 404 (or 403 / 401)
    kw_wrong: dict = {"headers": {"X-Guest-Token": "wrong-token"}}
    if payload is not None:
        kw_wrong["json"] = payload
    r_wrong = h.client.request(method, url, **kw_wrong)
    assert r_wrong.status_code in (401, 403, 404)

    # 2. With no header -> 404 (or 403 / 401)
    kw_none: dict = {}
    if payload is not None:
        kw_none["json"] = payload
    r_none = h.client.request(method, url, **kw_none)
    assert r_none.status_code in (401, 403, 404)

    # 3. Second valid session's token must not open first session
    kw_second: dict = {"headers": auth2}
    if payload is not None:
        kw_second["json"] = payload
    r_second = h.client.request(method, url, **kw_second)
    assert r_second.status_code in (401, 403, 404)


def test_finish_twice_creates_one_evaluation_chain() -> None:
    h = make_harness()
    sid, auth = _interview(h)

    r1 = h.client.post(f"/api/v1/sessions/{sid}/finish", headers=auth)
    assert r1.status_code == 200

    r2 = h.client.post(f"/api/v1/sessions/{sid}/finish", headers=auth)
    assert r2.status_code == 200

    evaluate_jobs = [j for j in h.store.jobs if j.kind == "evaluate"]
    debrief_jobs = [j for j in h.store.jobs if j.kind == "debrief"]
    assert len(evaluate_jobs) == 1
    assert len(debrief_jobs) == 1
    assert [j.kind for j in h.store.jobs] == ["evaluate", "debrief"]
    assert all(j.status == "done" for j in h.store.jobs)
