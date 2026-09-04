from __future__ import annotations

import re
from collections import Counter

from .stopwords import STOP_WORDS, STOP_WORDS_EN, STOP_WORDS_SK

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

# Re-export for callers that imported STOP_WORDS from text_utils.
__all__ = [
    "STOP_WORDS",
    "STOP_WORDS_EN",
    "STOP_WORDS_SK",
    "normalize_text",
    "tokenize",
    "content_tokens",
    "split_sentences",
    "jaccard_similarity",
    "top_terms",
    "truncate_text",
]


def normalize_text(text: str) -> str:
    return WHITESPACE_RE.sub(" ", (text or "").strip())


def tokenize(text: str) -> list[str]:
    return [token.lower() for token in WORD_RE.findall(text or "") if len(token) > 1]


def content_tokens(text: str) -> list[str]:
    """Tokens with stopwords and ultra-short noise removed."""
    return [
        token
        for token in tokenize(text)
        if token not in STOP_WORDS and len(token) > 2
    ]


def split_sentences(text: str) -> list[str]:
    cleaned = normalize_text(text)
    if not cleaned:
        return []
    parts = SENTENCE_SPLIT.split(cleaned)
    return [part.strip() for part in parts if part.strip()]


def jaccard_similarity(left: str, right: str) -> float:
    left_tokens = set(content_tokens(left))
    right_tokens = set(content_tokens(right))
    if not left_tokens or not right_tokens:
        return 0.0
    intersection = len(left_tokens & right_tokens)
    union = len(left_tokens | right_tokens)
    return intersection / union if union else 0.0


def top_terms(texts: list[str], limit: int = 12) -> list[tuple[str, int]]:
    counter: Counter[str] = Counter()
    for text in texts:
        counter.update(content_tokens(text))
    return counter.most_common(limit)


def truncate_text(text: str, max_chars: int) -> str:
    cleaned = text or ""
    if len(cleaned) <= max_chars:
        return cleaned
    return cleaned[:max_chars]
