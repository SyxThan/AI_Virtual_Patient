"""Delete-my-data tests (Slice 13, AVP-115; T-PRIV-01, T-SEC-01, T-SEC-02).

In-memory fakes that mirror the SQL: the ownership predicate of the DELETE and the
`on delete cascade` FKs (turns, evaluations + items, debriefs, jobs). Synthetic
users and transcripts only. The `real_db` tests at the bottom run the same flows
against a real Postgres when AVP_TEST_DATABASE_URL is set.
"""

from __future__ import annotations

import io
import logging
import os
import urllib.error
import uuid
from datetime import UTC, datetime

import pytest
from sqlalchemy import text

from avp_api.config import Settings
from avp_api.db.repositories.privacy_repo import UserDataDeletion
from avp_api.routers import me, sessions
from avp_api.services import privacy_service
from tests.test_auth import SESSION_ROUTES, USER_A, USER_B, _bearer, _signed_in_harness
from tests.test_me import FakeProfileRepo

SECRET = "sb_secret_TEST_ONLY_never_a_real_key_0123456789"


class FakePrivacyRepo:
    """Deletes from the harness store like Postgres would (FK cascades)."""

    def __init__(self, h) -> None:
        self.h = h

    def _cascade(self, sids: set[str]) -> None:
        s = self.h.store
        for sid in sids:
            s.sessions.pop(sid, None)
        s.turns[:] = [t for t in s.turns if t.session_id not in sids]
        s.evals[:] = [e for e in s.evals if e.session_id not in sids]  # items live inside
        s.jobs[:] = [j for j in s.jobs if j.session_id not in sids]
        self.h.debriefs[:] = [d for d in self.h.debriefs if d.session_id not in sids]

    def delete_owned_session(self, session_id, user_id, guest_token_hash) -> bool:
        rec = self.h.store.sessions.get(session_id)
        if rec is None:
            return False
        owned = (user_id is not None and rec.user_id == user_id) or (
            guest_token_hash is not None
            and rec.user_id is None
            and rec.guest_token_hash == guest_token_hash
        )
        if owned:
            self._cascade({session_id})
        return owned

    def delete_user_data(self, user_id: str) -> UserDataDeletion:
        mine = {sid for sid, r in self.h.store.sessions.items() if r.user_id == user_id}
        self._cascade(mine)
        had_profile = self.h.profiles.pop(user_id, None) is not None
        return UserDataDeletion(sessions_deleted=len(mine), profile_deleted=had_profile)

    def count_expired_guest_sessions(self, cutoff) -> int:  # pragma: no cover - unused here
        raise NotImplementedError

    def delete_expired_guest_sessions(self, cutoff) -> int:  # pragma: no cover
        raise NotImplementedError


@pytest.fixture
def h():
    h = _signed_in_harness()
    h.profiles = {}
    h.deleter_calls = []
    h.deleter = None  # tests set a callable to simulate a configured Admin API
    ov = h.client.app.dependency_overrides
    ov[sessions.get_privacy_repo] = lambda: FakePrivacyRepo(h)
    ov[me.get_privacy_repo] = lambda: FakePrivacyRepo(h)
    ov[me.get_profile_repo] = lambda: FakeProfileRepo(h.store, h.profiles)
    ov[me.get_account_deleter] = lambda: h.deleter
    return h


def _session_with_data(h, headers: dict | None = None) -> tuple[str, dict]:
    """A finished session with turns, an evaluation, a debrief and jobs."""
    if headers is None:
        sid, headers = h.new_session()
    else:
        r = h.client.post("/api/v1/sessions", json={"consent": True}, headers=headers)
        assert r.status_code == 201
        sid = r.json()["id"]
    for q in ("Chào chị, bé sốt mấy ngày rồi ạ?", "Bé có loét miệng không chị?"):
        r = h.client.post(f"/api/v1/sessions/{sid}/turns", json={"text": q}, headers=headers)
        assert r.status_code == 200
    assert h.client.post(f"/api/v1/sessions/{sid}/finish", headers=headers).status_code == 200
    assert h.client.get(f"/api/v1/sessions/{sid}/debrief", headers=headers).status_code == 200
    return sid, headers


