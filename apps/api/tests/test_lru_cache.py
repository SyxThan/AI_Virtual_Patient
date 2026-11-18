"""BoundedLRU (AVP-167): bounded by entries and by total size."""

from __future__ import annotations

from avp_api.providers.cache import BoundedLRU


def test_evicts_least_recently_used_entry() -> None:
    c: BoundedLRU[str, int] = BoundedLRU(2)
    c.put("a", 1)
    c.put("b", 2)
    assert c.get("a") == 1  # a is now the most recent
    c.put("c", 3)
    assert c.get("b") is None and c.get("a") == 1 and c.get("c") == 3
    assert len(c) == 2


def test_size_budget_evicts_and_refuses_oversized_values() -> None:
    c: BoundedLRU[str, bytes] = BoundedLRU(10, max_size=10, size_of=len)
    c.put("a", b"12345")
    c.put("b", b"12345")
    c.put("c", b"123")  # 13 > 10: a goes
    assert c.get("a") is None and c.get("b") and c.get("c")
    c.put("huge", b"x" * 11)  # never kept, evicts nothing
    assert c.get("huge") is None and len(c) == 2


def test_replacing_a_key_keeps_the_size_right() -> None:
    c: BoundedLRU[str, bytes] = BoundedLRU(10, max_size=6, size_of=len)
    c.put("a", b"123456")
    c.put("a", b"12")
    c.put("b", b"1234")
    assert c.get("a") == b"12" and c.get("b") == b"1234"


def test_hit_and_miss_counters_and_clear() -> None:
    c: BoundedLRU[str, int] = BoundedLRU(4)
    c.put("a", 1)
    c.get("a")
    c.get("zz")
    assert (c.hits, c.misses) == (1, 1)
    c.clear()
    assert len(c) == 0 and (c.hits, c.misses) == (0, 0)
