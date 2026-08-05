"""In-process sliding-window rate limiter (stdlib only — no Redis/slowapi).

Single-worker assumption: multi-worker deployments multiply the effective
allowance by worker count (acceptable for v1 single-api Compose).
"""

from __future__ import annotations

import ipaddress
import threading
import time
from collections.abc import Sequence
from dataclasses import dataclass

# Bound per-key stamp lists when operators mis-set AUTH_RATE_LIMIT_*_MAX.
MAX_ATTEMPTS_CAP = 10_000


@dataclass(frozen=True, slots=True)
class RateLimitPolicy:
    max_attempts: int
    window_seconds: int

    def __post_init__(self) -> None:
        if self.max_attempts < 1:
            raise ValueError("max_attempts must be >= 1")
        if self.window_seconds < 1:
            raise ValueError("window_seconds must be >= 1")
        if self.max_attempts > MAX_ATTEMPTS_CAP:
            raise ValueError(f"max_attempts must be <= {MAX_ATTEMPTS_CAP}")


class SlidingWindowRateLimiter:
    """Process-local sliding window of timestamps with a hard max-key cap."""

    def __init__(self, *, max_keys: int = 10_000) -> None:
        if max_keys < 1:
            raise ValueError("max_keys must be >= 1")
        self._max_keys = max_keys
        self._lock = threading.Lock()
        self._windows: dict[str, list[float]] = {}
        self._last_access: dict[str, float] = {}

    def clear(self) -> None:
        with self._lock:
            self._windows.clear()
            self._last_access.clear()

    def check_and_consume(
        self,
        key: str,
        policy: RateLimitPolicy,
        *,
        now: float | None = None,
    ) -> tuple[bool, int]:
        """Atomically check and consume one unit.

        Returns ``(allowed, retry_after_seconds)``. When denied, ``retry_after``
        is seconds until the oldest timestamp in the window expires (at least 1).
        """
        ts = time.time() if now is None else now
        cutoff = ts - policy.window_seconds

        with self._lock:
            stamps = self._windows.get(key)
            if stamps is None:
                stamps = []
                self._windows[key] = stamps

            self._last_access[key] = ts
            self._evict_if_needed_locked(keep_key=key)

            # Lazy prune expired entries for this key.
            if stamps and stamps[0] <= cutoff:
                stamps[:] = [t for t in stamps if t > cutoff]

            if len(stamps) >= policy.max_attempts:
                oldest = stamps[0]
                retry_after = max(1, int(policy.window_seconds - (ts - oldest) + 0.999))
                return False, retry_after

            stamps.append(ts)
            return True, 0

    def _evict_if_needed_locked(self, *, keep_key: str) -> None:
        while len(self._windows) > self._max_keys:
            candidates = [k for k in self._last_access if k != keep_key]
            if not candidates:
                break
            oldest_key = min(candidates, key=lambda k: self._last_access[k])
            self._windows.pop(oldest_key, None)
            self._last_access.pop(oldest_key, None)


def _peer_trusted(peer_host: str, trusted_proxies: Sequence[str]) -> bool:
    peer = (peer_host or "").strip()
    if not peer or not trusted_proxies:
        return False
    try:
        peer_ip = ipaddress.ip_address(peer)
        if peer_ip.version == 6 and peer_ip.ipv4_mapped is not None:
            peer_ip = peer_ip.ipv4_mapped
    except ValueError:
        peer_ip = None

    for entry in trusted_proxies:
        raw = entry.strip()
        if not raw:
            continue
        if peer_ip is None:
            if peer == raw:
                return True
            continue
        try:
            if "/" in raw:
                if peer_ip in ipaddress.ip_network(raw, strict=False):
                    return True
            elif peer_ip == ipaddress.ip_address(raw):
                return True
        except ValueError:
            if peer == raw:
                return True
    return False


def resolve_trusted_client_ip(
    *,
    peer_host: str,
    header_value: str | None,
    trusted_proxies: Sequence[str],
) -> str:
    """Trust client-IP header only when peer is in ``trusted_proxies``; else peer host.

    Header values must parse as an IP address (canonicalized); otherwise fall back to peer.
    """
    peer = (peer_host or "").strip() or "unknown"
    if header_value is None:
        return peer
    cleaned = header_value.strip()
    if not cleaned:
        return peer
    if not _peer_trusted(peer, trusted_proxies):
        return peer
    try:
        return str(ipaddress.ip_address(cleaned))
    except ValueError:
        return peer


def parse_trusted_proxy_ips(raw: str) -> tuple[str, ...]:
    """Parse comma-separated IPs, CIDRs, or literal peer hostnames (e.g. testclient)."""
    if not raw.strip():
        return ()
    return tuple(part.strip() for part in raw.split(",") if part.strip())