def _children(h, sid: str) -> dict[str, int]:
    s = h.store
    return {
        "turns": sum(t.session_id == sid for t in s.turns),
        "evaluations": sum(e.session_id == sid for e in s.evals),
        "jobs": sum(j.session_id == sid for j in s.jobs),
        "debriefs": sum(d.session_id == sid for d in h.debriefs),
    }


def _assert_every_route_404(h, sid: str, headers: dict) -> None:
    for method, path, payload in SESSION_ROUTES:
        kw = {"json": payload} if payload is not None else {}
        r = h.client.request(method, path.format(id=sid), headers=headers, **kw)
        assert r.status_code == 404, (method, path, r.text)
    r = h.client.delete(f"/api/v1/sessions/{sid}", headers=headers)
    assert r.status_code == 404  # deleting twice is a plain 404


# --- DELETE /sessions/{id} -------------------------------------------------------


def test_guest_owner_deletes_session_and_children(h) -> None:
    sid, guest = _session_with_data(h)
    before = _children(h, sid)
    assert all(before.values()), before  # every child table had rows

    r = h.client.delete(f"/api/v1/sessions/{sid}", headers=guest)
    assert r.status_code == 204 and r.content == b""
    assert sid not in h.store.sessions
    assert _children(h, sid) == {"turns": 0, "evaluations": 0, "jobs": 0, "debriefs": 0}
    _assert_every_route_404(h, sid, guest)


def test_signed_in_owner_deletes_with_bearer(h) -> None:
    sid, a = _session_with_data(h, _bearer(USER_A))
    assert h.client.delete(f"/api/v1/sessions/{sid}", headers=a).status_code == 204
    assert sid not in h.store.sessions
    assert not any(_children(h, sid).values())
    _assert_every_route_404(h, sid, a)


def test_non_owners_get_404_and_nothing_is_deleted(h) -> None:
    guest_sid, guest = _session_with_data(h)
    user_sid, a = _session_with_data(h, _bearer(USER_A))
    other_sid, other_guest = h.new_session()
    snapshot = {sid: _children(h, sid) for sid in (guest_sid, user_sid)}

    attempts = [
        (guest_sid, {"X-Guest-Token": "not-the-token"}),
        (guest_sid, {}),
        (guest_sid, other_guest),  # another guest's valid token
        (guest_sid, _bearer(USER_B)),
        (guest_sid, a),  # signed in, but without the guest token
        (user_sid, _bearer(USER_B)),
        (user_sid, {}),
        (user_sid, guest),  # a guest token never opens a user's session
        (user_sid, {"X-Guest-Token": "x", **_bearer(USER_B)}),
    ]
    for sid, headers in attempts:
        r = h.client.delete(f"/api/v1/sessions/{sid}", headers=headers)
        assert r.status_code == 404, (sid, headers)
        assert r.json()["error"]["code"] == "SESSION_NOT_FOUND"

    assert {guest_sid, user_sid, other_sid} <= set(h.store.sessions)
    assert {sid: _children(h, sid) for sid in (guest_sid, user_sid)} == snapshot
    # The owners can still use their sessions.
    assert h.client.get(f"/api/v1/sessions/{guest_sid}", headers=guest).status_code == 200
    assert h.client.get(f"/api/v1/sessions/{user_sid}", headers=a).status_code == 200


@pytest.mark.parametrize("sid", ["00000000-0000-4000-8000-000000000000", "not-a-uuid", "progress"])
def test_unknown_or_malformed_id_is_404(h, sid: str) -> None:
    r = h.client.delete(f"/api/v1/sessions/{sid}", headers={"X-Guest-Token": "x"})
    assert r.status_code == 404


def test_bad_bearer_is_401_not_a_delete(h) -> None:
    sid, a = _session_with_data(h, _bearer(USER_A))
    r = h.client.delete(f"/api/v1/sessions/{sid}", headers={"Authorization": "Bearer nope"})
    assert r.status_code == 401
    assert sid in h.store.sessions


