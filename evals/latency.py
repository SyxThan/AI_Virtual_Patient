"""Measure turn latency over the real WebSocket loop (AVP-026, TASK-S14-03).

The FastAPI app runs in-process with in-memory repositories (no database, no
running dev server) and the real case JSON, so the Patient Agent prompt is the
production one. Each synthetic student question goes through /ws/sessions/{id}
exactly as the browser sends it, and we record:

  server side (the "timing" message): stt_ms, llm_ms, tts_ms
  client side (perf_counter around the socket): first_text_ms (question sent ->
  patient transcript), first_audio_ms (question sent -> patient audio)

The target "first audio < 1.5 s" is a target, not a result (Hard rule 3). What
this script writes to evals/results/ is the only latency anyone may quote.
Not measured here: browser recording/playback and network to a remote host.

Usage (from the repo root):
  python evals/latency.py                          # fake providers, CI smoke
  python evals/latency.py --providers env --mode voice --sessions 3
Output stores numbers and provider names only, never question/answer text,
audio or tokens.
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import os
import sys
import time
import uuid
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common  # noqa: E402

common.use_api_package()

CASE_PATH = common.REPO_ROOT / "data" / "cases" / "case-01-hfmd.json"
TARGET_FIRST_AUDIO_MS = 1500  # proposal target, reported next to the measurement
GUEST_TOKEN = "eval-latency-guest"  # synthetic, only valid inside this process
# Synthetic history-taking questions (written for this eval, no student data).
QUESTIONS = [
    "Chào chị, em là sinh viên y. Hôm nay bé bị sao ạ?",
    "Bé bị sốt từ bao giờ ạ?",
    "Chị có đo nhiệt độ cho bé không, cao nhất bao nhiêu độ?",
    "Bé có bị nổi ban hay mụn nước ở đâu không chị?",
    "Bé ăn uống, bú có được không ạ?",
    "Bé có hay giật mình hay quấy khóc nhiều không chị?",
    "Ở nhà hay ở lớp có bạn nào bị giống bé không ạ?",
    "Bé đã uống thuốc gì chưa chị?",
]
FAKE_AUDIO = b"\x1aE\xdf\xa3" + b"\x00" * 2048  # synthetic bytes for fake STT


@dataclass
class TurnResult:
    session: int
    question: int
    warmup: bool
    stt_ms: int | None = None
    llm_ms: int | None = None
    tts_ms: int | None = None
    first_text_ms: int | None = None
    first_audio_ms: int | None = None
    errors: list[str] = field(default_factory=list)


def _load_case() -> dict:
    return json.loads(CASE_PATH.read_text(encoding="utf-8"))


def _make_repos(session_id: str, case: dict):
    from avp_api.db.repositories.session_repo import SessionRecord
    from avp_api.db.repositories.turn_repo import TurnRecord

    version = int(case.get("version", 1))

    class SessionRepo:
        def get(self, sid: str) -> SessionRecord | None:
            if sid != session_id:
                return None
            return SessionRecord(
                id=session_id,
                case_id=case["id"],
                case_version=version,
                mode="guided",
                status="active",
                user_id=None,
                guest_token_hash=hashlib.sha256(GUEST_TOKEN.encode()).hexdigest(),
                consented_at=None,
                state={"role": "student"},
                started_at=datetime.now(UTC),
            )

        def get_case_content(self, case_id: str, v: int) -> dict | None:
            return case if case_id == case["id"] else None

        def active_case_version(self, case_id: str) -> int | None:
            return version

    class TurnRepo:
        def __init__(self) -> None:
            self.rows: list[TurnRecord] = []

        def next_idx(self, sid: str) -> int:
            return len(self.rows)

        def add(self, **kw) -> TurnRecord:
            rec = TurnRecord(
                id=len(self.rows) + 1,
                session_id=kw["session_id"],
                idx=kw["idx"],
                speaker=kw["speaker"],
                text=kw["text"],
                t_start_ms=kw["t_start_ms"],
                created_at=datetime.now(UTC),
            )
            self.rows.append(rec)
            return rec

        def list_for_session(self, sid: str) -> list[TurnRecord]:
            return [r for r in self.rows if r.session_id == sid]

    return SessionRepo(), TurnRepo()


def _providers(kind: str):
    from avp_api.providers.llm import FakeLLMProvider, get_llm_provider
    from avp_api.providers.stt import FakeSTTProvider, get_stt_provider
    from avp_api.providers.tts import FakeTTSProvider, get_tts_provider

    if kind == "fake":
        return FakeLLMProvider(), FakeSTTProvider(), FakeTTSProvider()
    return get_llm_provider(), get_stt_provider(), get_tts_provider()


def _provider_name(p) -> str:
    return str(getattr(p, "name", None) or type(p).__name__)


def _question_audio(tts, stt_name: str, mode: str) -> list[bytes]:
    """Voice mode needs spoken questions. With a real STT we synthesize them once
    (untimed) with the configured TTS; with the fake STT any bytes do."""
    if mode != "voice":
        return []
    if stt_name == "fake":
        return [FAKE_AUDIO] * len(QUESTIONS)
    out = []
    for q in QUESTIONS:
        out.append(asyncio.run(tts.synthesize(q)))
    return out


def _run_turn(ws, payload, mode: str) -> TurnResult:
    res = TurnResult(session=0, question=0, warmup=False)
    t0 = time.perf_counter()
    if mode == "voice":
        for i in range(0, len(payload), 16384):
            ws.send_bytes(payload[i : i + 16384])
        ws.send_json({"type": "end"})
    else:
        ws.send_json({"type": "text", "text": payload})
    while True:
        msg = ws.receive_json()
        elapsed = int((time.perf_counter() - t0) * 1000)
        kind = msg.get("type")
        if kind == "transcript" and msg.get("speaker") == "patient":
            res.first_text_ms = elapsed
        elif kind == "audio":
            res.first_audio_ms = elapsed
        elif kind == "timing":
            res.stt_ms, res.llm_ms, res.tts_ms = msg["stt_ms"], msg["llm_ms"], msg["tts_ms"]
            return res
        elif kind == "error":
            code = str(msg.get("code"))
            res.errors.append(code)
            if code != "TTS_FAILED":  # STT/turn failure ends the turn with no timing
                return res


def run(providers: str, mode: str, sessions: int, warmup: int) -> dict:
    from fastapi.testclient import TestClient

    from avp_api.main import create_app
    from avp_api.routers import websocket as ws_router

    case = _load_case()
    llm, stt, tts = _providers(providers)
    names = {"llm": _provider_name(llm), "stt": _provider_name(stt), "tts": _provider_name(tts)}
    audio = _question_audio(tts, names["stt"], mode)

    turns: list[TurnResult] = []
    for s in range(sessions):
        session_id = str(uuid.uuid4())
        session_repo, turn_repo = _make_repos(session_id, case)

        @contextmanager
        def factory(sr=session_repo, tr=turn_repo):
            yield sr, tr

        app = create_app()
        app.dependency_overrides[ws_router.get_repo_factory] = lambda f=factory: f
        app.dependency_overrides[ws_router.get_ws_llm] = lambda: llm
        app.dependency_overrides[ws_router.get_ws_stt] = lambda: stt
        app.dependency_overrides[ws_router.get_ws_tts] = lambda: tts
        with TestClient(app).websocket_connect(f"/ws/sessions/{session_id}") as ws:
            ws.send_json({"type": "auth", "token": GUEST_TOKEN})
            if ws.receive_json().get("type") != "ready":
                raise RuntimeError("WebSocket auth failed")
            for q_idx, question in enumerate(QUESTIONS):
                payload = audio[q_idx] if mode == "voice" else question
                res = _run_turn(ws, payload, mode)
                res.session, res.question = s, q_idx
                res.warmup = len(turns) < warmup
                turns.append(res)

    measured = [t for t in turns if not t.warmup]

    def col(attr: str) -> list[float]:
        return [v for t in measured if (v := getattr(t, attr)) is not None]

    first_audio = col("first_audio_ms")
    p95 = common.percentile(first_audio, 95)
    error_counts: dict[str, int] = {}
    for t in measured:
        for code in t.errors:
            error_counts[code] = error_counts.get(code, 0) + 1

    fake = any("fake" in n.lower() for n in names.values())
    return {
        **common.run_metadata("evals/latency.py"),
        "config": {
            "providers": providers,
            "provider_names": names,
            "mode": mode,
            "sessions": sessions,
            "questions_per_session": len(QUESTIONS),
            "warmup_turns_excluded": min(warmup, len(turns)),
            "case_id": case["id"],
            "case_version": int(case.get("version", 1)),
            "setup": "in-process FastAPI + WebSocket, in-memory repos; "
            "excludes browser audio capture/playback and network",
        },
        "contains_fake_provider": fake,
        "note": (
            "At least one provider is fake: these numbers do not describe the real system."
            if fake
            else "All providers real as configured in .env on the measuring machine."
        ),
        "summary_ms": {
            "stt_ms": common.summarize(col("stt_ms")),
            "llm_ms": common.summarize(col("llm_ms")),
            "tts_ms": common.summarize(col("tts_ms")),
            "first_text_ms": common.summarize(col("first_text_ms")),
            "first_audio_ms": common.summarize(first_audio),
        },
        "target": {
            "metric": "first_audio_ms p95",
            "target_ms": TARGET_FIRST_AUDIO_MS,
            "measured_ms": p95,
            # Never claim a target against fake providers.
            "met": None if p95 is None or fake else p95 < TARGET_FIRST_AUDIO_MS,
        },
        "turns_total": len(measured),
        "turns_with_errors": sum(1 for t in measured if t.errors),
        "error_counts": error_counts,
        "turns": [
            {
                "session": t.session,
                "question": t.question,
                "stt_ms": t.stt_ms,
                "llm_ms": t.llm_ms,
                "tts_ms": t.tts_ms,
                "first_text_ms": t.first_text_ms,
                "first_audio_ms": t.first_audio_ms,
                "errors": t.errors,
            }
            for t in measured
        ],
    }


def main(argv: list[str] | None = None, out_dir: Path | None = None) -> Path:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--providers", choices=["fake", "env"], default="fake")
    ap.add_argument("--mode", choices=["text", "voice"], default="text")
    ap.add_argument("--sessions", type=int, default=3)
    ap.add_argument("--warmup", type=int, default=1, help="leading turns left out of stats")
    ap.add_argument("--out", type=Path, default=None, help="default: evals/results/")
    args = ap.parse_args(argv)
    if args.sessions < 1 or args.warmup < 0:
        ap.error("--sessions must be >= 1 and --warmup >= 0")

    target = (args.out or out_dir or common.RESULTS_DIR).resolve()
    # Read .env exactly like the API server does (config.py paths are cwd-relative).
    os.chdir(common.API_DIR)
    result = run(args.providers, args.mode, args.sessions, args.warmup)
    path = common.write_result(f"latency-{args.mode}", result, target)
    fa = result["summary_ms"]["first_audio_ms"]
    print(
        f"turns={result['turns_total']} errors={result['turns_with_errors']} "
        f"first_audio p50={fa['p50']} p95={fa['p95']} ms "
        f"(fake={result['contains_fake_provider']}) -> {path}"
    )
    return path


if __name__ == "__main__":
    main()
