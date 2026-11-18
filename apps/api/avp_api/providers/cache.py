"""A small thread-safe, in-process LRU cache (AVP-167).

Used for repeated TTS lines (tier-3 fallback lines, short repeated answers) and
for the deterministic debrief retrieval queries. Bounded by entry count and,
optionally, by total size, so it can never grow without limit. Process-local on
purpose: no Redis (small-team default); a restart simply starts cold.
"""

from __future__ import annotations

import threading
from collections import OrderedDict
from collections.abc import Callable, Hashable


class BoundedLRU[K: Hashable, V]:
    def __init__(
        self,
        max_entries: int,
        max_size: int | None = None,
        size_of: Callable[[V], int] | None = None,
    ) -> None:
        if max_entries < 1:
            raise ValueError("max_entries must be >= 1")
        self._max_entries = max_entries
        self._max_size = max_size
        self._size_of = size_of or (lambda _v: 0)
        self._data: OrderedDict[K, V] = OrderedDict()
        self._size = 0
        self._lock = threading.Lock()
        self.hits = 0
        self.misses = 0

    def get(self, key: K) -> V | None:
        with self._lock:
            value = self._data.get(key)
            if value is None:
                self.misses += 1
                return None
            self._data.move_to_end(key)
            self.hits += 1
            return value

    def put(self, key: K, value: V) -> None:
        size = self._size_of(value)
        with self._lock:
            if self._max_size is not None and size > self._max_size:
                return  # one value larger than the whole budget is never kept
            old = self._data.pop(key, None)
            if old is not None:
                self._size -= self._size_of(old)
            self._data[key] = value
            self._size += size
            while len(self._data) > self._max_entries or (
                self._max_size is not None and self._size > self._max_size
            ):
                _, evicted = self._data.popitem(last=False)
                self._size -= self._size_of(evicted)

    def clear(self) -> None:
        with self._lock:
            self._data.clear()
            self._size = 0
            self.hits = 0
            self.misses = 0

    def __len__(self) -> int:
        with self._lock:
            return len(self._data)
