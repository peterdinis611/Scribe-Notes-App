"""Dedicated local AI for document revision / diff analysis.

Heuristic, offline, no cloud LLM — classifies change kind, highlights risks,
and produces an editor-friendly report for the revision history panel.
"""

from __future__ import annotations

import re
from typing import Any, Literal

from .diff_summary import summarize_diff
from .text_utils import content_tokens, normalize_text, split_sentences

ChangeKind = Literal[
    "identical",
    "expansion",
    "trim",
    "rewrite",
    "polish",
    "structural",
    "mixed",
]

Severity = Literal["info", "warn", "critical"]

_HEADING_RE = re.compile(r"^(#{1,6}\s+|.+\n[=-]{3,}\s*$)", re.MULTILINE)
_MARKDOWN_HEADING_RE = re.compile(r"^(#{1,6})\s+(.+)$", re.MULTILINE)
_TODO_RE = re.compile(r"\b(TODO|FIXME|XXX|HACK|WIP)\b", re.IGNORECASE)
_SENSITIVE_RE = re.compile(
    r"\b(password|secret|api[_-]?key|token|ssn|rodn[eé]\s*[čc][ií]slo)\b",
    re.IGNORECASE,
)


def analyze_revision_diff(
    old_text: str,
    new_text: str,
    *,
    max_bullets: int = 6,
    language: str | None = None,
) -> dict[str, Any]:
    """Analyze a plain-text revision diff for the editor / Local AI panel."""
    old = old_text or ""
    new = new_text or ""
    max_bullets = max(1, min(int(max_bullets or 6), 12))

    base = summarize_diff(old, new, max_bullets=max_bullets)
    old_words = int(base.get("oldWordCount") or 0)
    new_words = int(base.get("newWordCount") or 0)
    change_ratio = float(base.get("changeRatio") or 0.0)
    added_sentences = list(base.get("addedSentences") or [])
    removed_sentences = list(base.get("removedSentences") or [])
    gained_terms = list(base.get("gainedTerms") or [])
    lost_terms = list(base.get("lostTerms") or [])

    old_lines = old.splitlines()
    new_lines = new.splitlines()
    lines_added, lines_removed = _line_churn(old_lines, new_lines)
    heading_changes = _heading_changes(old, new)
    risks = _detect_risks(old, new, old_words, new_words, change_ratio, lines_removed)

    change_kind = _classify_change_kind(
        old_words=old_words,
        new_words=new_words,
        change_ratio=change_ratio,
        lines_added=lines_added,
        lines_removed=lines_removed,
        heading_changes=heading_changes,
        added_n=len(added_sentences),
        removed_n=len(removed_sentences),
    )
    confidence = _confidence(change_kind, change_ratio, old_words, new_words)

    lang = (language or _guess_language(old + "\n" + new)).lower()
    headline = _headline(change_kind, old_words, new_words, change_ratio, lang)
    summary = _rich_summary(
        base_summary=str(base.get("summary") or ""),
        change_kind=change_kind,
        headline=headline,
        added=added_sentences,
        removed=removed_sentences,
        risks=risks,
        lang=lang,
    )
    bullets = _build_bullets(
        change_kind=change_kind,
        added=added_sentences,
        removed=removed_sentences,
        headings=heading_changes,
        risks=risks,
        gained=gained_terms,
        lost=lost_terms,
        max_bullets=max_bullets,
        lang=lang,
    )

    return {
        "summary": summary,
        "headline": headline,
        "changeKind": change_kind,
        "confidence": round(confidence, 3),
        "bullets": bullets,
        "addedSentences": added_sentences,
        "removedSentences": removed_sentences,
        "gainedTerms": gained_terms,
        "lostTerms": lost_terms,
        "headingChanges": heading_changes,
        "risks": risks,
        "stats": {
            "changeRatio": round(change_ratio, 3),
            "oldWordCount": old_words,
            "newWordCount": new_words,
            "linesAdded": lines_added,
            "linesRemoved": lines_removed,
            "netWords": new_words - old_words,
        },
        "source": "python",
        # Backward-compatible aliases for callers expecting summarize_diff shape.
        "changeRatio": round(change_ratio, 3),
        "oldWordCount": old_words,
        "newWordCount": new_words,
    }