def test_ownership_change_between_check_and_delete_is_404() -> None:
    """The service check passes but the DELETE's own predicate does not match
    (e.g. the guest session was claimed in between): 404, nothing reported deleted."""

    class Repo:
        def delete_owned_session(self, *a) -> bool:
            return False

    from tests.test_evaluation_api import FakeSessionRepo, Store

    store = Store()
    rec = FakeSessionRepo(store).create(
        case_id="case-01-hfmd", case_version=1, mode="exam", status="active", user_id=USER_A,
        guest_token_hash=None, consented_at=datetime.now(UTC), state={},
    )  # fmt: skip
    with pytest.raises(Exception) as exc:
        privacy_service.delete_session(rec.id, FakeSessionRepo(store), Repo(), USER_A, None)
    assert getattr(exc.value, "status_code", None) == 404


# --- DELETE /me ------------------------------------------------------------------


def test_delete_me_requires_sign_in(h) -> None:
    sid, guest = _session_with_data(h)
    r = h.client.delete("/api/v1/me", headers=guest)
    assert r.status_code == 401 and r.json()["error"]["code"] == "AUTH_REQUIRED"
    assert sid in h.store.sessions


def test_delete_me_removes_only_the_callers_data(h) -> None:
    a, b = _bearer(USER_A), _bearer(USER_B)
    assert h.client.get("/api/v1/me", headers=a).status_code == 200  # creates A's profile
    assert h.client.get("/api/v1/me", headers=b).status_code == 200
    a1, _ = _session_with_data(h, a)
    a2, _ = _session_with_data(h, a)
    b1, _ = _session_with_data(h, b)
    g1, guest = _session_with_data(h)

    r = h.client.delete("/api/v1/me", headers=a)
    assert r.status_code == 200
    assert r.json() == {"sessions_deleted": 2, "profile_deleted": True, "account_deleted": False}

    for sid in (a1, a2):
        assert sid not in h.store.sessions and not any(_children(h, sid).values())
        _assert_every_route_404(h, sid, a)
    assert USER_A not in h.profiles
    # B's and the guest's data are untouched.
    assert USER_B in h.profiles
    for sid, headers in ((b1, b), (g1, guest)):
        assert all(_children(h, sid).values())
        assert h.client.get(f"/api/v1/sessions/{sid}", headers=headers).status_code == 200

    # Repeating is harmless and honest.
    r = h.client.delete("/api/v1/me", headers=a)
    assert r.json() == {"sessions_deleted": 0, "profile_deleted": False, "account_deleted": False}


def test_delete_me_calls_admin_deleter_when_configured(h) -> None:
    h.deleter = lambda uid: h.deleter_calls.append(uid) or True
    _session_with_data(h, _bearer(USER_A))
    r = h.client.delete("/api/v1/me", headers=_bearer(USER_A))
    assert r.status_code == 200 and r.json()["account_deleted"] is True
    assert h.deleter_calls == [USER_A]


@pytest.mark.parametrize("outcome", ["false", "raise"])
def test_admin_failure_reports_account_not_deleted_but_data_is_gone(h, outcome, caplog) -> None:
    def deleter(uid: str) -> bool:
        h.deleter_calls.append(uid)
        if outcome == "raise":
            raise RuntimeError(f"boom {SECRET}")  # even a hostile message is not logged
        return False

    h.deleter = deleter
    sid, a = _session_with_data(h, _bearer(USER_A))
    with caplog.at_level(logging.DEBUG):
        r = h.client.delete("/api/v1/me", headers=a)
    assert r.status_code == 200
    assert r.json() == {"sessions_deleted": 1, "profile_deleted": False, "account_deleted": False}
    assert sid not in h.store.sessions and h.deleter_calls == [USER_A]
    assert SECRET not in caplog.text


# --- Supabase Admin API adapter (mocked; no network) ------------------------------


def _settings(**kw) -> Settings:
    return Settings(_env_file=None, **kw)


def test_no_deleter_without_secret_key_or_url(monkeypatch) -> None:
    for s in (
        _settings(supabase_url="https://x.supabase.co"),
        _settings(supabase_secret_key=SECRET),
    ):
        monkeypatch.setattr(privacy_service, "get_settings", lambda s=s: s)
        assert privacy_service.configured_account_deleter() is None


def test_secret_key_is_not_in_settings_repr() -> None:
    s = _settings(supabase_secret_key=SECRET)
    assert SECRET not in repr(s) and SECRET not in str(s)


