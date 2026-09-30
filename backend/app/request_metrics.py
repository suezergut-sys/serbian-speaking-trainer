"""Request-local timing counters without request content or identifiers."""

from contextlib import contextmanager
from contextvars import ContextVar, Token
from dataclasses import dataclass
from time import perf_counter
from typing import Iterator


@dataclass
class RequestMetrics:
    db_ms: float = 0.0
    db_queries: int = 0
    ai_ms: float = 0.0
    ai_calls: int = 0


_current_metrics: ContextVar[RequestMetrics | None] = ContextVar("request_metrics", default=None)


def start_request_metrics() -> tuple[RequestMetrics, Token[RequestMetrics | None]]:
    metrics = RequestMetrics()
    return metrics, _current_metrics.set(metrics)


def stop_request_metrics(token: Token[RequestMetrics | None]) -> None:
    _current_metrics.reset(token)


def current_request_metrics() -> RequestMetrics | None:
    return _current_metrics.get()


@contextmanager
def measure_ai_call() -> Iterator[None]:
    metrics = current_request_metrics()
    if metrics is None:
        yield
        return

    metrics.ai_calls += 1
    started = perf_counter()
    try:
        yield
    finally:
        metrics.ai_ms += (perf_counter() - started) * 1000
