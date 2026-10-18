from __future__ import annotations

import re

from .dates import resolve_due_hint
from .text_utils import split_sentences

# "- [ ] x", "* [x] x", "• [✓] x", ale aj "1. [ ] x" a "2) [x] x"
CHECKBOX_LINE = re.compile(
    r"^\s*(?:[-*+•]|\d+[.)])\s*\[([ xX✓✔])\]\s*(.+)$", re.MULTILINE
)

IMPERATIVE = re.compile(
    r"(?i)^(?:todo|fix|treba|úloha|uloha|splniť|splnit|remember|pripomenutie|"
    r"nezabudni|nezabudnúť|nezabudnut|musím|musime|musíme|deadline|due|"
    r"action(?:\s+item)?|akcia)\s*[:\-–—]\s*(.+)$"
)

# Inline cue: "Treba X", "Musím X", "Don't forget to X", "Need to X" ...
# Capture body is capped; callers also truncate at the first sentence end.
INLINE_TASK = re.compile(
    r"(?i)\b(?:treba|musím|musime|musíme|potrebujem|je\s+potrebné|je\s+potrebne|"
    r"nezabudni(?:te)?|don['’]t forget to|remember to|need to|have to)\s+(.{4,80})"
)

# Metadáta
TAG_RE = re.compile(r"(?<!\w)#([\w\-]+)", re.UNICODE)
MENTION_RE = re.compile(r"(?<!\w)@([\w\.\-]+)", re.UNICODE)
HIGH_RE = re.compile(
    r"(?i)(!{2,}|\b(?:urgent|asap|critical|naliehavé|naliehave|urgentné|"
    r"urgentne|kritické|kriticke|ihneď|ihned|dôležité|dolezite)\b)"
)
LOW_RE = re.compile(
    r"(?i)\b(?:someday|low priority|nice to have|neskôr|neskor|nízka priorita|"
    r"nizka priorita)\b"
)

PRIORITY_ORDER = {"high": 0, "normal": 1, "low": 2}


def _priority(text: str) -> str:
    if HIGH_RE.search(text):
        return "high"
    if LOW_RE.search(text):
        return "low"
    return "normal"


def extract_tasks(text: str, *, sort: bool = False) -> dict[str, object]:
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
                "dueHint": resolve_due_hint(cleaned),
                "priority": _priority(cleaned),
                "tags": TAG_RE.findall(cleaned),
                "assignees": MENTION_RE.findall(cleaned),
            }
        )

    # 1) Markdown checkboxy
    for match in CHECKBOX_LINE.finditer(source):
        checked = match.group(1).lower() in {"x", "✓", "✔"}
        _add(match.group(2), checked=checked, source_kind="markdown")

    # 2) Riadky s explicitným prefixom (TODO:, Treba: ...)
    for raw_line in source.splitlines():
        stripped = raw_line.strip()
        imperative = IMPERATIVE.match(stripped)
        if imperative:
            _add(imperative.group(1), checked=False, source_kind="phrase")

    # 3) Inline vety
    for sentence in split_sentences(source):
        stripped = sentence.strip()
        if IMPERATIVE.match(stripped) or CHECKBOX_LINE.match(stripped):
            continue
        inline = INLINE_TASK.search(stripped)
        if inline:
            body = inline.group(1).strip()
            # Keep a single action phrase — drop trailing clauses after .!? or ;
            cut = re.search(r"[.!?;]", body)
            if cut:
                body = body[: cut.start()].strip()
            if len(body) >= 3:
                _add(body, checked=False, source_kind="inline")

    if sort:
        # stabilné triedenie: otvorené pred hotovými, potom podľa priority
        tasks.sort(
            key=lambda t: (bool(t["checked"]), PRIORITY_ORDER[str(t["priority"])])
        )

    open_tasks = [t for t in tasks if not t["checked"]]
    by_priority = {p: 0 for p in PRIORITY_ORDER}
    for t in open_tasks:
        by_priority[str(t["priority"])] += 1

    return {
        "tasks": tasks,
        "openCount": len(open_tasks),
        "doneCount": len(tasks) - len(open_tasks),
        "byPriority": by_priority,
    }