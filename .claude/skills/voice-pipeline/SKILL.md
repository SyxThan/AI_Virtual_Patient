---
name: voice-pipeline
description: Use when building, debugging, or integrating the speech-to-text (STT), text-to-speech (TTS), WebSocket duplex audio stream, or audio buffering (`apps/api/avp_api/providers/` and `apps/web/src/hooks/useVoiceSession.ts`).
---

# Voice Pipeline (STT / TTS / WebSocket Duplex) Skill

Guidance for implementing the turn-based and duplex voice-to-voice communication pipeline between the student and the Patient Agent.

## Pipeline Architecture
```
[Microphone] ──(WebM Audio Chunks)──> [WebSocket /ws/sessions/{id}]
                                                  │
                                          [STT Adapter]
                                          (Whisper / Google / Fake)
                                                  │
                                          [Patient Agent LLM]
                                          (Cached Prompt + Guardrails)
                                                  │
                                          [TTS Adapter]
                                          (ElevenLabs / FPT.AI / Fake)
                                                  │
[Speaker Audio] <──(MP3/WAV Stream)── [WebSocket Audio Return]
```

## Provider Adapter Pattern (`apps/api/avp_api/providers/`)
All voice services must inherit from abstract base interfaces to support local mock testing:

```python
# stt.py
from abc import ABC, abstractmethod

class STTProvider(ABC):
    @abstractmethod
    async def transcribe(self, audio_bytes: bytes, language: str = "vi") -> str:
        """Transcribe audio bytes into text string."""
        pass

class FakeSTTProvider(STTProvider):
    async def transcribe(self, audio_bytes: bytes, language: str = "vi") -> str:
        # Returns a mock transcription for local offline testing
        return "Cháu bị sốt từ hôm qua và quấy khóc nhiều bác sĩ ạ."
```

```python
# tts.py
from abc import ABC, abstractmethod

class TTSProvider(ABC):
    @abstractmethod
    async def synthesize(self, text: str, voice_id: str | None = None) -> bytes:
        """Synthesize text into audio bytes."""
        pass

class FakeTTSProvider(TTSProvider):
    async def synthesize(self, text: str, voice_id: str | None = None) -> bytes:
        # Return a silent 0.5s MP3 header or synthetic sine wave beep
        return b"\xff\xfb\x90d\x00\x00\x00\x00"
```

## WebSocket Connection Protocol
1. Client establishes WebSocket to `/ws/sessions/{id}`.
2. First message sent by client must be the auth token:
   `{ "type": "auth", "token": "<supabase-jwt-or-guest-token>" }`
3. Streaming audio frames (format: `audio/webm;codecs=opus`).
4. End of speech detected via client-side VAD (Voice Activity Detection) or Push-To-Talk button release.
5. Server responds with events:
   - `{ "type": "transcript", "speaker": "student", "text": "..." }`
   - `{ "type": "transcript", "speaker": "patient", "text": "..." }`
   - `{ "type": "audio", "data": "<base64-encoded-audio>" }`

## Common Pitfalls
1. **Never send tokens in WebSocket URL:** URLs appear in access logs and proxy caches. Send token in the first handshake message.
2. **Audio Size Limits:** Limit audio chunks to max 5MB per turn to prevent denial-of-service memory exhaustion.
3. **Graceful Fallback:** When STT or TTS encounters a provider error or timeout, the session must remain intact and immediately fall back to text transcript without crashing.

