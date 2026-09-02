from __future__ import annotations

import re
from collections import Counter

WORD_RE = re.compile(r"[\w\u00C0-\u024F]+", re.UNICODE)
SENTENCE_SPLIT = re.compile(r"(?<=[.!?…])\s+")
WHITESPACE_RE = re.compile(r"\s+")

EMAIL_RE = re.compile(r"\b[\w.+-]+@[\w-]+\.[\w.-]+\b")
DATE_RE = re.compile(
    r"\b(\d{4}-\d{2}-\d{2}|\d{1,2}[./]\d{1,2}[./]\d{2,4})\b"
)
HASHTAG_RE = re.compile(r"(?<!\w)#([\w\u00C0-\u024F-]+)", re.UNICODE)
CAP_PHRASE_RE = re.compile(
    r"\b([A-ZÁÄČĎÉÍĹĽŇÓÔŔŠŤÚÝŽ][\w\u00C0-\u024F-]+(?:\s+[A-ZÁÄČĎÉÍĹĽŇÓÔŔŠŤÚÝŽ][\w\u00C0-\u024F-]+)+)\b"
)
URL_RE = re.compile(r"https?://[^\s<>\"']+", re.IGNORECASE)
WIKI_LINK_RE = re.compile(r"\[\[([^\]|]+)(?:\|[^\]]+)?\]\]")
PHONE_RE = re.compile(r"(?<!\d)(?:\+421|0)\s?\d{2,3}\s?\d{3}\s?\d{3}(?:\s?\d{3})?(?!\d)")

STOP_WORDS = frozenset(
    {
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
        "is",
        "are",
        "was",
        "were",
        "be",
        "been",
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
        "ktorí",
        "ktorých",
        "ktorým",
        "tento",
        "táto",
        "toto",
        "tieto",
        "tam",
        "tu",
        "potom",
        "potom",
        "keď",
        "kedy",
        "kde",
        "preto",
        "pretože",
        "lebo",
        "aby",
        "veľmi",
        "viac",
        "menej",
        "len",
        "ešte",
        "už",
        "iba",
        "možno",
        "proste",
        "vlastne",
        "prosím",
        "dnes",
        "včera",
        "zajtra",
    }
)


def normalize_text(text: str) -> str:
    return WHITESPACE_RE.sub(" ", (text or "").strip())


def tokenize(text: str) -> list[str]:
    return [token.lower() for token in WORD_RE.findall(text or "") if len(token) > 1]


def split_sentences(text: str) -> list[str]:
    cleaned = normalize_text(text)
    if not cleaned:
        return []
    parts = SENTENCE_SPLIT.split(cleaned)
    return [part.strip() for part in parts if part.strip()]


def jaccard_similarity(left: str, right: str) -> float:
    left_tokens = set(tokenize(left))
    right_tokens = set(tokenize(right))
    if not left_tokens or not right_tokens:
        return 0.0
    intersection = len(left_tokens & right_tokens)
    union = len(left_tokens | right_tokens)
    return intersection / union if union else 0.0


def top_terms(texts: list[str], limit: int = 12) -> list[tuple[str, int]]:
    counter: Counter[str] = Counter()
    for text in texts:
        counter.update(token for token in tokenize(text) if token not in STOP_WORDS)
    return counter.most_common(limit)


def truncate_text(text: str, max_chars: int) -> str:
    cleaned = text or ""
    if len(cleaned) <= max_chars:
        return cleaned
    return cleaned[:max_chars]
