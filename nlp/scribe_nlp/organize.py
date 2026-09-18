from __future__ import annotations

from .keywords import extract_keywords
from .normalize import fold_diacritics, stem_lite
from .text_utils import content_stems, normalize_text

MAX_FOLDERS = 500


def suggest_organize(
    text: str,
    folders: list[dict[str, object]],
    *,
    tags: list[str] | None = None,
    current_folder_id: str | None = None,
    limit: int = 3,
) -> dict[str, object]:
    """Rank folders for a note from title/body keywords + existing tags."""
    source = normalize_text(text)
    folder_rows = [
        folder
        for folder in (folders or [])[:MAX_FOLDERS]
        if str(folder.get("id") or "").strip() and str(folder.get("name") or "").strip()
    ]
    limit = max(1, min(int(limit or 3), 8))
    tag_terms = [normalize_text(tag) for tag in (tags or []) if normalize_text(tag)]
    keyword_terms = [
        str(item.get("term") or "")
        for item in (extract_keywords(source, limit=16).get("keywords") or [])
        if item.get("term")
    ]
    if not folder_rows:
        proposed = _propose_folder_name(tag_terms, keyword_terms, _titleish_tokens(source))
        return {
            "suggestions": [],
            "count": 0,
            "bestFolderId": None,
            "bestFolderName": proposed,
            "createNew": bool(proposed),
        }

    needles = _needle_stems(tag_terms + keyword_terms + _titleish_tokens(source))
    if not needles:
        return {"suggestions": [], "count": 0, "bestFolderId": None, "bestFolderName": None}

    scored: list[dict[str, object]] = []
    for folder in folder_rows:
        folder_id = str(folder.get("id") or "")
        name = normalize_text(str(folder.get("name") or ""))
        if current_folder_id and folder_id == current_folder_id:
            continue
        # Skip system-ish roots that are rarely useful auto-targets.
        folded_name = fold_diacritics(name).lower()
        if folded_name in {"inbox", "trash", "archive", "all notes", "všetko", "vsetko"}:
            continue

        name_stems = set(content_stems(name))
        if not name_stems and folded_name:
            name_stems = {stem_lite(folded_name)}

        score = 0.0
        reasons: list[str] = []
        for needle, weight in needles.items():
            if needle == folded_name or needle in name_stems:
                score += 3.0 * weight
                reasons.append("exact")
            elif any(needle in stem or stem in needle for stem in name_stems):
                score += 1.2 * weight
                reasons.append("partial")
            elif needle in folded_name or folded_name in needle:
                score += 1.6 * weight
                reasons.append("substring")

        if score <= 0:
            continue
        scored.append(
            {
                "folderId": folder_id,
                "name": name,
                "score": round(score, 4),
                "reason": reasons[0] if reasons else "match",
            }
        )

    scored.sort(key=lambda item: float(item.get("score") or 0), reverse=True)
    suggestions = scored[:limit]
    best = suggestions[0] if suggestions else None
    if best:
        return {
            "suggestions": suggestions,
            "count": len(suggestions),
            "bestFolderId": best.get("folderId"),
            "bestFolderName": best.get("name"),
            "createNew": False,
        }

    proposed = _propose_folder_name(tag_terms, keyword_terms, _titleish_tokens(source))
    return {
        "suggestions": [],
        "count": 0,
        "bestFolderId": None,
        "bestFolderName": proposed,
        "createNew": bool(proposed),
    }


def _titleish_tokens(text: str) -> list[str]:
    first_line = (text.split("\n", 1)[0] if text else "").strip()
    return [token for token in first_line.split() if len(token) >= 3][:8]


_STOP_NAMES = {
    "the",
    "and",
    "for",
    "with",
    "from",
    "this",
    "that",
    "untitled",
    "document",
    "note",
    "notes",
    "poznamka",
    "poznámka",
    "dokument",
    "inbox",
    "trash",
}


def _propose_folder_name(
    tag_terms: list[str],
    keyword_terms: list[str],
    title_tokens: list[str],
) -> str | None:
    for term in [*tag_terms, *keyword_terms, *title_tokens]:
        cleaned = normalize_text(term)
        folded = fold_diacritics(cleaned).lower().strip()
        if len(folded) < 3 or folded in _STOP_NAMES:
            continue
        return cleaned[:1].upper() + cleaned[1:]
    return None


def _needle_stems(terms: list[str]) -> dict[str, float]:
    weights: dict[str, float] = {}
    for index, term in enumerate(terms):
        folded = fold_diacritics(term).lower().strip()
        if len(folded) < 2:
            continue
        weight = 1.0 if index < 6 else 0.6
        weights[folded] = max(weights.get(folded, 0.0), weight)
        for stem in content_stems(term):
            weights[stem] = max(weights.get(stem, 0.0), weight * 0.9)
    return weights
