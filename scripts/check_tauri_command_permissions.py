#!/usr/bin/env python3
"""Fail if generate_handler! commands drift from permission inventory."""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LIB = ROOT / "src-tauri" / "src" / "lib.rs"
ALLOWLIST = ROOT / "scripts" / "tauri-command-groups.allowlist"


def handler_commands() -> set[str]:
    text = LIB.read_text()
    match = re.search(r"generate_handler!\[(.*?)\]", text, re.S)
    if not match:
        raise SystemExit("generate_handler! not found in lib.rs")
    cmds: set[str] = set()
    for line in match.group(1).splitlines():
        line = line.strip().rstrip(",")
        if not line or line.startswith("//"):
            continue
        cmds.add(line.split("::")[-1])
    return cmds


def allowlist_commands() -> set[str]:
    cmds: set[str] = set()
    for line in ALLOWLIST.read_text().splitlines():
        if not line or line.startswith("#"):
            continue
        parts = line.split("\t")
        if len(parts) == 2:
            cmds.add(parts[1].strip())
    return cmds


def main() -> int:
    if not ALLOWLIST.exists():
        print("missing allowlist — run scripts/gen-tauri-command-permissions.py", file=sys.stderr)
        return 1
    handler = handler_commands()
    listed = allowlist_commands()
    missing = sorted(handler - listed)
    extra = sorted(listed - handler)
    if missing or extra:
        if missing:
            print("Commands in generate_handler! missing from allowlist:", file=sys.stderr)
            for name in missing:
                print(f"  + {name}", file=sys.stderr)
        if extra:
            print("Allowlist entries not in generate_handler!:", file=sys.stderr)
            for name in extra:
                print(f"  - {name}", file=sys.stderr)
        print(
            "\nRegenerate with: python3 scripts/gen-tauri-command-permissions.py",
            file=sys.stderr,
        )
        return 1
    print(f"OK: {len(handler)} commands match permission inventory")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
