"""New Local AI note skills — heuristic-first, optional LLM polish."""

from __future__ import annotations

import re
from typing import Any

from .diff_summary import summarize_diff
from .language import detect_language
from .llm import try_complete_from_options
from .tasks import extract_tasks
from .text_utils import content_tokens, split_sentences, tokenize


def explain_selection(
    text: str,
    *,
    llm: dict[str, Any] | None = None,
) -> dict[str, Any]:
    source = (text or "").strip()
    if not source:
        raise ValueError("text is required")
    language = detect_language(source)
    slovak = language.startswith("sk")
    sentences = [s.strip() for s in split_sentences(source) if s.strip()]
    tokens = content_tokens(source)
    key_terms = sorted({t for t in tokens if len(t) >= 5}, key=len, reverse=True)[:6]
    heuristic = (
        ("Tento úsek hovorí o: " if slovak else "This passage is about: ")
        + (", ".join(key_terms) if key_terms else (sentences[0][:160] if sentences else source[:160]))
    )
    bullets = sentences[:4]
    explanation = heuristic
    enhanced = False
    polished = try_complete_from_options(
        llm,
        prompt=f"Explain clearly in 2-4 short sentences:\n\n{source[:4000]}",
        system="You explain text for a writer. No preamble. Stay faithful to the source.",
        max_tokens=320,
    )
    if polished:
        explanation = polished
        enhanced = True
    return {
        "language": language,
        "explanation": explanation,
        "bullets": bullets,
        "keyTerms": key_terms,
        "enhanced": enhanced,
        "source": "python",
    }


def simplify_text(
    text: str,
    *,
    llm: dict[str, Any] | None = None,
) -> dict[str, Any]:
    source = (text or "").strip()
    if not source:
        raise ValueError("text is required")
    language = detect_language(source)
    # Heuristic: split long sentences and drop filler-ish words
    fillers = {"basically", "actually", "literally", "really", "very", "just", "vlastne", "proste"}
    parts: list[str] = []
    for sentence in split_sentences(source):
        words = [w for w in sentence.split() if w.lower().strip(",.;:") not in fillers]
        if not words:
            continue
        chunk = " ".join(words)
        if len(words) > 22:
            mid = len(words) // 2
            parts.append(" ".join(words[:mid]).rstrip(",;") + ".")
            parts.append(" ".join(words[mid:]))
        else:
            parts.append(chunk)
    simplified = " ".join(parts).strip() or source
    enhanced = False
    polished = try_complete_from_options(
        llm,
        prompt=f"Rewrite in simpler plain language. Keep meaning. Output only the rewrite:\n\n{source[:4000]}",
        system="Simplify prose for a general reader. No bullet lists unless the source uses them.",
        max_tokens=500,
    )
    if polished:
        simplified = polished
        enhanced = True
    return {
        "language": language,
        "text": simplified,
        "originalLength": len(source),
        "simplifiedLength": len(simplified),
        "enhanced": enhanced,
        "source": "python",
    }


def action_items_from_text(
    text: str,
    *,
    limit: int = 12,
    llm: dict[str, Any] | None = None,
) -> dict[str, Any]:
    source = (text or "").strip()
    if not source:
        raise ValueError("text is required")
    extracted = extract_tasks(source)
    raw_items = extracted.get("tasks") if isinstance(extracted, dict) else None
    if not isinstance(raw_items, list):
        raw_items = extracted.get("items") if isinstance(extracted, dict) else []
    if not isinstance(raw_items, list):
        raw_items = []
    items: list[dict[str, str]] = []
    for task in raw_items[: max(1, min(limit, 30))]:
        if isinstance(task, dict):
            items.append(
                {
                    "text": str(task.get("text") or task.get("title") or "").strip(),
                    "kind": str(task.get("kind") or "task"),
                }
            )
        else:
            items.append({"text": str(task), "kind": "task"})
    # Also harvest imperative-looking lines
    for line in source.splitlines():
        stripped = line.strip(" -*\t")
        if re.match(r"^(TODO|FIXME|Action|Akcia)\b", stripped, re.I):
            items.append({"text": stripped, "kind": "marked"})
        elif re.match(r"^(Please|Prosím|Treba|Need to)\b", stripped, re.I):
            items.append({"text": stripped, "kind": "request"})
        if len(items) >= limit:
            break
    # Dedup
    seen: set[str] = set()
    unique = []
    for item in items:
        key = item["text"].lower()
        if not key or key in seen:
            continue
        seen.add(key)
        unique.append(item)
    enhanced = False
    polished = try_complete_from_options(
        llm,
        prompt=(
            "Extract concrete action items as a numbered list (max "
            f"{limit}). Source:\n\n{source[:4000]}"
        ),
        system="Output only numbered action items, one per line.",
        max_tokens=400,
    )
    if polished:
        llm_items = []
        for line in polished.splitlines():
            cleaned = re.sub(r"^\d+[.)]\s*", "", line).strip(" -*")
            if cleaned:
                llm_items.append({"text": cleaned, "kind": "llm"})
        if llm_items:
            unique = llm_items[:limit]
            enhanced = True
    return {
        "items": unique[:limit],
        "count": len(unique[:limit]),
        "enhanced": enhanced,
        "source": "python",
    }


