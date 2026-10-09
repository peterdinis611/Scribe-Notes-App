"""Find unfinished loops: open checkboxes, commitments, due-ish todos."""

from __future__ import annotations

import re
from typing import Any

from .commitments import extract_commitments
from .task_rank import rank_tasks
from .text_utils import normalize_text

_DUE_RE = re.compile(
    r"\b(today|tomorrow|asap|deadline|due|dnes|zajtra|termín|urgent)\b",
    re.IGNORECASE,
)


def open_loops(text: str, *, limit: int = 16) -> dict[str, Any]:
    source = text or ""
    limit = max(1, min(int(limit or 16), 40))

    loops: list[dict[str, Any]] = []
    seen: set[str] = set()

    def push(item_text: str, *, kind: str, score: float, due_hint: str | None = None) -> None:
        cleaned = normalize_text(item_text)
        if len(cleaned) < 3:
            return
        key = cleaned.lower()
        if key in seen:
            return
        seen.add(key)
        loops.append(
            {
                "text": cleaned,
                "kind": kind,
                "score": round(score, 3),
                "dueHint": due_hint,
            }
        )

    ranked = rank_tasks(source, limit=limit)
    for task in ranked.get("tasks") or []:
        if not isinstance(task, dict):
            continue
        score = float(task.get("score") or 1.0) + 0.5
        push(
            str(task.get("text") or ""),
            kind="task",
            score=score,
            due_hint=task.get("dueHint"),
        )

    commits = extract_commitments(source, limit=limit)
    for item in commits.get("commitments") or []:
        if not isinstance(item, dict):
            continue
        text_item = str(item.get("text") or "")
        score = 2.2
        if _DUE_RE.search(text_item):
            score += 1.0
        push(text_item, kind="commitment", score=score, due_hint=item.get("dueHint"))

    loops.sort(key=lambda row: float(row["score"]), reverse=True)
    trimmed = loops[:limit]
    return {
        "loops": trimmed,
        "count": len(trimmed),
        "openTaskCount": sum(1 for row in trimmed if row["kind"] == "task"),
        "commitmentCount": sum(1 for row in trimmed if row["kind"] == "commitment"),
        "source": "python",
    }
