"""Practice-history data access (Slice 11, AVP-109). Read-only.

The session list is ONE query: the caller's sessions (served by
`sessions_user_idx`), the case title from the pinned case snapshot, and the
latest evaluation per session via a LATERAL subquery (`evaluations_session_idx`).
No N+1, and no transcript column is ever selected.

Progress is computed only from stored evaluations whose latest row per session
has status 'done'; nothing is extrapolated.
"""

from __future__ import annotations

import datetime
import uuid
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from typing import Protocol

from sqlalchemy import text
from sqlalchemy.orm import Session as OrmSession

from avp_api.db.repositories.evaluation_repo import EvaluationRecord
from avp_api.db.repositories.session_repo import SessionRecord

Cursor = tuple[datetime.datetime, str]  # (started_at, session id) of the last row seen


@dataclass
class SessionSummaryRow:
    id: str
    case_id: str
    case_title: str | None
    mode: str
    status: str
    started_at: datetime.datetime
    ended_at: datetime.datetime | None
    evaluation_status: str | None  # latest evaluation's status, None if there is none
    total_score: float | None
    critical_missed: bool


@dataclass
class AttemptRow:
    session_id: str
    started_at: datetime.datetime
    total_score: float | None
    critical_missed: bool
    rubric_version: int


@dataclass
class CriterionCountRow:
    rubric_version: int
    criterion_id: str
    criterion: str | None
    attempts: int
    met: int
    partial: int


class HistoryRepository(Protocol):
    def list_for_user(
        self, user_id: str, limit: int, after: Cursor | None
    ) -> list[SessionSummaryRow]: ...

    def done_attempts(self, user_id: str) -> list[AttemptRow]: ...

    def criterion_counts(self, user_id: str) -> list[CriterionCountRow]: ...


def _uuid_or_none(value: str) -> uuid.UUID | None:
    try:
        return uuid.UUID(value)
    except ValueError:
        return None


_LIST_SQL = text(
    """
    select s.id, s.case_id, c.content -> 'title' ->> 'vi' as case_title,
           s.mode, s.status, s.started_at, s.ended_at,
           e.status as evaluation_status, e.total_score, e.critical_missed
    from sessions s
    left join cases c on c.id = s.case_id and c.version = s.case_version
    left join lateral (
        select ev.status, ev.total_score, ev.critical_missed
        from evaluations ev
        where ev.session_id = s.id
        order by ev.created_at desc
        limit 1
    ) e on true
    where s.user_id = :user_id
      and (cast(:after_started as timestamptz) is null
           or (s.started_at, s.id) < (cast(:after_started as timestamptz), cast(:after_id as uuid)))
    order by s.started_at desc, s.id desc
    limit :limit
    """
)

# Latest evaluation per session of this user, kept only when it is 'done'.
_LATEST_DONE_CTE = """
    with latest as (
        select distinct on (ev.session_id)
               ev.id, ev.session_id, ev.status, ev.total_score, ev.critical_missed,
               ev.rubric_version
        from evaluations ev
        join sessions s on s.id = ev.session_id
        where s.user_id = :user_id
        order by ev.session_id, ev.created_at desc
    ), done as (
        select * from latest where status = 'done'
    )
"""

_ATTEMPTS_SQL = text(
    _LATEST_DONE_CTE
    + """
    select d.session_id, s.started_at, d.total_score, d.critical_missed, d.rubric_version
    from done d
    join sessions s on s.id = d.session_id
    order by s.started_at asc, s.id asc
    """
)

_CRITERIA_SQL = text(
    _LATEST_DONE_CTE
    + """
    select d.rubric_version, i.criterion_id,
           max(r.item ->> 'criterion') as criterion,
           count(*) as attempts,
           count(*) filter (where i.status = 'met') as met,
           count(*) filter (where i.status = 'partial') as partial
    from done d
    join evaluation_items i on i.evaluation_id = d.id
    join sessions s on s.id = d.session_id
    left join cases c on c.id = s.case_id and c.version = s.case_version
    left join lateral jsonb_array_elements(
        coalesce(c.content -> 'rubric' -> 'items', '[]'::jsonb)
    ) with ordinality as r(item, ord) on r.item ->> 'id' = i.criterion_id
    group by d.rubric_version, i.criterion_id
    order by d.rubric_version asc, min(r.ord) asc nulls last, i.criterion_id asc
    """
)


