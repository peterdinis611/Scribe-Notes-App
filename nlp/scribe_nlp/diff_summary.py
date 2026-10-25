from __future__ import annotations

from collections import Counter
from difflib import SequenceMatcher

from .summarize import summarize_text
from .text_utils import (
    content_tokens,
    jaccard_similarity,
    normalize_text,
    split_sentences,
    tokenize,
)

# Replace pairs at/above this Jaccard are "modified"; below → delete + insert.
_MODIFY_THRESHOLD = 0.34
# Second pass: reclaim high-overlap add/remove pairs (reorder / paraphrase).
_RECLAIM_THRESHOLD = 0.55


def summarize_diff(old_text: str, new_text: str, *, max_bullets: int = 5) -> dict[str, object]:
    """Revision summary with sentence alignment, modified pairs, and ranked terms."""
    old = old_text or ""
    new = new_text or ""
    max_bullets = max(1, min(int(max_bullets or 5), 12))

    old_sentences = [normalize_text(item) for item in split_sentences(old) if normalize_text(item)]
    new_sentences = [normalize_text(item) for item in split_sentences(new) if normalize_text(item)]

    added, removed, modified = _align_sentences(old_sentences, new_sentences)
    added, removed, modified = _reclaim_modified_pairs(added, removed, modified)

    added = added[:max_bullets]
    removed = removed[:max_bullets]
    modified = modified[:max_bullets]

    old_token_list = content_tokens(old)
    new_token_list = content_tokens(new)
    old_counts = Counter(old_token_list)
    new_counts = Counter(new_token_list)
    gained = _ranked_delta(new_counts, old_counts, limit=12)
    lost = _ranked_delta(old_counts, new_counts, limit=12)

    focus_parts: list[str] = []
    for pair in modified[:2]:
        focus_parts.append(str(pair.get("new") or ""))
    if added and len(focus_parts) < 3:
        focus_parts.extend(added[: 3 - len(focus_parts)])
    if removed and len(focus_parts) < 3:
        focus_parts.extend(
            f"(removed) {item}" for item in removed[: 3 - len(focus_parts)]
        )
    focus = " ".join(part for part in focus_parts if part)
    summary = ""
    if focus:
        summary = str(
            summarize_text(focus, max_sentences=min(3, max_bullets)).get("summary") or focus
        )

    old_token_set = set(old_token_list)
    new_token_set = set(new_token_list)
    union = len(old_token_set | new_token_set)
    token_ratio = (len(old_token_set ^ new_token_set) / union) if union else 0.0
    seq_ratio = 1.0 - SequenceMatcher(
        a=old_sentences, b=new_sentences, autojunk=False
    ).ratio()
    # Blend set-diff and sequence distance; empty docs → 0.
    if not old_sentences and not new_sentences:
        change_ratio = 0.0
    elif not old_sentences or not new_sentences:
        change_ratio = 1.0
    else:
        change_ratio = 0.55 * token_ratio + 0.45 * seq_ratio

    return {
        "summary": summary,
        "addedSentences": added,
        "removedSentences": removed,
        "modifiedSentences": modified,
        "gainedTerms": gained,
        "lostTerms": lost,
        "changeRatio": round(change_ratio, 3),
        "oldWordCount": len(tokenize(old)),
        "newWordCount": len(tokenize(new)),
    }


def _align_sentences(
    old_sentences: list[str],
    new_sentences: list[str],
) -> tuple[list[str], list[str], list[dict[str, object]]]:
    added: list[str] = []
    removed: list[str] = []
    modified: list[dict[str, object]] = []

    matcher = SequenceMatcher(a=old_sentences, b=new_sentences, autojunk=False)
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == "equal":
            continue
        if tag == "insert":
            added.extend(new_sentences[j1:j2])
            continue
        if tag == "delete":
            removed.extend(old_sentences[i1:i2])
            continue
        # replace — pair by best Jaccard within the block
        left = old_sentences[i1:i2]
        right = new_sentences[j1:j2]
        pairs, leftover_old, leftover_new = _pair_by_similarity(left, right)
        for old_sent, new_sent, sim in pairs:
            if sim >= _MODIFY_THRESHOLD:
                modified.append(
                    {
                        "old": old_sent,
                        "new": new_sent,
                        "similarity": round(sim, 3),
                    }
                )
            else:
                removed.append(old_sent)
                added.append(new_sent)
        removed.extend(leftover_old)
        added.extend(leftover_new)

    return added, removed, modified


def _pair_by_similarity(
    left: list[str],
    right: list[str],
) -> tuple[list[tuple[str, str, float]], list[str], list[str]]:
    """Greedy best-Jaccard matching between two sentence lists."""
    if not left or not right:
        return [], list(left), list(right)

    candidates: list[tuple[float, int, int]] = []
    for li, old_sent in enumerate(left):
        for ri, new_sent in enumerate(right):
            if old_sent == new_sent:
                sim = 1.0
            else:
                sim = jaccard_similarity(old_sent, new_sent)
                # Character ratio catches typo-level edits with few content tokens.
                if sim < 0.5:
                    char_sim = SequenceMatcher(None, old_sent, new_sent).ratio()
                    sim = max(sim, char_sim * 0.85)
            candidates.append((sim, li, ri))
    candidates.sort(reverse=True)

    used_l: set[int] = set()
    used_r: set[int] = set()
    pairs: list[tuple[str, str, float]] = []
    for sim, li, ri in candidates:
        if li in used_l or ri in used_r:
            continue
        if sim < 0.12:
            break
        used_l.add(li)
        used_r.add(ri)
        pairs.append((left[li], right[ri], sim))

    leftover_old = [sent for i, sent in enumerate(left) if i not in used_l]
    leftover_new = [sent for i, sent in enumerate(right) if i not in used_r]
    return pairs, leftover_old, leftover_new


def _reclaim_modified_pairs(
    added: list[str],
    removed: list[str],
    modified: list[dict[str, object]],
) -> tuple[list[str], list[str], list[dict[str, object]]]:
    """Pull high-overlap add/remove pairs into modified (moves / soft rewrites)."""
    if not added or not removed:
        return added, removed, modified

    pairs, leftover_old, leftover_new = _pair_by_similarity(removed, added)
    next_modified = list(modified)
    kept_removed = list(leftover_old)
    kept_added = list(leftover_new)
    for old_sent, new_sent, sim in pairs:
        if sim >= _RECLAIM_THRESHOLD:
            if old_sent != new_sent:
                next_modified.append(
                    {
                        "old": old_sent,
                        "new": new_sent,
                        "similarity": round(sim, 3),
                    }
                )
            # Exact sentence move: drop from both churn lists.
            continue
        kept_removed.append(old_sent)
        kept_added.append(new_sent)

    return kept_added, kept_removed, next_modified


def _ranked_delta(primary: Counter[str], secondary: Counter[str], *, limit: int) -> list[str]:
    """Terms with higher count in `primary` than `secondary`, ranked by net gain."""
    scored: list[tuple[int, str]] = []
    for term, count in primary.items():
        net = count - secondary.get(term, 0)
        if net > 0:
            scored.append((net, term))
    scored.sort(key=lambda item: (-item[0], item[1]))
    return [term for _, term in scored[:limit]]
