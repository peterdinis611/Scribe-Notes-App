from __future__ import annotations

from .summarize import summarize_text
from .text_utils import content_tokens, normalize_text, split_sentences


def summarize_diff(old_text: str, new_text: str, *, max_bullets: int = 5) -> dict[str, object]:
    """Lightweight revision summary: added/removed sentences + extractive note."""
    old = old_text or ""
    new = new_text or ""
    max_bullets = max(1, min(int(max_bullets or 5), 12))

    old_sentences = [normalize_text(item) for item in split_sentences(old)]
    new_sentences = [normalize_text(item) for item in split_sentences(new)]
    old_set = set(old_sentences)
    new_set = set(new_sentences)

    added = [item for item in new_sentences if item and item not in old_set][:max_bullets]
    removed = [item for item in old_sentences if item and item not in new_set][:max_bullets]

    old_tokens = set(content_tokens(old))
    new_tokens = set(content_tokens(new))
    gained = sorted(new_tokens - old_tokens)[:12]
    lost = sorted(old_tokens - new_tokens)[:12]

    focus_parts: list[str] = []
    if added:
        focus_parts.extend(added[:3])
    if removed and len(focus_parts) < 3:
        focus_parts.extend(f"(removed) {item}" for item in removed[: 3 - len(focus_parts)])
    focus = " ".join(focus_parts)
    summary = ""
    if focus:
        summary = str(summarize_text(focus, max_sentences=min(3, max_bullets)).get("summary") or focus)

    change_ratio = 0.0
    union = len(old_tokens | new_tokens)
    if union:
        change_ratio = len(old_tokens ^ new_tokens) / union

    return {
        "summary": summary,
        "addedSentences": added,
        "removedSentences": removed,
        "gainedTerms": gained,
        "lostTerms": lost,
        "changeRatio": round(change_ratio, 3),
        "oldWordCount": len(old.split()),
        "newWordCount": len(new.split()),
    }
