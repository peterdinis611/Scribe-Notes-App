from __future__ import annotations

import threading
from functools import lru_cache

from .extras import has_lingua
from .stopwords import (
    STOP_WORDS_CS,
    STOP_WORDS_EN,
    STOP_WORDS_HU,
    STOP_WORDS_PL,
    STOP_WORDS_SK,
)
from .text_utils import tokenize

SK_CHARS = set("áäčďéíĺľňóôŕšťúýžÁÄČĎÉÍĹĽŇÓÔŔŠŤÚÝŽ")
CS_CHARS = set("áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ")
HU_CHARS = set("áéíóöőúüűÁÉÍÓÖŐÚÜŰ")
PL_CHARS = set("ąćęłńóśźżĄĆĘŁŃÓŚŹŻ")

_SUPPORTED = ("sk", "en", "cs", "hu", "pl")

_lingua_lock = threading.Lock()


@lru_cache(maxsize=1)
def _lingua_detector():
    from lingua import Language, LanguageDetectorBuilder

    return LanguageDetectorBuilder.from_languages(
        Language.SLOVAK,
        Language.ENGLISH,
        Language.CZECH,
        Language.HUNGARIAN,
        Language.POLISH,
    ).build()


def detect_language(text: str) -> dict[str, object]:
    """SK / EN / CS / HU / PL detector — Lingua when installed, else stopword heuristics."""
    lingua_hit = _detect_lingua(text)
    if lingua_hit is not None:
        return lingua_hit
    return _detect_heuristic(text)


def _detect_lingua(text: str) -> dict[str, object] | None:
    if not has_lingua() or len((text or "").strip()) < 12:
        return None
    try:
        from lingua import Language

        detector = _lingua_detector()
        with _lingua_lock:
            confidence_values = detector.compute_language_confidence_values(text or "")
        mapping = {
            Language.SLOVAK: "sk",
            Language.ENGLISH: "en",
            Language.CZECH: "cs",
            Language.HUNGARIAN: "hu",
            Language.POLISH: "pl",
        }
        scores = {code: 0.0 for code in _SUPPORTED}
        for item in confidence_values:
            code = mapping.get(item.language)
            if code:
                scores[code] = float(item.value)

        ranked = sorted(scores.items(), key=lambda item: item[1], reverse=True)
        top_lang, top_score = ranked[0]
        second_score = ranked[1][1] if len(ranked) > 1 else 0.0
        if top_score <= 0.15:
            language = "unknown"
            confidence = 0.0
        elif top_score >= second_score * 1.05:
            language = top_lang
            confidence = top_score
        else:
            language = "unknown"
            confidence = max(top_score, second_score) * 0.5
        return {
            "language": language,
            "confidence": round(float(confidence), 3),
            "scores": {code: round(scores[code], 3) for code in _SUPPORTED},
        }
    except Exception:
        return None


def _diacritic_boost(text: str, chars: set[str], weight: float = 8.0) -> float:
    hits = sum(1 for char in (text or "") if char in chars)
    return min(0.35, hits / max(len(text or ""), 1) * weight)


def _detect_heuristic(text: str) -> dict[str, object]:
    tokens = tokenize(text)
    empty_scores = {code: 0.0 for code in _SUPPORTED}
    if len(tokens) < 4:
        return {
            "language": "unknown",
            "confidence": 0.0,
            "scores": empty_scores,
        }

    unique = set(tokens)
    denom = max(len(unique), 1)
    scores = {
        "sk": len(unique & STOP_WORDS_SK) / denom + _diacritic_boost(text, SK_CHARS),
        "en": len(unique & STOP_WORDS_EN) / denom,
        "cs": len(unique & STOP_WORDS_CS) / denom + _diacritic_boost(text, CS_CHARS),
        "hu": len(unique & STOP_WORDS_HU) / denom + _diacritic_boost(text, HU_CHARS),
        "pl": len(unique & STOP_WORDS_PL) / denom + _diacritic_boost(text, PL_CHARS),
    }

    # Slovak vs Czech share many tokens — prefer distinctive diacritics when close.
    if abs(scores["sk"] - scores["cs"]) < 0.04:
        sk_only = sum(1 for char in (text or "") if char in "äĺľŕô")
        cs_only = sum(1 for char in (text or "") if char in "ěřů")
        if sk_only > cs_only:
            scores["sk"] += 0.05
        elif cs_only > sk_only:
            scores["cs"] += 0.05

    ranked = sorted(scores.items(), key=lambda item: item[1], reverse=True)
    top_lang, top_score = ranked[0]
    second_score = ranked[1][1]
    if top_score <= 0.02:
        language = "unknown"
        confidence = 0.0
    elif top_score >= second_score * 1.05:
        language = top_lang
        confidence = min(1.0, top_score / max(top_score + second_score, 1e-6))
    else:
        language = "unknown"
        confidence = 0.35

    return {
        "language": language,
        "confidence": round(confidence, 3),
        "scores": {code: round(scores[code], 3) for code in _SUPPORTED},
    }
