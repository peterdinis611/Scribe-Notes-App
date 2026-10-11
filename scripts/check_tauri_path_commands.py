#!/usr/bin/env python3
"""CI: every Tauri command that takes a filesystem path must be allowlisted.

Fail if a new `path: String` / `paths: Vec<String>` / `directory: String` /
`image_path: String` command appears without an reviewed entry in
`scripts/tauri-path-commands.allowlist`.

Allowlist format (one per line):
  module::fn_name   # optional comment
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src-tauri" / "src"
ALLOWLIST_PATH = ROOT / "scripts" / "tauri-path-commands.allowlist"

# Commands that take a path-like String argument from JS.
PATH_PARAM = re.compile(
    r"\b(?P<name>path|paths|directory|image_path|file_path|dir)\s*:\s*"
    r"(?:String|Vec\s*<\s*String\s*>)",
)
COMMAND_ATTR = re.compile(r"#\[tauri::command\]")
FN_NAME = re.compile(r"\b(?:pub\s+)?(?:async\s+)?fn\s+(\w+)\s*\(")


def load_allowlist() -> set[str]:
    if not ALLOWLIST_PATH.is_file():
        print(f"missing allowlist: {ALLOWLIST_PATH}", file=sys.stderr)
        sys.exit(2)
    out: set[str] = set()
    for line in ALLOWLIST_PATH.read_text(encoding="utf-8").splitlines():
        line = line.split("#", 1)[0].strip()
        if line:
            out.add(line)
    return out


def module_key(path: Path) -> str:
    rel = path.relative_to(SRC).with_suffix("")
    parts = list(rel.parts)
    if parts[-1] == "mod":
        parts = parts[:-1]
    return "::".join(parts)


def find_path_commands() -> list[tuple[str, Path, int]]:
    found: list[tuple[str, Path, int]] = []
    for path in sorted(SRC.rglob("*.rs")):
        text = path.read_text(encoding="utf-8")
        lines = text.splitlines()
        i = 0
        while i < len(lines):
            if COMMAND_ATTR.search(lines[i]):
                # Collect signature until closing ')' of fn params (simple scan).
                block_lines: list[str] = []
                j = i + 1
                while j < len(lines) and j < i + 40:
                    block_lines.append(lines[j])
                    if ")" in lines[j] and "fn " in "\n".join(block_lines):
                        break
                    j += 1
                block = "\n".join(block_lines)
                m = FN_NAME.search(block)
                if m and PATH_PARAM.search(block):
                    key = f"{module_key(path)}::{m.group(1)}"
                    found.append((key, path, i + 1))
                i = j
            else:
                i += 1
    return found


def main() -> int:
    allow = load_allowlist()
    found = find_path_commands()
    keys = {k for k, _, _ in found}

    unknown = sorted(keys - allow)
    stale = sorted(allow - keys)

    if unknown:
        print("ERROR: path-bearing Tauri commands not in allowlist:", file=sys.stderr)
        for key in unknown:
            loc = next(f"{p}:{ln}" for k, p, ln in found if k == key)
            print(f"  - {key}  ({loc})", file=sys.stderr)
        print(
            f"\nReview PathAccessGate / picker grant, then add to {ALLOWLIST_PATH.name}",
            file=sys.stderr,
        )
        return 1

    if stale:
        print("WARNING: allowlist entries with no matching command (clean up):")
        for key in stale:
            print(f"  - {key}")

    print(f"OK: {len(keys)} path-bearing commands reviewed ({ALLOWLIST_PATH.name})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
