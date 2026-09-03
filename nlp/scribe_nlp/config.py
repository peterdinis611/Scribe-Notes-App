from __future__ import annotations

# Guardrails for stdio RPC — keeps sidecar responsive when Rust sends large payloads.
MAX_TEXT_CHARS = 120_000
MAX_EMBED_BATCH = 128
MAX_REPORT_DOCUMENTS = 5_000
# Keep enough hits for interactive search without retaining a large vector heap.
EMBED_CACHE_SIZE = 192