def glossary_from_text(
    text: str,
    *,
    limit: int = 12,
    llm: dict[str, Any] | None = None,
) -> dict[str, Any]:
    source = (text or "").strip()
    if not source:
        raise ValueError("text is required")
    language = detect_language(source)
    tokens = tokenize(source)
    # Prefer capitalized / longer content tokens as term candidates
    candidates: dict[str, int] = {}
    for raw in re.findall(r"\b[\wÁÄČĎÉÍĹĽŇÓÔŔŠŤÚÝŽáäčďéíĺľňóôŕšťúýž-]{4,}\b", source):
        if raw.lower() in {"this", "that", "with", "from", "have", "which", "ktorý", "ktorá", "toto"}:
            continue
        key = raw if raw[:1].isupper() else raw.lower()
        candidates[key] = candidates.get(key, 0) + 1
    ranked = sorted(candidates.items(), key=lambda kv: (-kv[1], -len(kv[0]), kv[0]))
    entries = []
    lower_source = source.lower()
    for term, count in ranked[: max(1, min(limit, 40))]:
        # Definition heuristic: sentence containing the term
        definition = ""
        for sentence in split_sentences(source):
            if term.lower() in sentence.lower():
                definition = sentence.strip()
                break
        if not definition:
            definition = f"Mentioned {count}× in the note."
        entries.append({"term": term, "definition": definition[:280], "count": count})
    enhanced = False
    polished = try_complete_from_options(
        llm,
        prompt=(
            f"Build a short glossary (max {limit} terms) as 'TERM — definition' lines "
            f"from this note:\n\n{source[:4000]}"
        ),
        system="Output only glossary lines. Keep definitions under 20 words.",
        max_tokens=500,
    )
    if polished:
        llm_entries = []
        for line in polished.splitlines():
            if "—" in line:
                term, definition = line.split("—", 1)
            elif " - " in line:
                term, definition = line.split(" - ", 1)
            else:
                continue
            term = term.strip(" \t-*0123456789.")
            definition = definition.strip()
            if term and definition:
                llm_entries.append({"term": term, "definition": definition, "count": lower_source.count(term.lower())})
        if llm_entries:
            entries = llm_entries[:limit]
            enhanced = True
    return {
        "language": language,
        "entries": entries[:limit],
        "count": len(entries[:limit]),
        "tokenCount": len(tokens),
        "enhanced": enhanced,
        "source": "python",
    }


def compare_notes(
    text_a: str,
    text_b: str,
    *,
    title_a: str | None = None,
    title_b: str | None = None,
    llm: dict[str, Any] | None = None,
) -> dict[str, Any]:
    a = (text_a or "").strip()
    b = (text_b or "").strip()
    if not a or not b:
        raise ValueError("both texts are required")
    diff = summarize_diff(a, b)
    summary = str(diff.get("summary") or diff.get("markdown") or "")
    enhanced = False
    polished = try_complete_from_options(
        llm,
        prompt=(
            f"Compare two notes.\nA ({title_a or 'A'}):\n{a[:2500]}\n\n"
            f"B ({title_b or 'B'}):\n{b[:2500]}\n\n"
            "Write 4 short bullets: shared themes, only-in-A, only-in-B, risks."
        ),
        system="Be concise and concrete.",
        max_tokens=400,
    )
    if polished:
        summary = polished
        enhanced = True
    return {
        "titleA": title_a,
        "titleB": title_b,
        "diff": diff,
        "summary": summary,
        "enhanced": enhanced,
        "source": "python",
    }
