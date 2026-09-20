from __future__ import annotations

from .extras import has_lingua
from .stopwords import STOP_WORDS_EN, STOP_WORDS_SK
from .text_utils import tokenize

SK_CHARS = set("áäčďéíĺľňóôŕšťúýžÁÄČĎÉÍĹĽŇÓÔŔŠŤÚÝŽ")


def detect_language(text: str) -> dict[str, object]:
    """SK / EN detector — Lingua when installed, else stopword heuristics."""
    lingua_hit = _detect_lingua(text)
    if lingua_hit is not None:
        return lingua_hit
    return _detect_heuristic(text)


def _detect_lingua(text: str) -> dict[str, object] | None:
    if not has_lingua() or len((text or "").strip()) < 12:
        return None
    try:
        from lingua import Language, LanguageDetectorBuilder

        detector = LanguageDetectorBuilder.from_languages(
            Language.SLOVAK,
            Language.ENGLISH,
        ).build()
        confidence_values = detector.compute_language_confidence_values(text or "")
        scores = {"sk": 0.0, "en": 0.0}
        for item in confidence_values:
            if item.language == Language.SLOVAK:
                scores["sk"] = float(item.value)
            elif item.language == Language.ENGLISH:
                scores["en"] = float(item.value)
        sk_score = scores["sk"]
        en_score = scores["en"]
        if sk_score <= 0.15 and en_score <= 0.15:
            language = "unknown"
            confidence = 0.0
        elif sk_score >= en_score * 1.05:
            language = "sk"
            confidence = sk_score
        elif en_score > sk_score * 1.05:
            language = "en"
            confidence = en_score
        else:
            language = "unknown"
            confidence = max(sk_score, en_score) * 0.5
        return {
            "language": language,
            "confidence": round(float(confidence), 3),
            "scores": {
                "sk": round(sk_score, 3),
                "en": round(en_score, 3),
            },
        }
    except Exception:
        return None


def _detect_heuristic(text: str) -> dict[str, object]:
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
