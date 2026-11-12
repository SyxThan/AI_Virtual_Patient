"""Cold-path job worker (Slice 7, AVP-014; ADR-0004 Postgres job queue).

Two ways to run the same code:
- standalone: `python -m avp_api.jobs.worker [--once]` polls `jobs` with
  FOR UPDATE SKIP LOCKED (safe with several workers);
- in-process: POST /sessions/{id}/finish schedules `run_job_by_id` as a FastAPI
  BackgroundTask so a single-process dev setup never stays "pending" forever.
Both claim the job atomically, so a job never runs twice.

Chaining (Slice 8, AVP-019): a successful `evaluate` job enqueues a `debrief`
job. The in-process runner claims and runs it right away; otherwise any worker
picks it up from the queue.
"""

from __future__ import annotations

import argparse
import logging
import time
from collections.abc import Callable
from dataclasses import dataclass

from avp_api.db.repositories.debrief_repo import (
    DebriefRecord,
    DebriefRepository,
    SqlDebriefRepository,
)
from avp_api.db.repositories.evaluation_repo import (
    EvaluationRecord,
    EvaluationRepository,
    SqlEvaluationRepository,
)
from avp_api.db.repositories.job_repo import JobRecord, JobRepository, SqlJobRepository
from avp_api.db.repositories.rag_repo import RagRepository, SqlRagRepository
from avp_api.db.repositories.session_repo import SessionRepository, SqlSessionRepository
from avp_api.db.repositories.turn_repo import SqlTurnRepository, TurnRepository
from avp_api.providers.embeddings import EmbeddingProvider, get_embedding_provider
from avp_api.providers.llm import LLMProvider, get_evaluator_provider
from avp_api.services import debrief_agent
from avp_api.services.debrief_agent import DebriefError, generate_debrief
from avp_api.services.evaluator_agent import PROMPT_VERSION, EvaluatorError, evaluate_transcript
from avp_api.services.scoring_engine import SCORING_VERSION

logger = logging.getLogger("avp_api.worker")

EVALUATE, DEBRIEF = "evaluate", "debrief"


@dataclass
class DebriefDeps:
    """What a `debrief` job needs beyond the evaluate-job repositories."""

    debrief_repo: DebriefRepository
    rag_repo: RagRepository
    embedder: EmbeddingProvider
    llm: LLMProvider


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


def _failed_debrief(code: str, model: str = "none") -> dict:
    return {
        "status": "failed",
        "error": code,
        "model": model,
        "prompt_version": debrief_agent.PROMPT_VERSION,
    }


def process_debrief_job(
    session_id: str,
    session_repo: SessionRepository,
    turn_repo: TurnRepository,
    eval_repo: EvaluationRepository,
    deps: DebriefDeps,
) -> DebriefRecord:
    """Latest *done* evaluation + transcript -> Debriefing Agent (RAG + citation
    verifier) -> debriefs row. A DebriefError is stored as a failed debrief."""
    sess = session_repo.get(session_id)
    if sess is None:
        raise LookupError("session not found")
    evaluation = eval_repo.latest_for_session(session_id)
    if evaluation is None or evaluation.status != "done":
        raise LookupError("no completed evaluation to debrief")

    def save(content: dict) -> DebriefRecord:
        return deps.debrief_repo.save(
            session_id=session_id, evaluation_id=evaluation.id, content=content
        )

    if sess.consented_at is None:  # Hard Rule 6
        return save(_failed_debrief("CONSENT_MISSING"))
    case = session_repo.get_case_content(sess.case_id, sess.case_version) or {}
    try:
        outcome = generate_debrief(
            case,
            evaluation,
            turn_repo.list_for_session(session_id),
            deps.rag_repo,
            deps.embedder,
            deps.llm,
        )
    except DebriefError as exc:
        logger.warning("debrief failed session=%s code=%s", session_id, exc.code)
        return save(_failed_debrief(exc.code, deps.llm.model_id))
    return save(outcome.content())


def execute_job(
    job: JobRecord,
    job_repo: JobRepository,
    session_repo: SessionRepository,
    turn_repo: TurnRepository,
    eval_repo: EvaluationRepository,
    provider: LLMProvider,
    rollback: Callable[[], None] = lambda: None,
    debrief: DebriefDeps | None = None,
) -> int | None:
    """Run one claimed job, then mark it done/failed. Returns the id of a follow-up
    job it enqueued (evaluate -> debrief), else None. Repository-generic so the
    same code runs on Postgres and on in-memory fakes in tests."""
    try:
        if not job.session_id:
            raise ValueError("job without session")
        if job.kind == EVALUATE:
            rec = process_evaluate_job(job.session_id, session_repo, turn_repo, eval_repo, provider)
            ok, error = rec.status == "done", rec.error
        elif job.kind == DEBRIEF and debrief is not None:
            drec = process_debrief_job(job.session_id, session_repo, turn_repo, eval_repo, debrief)
            ok, error = drec.content.get("status") == "done", drec.content.get("error")
        else:
            raise ValueError(f"unsupported job kind {job.kind}")
    except Exception as exc:  # noqa: BLE001 - a job must never kill the worker
        rollback()
        logger.exception("job %s failed", job.id)
        job_repo.mark_failed(job.id, type(exc).__name__)
        if job.session_id and job.kind == EVALUATE:
            try:
                session_repo.set_status(job.session_id, "failed")
                _save_failed(eval_repo, job.session_id, "INTERNAL_ERROR", "unknown", 0)
            except Exception:  # noqa: BLE001
                rollback()
        return None
    if not ok:
        job_repo.mark_failed(job.id, error or "FAILED")
        return None
    job_repo.mark_done(job.id)
    if job.kind == EVALUATE:
        try:
            return job_repo.enqueue_job(DEBRIEF, job.session_id)
        except Exception as exc:  # noqa: BLE001 - e.g. session deleted meanwhile (AVP-115)
            rollback()
            logger.warning("debrief enqueue skipped for job %s: %s", job.id, type(exc).__name__)
    return None


def run_job(job: JobRecord, db, provider: LLMProvider | None = None) -> int | None:
    llm = provider or get_evaluator_provider()
    return execute_job(
        job,
        SqlJobRepository(db),
        SqlSessionRepository(db),
        SqlTurnRepository(db),
        SqlEvaluationRepository(db),
        llm,
        rollback=db.rollback,
        debrief=DebriefDeps(
            debrief_repo=SqlDebriefRepository(db),
            rag_repo=SqlRagRepository(db),
            embedder=get_embedding_provider(),
            llm=llm,
        ),
    )


def _open_db():
    from avp_api.db.session import _maker

    return _maker()()


def run_job_by_id(job_id: int) -> None:
    """BackgroundTasks entry point: claim exactly this job (if still queued), run
    it, then run its follow-up (evaluate -> debrief) so a single-process dev setup
    never waits on a standalone worker."""
    next_id: int | None = job_id
    with _open_db() as db:
        while next_id is not None:
            job = SqlJobRepository(db).claim_job(next_id)
            if job is None:  # already taken by a standalone worker: nothing to do
                return
            next_id = run_job(job, db)


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
