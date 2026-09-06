from __future__ import annotations

from .text_utils import tokenize

# Compact bilingual polarity lexicon (stdlib-only sentiment-lite).
POSITIVE = {
    # EN
    "good",
    "great",
    "excellent",
    "happy",
    "love",
    "loved",
    "glad",
    "proud",
    "success",
    "successful",
    "win",
    "won",
    "better",
    "best",
    "hope",
    "hopeful",
    "calm",
    "peace",
    "peaceful",
    "grateful",
    "thankful",
    "progress",
    "improved",
    "joy",
    "joyful",
    # SK
    "dobré",
    "dobre",
    "skvelé",
    "skvele",
    "výborné",
    "vyborne",
    "šťastný",
    "stastny",
    "šťastná",
    "radosť",
    "radost",
    "milujem",
    "hrdý",
    "hrdy",
    "úspech",
    "uspech",
    "lepšie",
    "lepsie",
    "najlepšie",
    "pokoj",
    "vďačný",
    "vdacny",
    "vďačná",
    "pokrok",
    "lepší",
    "teší",
    "tesi",
    "potešenie",
    "potešilo",
    "super",
    "paráda",
    "parada",
}

NEGATIVE = {
    # EN
    "bad",
    "worse",
    "worst",
    "sad",
    "angry",
    "hate",
    "afraid",
    "fear",
    "fail",
    "failed",
    "failure",
    "stress",
    "stressed",
    "tired",
    "anxious",
    "anxiety",
    "pain",
    "hurt",
    "problem",
    "problems",
    "worry",
    "worried",
    "frustrated",
    "lonely",
    "cry",
    "crying",
    # SK
    "zlé",
    "zle",
    "horšie",
    "horsie",
    "smutný",
    "smutny",
    "smutná",
    "nahnevaný",
    "nahnevany",
    "nenávidím",
    "nenavidim",
    "strach",
    "bojím",
    "bojim",
    "zlyhanie",
    "zlyhal",
    "stres",
    "unavený",
    "unaveny",
    "úzkosť",
    "uzkost",
    "bolesť",
    "bolest",
    "problém",
    "problem",
    "problémy",
    "starosť",
    "starost",
    "frustrovaný",
    "osamotený",
    "osamoteny",
    "plačem",
    "placem",
    "hrozné",
    "hrozne",
    "sklamanie",
    "sklamaný",
    "sklamany",
}


def analyze_sentiment(text: str) -> dict[str, object]:
    """Lexicon polarity → label for digests / insights."""
    tokens = tokenize(text)
    if not tokens:
        return {
            "label": "neutral",
            "score": 0.0,
            "positiveHits": 0,
            "negativeHits": 0,
            "confidence": 0.0,
        }

    pos = sum(1 for token in tokens if token in POSITIVE)
    neg = sum(1 for token in tokens if token in NEGATIVE)
    total = pos + neg
    if total == 0:
        return {
            "label": "neutral",
            "score": 0.0,
            "positiveHits": 0,
            "negativeHits": 0,
            "confidence": 0.0,
        }

    raw = (pos - neg) / total
    confidence = min(1.0, total / max(len(tokens) * 0.08, 1))
    if raw >= 0.25:
        label = "positive"
    elif raw <= -0.25:
        label = "negative"
    else:
        label = "mixed" if total >= 3 else "neutral"

    return {
        "label": label,
        "score": round(raw, 3),
        "positiveHits": pos,
        "negativeHits": neg,
        "confidence": round(confidence, 3),
    }
