"""Read-aloud of a saved patient turn (Slice 16, AVP-133).

POST /api/v1/sessions/{id}/turns/{turn_idx}/speech: ownership like every session
route, only patient turns, 204 without a real TTS provider, 503 on TTS failure.
In-memory fakes, synthetic text, no network.
"""

from __future__ import annotations

import asyncio
import dataclasses
import logging

from fastapi.testclient import TestClient

from avp_api.auth import current_user_id
from avp_api.main import create_app
from avp_api.providers.llm import FakeLLMProvider
from avp_api.providers.tts import FakeTTSProvider, TTSProvider
from avp_api.routers import turns
from tests.test_turns import GOOD, SID, FakeSessionRepo, FakeTurnRepo

USER = "11111111-1111-4111-8111-111111111111"
AUDIO = b"RIFF-synthetic-not-speech"


class RecordingTTS(TTSProvider):
    name = "test"
    mime = "audio/wav"

    def __init__(self, fail: bool = False) -> None:
        self.fail = fail
        self.texts: list[str] = []

    async def synthesize(self, text: str, voice_id: str | None = None) -> bytes:
        self.texts.append(text)
        if self.fail:
            raise RuntimeError("provider exploded with secret detail")
        return AUDIO


class SlowTTS(RecordingTTS):
    async def synthesize(self, text: str, voice_id: str | None = None) -> bytes:
        await asyncio.sleep(5)
        return AUDIO


class OwnedSessionRepo(FakeSessionRepo):
    """The same session, owned by a signed-in user (no guest token)."""

    def get(self, session_id: str):
        rec = super().get(session_id)
        return rec and dataclasses.replace(rec, user_id=USER, guest_token_hash=None)


def _app(tts: TTSProvider, session_repo=None, user: str | None = None):
    repo = FakeTurnRepo()
    app = create_app()
    app.dependency_overrides[turns.get_session_repo] = lambda: session_repo or FakeSessionRepo()
    app.dependency_overrides[turns.get_turn_repo] = lambda: repo
    app.dependency_overrides[turns.get_provider] = lambda: FakeLLMProvider()
    app.dependency_overrides[turns.get_tts] = lambda: tts
    app.dependency_overrides[current_user_id] = lambda: user
    return TestClient(app), repo


def _one_exchange(client: TestClient, headers: dict) -> dict:
    r = client.post(
        f"/api/v1/sessions/{SID}/turns",
        json={"text": "Cháu sốt mấy ngày rồi chị?"},
        headers=headers,
    )
    assert r.status_code == 200, r.text
    return r.json()


def test_speaks_the_saved_patient_turn():
    tts = RecordingTTS()
    client, _ = _app(tts)
    patient = _one_exchange(client, {"X-Guest-Token": GOOD})

    r = client.post(
        f"/api/v1/sessions/{SID}/turns/{patient['turn_idx']}/speech",
        headers={"X-Guest-Token": GOOD},
    )
    assert r.status_code == 200
    assert r.headers["content-type"] == "audio/wav"
    assert r.headers["cache-control"] == "no-store"
    assert r.content == AUDIO
    assert tts.texts == [patient["text"]]  # exactly the saved (guardrailed) text


def test_signed_in_owner_can_listen():
    tts = RecordingTTS()
    client, _ = _app(tts, session_repo=OwnedSessionRepo(), user=USER)
    patient = _one_exchange(client, {})
    r = client.post(f"/api/v1/sessions/{SID}/turns/{patient['turn_idx']}/speech")
    assert r.status_code == 200


def test_other_user_and_wrong_guest_get_404_and_nothing_is_synthesized():
    tts = RecordingTTS()
    client, _ = _app(tts)
    patient = _one_exchange(client, {"X-Guest-Token": GOOD})
    url = f"/api/v1/sessions/{SID}/turns/{patient['turn_idx']}/speech"

    assert client.post(url, headers={"X-Guest-Token": "wrong"}).status_code == 404
    assert client.post(url).status_code == 404  # no credentials at all

    owned_tts = RecordingTTS()
    owned, _ = _app(owned_tts, session_repo=OwnedSessionRepo(), user="someone-else")
    assert owned.post(url).status_code == 404
    assert tts.texts == [] and owned_tts.texts == []


def test_student_turn_and_missing_turn_are_404():
    tts = RecordingTTS()
    client, _ = _app(tts)
    patient = _one_exchange(client, {"X-Guest-Token": GOOD})
    h = {"X-Guest-Token": GOOD}

    student_idx = patient["turn_idx"] - 1
    r = client.post(f"/api/v1/sessions/{SID}/turns/{student_idx}/speech", headers=h)
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "TURN_NOT_FOUND"
    assert client.post(f"/api/v1/sessions/{SID}/turns/99/speech", headers=h).status_code == 404
    assert client.post(f"/api/v1/sessions/{SID}/turns/abc/speech", headers=h).status_code == 422
    assert tts.texts == []


def test_unknown_session_is_404():
    client, _ = _app(RecordingTTS())
    r = client.post(
        "/api/v1/sessions/00000000-0000-4000-8000-000000000999/turns/1/speech",
        headers={"X-Guest-Token": GOOD},
    )
    assert r.status_code == 404


def test_fake_provider_returns_204_without_audio():
    client, _ = _app(FakeTTSProvider())
    patient = _one_exchange(client, {"X-Guest-Token": GOOD})
    r = client.post(
        f"/api/v1/sessions/{SID}/turns/{patient['turn_idx']}/speech",
        headers={"X-Guest-Token": GOOD},
    )
    assert r.status_code == 204
    assert r.content == b""


def test_tts_failure_is_503_without_leaking_and_turns_stay(caplog):
    tts = RecordingTTS(fail=True)
    client, repo = _app(tts)
    patient = _one_exchange(client, {"X-Guest-Token": GOOD})
    caplog.set_level(logging.DEBUG)

    r = client.post(
        f"/api/v1/sessions/{SID}/turns/{patient['turn_idx']}/speech",
        headers={"X-Guest-Token": GOOD},
    )
    assert r.status_code == 503
    assert r.json()["error"]["code"] == "TTS_UNAVAILABLE"
    assert "secret detail" not in r.text
    assert patient["text"] not in caplog.text  # the reply text is never logged
    assert "secret detail" not in caplog.text
    assert [t.speaker for t in repo.rows] == ["student", "patient"]  # nothing added or lost


def test_tts_timeout_is_503(monkeypatch):
    from avp_api.config import Settings
    from avp_api.providers import tts as tts_mod

    s = Settings(_env_file=None, tts_timeout_s=0.2)
    monkeypatch.setattr(tts_mod, "get_settings", lambda: s)
    client, _ = _app(SlowTTS())
    patient = _one_exchange(client, {"X-Guest-Token": GOOD})
    r = client.post(
        f"/api/v1/sessions/{SID}/turns/{patient['turn_idx']}/speech",
        headers={"X-Guest-Token": GOOD},
    )
    assert r.status_code == 503
