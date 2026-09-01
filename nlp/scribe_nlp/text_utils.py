from __future__ import annotations

import re
from collections import Counter

WORD_RE = re.compile(r"[\w\u00C0-\u024F]+", re.UNICODE)
SENTENCE_SPLIT = re.compile(r"(?<=[.!?…])\s+")

EMAIL_RE = re.compile(r"\b[\w.+-]+@[\w-]+\.[\w.-]+\b")
DATE_RE = re.compile(
    r"\b(\d{4}-\d{2}-\d{2}|\d{1,2}[./]\d{1,2}[./]\d{2,4})\b"
)
HASHTAG_RE = re.compile(r"(?<!\w)#([\w\u00C0-\u024F-]+)", re.UNICODE)
CAP_PHRASE_RE = re.compile(
    r"\b([A-ZÁÄČĎÉÍĹĽŇÓÔŔŠŤÚÝŽ][\w\u00C0-\u024F-]+(?:\s+[A-ZÁÄČĎÉÍĹĽŇÓÔŔŠŤÚÝŽ][\w\u00C0-\u024F-]+)+)\b"
)


def tokenize(text: str) -> list[str]:
    return [token.lower() for token in WORD_RE.findall(text or "") if len(token) > 1]


def split_sentences(text: str) -> list[str]:
    cleaned = (text or "").strip()
    if not cleaned:
        return []
    parts = SENTENCE_SPLIT.split(cleaned)
    return [part.strip() for part in parts if part.strip()]


def top_terms(texts: list[str], limit: int = 12) -> list[tuple[str, int]]:
    counter: Counter[str] = Counter()
    stop = {
        "a",
        "an",
        "the",
        "and",
        "or",
        "to",
        "of",
        "in",
        "on",
        "for",
        "with",
        "je",
        "sa",
        "na",
        "do",
        "od",
        "po",
        "pre",
        "aby",
        "som",
        "si",
        "sme",
        "ste",
        "sú",
        "že",
        "ako",
        "ale",
        "pri",
        "už",
        "nie",
        "tak",
        "to",
        "ta",
        "ten",
        "tá",
        "toto",
        "táto",
        "ktorý",
        "ktorá",
        "ktoré",
    }
    for text in texts:
        counter.update(token for token in tokenize(text) if token not in stop)
    return counter.most_common(limit)
