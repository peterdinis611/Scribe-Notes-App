from __future__ import annotations

from .normalize import fold_diacritics, stem_lite
from .text_utils import tokenize

# Bidirectional SK ↔ EN topical synonyms for semantic / hybrid query expansion.
_PAIRS: list[tuple[str, ...]] = [
    ("poznámka", "poznamka", "note", "notes"),
    ("dokument", "document", "documents", "file"),
    ("denník", "dennik", "journal", "diary"),
    ("úloha", "uloha", "task", "todo", "todos"),
    ("štítok", "stitok", "tag", "tags", "label"),
    ("zhrnutie", "summary", "summarize", "digest"),
    ("vyhľadávanie", "vyhladavanie", "search", "find"),
    ("projekt", "project"),
    ("schôdza", "schodza", "meeting", "call"),
    ("termín", "termin", "deadline", "due"),
    ("klient", "customer", "client"),
    ("zmluva", "contract", "agreement"),
    ("faktúra", "faktura", "invoice"),
    ("nápad", "napad", "idea", "ideas"),
    ("cieľ", "ciel", "goal", "objective"),
    ("plán", "plan", "roadmap"),
    ("lokálne", "lokalne", "local", "offline"),
    ("embeddings", "embedding", "vektor", "vector"),
    ("knižnica", "kniznica", "library"),
    ("export", "pdf", "docx"),
]

_LOOKUP: dict[str, set[str]] = {}
for group in _PAIRS:
    folded = {fold_diacritics(item) for item in group}
    stems = {stem_lite(item) for item in group}
    keys = folded | stems
    values = set(group) | folded
    for key in keys:
        _LOOKUP.setdefault(key, set()).update(values)


def rewrite_query(query: str, *, max_expansions: int = 8) -> dict[str, object]:
    """Expand SK/EN synonyms for semantic search without changing user intent."""
    source = (query or "").strip()
    if not source:
        return {"query": "", "rewritten": "", "expansions": []}

    tokens = tokenize(source)
    expansions: list[str] = []
    seen = {fold_diacritics(source)}
    for token in tokens:
        key = stem_lite(token)
        for candidate in sorted(
            _LOOKUP.get(key, set()) | _LOOKUP.get(fold_diacritics(token), set())
        ):
            folded = fold_diacritics(candidate)
            if folded in seen or fold_diacritics(token) == folded:
                continue
            seen.add(folded)
            expansions.append(candidate)
            if len(expansions) >= max_expansions:
                break
        if len(expansions) >= max_expansions:
            break

    rewritten = source
    if expansions:
        rewritten = f"{source} {' '.join(expansions)}"

    return {
        "query": source,
        "rewritten": rewritten,
        "expansions": expansions,
    }