class _Resp:
    def __init__(self, status: int) -> None:
        self.status = status

    def __enter__(self):
        return self

    def __exit__(self, *a) -> None:
        return None


def test_admin_api_request_shape_and_no_key_in_logs(monkeypatch, caplog) -> None:
    seen = []

    def fake_urlopen(req, timeout):
        seen.append((req, timeout))
        return _Resp(200)

    monkeypatch.setattr(privacy_service.urllib.request, "urlopen", fake_urlopen)
    s = _settings(supabase_url="https://proj.supabase.co/", supabase_secret_key=SECRET)
    monkeypatch.setattr(privacy_service, "get_settings", lambda: s)
    deleter = privacy_service.configured_account_deleter()
    assert deleter is not None
    with caplog.at_level(logging.DEBUG):
        assert deleter(USER_A) is True
    (req, timeout), = seen  # fmt: skip
    assert req.get_method() == "DELETE"
    assert req.full_url == f"https://proj.supabase.co/auth/v1/admin/users/{USER_A}"
    assert req.get_header("Apikey") == SECRET
    assert req.get_header("Authorization") == f"Bearer {SECRET}"
    assert SECRET not in req.full_url
    assert 0 < timeout <= 10
    assert SECRET not in caplog.text


@pytest.mark.parametrize(
    ("error", "expected"),
    [
        (urllib.error.HTTPError("u", 404, "Not Found", {}, io.BytesIO(b"")), True),
        (urllib.error.HTTPError("u", 401, "Unauthorized", {}, io.BytesIO(b"")), False),
        (urllib.error.HTTPError("u", 500, "Server Error", {}, io.BytesIO(b"")), False),
        (urllib.error.URLError("no route"), False),
        (TimeoutError(), False),
    ],
)
def test_admin_api_errors(monkeypatch, caplog, error, expected) -> None:
    def fake_urlopen(req, timeout):
        raise error

    monkeypatch.setattr(privacy_service.urllib.request, "urlopen", fake_urlopen)
    with caplog.at_level(logging.DEBUG):
        ok = privacy_service.delete_supabase_auth_user("https://p.supabase.co", SECRET, USER_A)
    assert ok is expected
    assert SECRET not in caplog.text


# --- Real Postgres (T-PRIV-01 "CI (real DB)") --------------------------------------
# Runs only when AVP_TEST_DATABASE_URL points at a DISPOSABLE, migrated database
# (alembic upgrade head) that has the Supabase `auth.users` table or a local stub.
# Never point it at the dev or demo Supabase project: it inserts and deletes rows.

REAL_DB_URL = os.environ.get("AVP_TEST_DATABASE_URL")
needs_real_db = pytest.mark.skipif(not REAL_DB_URL, reason="AVP_TEST_DATABASE_URL not set")

SYNTHETIC_CASE = "avp115-synthetic-case"
CHILD_COUNTS = {
    # table -> SQL counting its rows for :sid (evaluation_items via its evaluation)
    "turns": "select count(*) from turns where session_id = :sid",
    "evaluations": "select count(*) from evaluations where session_id = :sid",
    "evaluation_items": "select count(*) from evaluation_items i join evaluations e"
    " on e.id = i.evaluation_id where e.session_id = :sid",
    "debriefs": "select count(*) from debriefs where session_id = :sid",
    "jobs": "select count(*) from jobs where session_id = :sid",
    "fallback_hits": "select count(*) from fallback_hits where session_id = :sid",
}
NO_CHILDREN = dict.fromkeys(CHILD_COUNTS, 0)


@pytest.fixture
def real_db():
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    # lock_timeout: a delete blocked by a lock fails fast instead of hanging the test.
    engine = create_engine(REAL_DB_URL, connect_args={"options": "-c lock_timeout=5000"})
    maker = sessionmaker(bind=engine, expire_on_commit=False)
    from sqlalchemy.dialects.postgresql import insert

    from avp_api.db import models
    from tests.test_evaluation_api import CASE  # the repo's case JSON (has the rubric)

    with maker() as db:
        db.execute(
            insert(models.Case)
            .values(id=SYNTHETIC_CASE, version=1, content=CASE, content_hash="synthetic")
            .on_conflict_do_nothing()
        )
        for uid in (USER_A, USER_B):
            db.execute(
                text("insert into auth.users (id) values (:u) on conflict do nothing"),
                {"u": uuid.UUID(uid)},
            )
        db.commit()
    yield maker
    engine.dispose()


