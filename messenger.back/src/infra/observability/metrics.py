"""
In-process Prometheus text exposition (no extra dependency).

Optional OpenTelemetry: add ``opentelemetry-api`` + ``opentelemetry-sdk`` and bridge
histograms/counters here or via FastAPI instrumentation — not wired in MVP deps.
"""

from __future__ import annotations

import math
import threading
import time
from collections.abc import Iterable

_DEFAULT_BUCKETS = (
    0.005,
    0.01,
    0.025,
    0.05,
    0.1,
    0.25,
    0.5,
    1.0,
    2.5,
    5.0,
    10.0,
    float("inf"),
)


class Counter:
    __slots__ = ("_help", "_lock", "_name", "_value")

    def __init__(self, name: str, help_text: str) -> None:
        self._name = name
        self._help = help_text
        self._value = 0.0
        self._lock = threading.Lock()

    def inc(self, amount: float = 1.0) -> None:
        if amount < 0:
            raise ValueError("counter increment must be non-negative")
        with self._lock:
            self._value += amount

    def render(self) -> str:
        lines = [
            f"# HELP {self._name} {self._help}",
            f"# TYPE {self._name} counter",
            f"{self._name} {self._value}",
        ]
        return "\n".join(lines)


class Gauge:
    __slots__ = ("_help", "_lock", "_name", "_value")

    def __init__(self, name: str, help_text: str) -> None:
        self._name = name
        self._help = help_text
        self._value = 0.0
        self._lock = threading.Lock()

    def set(self, value: float) -> None:
        with self._lock:
            self._value = value

    def render(self) -> str:
        lines = [
            f"# HELP {self._name} {self._help}",
            f"# TYPE {self._name} gauge",
            f"{self._name} {self._value}",
        ]
        return "\n".join(lines)


class Histogram:
    __slots__ = ("_buckets", "_count", "_counts", "_help", "_lock", "_name", "_sum")

    def __init__(
        self,
        name: str,
        help_text: str,
        *,
        buckets: Iterable[float] = _DEFAULT_BUCKETS,
    ) -> None:
        self._name = name
        self._help = help_text
        ordered = sorted(set(buckets))
        if not ordered or ordered[-1] != math.inf:
            ordered.append(math.inf)
        self._buckets = tuple(ordered)
        self._counts = [0] * len(self._buckets)
        self._sum = 0.0
        self._count = 0
        self._lock = threading.Lock()

    def observe(self, value: float) -> None:
        with self._lock:
            self._sum += value
            self._count += 1
            for index, upper in enumerate(self._buckets):
                if value <= upper:
                    self._counts[index] += 1

    def render(self) -> str:
        lines = [
            f"# HELP {self._name} {self._help}",
            f"# TYPE {self._name} histogram",
        ]
        cumulative = 0
        with self._lock:
            for upper, count in zip(self._buckets, self._counts, strict=True):
                cumulative += count
                le = "+Inf" if math.isinf(upper) else repr(upper)
                lines.append(f'{self._name}_bucket{{le="{le}"}} {cumulative}')
            lines.append(f"{self._name}_sum {self._sum}")
            lines.append(f"{self._name}_count {self._count}")
        return "\n".join(lines)


class MetricsRegistry:
    def __init__(self) -> None:
        self.send_ack_latency = Histogram(
            "messenger_send_ack_latency_seconds",
            "Wall time for HTTP send message until response.",
        )
        self.search_latency = Histogram(
            "messenger_search_latency_seconds",
            "Wall time for message search queries.",
        )
        self.outbox_lag = Gauge(
            "messenger_outbox_lag_seconds",
            "Age of oldest unprocessed outbox row (set by relay/worker).",
        )
        self.ws_connections = Gauge(
            "messenger_ws_connections",
            "Active WebSocket connections on this API instance.",
        )
        self.sync_gap_total = Counter(
            "messenger_sync_gap_total",
            "Clients hit event cursor older than retention (snapshot_required).",
        )
        self.snapshot_reset_total = Counter(
            "messenger_snapshot_reset_total",
            "Conversation snapshot fetches after sync gap.",
        )
        self.upload_scan_failures_total = Counter(
            "messenger_upload_scan_failures_total",
            "Media worker rejections during scan/validate.",
        )

    def render_prometheus(self) -> str:
        parts = [
            self.send_ack_latency.render(),
            self.search_latency.render(),
            self.outbox_lag.render(),
            self.ws_connections.render(),
            self.sync_gap_total.render(),
            self.snapshot_reset_total.render(),
            self.upload_scan_failures_total.render(),
        ]
        return "\n".join(parts) + "\n"


METRICS = MetricsRegistry()


def observe_send_ack_latency(seconds: float) -> None:
    METRICS.send_ack_latency.observe(seconds)


def observe_search_latency(seconds: float) -> None:
    METRICS.search_latency.observe(seconds)


def set_outbox_lag_seconds(lag: float) -> None:
    """Call from outbox relay after measuring oldest pending row age."""
    METRICS.outbox_lag.set(max(0.0, lag))


def set_ws_connections(count: int) -> None:
    METRICS.ws_connections.set(float(count))


def inc_sync_gap() -> None:
    METRICS.sync_gap_total.inc()


def inc_snapshot_reset() -> None:
    METRICS.snapshot_reset_total.inc()


def inc_upload_scan_failure() -> None:
    METRICS.upload_scan_failures_total.inc()


class SendAckTimer:
    """Context manager / decorator-style timer for send ack latency."""

    def __enter__(self) -> SendAckTimer:
        self._start = time.perf_counter()
        return self

    def __exit__(self, *args: object) -> None:
        observe_send_ack_latency(time.perf_counter() - self._start)
