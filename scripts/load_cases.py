#!/usr/bin/env python
"""Load data/cases/*.json into the `cases` table (AVP-008, `make load-cases`).

Idempotent (docs/specs/database.md): hash each case; an unchanged file is a
no-op; a changed file deactivates the old active version and inserts a new one
(the partial unique index allows only one active version per case id). Files whose
name starts with "_" are illustrative examples and are skipped.
"""

from __future__ import annotations

import datetime
import hashlib
import json
import sys
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from avp_api.config import get_settings
from avp_api.db import models
from avp_api.db.session import get_engine

REPO_ROOT = Path(__file__).resolve().parents[1]
CASES_DIR = REPO_ROOT / "data" / "cases"


def content_hash(content: dict) -> str:
    return hashlib.sha256(
        json.dumps(content, sort_keys=True, ensure_ascii=False).encode("utf-8")
    ).hexdigest()


def _review_date(value: str | None) -> datetime.date | None:
    return datetime.date.fromisoformat(value) if value else None


def load_one(db: Session, path: Path) -> str:
    content = json.loads(path.read_text(encoding="utf-8"))
    case_id = content["id"]
    digest = content_hash(content)

    active = db.execute(
        select(models.Case).where(models.Case.id == case_id, models.Case.is_active.is_(True))
    ).scalar_one_or_none()
    if active is not None and active.content_hash == digest:
        return f"unchanged (v{active.version})"

    max_version = (
        db.execute(select(func.max(models.Case.version)).where(models.Case.id == case_id)).scalar()
        or 0
    )
    if active is not None:
        active.is_active = False
        db.flush()  # deactivate before inserting the new active version

    review = content.get("review", {})
    db.add(
        models.Case(
            id=case_id,
            version=max_version + 1,
            content=content,
            content_hash=digest,
            review_status=review.get("status", "draft"),
            reviewer=review.get("reviewer"),
            reviewed_at=_review_date(review.get("date")),
            is_active=True,
        )
    )
    return f"loaded v{max_version + 1}"


def main() -> int:
    if not get_settings().database_url:
        print("DATABASE_URL is not set; configure .env (see .env.example)", file=sys.stderr)
        return 2
    paths = sorted(p for p in CASES_DIR.glob("*.json") if not p.name.startswith("_"))
    if not paths:
        print("no case files to load")
        return 0
    with Session(get_engine()) as db:
        for path in paths:
            print(f"{path.name}: {load_one(db, path)}")
        db.commit()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