def real_db_client(maker):
    """TestClient on the real database: only get_db and the JWT verifier are swapped."""
    from fastapi.testclient import TestClient

    from avp_api import auth
    from avp_api.db.session import get_db
    from avp_api.main import create_app
    from tests.test_auth import make_verifier

    def db_dep():
        with maker() as db:
            yield db

    app = create_app()
    verifier, _ = make_verifier()
    app.dependency_overrides[get_db] = db_dep
    app.dependency_overrides[auth.get_verifier] = lambda: verifier
    app.dependency_overrides[me.get_account_deleter] = lambda: None
    return TestClient(app)


def seed_session(
    maker,
    *,
    user_id: str | None = None,
    started_at: datetime | None = None,
    job_status: str = "done",
) -> tuple[str, str | None]:
    """A session with synthetic rows in EVERY child table. Returns (id, guest token)."""
    import secrets

    from avp_api.db import models
    from avp_api.services.session_service import _hash_guest_token

    token = None if user_id else secrets.token_hex(32)
    with maker() as db:
        sess = models.Session(
            user_id=uuid.UUID(user_id) if user_id else None,
            guest_token_hash=_hash_guest_token(token) if token else None,
            case_id=SYNTHETIC_CASE,
            case_version=1,
            mode="exam",
            status="evaluated",
            consented_at=datetime.now(UTC),
            state={"role": "student"},
        )
        if started_at is not None:
            sess.started_at = started_at
        db.add(sess)
        db.flush()
        sid = sess.id
        db.add_all(
            [
                models.Turn(session_id=sid, idx=0, speaker="student",
                            text="Synthetic question?", t_start_ms=0),
                models.Turn(session_id=sid, idx=1, speaker="patient",
                            text="Synthetic answer.", t_start_ms=10),
            ]
        )  # fmt: skip
        ev = models.Evaluation(session_id=sid, status="done", model="fake",
                               prompt_version="t", rubric_version=1, scoring_version="t",
                               total_score=50)  # fmt: skip
        db.add(ev)
        db.flush()
        db.add(
            models.EvaluationItem(
                evaluation_id=ev.id,
                criterion_id="c1",
                level=2,
                status="met",
                evidence=[{"turn_idx": 0, "quote": "Synthetic question?"}],
            )
        )
        db.add(models.Debrief(session_id=sid, evaluation_id=ev.id, content={"status": "done"}))
        db.add(models.Job(kind="evaluate", session_id=sid, status=job_status))
        db.add(models.FallbackHit(session_id=sid, case_id=SYNTHETIC_CASE,
                                  kind="unknown_symptom", question="Synthetic?"))  # fmt: skip
        db.commit()
    return str(sid), token


def child_counts(maker, sid: str) -> dict[str, int]:
    with maker() as db:
        return {
            t: int(db.execute(text(q), {"sid": uuid.UUID(sid)}).scalar_one())
            for t, q in CHILD_COUNTS.items()
        }


def session_exists(maker, sid: str) -> bool:
    with maker() as db:
        q = text("select 1 from sessions where id = :s")
        return db.execute(q, {"s": uuid.UUID(sid)}).first() is not None


@needs_real_db
def test_real_db_owner_delete_cascades_every_child_table(real_db) -> None:
    client = real_db_client(real_db)
    gsid, token = seed_session(real_db)
    usid, _ = seed_session(real_db, user_id=USER_A)
    guest = {"X-Guest-Token": token}
    assert all(child_counts(real_db, gsid).values()), child_counts(real_db, gsid)

    # Non-owners: 404 and nothing changes.
    attempts = [
        (gsid, {"X-Guest-Token": "wrong"}),
        (gsid, _bearer(USER_B)),
        (gsid, {}),
        (usid, _bearer(USER_B)),
        (usid, guest),
    ]
    for sid, headers in attempts:
        before = child_counts(real_db, sid)
        assert client.delete(f"/api/v1/sessions/{sid}", headers=headers).status_code == 404
        assert session_exists(real_db, sid) and child_counts(real_db, sid) == before

    for sid, headers in ((gsid, guest), (usid, _bearer(USER_A))):
        assert client.delete(f"/api/v1/sessions/{sid}", headers=headers).status_code == 204
        assert not session_exists(real_db, sid)
        assert child_counts(real_db, sid) == NO_CHILDREN
        for method, path, payload in SESSION_ROUTES:
            kw = {"json": payload} if payload is not None else {}
            r = client.request(method, path.format(id=sid), headers=headers, **kw)
            assert r.status_code == 404, (method, path, r.status_code)
        assert client.delete(f"/api/v1/sessions/{sid}", headers=headers).status_code == 404


