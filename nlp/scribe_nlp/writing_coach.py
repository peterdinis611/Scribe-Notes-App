"""Local writing coach hints (style / clarity) — no cloud LLM."""

from __future__ import annotations

import re
from collections import Counter
from typing import Any

from .language import detect_language
from .text_utils import content_tokens, split_sentences, tokenize

_FILLERS_EN = {
    "basically",
    "actually",
    "literally",
    "really",
    "very",
    "just",
    "maybe",
    "perhaps",
    "kind",
    "sort",
}
_FILLERS_SK = {
    "vlastne",
    "proste",
    "takže",
    "akože",
    "fakt",
    "úplne",
    "celkom",
    "možno",
    "trochu",
}
_PASSIVE_EN = re.compile(r"\b(?:is|are|was|were|be|been|being)\s+\w+ed\b", re.IGNORECASE)
_PASSIVE_SK = re.compile(
    r"\b(?:je|sú|bol|bola|bolo|boli|bude|budú)\s+\w+(?:ý|á|é|í|é|ení|aná|ané)\b",
    re.IGNORECASE,
)


def writing_coach(text: str, *, limit: int = 12) -> dict[str, Any]:
    source = text or ""
    limit = max(1, min(int(limit or 12), 30))
    language = str(detect_language(source).get("language") or "unknown")
    slovak = language == "sk"
    sentences = split_sentences(source)
    words = tokenize(source)
    fillers = _FILLERS_SK if slovak else _FILLERS_EN

    hints: list[dict[str, Any]] = []

    long_sentences = [s for s in sentences if len(s.split()) >= 32]
    for sentence in long_sentences[:4]:
        hints.append(
            {
                "code": "long_sentence",
                "severity": "warn",
                "message": (
                    "Príliš dlhá veta — rozdeľ ju."
                    if slovak
                    else "Sentence is very long — consider splitting it."
                ),
                "excerpt": sentence[:180],
            }
        )

    passive_re = _PASSIVE_SK if slovak else _PASSIVE_EN
    passive_hits = [s for s in sentences if passive_re.search(s)]
    if len(passive_hits) >= 2:
        hints.append(
            {
                "code": "passive_voice",
                "severity": "info",
                "message": (
                    f"Častý trpný rod ({len(passive_hits)} viet)."
                    if slovak
                    else f"Frequent passive voice ({len(passive_hits)} sentences)."
                ),
                "excerpt": passive_hits[0][:160],
            }
        )

    filler_counts = Counter(
        token.lower() for token in words if token.lower() in fillers
    )
    for word, count in filler_counts.most_common(4):
        if count < 3:
            continue
        hints.append(
            {
                "code": "filler_word",
                "severity": "info",
                "message": (
                    f"Výplňové slovo „{word}“ ({count}×)."
                    if slovak
                    else f"Filler word “{word}” used {count}×."
                ),
                "excerpt": word,
            }
        )

    content = content_tokens(source)
    repeats = Counter(content)
    for word, count in repeats.most_common(8):
        if count < 6 or len(word) < 5:
            continue
        hints.append(
            {
                "code": "repeated_word",
                "severity": "info",
                "message": (
                    f"Opakované slovo „{word}“ ({count}×)."
                    if slovak
                    else f"Repeated word “{word}” ({count}×)."
                ),
                "excerpt": word,
            }
        )
        if len(hints) >= limit:
            break

    avg_len = (sum(len(s.split()) for s in sentences) / len(sentences)) if sentences else 0.0
    if avg_len >= 24:
        hints.append(
            {
                "code": "dense_prose",
                "severity": "warn",
                "message": (
                    f"Priemerná dĺžka vety {avg_len:.0f} slov — text pôsobí hustým."
                    if slovak
                    else f"Average sentence length is {avg_len:.0f} words — prose feels dense."
                ),
                "excerpt": "",
            }
        )

    if not hints:
        hints.append(
            {
                "code": "ok",
                "severity": "info",
                "message": (
                    "Žiadne výrazné štýlové problémy."
                    if slovak
                    else "No major style issues found."
                ),
                "excerpt": "",
            }
        )

    score = max(0, 100 - len([h for h in hints if h["code"] != "ok"]) * 8)

    return {
        "language": language,
        "score": score,
        "hints": hints[:limit],
        "stats": {
            "sentenceCount": len(sentences),
            "wordCount": len(words),
            "averageSentenceWords": round(avg_len, 1),
            "longSentenceCount": len(long_sentences),
            "passiveSentenceCount": len(passive_hits),
        },
        "source": "python",
    }
