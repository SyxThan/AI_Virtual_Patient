"""Guest-session retention cleanup (Slice 13, AVP-115; database.md "Security" 6).

    python -m avp_api.jobs.cleanup [--dry-run] [--days N]

Deletes guest sessions (user_id IS NULL) that started more than
GUEST_RETENTION_DAYS days ago; their turns, evaluations, evaluation_items,
debriefs, jobs and fallback_hits go with them by FK cascade. Sessions of
signed-in users are never touched (they are deleted by their owner, DELETE /me).

The retention period is a proposal: OPEN_QUESTIONS "Câu hỏi 7" is undecided, so
the default of 30 days is only a placeholder until the team decides.

Not scheduled automatically: run it by hand or from an external scheduler. It
prints counts only, never session ids or content.
"""

from __future__ import annotations

import argparse
import datetime
from collections.abc import Callable
from dataclasses import dataclass

from avp_api.db.repositories.privacy_repo import PrivacyRepository


@dataclass
class CleanupResult:
    retention_days: int
    expired: int
    deleted: int
    dry_run: bool

    def summary(self) -> str:
        verb = "would delete" if self.dry_run else "deleted"
        return (
            f"guest cleanup: retention_days={self.retention_days} "
            f"expired={self.expired} {verb}={self.expired if self.dry_run else self.deleted}"
        )


def cutoff_for(now: datetime.datetime, retention_days: int) -> datetime.datetime:
    if retention_days < 1:
        raise ValueError("retention_days must be >= 1")
    return now - datetime.timedelta(days=retention_days)


def run_cleanup(
    repo: PrivacyRepository,
    retention_days: int,
    *,
    dry_run: bool = False,
    now: Callable[[], datetime.datetime] = lambda: datetime.datetime.now(datetime.UTC),
) -> CleanupResult:
    cutoff = cutoff_for(now(), retention_days)
    expired = repo.count_expired_guest_sessions(cutoff)
    deleted = 0 if dry_run else repo.delete_expired_guest_sessions(cutoff)
    return CleanupResult(retention_days, expired, deleted, dry_run)


def main(argv: list[str] | None = None) -> int:
    from avp_api.config import get_settings
    from avp_api.db.repositories.privacy_repo import SqlPrivacyRepository
    from avp_api.db.session import _maker

    parser = argparse.ArgumentParser(description="Delete expired guest sessions")
    parser.add_argument("--dry-run", action="store_true", help="count only, delete nothing")
    parser.add_argument(
        "--days",
        type=int,
        default=None,
        help="override GUEST_RETENTION_DAYS (must be >= 1)",
    )
    args = parser.parse_args(argv)
    days = args.days if args.days is not None else get_settings().guest_retention_days
    if days < 1:
        parser.error("--days must be >= 1")
    with _maker()() as db:
        result = run_cleanup(SqlPrivacyRepository(db), days, dry_run=args.dry_run)
    print(result.summary())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
