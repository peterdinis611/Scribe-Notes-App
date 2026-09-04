from __future__ import annotations

from .stopwords import STOP_WORDS_EN, STOP_WORDS_SK
from .text_utils import tokenize

SK_CHARS = set("áäčďéíĺľňóôŕšťúýžÁÄČĎÉÍĹĽŇÓÔŔŠŤÚÝŽ")


def detect_language(text: str) -> dict[str, object]:
    """Heuristic SK / EN detector (stopword overlap + diacritics)."""
    tokens = tokenize(text)
    if len(tokens) < 4:
        return {
            "language": "unknown",
            "confidence": 0.0,
            "scores": {"sk": 0.0, "en": 0.0},
        }

    unique = set(tokens)
    sk_hits = len(unique & STOP_WORDS_SK)
    en_hits = len(unique & STOP_WORDS_EN)
    diacritic_chars = sum(1 for char in (text or "") if char in SK_CHARS)
    diacritic_boost = min(0.35, diacritic_chars / max(len(text or ""), 1) * 8)

    sk_score = sk_hits / max(len(unique), 1) + diacritic_boost
    en_score = en_hits / max(len(unique), 1)

    if sk_score <= 0.02 and en_score <= 0.02:
        language = "unknown"
        confidence = 0.0
    elif sk_score >= en_score * 1.05:
        language = "sk"
        confidence = min(1.0, sk_score / max(sk_score + en_score, 1e-6))
    elif en_score > sk_score * 1.05:
        language = "en"
        confidence = min(1.0, en_score / max(sk_score + en_score, 1e-6))
    else:
        language = "unknown"
        confidence = 0.35

    return {
        "language": language,
        "confidence": round(confidence, 3),
        "scores": {
            "sk": round(sk_score, 3),
            "en": round(en_score, 3),
        },
    }