def _line_churn(old_lines: list[str], new_lines: list[str]) -> tuple[int, int]:
    old_set = set(old_lines)
    new_set = set(new_lines)
    added = sum(1 for line in new_lines if line not in old_set)
    removed = sum(1 for line in old_lines if line not in new_set)
    return added, removed


def _extract_headings(text: str) -> list[str]:
    found: list[str] = []
    for match in _MARKDOWN_HEADING_RE.finditer(text or ""):
        title = normalize_text(match.group(2))
        if title:
            found.append(title)
    # TipTap plain export often has bare title lines without markdown hashes —
    # keep short ALL-CAPS / Title Case lines under 80 chars as weak headings.
    if not found:
        for line in (text or "").splitlines():
            stripped = line.strip()
            if 3 <= len(stripped) <= 80 and stripped == stripped.title() and " " in stripped:
                found.append(normalize_text(stripped))
    return found


def _heading_changes(old: str, new: str) -> dict[str, list[str]]:
    old_h = set(_extract_headings(old))
    new_h = set(_extract_headings(new))
    return {
        "added": sorted(new_h - old_h)[:8],
        "removed": sorted(old_h - new_h)[:8],
    }


def _detect_risks(
    old: str,
    new: str,
    old_words: int,
    new_words: int,
    change_ratio: float,
    lines_removed: int,
) -> list[str]:
    risks: list[str] = []
    if old_words > 40 and new_words < old_words * 0.55:
        risks.append("large_deletion")
    if change_ratio >= 0.65 and old_words > 80:
        risks.append("heavy_rewrite")
    if lines_removed >= 12:
        risks.append("many_lines_removed")
    old_todos = set(_TODO_RE.findall(old))
    new_todos = set(_TODO_RE.findall(new))
    if new_todos - old_todos:
        risks.append("todo_introduced")
    if _SENSITIVE_RE.search(new) and not _SENSITIVE_RE.search(old):
        risks.append("sensitive_term_added")
    if len(new.strip()) == 0 and len(old.strip()) > 0:
        risks.append("content_cleared")
    return risks


def _classify_change_kind(
    *,
    old_words: int,
    new_words: int,
    change_ratio: float,
    lines_added: int,
    lines_removed: int,
    heading_changes: dict[str, list[str]],
    added_n: int,
    removed_n: int,
) -> ChangeKind:
    if old_words == 0 and new_words == 0:
        return "identical"
    if change_ratio < 0.02 and lines_added == 0 and lines_removed == 0:
        return "identical"

    growth = (new_words - old_words) / max(old_words, 1)
    headings_moved = bool(heading_changes.get("added") or heading_changes.get("removed"))

    if headings_moved and abs(growth) < 0.25 and change_ratio < 0.45:
        return "structural"
    if growth >= 0.18 and change_ratio < 0.55:
        return "expansion"
    if growth <= -0.18 and change_ratio < 0.55:
        return "trim"
    if change_ratio >= 0.45 and abs(growth) < 0.2:
        return "rewrite"
    if change_ratio < 0.18 and abs(growth) < 0.12 and (added_n + removed_n) <= 4:
        return "polish"
    if abs(growth) >= 0.12 and change_ratio >= 0.35:
        return "mixed"
    if growth > 0.05:
        return "expansion"
    if growth < -0.05:
        return "trim"
    return "mixed"


def _confidence(
    change_kind: ChangeKind,
    change_ratio: float,
    old_words: int,
    new_words: int,
) -> float:
    if change_kind == "identical":
        return 0.99
    base = 0.55 + min(0.3, change_ratio)
    if old_words + new_words < 40:
        base -= 0.15
    return max(0.35, min(0.95, base))


def _guess_language(text: str) -> str:
    sample = (text or "")[:4000].lower()
    sk_hits = sum(
        1
        for token in (
            " že ",
            " nie ",
            " alebo ",
            " pre ",
            " ako ",
            " toto ",
            " ktoré ",
            " ktoré",
            "či ",
        )
        if token in sample
    )
    return "sk" if sk_hits >= 2 else "en"