@needs_real_db
def test_real_db_delete_me_only_touches_the_caller(real_db) -> None:
    client = real_db_client(real_db)
    with real_db() as db:
        for uid in (USER_A, USER_B):
            db.execute(
                text("insert into profiles (user_id) values (:u) on conflict do nothing"),
                {"u": uuid.UUID(uid)},
            )
        db.execute(text("delete from sessions where user_id = :u"), {"u": uuid.UUID(USER_A)})
        db.commit()
    a1, _ = seed_session(real_db, user_id=USER_A)
    a2, _ = seed_session(real_db, user_id=USER_A)
    b1, _ = seed_session(real_db, user_id=USER_B)
    g1, _ = seed_session(real_db)

    r = client.delete("/api/v1/me", headers=_bearer(USER_A))
    assert r.status_code == 200
    assert r.json() == {"sessions_deleted": 2, "profile_deleted": True, "account_deleted": False}
    for sid in (a1, a2):
        assert not session_exists(real_db, sid)
        assert child_counts(real_db, sid) == NO_CHILDREN
    for sid in (b1, g1):
        assert session_exists(real_db, sid) and all(child_counts(real_db, sid).values())
    with real_db() as db:
        profiles = {str(u) for u in db.execute(text("select user_id from profiles")).scalars()}
    assert USER_A not in profiles and USER_B in profiles


@needs_real_db
def test_real_db_worker_survives_session_deleted_mid_job(real_db) -> None:
    """A session deleted while its evaluate job runs: the job row goes by cascade,
    the delete is not blocked, and the worker finishes without raising (the
    evaluation insert fails its FK and is handled like any other job failure)."""
    from avp_api.db.repositories.evaluation_repo import SqlEvaluationRepository
    from avp_api.db.repositories.job_repo import SqlJobRepository
    from avp_api.db.repositories.session_repo import SqlSessionRepository
    from avp_api.db.repositories.turn_repo import SqlTurnRepository
    from avp_api.jobs import worker
    from avp_api.providers.llm import FakeLLMProvider

    client = real_db_client(real_db)
    sid, token = seed_session(real_db, job_status="queued")
    with real_db() as db:
        q = text("select id from jobs where session_id = :s")
        job_id = db.execute(q, {"s": uuid.UUID(sid)}).scalar_one()
    deleted: list[int] = []

    class DeletingTurnRepo(SqlTurnRepository):
        """The owner deletes the session while the worker is reading the transcript
        (after the job was claimed and the session marked `evaluating`)."""

        def list_for_session(self, session_id: str):
            turns = super().list_for_session(session_id)
            if not deleted:
                r = client.delete(f"/api/v1/sessions/{sid}", headers={"X-Guest-Token": token})
                deleted.append(r.status_code)
            return turns

    with real_db() as db:
        job = SqlJobRepository(db).claim_job(job_id)
        assert job is not None
        follow_up = worker.execute_job(
            job,
            SqlJobRepository(db),
            SqlSessionRepository(db),
            DeletingTurnRepo(db),
            SqlEvaluationRepository(db),
            FakeLLMProvider(),
            rollback=db.rollback,
        )
        assert follow_up is None  # no debrief enqueued for a deleted session
    assert deleted == [204]
    assert not session_exists(real_db, sid)
    assert child_counts(real_db, sid) == NO_CHILDREN

    # A job whose session vanished before it was claimed is simply gone.
    sid2, token2 = seed_session(real_db, job_status="queued")
    r = client.delete(f"/api/v1/sessions/{sid2}", headers={"X-Guest-Token": token2})
    assert r.status_code == 204
    assert child_counts(real_db, sid2)["jobs"] == 0
