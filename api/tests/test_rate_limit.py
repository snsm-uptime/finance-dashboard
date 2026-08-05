"""Unit tests for sliding-window rate limiter (Story 1.5.6)."""

from __future__ import annotations

import threading
import time

from application.rate_limit import RateLimitPolicy, SlidingWindowRateLimiter
from domain.errors import RateLimitedError


def test_rate_limited_error_locked_message_and_code() -> None:
    assert RateLimitedError.MESSAGE == "Too many attempts. Please try again later."
    assert RateLimitedError.CODE == "rate_limited"
    assert str(RateLimitedError()) == RateLimitedError.MESSAGE


def test_allows_under_threshold() -> None:
    limiter = SlidingWindowRateLimiter()
    policy = RateLimitPolicy(max_attempts=3, window_seconds=60)
    now = 1_000.0
    for _ in range(3):
        allowed, retry_after = limiter.check_and_consume("ip:1", policy, now=now)
        assert allowed is True
        assert retry_after == 0
        now += 0.1


def test_rejects_when_exceeded() -> None:
    limiter = SlidingWindowRateLimiter()
    policy = RateLimitPolicy(max_attempts=2, window_seconds=60)
    assert limiter.check_and_consume("ip:1", policy, now=100.0)[0] is True
    assert limiter.check_and_consume("ip:1", policy, now=101.0)[0] is True
    allowed, retry_after = limiter.check_and_consume("ip:1", policy, now=102.0)
    assert allowed is False
    assert retry_after == 58  # window - (102 - 100)


def test_resets_after_window() -> None:
    limiter = SlidingWindowRateLimiter()
    policy = RateLimitPolicy(max_attempts=1, window_seconds=10)
    assert limiter.check_and_consume("ip:1", policy, now=0.0)[0] is True
    assert limiter.check_and_consume("ip:1", policy, now=5.0)[0] is False
    assert limiter.check_and_consume("ip:1", policy, now=10.0)[0] is True


def test_key_isolation() -> None:
    limiter = SlidingWindowRateLimiter()
    policy = RateLimitPolicy(max_attempts=1, window_seconds=60)
    assert limiter.check_and_consume("a", policy, now=1.0)[0] is True
    assert limiter.check_and_consume("b", policy, now=1.0)[0] is True
    assert limiter.check_and_consume("a", policy, now=2.0)[0] is False
    assert limiter.check_and_consume("b", policy, now=2.0)[0] is False


def test_clear_resets_store() -> None:
    limiter = SlidingWindowRateLimiter()
    policy = RateLimitPolicy(max_attempts=1, window_seconds=60)
    assert limiter.check_and_consume("k", policy, now=1.0)[0] is True
    limiter.clear()
    assert limiter.check_and_consume("k", policy, now=2.0)[0] is True


def test_evicts_oldest_idle_when_over_max_keys() -> None:
    limiter = SlidingWindowRateLimiter(max_keys=2)
    policy = RateLimitPolicy(max_attempts=5, window_seconds=60)
    assert limiter.check_and_consume("a", policy, now=1.0)[0] is True
    assert limiter.check_and_consume("b", policy, now=2.0)[0] is True
    assert limiter.check_and_consume("c", policy, now=3.0)[0] is True
    # "a" should have been evicted; fresh allowance
    assert limiter.check_and_consume("a", policy, now=4.0)[0] is True


def test_concurrent_check_and_consume_respects_max() -> None:
    limiter = SlidingWindowRateLimiter()
    policy = RateLimitPolicy(max_attempts=50, window_seconds=60)
    results: list[bool] = []
    lock = threading.Lock()

    def worker() -> None:
        allowed, _ = limiter.check_and_consume("shared", policy, now=time.time())
        with lock:
            results.append(allowed)

    threads = [threading.Thread(target=worker) for _ in range(80)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert sum(1 for r in results if r) == 50
    assert sum(1 for r in results if not r) == 30


def test_peer_trusted_only_for_header_identity() -> None:
    from application.rate_limit import resolve_trusted_client_ip

    settings_trusted = ("127.0.0.1", "172.16.0.0/12", "testclient")
    assert (
        resolve_trusted_client_ip(
            peer_host="172.18.0.5",
            header_value="203.0.113.9",
            trusted_proxies=settings_trusted,
        )
        == "203.0.113.9"
    )
    assert (
        resolve_trusted_client_ip(
            peer_host="203.0.113.1",
            header_value="203.0.113.9",
            trusted_proxies=settings_trusted,
        )
        == "203.0.113.1"
    )
    assert (
        resolve_trusted_client_ip(
            peer_host="testclient",
            header_value=" 10.0.0.2 ",
            trusted_proxies=settings_trusted,
        )
        == "10.0.0.2"
    )
    assert (
        resolve_trusted_client_ip(
            peer_host="testclient",
            header_value=None,
            trusted_proxies=settings_trusted,
        )
        == "testclient"
    )


def test_invalid_header_ip_falls_back_to_peer() -> None:
    from application.rate_limit import resolve_trusted_client_ip

    assert (
        resolve_trusted_client_ip(
            peer_host="172.18.0.5",
            header_value="not-an-ip",
            trusted_proxies=("172.16.0.0/12",),
        )
        == "172.18.0.5"
    )


def test_policy_rejects_non_positive_or_over_cap() -> None:
    import pytest

    with pytest.raises(ValueError):
        RateLimitPolicy(max_attempts=0, window_seconds=60)
    with pytest.raises(ValueError):
        RateLimitPolicy(max_attempts=1, window_seconds=0)
    with pytest.raises(ValueError):
        RateLimitPolicy(max_attempts=10_001, window_seconds=60)


def test_empty_trusted_never_honors_header() -> None:
    from application.rate_limit import resolve_trusted_client_ip

    assert (
        resolve_trusted_client_ip(
            peer_host="172.18.0.5",
            header_value="203.0.113.9",
            trusted_proxies=(),
        )
        == "172.18.0.5"
    )
