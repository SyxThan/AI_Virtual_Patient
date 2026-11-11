"""Cold-path job worker (Slice 7, AVP-014; ADR-0004 Postgres job queue).

Two ways to run the same code:
- standalone: `python -m avp_api.jobs.worker [--once]` polls `jobs` with
  FOR UPDATE SKIP LOCKED (safe with several workers);
- in-process: POST /sessions/{id}/finish schedules `run_job_by_id` as a FastAPI
  BackgroundTask so a single-process dev setup never stays "pending" forever.
Both claim the job atomically, so a job never runs twice.
"""

from __future__ import annotations

import argparse
import logging
import time
from collections.abc import Callable

from avp_api.db.repositories.evaluation_repo import (
    EvaluationRecord,
    EvaluationRepository,
    SqlEvaluationRepository,
)
from avp_api.db.repositories.job_repo import JobRecord, JobRepository, SqlJobRepository
from avp_api.db.repositories.session_repo import SessionRepository, SqlSessionRepository
from avp_api.db.repositories.turn_repo import SqlTurnRepository, TurnRepository
from avp_api.providers.llm import LLMProvider, get_evaluator_provider
from avp_api.services.evaluator_agent import PROMPT_VERSION, EvaluatorError, evaluate_transcript
from avp_api.services.scoring_engine import SCORING_VERSION

logger = logging.getLogger("avp_api.worker")


def _save_failed(
    eval_repo: EvaluationRepository,
    session_id: str,
    code: str,
    model: str,
    rubric_version: int,
) -> EvaluationRecord:
    return eval_repo.save(
        session_id=session_id,
        status="failed",
        model=model,
        prompt_version=PROMPT_VERSION,
        rubric_version=rubric_version,
        scoring_version=SCORING_VERSION,
        total_score=None,
        critical_missed=False,
        error=code,
        items=[],
    )


def process_evaluate_job(
    session_id: str,
    session_repo: SessionRepository,
    turn_repo: TurnRepository,
    eval_repo: EvaluationRepository,
    provider: LLMProvider,
) -> EvaluationRecord:
    """Transcript + pinned case rubric -> Evaluator (propose) -> verifier ->
    scoring -> persist. Never raises for an evaluation failure: it stores a
    `failed` evaluation (with a safe error code) and marks the session failed."""
    sess = session_repo.get(session_id)
    if sess is None:
        raise LookupError("session not found")
    case = session_repo.get_case_content(sess.case_id, sess.case_version) or {}
    rubric_version = int((case.get("rubric") or {}).get("version", 0))

    if sess.consented_at is None:  # Hard Rule 6: no evaluation without consent
        session_repo.set_status(session_id, "failed")
        return _save_failed(eval_repo, session_id, "CONSENT_MISSING", "none", rubric_version)

    session_repo.set_status(session_id, "evaluating")
    try:
        outcome = evaluate_transcript(case, turn_repo.list_for_session(session_id), provider)
    except EvaluatorError as exc:
        logger.warning("evaluation failed session=%s code=%s", session_id, exc.code)
        session_repo.set_status(session_id, "failed")
        return _save_failed(eval_repo, session_id, exc.code, provider.model_id, rubric_version)

    rec = eval_repo.save(
        session_id=session_id,
        status="done",
        model=outcome.model,
        prompt_version=outcome.prompt_version,
        rubric_version=outcome.rubric_version,
        scoring_version=outcome.score.scoring_version,
        total_score=outcome.score.total_score,
        critical_missed=outcome.score.critical_missed,
        error=None,
        items=outcome.items,
    )
    session_repo.set_status(session_id, "evaluated")
    return rec


def execute_job(
    job: JobRecord,
    job_repo: JobRepository,
    session_repo: SessionRepository,
    turn_repo: TurnRepository,
    eval_repo: EvaluationRepository,
    provider: LLMProvider,
    rollback: Callable[[], None] = lambda: None,
) -> None:
    """Run one claimed job, then mark it done/failed. Repository-generic so the
    same code runs on Postgres and on in-memory fakes in tests."""
    try:
        if job.kind != "evaluate" or not job.session_id:
            raise ValueError(f"unsupported job kind {job.kind}")
        rec = process_evaluate_job(job.session_id, session_repo, turn_repo, eval_repo, provider)
    except Exception as exc:  # noqa: BLE001 - a job must never kill the worker
        rollback()
        logger.exception("job %s failed", job.id)
        job_repo.mark_failed(job.id, type(exc).__name__)
        if job.session_id:
            try:
                session_repo.set_status(job.session_id, "failed")
                _save_failed(eval_repo, job.session_id, "INTERNAL_ERROR", "unknown", 0)
            except Exception:  # noqa: BLE001
                rollback()
        return
    if rec.status == "done":
        job_repo.mark_done(job.id)
    else:
        job_repo.mark_failed(job.id, rec.error or "FAILED")


def run_job(job: JobRecord, db, provider: LLMProvider | None = None) -> None:
    execute_job(
        job,
        SqlJobRepository(db),
        SqlSessionRepository(db),
        SqlTurnRepository(db),
        SqlEvaluationRepository(db),
        provider or get_evaluator_provider(),
        rollback=db.rollback,
    )


def _open_db():
    from avp_api.db.session import _maker

    return _maker()()


def run_job_by_id(job_id: int) -> None:
    """BackgroundTasks entry point: claim exactly this job (if still queued) and run it."""
    with _open_db() as db:
        job = SqlJobRepository(db).claim_job(job_id)
        if job is not None:  # already taken by a standalone worker: nothing to do
            run_job(job, db)


def run_once() -> bool:
    with _open_db() as db:
        job = SqlJobRepository(db).claim_next_job()
        if job is None:
            return False
        run_job(job, db)
        return True


def main() -> None:
    parser = argparse.ArgumentParser(description="AVP cold-path job worker")
    parser.add_argument("--once", action="store_true", help="process queued jobs, then exit")
    parser.add_argument("--poll", type=float, default=2.0, help="seconds between polls")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO)
    while True:
        while run_once():
            pass
        if args.once:
            return
        time.sleep(args.poll)


if __name__ == "__main__":
    main()