class SqlHistoryRepository:
    def __init__(self, db: OrmSession) -> None:
        self.db = db

    def list_for_user(
        self, user_id: str, limit: int, after: Cursor | None
    ) -> list[SessionSummaryRow]:
        uid = _uuid_or_none(user_id)
        if uid is None:
            return []
        params = {
            "user_id": uid,
            "limit": limit,
            "after_started": after[0] if after else None,
            "after_id": _uuid_or_none(after[1]) if after else None,
        }
        rows = self.db.execute(_LIST_SQL, params).mappings()
        return [
            SessionSummaryRow(
                id=str(r["id"]),
                case_id=r["case_id"],
                case_title=r["case_title"],
                mode=r["mode"],
                status=r["status"],
                started_at=r["started_at"],
                ended_at=r["ended_at"],
                evaluation_status=r["evaluation_status"],
                total_score=float(r["total_score"]) if r["total_score"] is not None else None,
                critical_missed=bool(r["critical_missed"]),
            )
            for r in rows
        ]

    def done_attempts(self, user_id: str) -> list[AttemptRow]:
        uid = _uuid_or_none(user_id)
        if uid is None:
            return []
        rows = self.db.execute(_ATTEMPTS_SQL, {"user_id": uid}).mappings()
        return [
            AttemptRow(
                session_id=str(r["session_id"]),
                started_at=r["started_at"],
                total_score=float(r["total_score"]) if r["total_score"] is not None else None,
                critical_missed=bool(r["critical_missed"]),
                rubric_version=int(r["rubric_version"]),
            )
            for r in rows
        ]

    def criterion_counts(self, user_id: str) -> list[CriterionCountRow]:
        uid = _uuid_or_none(user_id)
        if uid is None:
            return []
        rows = self.db.execute(_CRITERIA_SQL, {"user_id": uid}).mappings()
        return [
            CriterionCountRow(
                rubric_version=int(r["rubric_version"]),
                criterion_id=r["criterion_id"],
                criterion=r["criterion"],
                attempts=int(r["attempts"]),
                met=int(r["met"]),
                partial=int(r["partial"]),
            )
            for r in rows
        ]


class InMemoryHistoryRepository:
    """Same semantics as the SQL repository, over in-memory records (tests, dev)."""

    def __init__(
        self,
        sessions: Mapping[str, SessionRecord],
        evaluations: Iterable[EvaluationRecord],
        cases: Mapping[tuple[str, int], dict] | None = None,
    ) -> None:
        self.sessions = sessions
        self.evaluations = evaluations
        self.cases = cases or {}

    def _latest(self, session_id: str) -> EvaluationRecord | None:
        mine = [e for e in self.evaluations if e.session_id == session_id]
        return max(mine, key=lambda e: e.created_at) if mine else None

    def _mine(self, user_id: str) -> list[SessionRecord]:
        rows = [s for s in self.sessions.values() if s.user_id == user_id]
        rows.sort(key=lambda s: (s.started_at, s.id), reverse=True)
        return rows

    def list_for_user(
        self, user_id: str, limit: int, after: Cursor | None
    ) -> list[SessionSummaryRow]:
        rows = self._mine(user_id)
        if after is not None:
            rows = [s for s in rows if (s.started_at, s.id) < after]
        out = []
        for s in rows[:limit]:
            ev = self._latest(s.id)
            title = (self.cases.get((s.case_id, s.case_version)) or {}).get("title") or {}
            out.append(
                SessionSummaryRow(
                    id=s.id,
                    case_id=s.case_id,
                    case_title=title.get("vi") if isinstance(title, dict) else None,
                    mode=s.mode,
                    status=s.status,
                    started_at=s.started_at,
                    ended_at=getattr(s, "ended_at", None),
                    evaluation_status=ev.status if ev else None,
                    total_score=ev.total_score if ev else None,
                    critical_missed=ev.critical_missed if ev else False,
                )
            )
        return out

    def _done(self, user_id: str) -> list[tuple[SessionRecord, EvaluationRecord]]:
        pairs = []
        for s in sorted(self._mine(user_id), key=lambda s: (s.started_at, s.id)):
            ev = self._latest(s.id)
            if ev is not None and ev.status == "done":
                pairs.append((s, ev))
        return pairs

    def done_attempts(self, user_id: str) -> list[AttemptRow]:
        return [
            AttemptRow(
                session_id=s.id,
                started_at=s.started_at,
                total_score=ev.total_score,
                critical_missed=ev.critical_missed,
                rubric_version=ev.rubric_version,
            )
            for s, ev in self._done(user_id)
        ]

    def criterion_counts(self, user_id: str) -> list[CriterionCountRow]:
        acc: dict[tuple[int, str], CriterionCountRow] = {}
        order: dict[tuple[int, str], int] = {}
        for s, ev in self._done(user_id):
            items = ((self.cases.get((s.case_id, s.case_version)) or {}).get("rubric") or {}).get(
                "items"
            ) or []
            meta = {c.get("id"): (i, c) for i, c in enumerate(items)}
            for v in ev.items:
                key = (ev.rubric_version, v.criterion_id)
                pos, c = meta.get(v.criterion_id, (None, {}))
                row = acc.get(key)
                if row is None:
                    row = acc[key] = CriterionCountRow(
                        rubric_version=ev.rubric_version,
                        criterion_id=v.criterion_id,
                        criterion=c.get("criterion"),
                        attempts=0,
                        met=0,
                        partial=0,
                    )
                if pos is not None:
                    order[key] = min(order.get(key, pos), pos)
                row.attempts += 1
                row.met += v.status == "met"
                row.partial += v.status == "partial"
        big = 1 << 30
        return sorted(
            acc.values(),
            key=lambda r: (
                r.rubric_version,
                order.get((r.rubric_version, r.criterion_id), big),
                r.criterion_id,
            ),
        )