def _headline(
    kind: ChangeKind,
    old_words: int,
    new_words: int,
    change_ratio: float,
    lang: str,
) -> str:
    pct = int(round(abs(new_words - old_words) / max(old_words, 1) * 100))
    if lang.startswith("sk"):
        labels = {
            "identical": "Bez zmien",
            "expansion": f"Rozšírenie (+{pct} % slov)",
            "trim": f"Skrátenie (−{pct} % slov)",
            "rewrite": f"Prepísanie (~{int(change_ratio * 100)} % zmeny)",
            "polish": "Jemná úprava",
            "structural": "Štrukturálna zmena (nadpisy)",
            "mixed": f"Zmiešaná úprava (~{int(change_ratio * 100)} %)",
        }
    else:
        labels = {
            "identical": "No changes",
            "expansion": f"Expansion (+{pct}% words)",
            "trim": f"Trim (−{pct}% words)",
            "rewrite": f"Rewrite (~{int(change_ratio * 100)}% changed)",
            "polish": "Light polish",
            "structural": "Structural (headings)",
            "mixed": f"Mixed edit (~{int(change_ratio * 100)}%)",
        }
    return labels.get(kind, labels["mixed"])


def _rich_summary(
    *,
    base_summary: str,
    change_kind: ChangeKind,
    headline: str,
    added: list[str],
    removed: list[str],
    risks: list[str],
    lang: str,
) -> str:
    parts = [headline]
    if base_summary and base_summary not in headline:
        parts.append(base_summary)
    elif added:
        parts.append(added[0])
    elif removed:
        prefix = "Odstránené" if lang.startswith("sk") else "Removed"
        parts.append(f"{prefix}: {removed[0]}")
    if "large_deletion" in risks:
        parts.append(
            "Pozor: veľká časť textu zmizla."
            if lang.startswith("sk")
            else "Warning: a large part of the text was removed."
        )
    if "todo_introduced" in risks:
        parts.append(
            "Pribudol TODO/FIXME marker."
            if lang.startswith("sk")
            else "A TODO/FIXME marker was introduced."
        )
    return " ".join(parts).strip()


def _build_bullets(
    *,
    change_kind: ChangeKind,
    added: list[str],
    removed: list[str],
    headings: dict[str, list[str]],
    risks: list[str],
    gained: list[str],
    lost: list[str],
    max_bullets: int,
    lang: str,
) -> list[dict[str, str]]:
    bullets: list[dict[str, str]] = []

    def push(text: str, severity: Severity, kind: str) -> None:
        if len(bullets) >= max_bullets or not text.strip():
            return
        bullets.append({"text": text.strip(), "severity": severity, "kind": kind})

    for risk in risks:
        push(_risk_label(risk, lang), "critical" if risk in {"content_cleared", "large_deletion"} else "warn", "risk")

    for title in headings.get("added", [])[:2]:
        label = "Nový nadpis" if lang.startswith("sk") else "New heading"
        push(f"{label}: {title}", "info", "heading")
    for title in headings.get("removed", [])[:2]:
        label = "Odstránený nadpis" if lang.startswith("sk") else "Removed heading"
        push(f"{label}: {title}", "warn", "heading")

    for sentence in added[:3]:
        push(sentence, "info", "added")
    for sentence in removed[:2]:
        push(sentence, "warn", "removed")

    if gained and len(bullets) < max_bullets:
        label = "Nové termíny" if lang.startswith("sk") else "New terms"
        push(f"{label}: {', '.join(gained[:5])}", "info", "terms")
    if lost and len(bullets) < max_bullets:
        label = "Stratené termíny" if lang.startswith("sk") else "Lost terms"
        push(f"{label}: {', '.join(lost[:5])}", "info", "terms")

    if not bullets and change_kind == "identical":
        push(
            "Texty sú rovnaké." if lang.startswith("sk") else "The texts are identical.",
            "info",
            "info",
        )
    return bullets


def _risk_label(risk: str, lang: str) -> str:
    sk = {
        "large_deletion": "Veľké vymazanie textu",
        "heavy_rewrite": "Silné prepísanie obsahu",
        "many_lines_removed": "Veľa odstránených riadkov",
        "todo_introduced": "Pribudol TODO/FIXME",
        "sensitive_term_added": "Možný citlivý výraz",
        "content_cleared": "Obsah bol úplne vymazaný",
    }
    en = {
        "large_deletion": "Large text deletion",
        "heavy_rewrite": "Heavy content rewrite",
        "many_lines_removed": "Many lines removed",
        "todo_introduced": "TODO/FIXME introduced",
        "sensitive_term_added": "Possible sensitive term added",
        "content_cleared": "Content was fully cleared",
    }
    table = sk if lang.startswith("sk") else en
    return table.get(risk, risk)
