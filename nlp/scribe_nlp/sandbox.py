"""Process-level FS guard when SCRIBE_NLP_SANDBOX=1.

Complements the Rust spawn (env_clear + optional macOS seatbelt). This is
defense-in-depth only — compromised native extensions can still bypass it.
"""

from __future__ import annotations

import builtins
import os
from pathlib import Path

_SENSITIVE_SUBSTR = (
    "/.ssh/",
    "/.gnupg/",
    "/.aws/",
    "/.kube/",
    "/Library/Keychains/",
    "Application Support/com.scribe.app/scribe.db",
    "Application Support/com.scribe.app/scribe-agent.db",
    "Application Support/com.scribe.app/scribe-audit.db",
    "Application Support/com.scribe.app/scribe-audit",
)


def sandbox_enabled() -> bool:
    value = os.environ.get("SCRIBE_NLP_SANDBOX", "").strip().lower()
    return value in {"1", "true", "yes", "on"}


def _normalize(path: str | os.PathLike[str] | int) -> str | None:
    if isinstance(path, int):
        return None
    try:
        return str(Path(path).expanduser().resolve())
    except OSError:
        return str(path)


def _is_sensitive(resolved: str) -> bool:
    lowered = resolved.replace("\\", "/")
    return any(token in lowered for token in _SENSITIVE_SUBSTR)


_original_open = builtins.open


def _sandboxed_open(file, *args, **kwargs):  # type: ignore[no-untyped-def]
    resolved = _normalize(file)
    if resolved is not None and _is_sensitive(resolved):
        raise PermissionError(
            f"SCRIBE_NLP_SANDBOX blocked access to sensitive path: {resolved}"
        )
    return _original_open(file, *args, **kwargs)


def install_sandbox_guards() -> bool:
    """Install builtins.open guard. Idempotent. Returns True when armed."""
    if not sandbox_enabled():
        return False
    if getattr(builtins.open, "__scribe_nlp_sandbox__", False):
        return True
    wrapped = _sandboxed_open
    wrapped.__scribe_nlp_sandbox__ = True  # type: ignore[attr-defined]
    builtins.open = wrapped  # type: ignore[assignment]
    return True
