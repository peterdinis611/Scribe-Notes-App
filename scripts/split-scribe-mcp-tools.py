#!/usr/bin/env python3
"""Split tools parameter types into tools/ modules on complete struct boundaries."""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC_CANDIDATES = [
    Path("/tmp/tools-full.rs"),
    ROOT / "crates/scribe-mcp/src/tools.rs",
]
OUT = ROOT / "crates/scribe-mcp/src/tools"

HEADER = """\
use rmcp::schemars::JsonSchema;
use serde::{Deserialize, Serialize};
"""

# Target approx equal groups by struct count.
GROUP_FILES = [
    "documents.rs",
    "agent_nlp.rs",
    "study_files.rs",
    "wiki.rs",
    "library_ui.rs",
]


def leading_attr_start(lines: list[str], struct_idx: int) -> int:
    """Include #[...] / docs immediately above `pub struct`."""
    j = struct_idx
    while j > 0:
        prev = lines[j - 1].strip()
        if prev.startswith("#[") or prev.startswith("///") or prev.startswith("//!"):
            j -= 1
            continue
        if prev == "":
            # keep one blank only if attrs continue above
            k = j - 1
            while k > 0 and lines[k - 1].strip() == "":
                k -= 1
            if k > 0 and (
                lines[k - 1].strip().startswith("#[")
                or lines[k - 1].strip().startswith("///")
            ):
                j = k
                continue
            break
        break
    return j


def main() -> None:
    src = next((p for p in SRC_CANDIDATES if p.is_file()), None)
    if src is None:
        raise SystemExit("no tools source found")

    lines = src.read_text().splitlines()
    # Drop json helper + imports from source; keep only param items.
    struct_idxs = [i for i, l in enumerate(lines) if re.match(r"pub struct \w+", l)]
    if not struct_idxs:
        raise SystemExit("no structs")

    blocks: list[str] = []
    for n, idx in enumerate(struct_idxs):
        start = leading_attr_start(lines, idx)
        end = struct_idxs[n + 1] if n + 1 < len(struct_idxs) else len(lines)
        # end should be leading_attr of next, not next struct itself — already handled via start of next
        if n + 1 < len(struct_idxs):
            end = leading_attr_start(lines, struct_idxs[n + 1])
        block = "\n".join(lines[start:end]).rstrip()
        if block:
            blocks.append(block)

    # Partition blocks into groups
    n = len(blocks)
    group_count = len(GROUP_FILES)
    size = (n + group_count - 1) // group_count
    groups: list[list[str]] = []
    for i in range(group_count):
        chunk = blocks[i * size : (i + 1) * size]
        groups.append(chunk)

    OUT.mkdir(parents=True, exist_ok=True)
    # Remove old pieces
    for old in OUT.glob("*.rs"):
        old.unlink()

    for filename, chunk in zip(GROUP_FILES, groups):
        body = "\n\n".join(chunk).rstrip() + "\n"
        (OUT / filename).write_text(f"{HEADER}\n{body}")

    (OUT / "mod.rs").write_text(
        """//! MCP tool parameter types (split by domain).

mod agent_nlp;
mod documents;
mod library_ui;
mod study_files;
mod wiki;

pub use agent_nlp::*;
pub use documents::*;
pub use library_ui::*;
pub use study_files::*;
pub use wiki::*;

pub fn json<T: serde::Serialize>(value: &T) -> String {
    serde_json::to_string_pretty(value).unwrap_or_else(|error| error.to_string())
}
"""
    )

    # Remove monolithic file if present
    mono = ROOT / "crates/scribe-mcp/src/tools.rs"
    if mono.exists():
        mono.unlink()

    print(f"split {n} structs into {group_count} files")
    for path in sorted(OUT.glob("*.rs")):
        print(f"  {path.name:20} {sum(1 for _ in path.open()):4} lines")


if __name__ == "__main__":
    main()
