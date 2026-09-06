from __future__ import annotations

import re

from .text_utils import split_sentences

CHECKBOX_LINE = re.compile(r"^\s*(?:[-*+]|•)\s*\[([ xX✓✔])\]\s*(.+)$", re.MULTILINE)
IMPERATIVE = re.compile(
    r"(?i)^(?:todo|fix|treba|úloha|uloha|splniť|splnit|remember|pripomenutie|"
    r"nezabudni|nezabudnúť|nezabudnut|musím|musime|musíme|deadline|due)\s*[:\-–—]\s*(.+)$"
)
# Inline task cues: "Treba X", "Musím X", "Don't forget to X"
INLINE_TASK = re.compile(
    r"(?i)\b(?:treba|musím|musime|musíme|nezabudni(?:te)?|don't forget to|remember to)\s+(.{4,120})"
)
DATE_HINT = re.compile(
    r"\b(\d{4}-\d{2}-\d{2}|\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?)\b"
)


def extract_tasks(text: str) -> dict[str, object]:
    source = text or ""
    tasks: list[dict[str, object]] = []
    seen: set[str] = set()

    def _add(body: str, *, checked: bool, source_kind: str) -> None:
        cleaned = body.strip().rstrip(".;,")
        if len(cleaned) < 3:
            return
        key = cleaned.lower()
        if key in seen:
            return
        seen.add(key)
        tasks.append(
            {
                "text": cleaned,
                "checked": checked,
                "source": source_kind,
                "dueHint": _due_hint(cleaned),
            }
        )

    for match in CHECKBOX_LINE.finditer(source):
        checked = match.group(1).lower() in {"x", "✓", "✔"}
        _add(match.group(2), checked=checked, source_kind="markdown")

    for raw_line in source.splitlines():
        stripped = raw_line.strip()
        imperative = IMPERATIVE.match(stripped)
        if imperative:
            _add(imperative.group(1), checked=False, source_kind="phrase")

    for sentence in split_sentences(source):
        stripped = sentence.strip()
        if IMPERATIVE.match(stripped):
            continue
        inline = INLINE_TASK.search(stripped)
        if inline:
            _add(inline.group(1), checked=False, source_kind="inline")

    open_tasks = [task for task in tasks if not task.get("checked")]
    return {"tasks": tasks, "openCount": len(open_tasks)}


def _due_hint(text: str) -> str | None:
    match = DATE_HINT.search(text)
    return match.group(1) if match else None
