from __future__ import annotations

import re

from .text_utils import split_sentences

CHECKBOX_LINE = re.compile(r"^\s*(?:[-*+]|•)\s*\[([ xX✓✔])\]\s*(.+)$", re.MULTILINE)
IMPERATIVE = re.compile(
    r"(?i)^(?:todo|treba|úloha|uloha|splniť|splnit|remember|pripomenutie)\s*[:\-]\s*(.+)$"
)
DATE_HINT = re.compile(
    r"\b(\d{4}-\d{2}-\d{2}|\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?)\b"
)


def extract_tasks(text: str) -> dict[str, object]:
    source = text or ""
    tasks: list[dict[str, object]] = []
    seen: set[str] = set()

    for match in CHECKBOX_LINE.finditer(source):
        checked = match.group(1).lower() in {"x", "✓", "✔"}
        body = match.group(2).strip()
        if not body:
            continue
        key = body.lower()
        if key in seen:
            continue
        seen.add(key)
        tasks.append(
            {
                "text": body,
                "checked": checked,
                "source": "markdown",
                "dueHint": _due_hint(body),
            }
        )

    for sentence in split_sentences(source):
        imperative = IMPERATIVE.match(sentence.strip())
        if not imperative:
            continue
        body = imperative.group(1).strip()
        if len(body) < 3:
            continue
        key = body.lower()
        if key in seen:
            continue
        seen.add(key)
        tasks.append(
            {
                "text": body,
                "checked": False,
                "source": "phrase",
                "dueHint": _due_hint(body),
            }
        )

    open_tasks = [task for task in tasks if not task.get("checked")]
    return {"tasks": tasks, "openCount": len(open_tasks)}


def _due_hint(text: str) -> str | None:
    match = DATE_HINT.search(text)
    return match.group(1) if match else None
