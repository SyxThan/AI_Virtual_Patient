"""Guest-retention cleanup tests (Slice 13, AVP-115). Synthetic sessions only.

The fake mirrors the SQL predicate of SqlPrivacyRepository
(`user_id IS NULL AND started_at < cutoff`); the real-DB variant at the bottom
runs the actual SQL when AVP_TEST_DATABASE_URL points at a disposable database.
"""

from __future__ import annotations

import uuid
from contextlib import nullcontext
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import pytest

from avp_api.jobs import cleanup
from tests.test_auth import USER_A as USER
from tests.test_privacy import (  # noqa: F401 - real_db is a pytest fixture
    NO_CHILDREN,
    child_counts,
    needs_real_db,
    real_db,
    seed_session,
    session_exists,
)

NOW = datetime(2026, 11, 12, 12, 0, 0, tzinfo=UTC)


@dataclass
class Row:
    id: str
    user_id: str | None
    started_at: datetime


class FakeRepo:
    def __init__(self, rows: list[Row]) -> None:
        self.rows = rows
        self.cutoffs: list[datetime] = []

    def _expired(self, cutoff: datetime) -> list[Row]:
        return [r for r in self.rows if r.user_id is None and r.started_at < cutoff]

    def count_expired_guest_sessions(self, cutoff: datetime) -> int:
        self.cutoffs.append(cutoff)
        return len(self._expired(cutoff))

    def delete_expired_guest_sessions(self, cutoff: datetime) -> int:
        self.cutoffs.append(cutoff)
        gone = {r.id for r in self._expired(cutoff)}
        self.rows[:] = [r for r in self.rows if r.id not in gone]
        return len(gone)


def _row(user_id: str | None, age: timedelta) -> Row:
    return Row(str(uuid.uuid4()), user_id, NOW - age)


def _fixture_rows() -> dict[str, Row]:
    return {
        "guest_old": _row(None, timedelta(days=45)),
        "guest_just_expired": _row(None, timedelta(days=30, microseconds=1)),
        "guest_at_boundary": _row(None, timedelta(days=30)),  # exactly N days: kept
        "guest_recent": _row(None, timedelta(days=1)),
        "user_very_old": _row(USER, timedelta(days=400)),  # signed in: never touched
        "user_recent": _row(USER, timedelta(hours=1)),
    }


def test_retention_boundary_and_signed_in_untouched() -> None:
    rows = _fixture_rows()
    repo = FakeRepo(list(rows.values()))
    result = cleanup.run_cleanup(repo, 30, now=lambda: NOW)
    assert (result.expired, result.deleted, result.dry_run) == (2, 2, False)
    left = {r.id for r in repo.rows}
    assert left == {rows[k].id for k in ("guest_at_boundary", "guest_recent", "user_very_old",
                                          "user_recent")}  # fmt: skip
    assert repo.cutoffs == [NOW - timedelta(days=30)] * 2


def test_dry_run_deletes_nothing() -> None:
    rows = _fixture_rows()
    repo = FakeRepo(list(rows.values()))
    result = cleanup.run_cleanup(repo, 30, dry_run=True, now=lambda: NOW)
    assert (result.expired, result.deleted, result.dry_run) == (2, 0, True)
    assert len(repo.rows) == len(rows)
    assert "would delete=2" in result.summary()


def test_other_retention_and_invalid_days() -> None:
    repo = FakeRepo(list(_fixture_rows().values()))
    assert cleanup.run_cleanup(repo, 2, dry_run=True, now=lambda: NOW).expired == 3
    with pytest.raises(ValueError):
        cleanup.run_cleanup(repo, 0, now=lambda: NOW)


def test_default_retention_is_30_days() -> None:
    from avp_api.config import Settings

    assert Settings(_env_file=None).guest_retention_days == 30


def test_cli_prints_counts_only(monkeypatch, capsys) -> None:
    rows = _fixture_rows()
    repo = FakeRepo(list(rows.values()))
    import avp_api.db.repositories.privacy_repo as privacy_repo
    import avp_api.db.session as db_session

    monkeypatch.setattr(db_session, "_maker", lambda: lambda: nullcontext(None))
    monkeypatch.setattr(privacy_repo, "SqlPrivacyRepository", lambda db: repo)

    assert cleanup.main(["--dry-run", "--days", "30"]) == 0
    out = capsys.readouterr().out
    assert len(repo.rows) == len(rows)  # dry run
    assert cleanup.main(["--days", "30"]) == 0
    out += capsys.readouterr().out
    assert "retention_days=30" in out and "deleted=" in out
    for r in rows.values():
        assert r.id not in out and USER not in out
    with pytest.raises(SystemExit):
        cleanup.main(["--days", "0"])


# --- Real Postgres (runs only with AVP_TEST_DATABASE_URL; disposable DB only) ------


@needs_real_db
def test_real_db_cleanup_dry_run_then_real(real_db) -> None:  # noqa: F811 - fixture
    from avp_api.db.repositories.privacy_repo import SqlPrivacyRepository

    now = datetime.now(UTC)
    old_guest, _ = seed_session(real_db, started_at=now - timedelta(days=31))
    edge_guest, _ = seed_session(real_db, started_at=now - timedelta(days=29, hours=23))
    new_guest, _ = seed_session(real_db)
    old_user, _ = seed_session(real_db, user_id=USER, started_at=now - timedelta(days=400))

    with real_db() as db:
        repo = SqlPrivacyRepository(db)
        dry = cleanup.run_cleanup(repo, 30, dry_run=True, now=lambda: now)
        assert dry.deleted == 0 and dry.expired >= 1
        assert session_exists(real_db, old_guest)  # dry run deleted nothing
        real = cleanup.run_cleanup(repo, 30, now=lambda: now)
        assert real.deleted == dry.expired

    assert not session_exists(real_db, old_guest)
    assert child_counts(real_db, old_guest) == NO_CHILDREN
    for sid in (edge_guest, new_guest, old_user):
        assert session_exists(real_db, sid) and all(child_counts(real_db, sid).values())
