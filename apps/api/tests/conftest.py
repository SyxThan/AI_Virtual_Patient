"""Shared test setup: process-wide caches start empty in every test (AVP-167),
so one test's synthesized line or embedded query never leaks into another."""

from __future__ import annotations

import pytest

from avp_api.providers.embeddings import query_cache
from avp_api.providers.tts import tts_cache


@pytest.fixture(autouse=True)
def _empty_process_caches():
    tts_cache().clear()
    query_cache().clear()
    yield
    tts_cache().clear()
    query_cache().clear()
