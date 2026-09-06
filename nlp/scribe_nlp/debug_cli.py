"""Interactive Local AI debug helper: SCRIBE_NLP_DEBUG=1 python -m scribe_nlp.debug_cli"""

from __future__ import annotations

import json
import os
import sys

# Ensure debug logs are on for this CLI even if the env was forgotten.
os.environ.setdefault("SCRIBE_NLP_DEBUG", "1")

from .debug import debug_log  # noqa: E402
from .server import handle_request  # noqa: E402


def _call(method: str, params: dict | None = None) -> dict:
    response = handle_request(
        {
            "jsonrpc": "2.0",
            "id": 1,
            "method": method,
            "params": params or {},
        }
    )
    print(json.dumps(response, ensure_ascii=False, indent=2))
    return response


def main() -> None:
    debug_log("debug_cli:start", python=sys.executable)
    print("=== health ===", file=sys.stderr)
    _call("health")

    sample = (
        "# Scribe debug\n\n"
        "Lokálna AI beží offline. Meeting zajtra v Bratislave s Acme s.r.o. "
        "Pozri [[Roadmap]] a @peter. Treba: otestovať NLP."
    )
    print("=== analyze_document (sample) ===", file=sys.stderr)
    _call("analyze_document", {"text": sample, "keywordLimit": 8, "summarySentences": 2})

    print("=== rewrite_query ===", file=sys.stderr)
    _call("rewrite_query", {"query": "poznámka o projekte"})

    print("Done. Re-run with SCRIBE_NLP_DEBUG=1 for stderr timings.", file=sys.stderr)


if __name__ == "__main__":
    main()
