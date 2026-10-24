#!/usr/bin/env bash
# Regenerate nlp/requirements.lock with hashes for pip-audit / --require-hashes installs.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if command -v uv >/dev/null 2>&1; then
  uv pip compile --python 3.12 --generate-hashes -o requirements.lock requirements.in
elif command -v pip-compile >/dev/null 2>&1; then
  pip-compile --generate-hashes -o requirements.lock requirements.in
else
  echo "Install uv (https://github.com/astral-sh/uv) or pip-tools, then re-run." >&2
  exit 1
fi

echo "Wrote $ROOT/requirements.lock"
