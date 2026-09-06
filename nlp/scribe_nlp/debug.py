from __future__ import annotations

import os
import sys
import time
from typing import Any


def nlp_debug_enabled() -> bool:
    value = os.environ.get("SCRIBE_NLP_DEBUG", "").strip().lower()
    return value in {"1", "true", "yes", "on", "debug"}


def debug_log(message: str, **fields: Any) -> None:
    """Write debug lines to stderr so stdout stays JSON-RPC clean."""
    if not nlp_debug_enabled():
        return
    extras = " ".join(f"{key}={value!r}" for key, value in fields.items() if value is not None)
    line = f"[nlp-debug] {message}"
    if extras:
        line = f"{line} {extras}"
    sys.stderr.write(line + "\n")
    sys.stderr.flush()


class timed_debug:
    def __init__(self, label: str, **fields: Any) -> None:
        self.label = label
        self.fields = fields
        self.started = 0.0

    def __enter__(self) -> timed_debug:
        self.started = time.perf_counter()
        debug_log(f"{self.label}:start", **self.fields)
        return self

    def __exit__(self, exc_type, exc, tb) -> None:  # noqa: ANN001
        elapsed_ms = (time.perf_counter() - self.started) * 1000
        if exc is not None:
            debug_log(
                f"{self.label}:error",
                ms=f"{elapsed_ms:.1f}",
                error=str(exc),
                **self.fields,
            )
        else:
            debug_log(f"{self.label}:ok", ms=f"{elapsed_ms:.1f}", **self.fields)
