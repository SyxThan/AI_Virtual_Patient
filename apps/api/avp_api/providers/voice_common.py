"""Shared helpers for the voice adapters (STT/TTS, ADR-0006).

Typed failures so callers (the WebSocket loop) can degrade to text instead of
crashing, plus a timed wrapper that reports the *measured* elapsed time of each
call. Nothing here logs audio, transcripts or keys.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
import urllib.error
import urllib.request
from collections.abc import Awaitable
from dataclasses import dataclass

logger = logging.getLogger("avp_api.voice")


class VoiceProviderError(Exception):
    """A voice provider failed or timed out. Message is safe to log (no secrets)."""

    def __init__(self, kind: str, reason: str) -> None:
        super().__init__(f"{kind}: {reason}")
        self.kind = kind  # "stt" | "tts"
        self.reason = reason  # "timeout" | "provider_error" | "empty_result" | ...


@dataclass(frozen=True)
class Timed[T]:
    value: T
    elapsed_ms: int


async def run_timed[T](
    kind: str, provider_name: str, call: Awaitable[T], timeout_s: float
) -> Timed[T]:
    """Await `call` with a timeout; measure elapsed ms; map every failure to
    VoiceProviderError. Logs only provider name, outcome and elapsed ms."""
    started = time.perf_counter()
    try:
        value = await asyncio.wait_for(call, timeout=timeout_s)
    except TimeoutError as exc:
        ms = int((time.perf_counter() - started) * 1000)
        logger.warning("%s provider=%s outcome=timeout elapsed_ms=%d", kind, provider_name, ms)
        raise VoiceProviderError(kind, "timeout") from exc
    except VoiceProviderError:
        ms = int((time.perf_counter() - started) * 1000)
        logger.warning("%s provider=%s outcome=error elapsed_ms=%d", kind, provider_name, ms)
        raise
    except Exception as exc:  # noqa: BLE001 - any provider failure must become typed
        ms = int((time.perf_counter() - started) * 1000)
        logger.warning(
            "%s provider=%s outcome=error type=%s elapsed_ms=%d",
            kind,
            provider_name,
            type(exc).__name__,
            ms,
        )
        raise VoiceProviderError(kind, "provider_error") from exc
    ms = int((time.perf_counter() - started) * 1000)
    logger.info("%s provider=%s outcome=ok elapsed_ms=%d", kind, provider_name, ms)
    return Timed(value=value, elapsed_ms=ms)


def post_json(url: str, payload: dict, api_key: str, timeout_s: float) -> dict:
    """Blocking JSON POST using the stdlib (no extra runtime dependency). The key
    goes in a header, never the URL, so it cannot leak into access logs."""
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "X-Goog-Api-Key": api_key},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout_s) as resp:  # noqa: S310 - fixed https URL
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        # Status code only; the body may echo request details.
        raise RuntimeError(f"HTTP {exc.code}") from None
