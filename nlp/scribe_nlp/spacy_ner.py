"""Optional spaCy NER merge (xx_ent_wiki_sm or en_core_web_sm)."""

from __future__ import annotations

from functools import lru_cache

from .extras import has_spacy
from .normalize import fold_diacritics


SPACY_KIND_MAP = {
    "PER": "person",
    "PERSON": "person",
    "ORG": "org",
    "GPE": "place",
    "LOC": "place",
    "FAC": "place",
    "PRODUCT": "phrase",
    "EVENT": "phrase",
    "WORK_OF_ART": "phrase",
}


@lru_cache(maxsize=1)
def _load_nlp():
    if not has_spacy():
        return None
    try:
        import spacy

        for name in ("xx_ent_wiki_sm", "en_core_web_sm", "en_core_web_md"):
            try:
                return spacy.load(name)
            except Exception:
                continue
        # Blank multilingual with NER pipe unavailable — skip.
        return None
    except Exception:
        return None


def spacy_available() -> bool:
    return _load_nlp() is not None


def extract_spacy_entities(text: str, *, limit: int = 40) -> list[dict[str, str]]:
    """Return [{text, kind}] from spaCy when the model is installed."""
    nlp = _load_nlp()
    if nlp is None or not (text or "").strip():
        return []
    try:
        # Avoid huge docs blocking sidecar.
        doc = nlp((text or "")[:20_000])
    except Exception:
        return []

    out: list[dict[str, str]] = []
    seen: set[str] = set()
    for ent in doc.ents:
        label = str(ent.label_ or "").upper()
        kind = SPACY_KIND_MAP.get(label)
        if not kind:
            continue
        value = " ".join(str(ent.text or "").split()).strip()
        if len(value) < 2 or len(value) > 80:
            continue
        key = f"{kind}:{fold_diacritics(value).lower()}"
        if key in seen:
            continue
        seen.add(key)
        out.append({"text": value, "kind": kind})
        if len(out) >= limit:
            break
    return out
