"""Suggest next phrases from the library corpus (local n-gram continuation)."""

from __future__ import annotations

import re
from collections import Counter, defaultdict
from typing import Any

_TOKEN_RE = re.compile(r"[A-Za-zÀ-ž0-9][A-Za-zÀ-ž0-9'\-]{0,48}", re.UNICODE)
_MAX_PREFIX_CHARS = 4_000
_MAX_CORPUS_DOCS = 80
_MAX_CORPUS_CHARS = 120_000
_MAX_SUGGESTIONS = 5
_MAX_TOKENS = 32


def suggest_continuation(
    prefix: str,
    *,
    corpus: list[str] | None = None,
    max_suggestions: int = 3,
    max_tokens: int = 16,
) -> dict[str, Any]:
    """Return ranked continuation phrases based on local n-grams.

    Uses trigrams when possible, then bigrams, then unigram frequency.
    Corpus is optional — when empty, falls back to the prefix itself.
    """
    prefix = (prefix or "")[-_MAX_PREFIX_CHARS:]
    max_suggestions = max(1, min(int(max_suggestions), _MAX_SUGGESTIONS))
    max_tokens = max(1, min(int(max_tokens), _MAX_TOKENS))

    docs = _prepare_corpus(corpus)
    if prefix.strip():
        docs.append(prefix)

    tokens_by_doc = [tokenize(doc) for doc in docs if doc.strip()]
    if not tokens_by_doc:
        return {
            "suggestions": [],
            "prefixTail": "",
            "source": "python",
            "corpusDocs": 0,
            "model": "empty",
        }

    trigrams: dict[tuple[str, str], Counter[str]] = defaultdict(Counter)
    bigrams: dict[str, Counter[str]] = defaultdict(Counter)
    unigrams: Counter[str] = Counter()

    for tokens in tokens_by_doc:
        for token in tokens:
            unigrams[token.lower()] += 1
        for i in range(len(tokens) - 1):
            bigrams[tokens[i].lower()][tokens[i + 1]] += 1
        for i in range(len(tokens) - 2):
            key = (tokens[i].lower(), tokens[i + 1].lower())
            trigrams[key][tokens[i + 2]] += 1

    seed = tokenize(prefix)
    tail = [t.lower() for t in seed[-2:]]
    prefix_tail = " ".join(seed[-4:]) if seed else ""

    suggestions: list[dict[str, Any]] = []
    seen: set[str] = set()

    for start_mode in ("trigram", "bigram", "unigram"):
        for text, score, model in _generate_candidates(
            start_mode=start_mode,
            tail=tail,
            trigrams=trigrams,
            bigrams=bigrams,
            unigrams=unigrams,
            max_tokens=max_tokens,
            limit=max_suggestions * 3,
        ):
            key = text.lower()
            if not text or key in seen:
                continue
            seen.add(key)
            suggestions.append(
                {
                    "text": text,
                    "score": round(score, 4),
                    "model": model,
                }
            )
            if len(suggestions) >= max_suggestions:
                break
        if len(suggestions) >= max_suggestions:
            break

    return {
        "suggestions": suggestions,
        "prefixTail": prefix_tail,
        "source": "python",
        "corpusDocs": max(0, len(docs) - (1 if prefix.strip() else 0)),
        "model": suggestions[0]["model"] if suggestions else "empty",
    }


def tokenize(text: str) -> list[str]:
    return _TOKEN_RE.findall(text or "")


def _prepare_corpus(corpus: list[str] | None) -> list[str]:
    if not corpus:
        return []
    docs: list[str] = []
    total = 0
    for raw in corpus[:_MAX_CORPUS_DOCS]:
        text = (raw or "").strip()
        if len(text) < 24:
            continue
        remaining = _MAX_CORPUS_CHARS - total
        if remaining <= 0:
            break
        chunk = text[:remaining]
        docs.append(chunk)
        total += len(chunk)
    return docs


def _generate_candidates(
    *,
    start_mode: str,
    tail: list[str],
    trigrams: dict[tuple[str, str], Counter[str]],
    bigrams: dict[str, Counter[str]],
    unigrams: Counter[str],
    max_tokens: int,
    limit: int,
) -> list[tuple[str, float, str]]:
    starters = _starter_options(start_mode, tail, trigrams, bigrams, unigrams)
    out: list[tuple[str, float, str]] = []
    for first, first_score in starters[: max(6, limit)]:
        words = [first]
        score = float(first_score)
        local_tail = list(tail)
        local_tail.append(first.lower())
        for _ in range(max_tokens - 1):
            nxt = _next_token(local_tail, trigrams, bigrams, unigrams)
            if not nxt:
                break
            token, step_score = nxt
            words.append(token)
            score += step_score
            local_tail.append(token.lower())
            if len(local_tail) > 2:
                local_tail = local_tail[-2:]
            if token.endswith((".", "!", "?")):
                break
        text = " ".join(words).strip()
        if text:
            out.append((text, score / max(len(words), 1), start_mode))
    out.sort(key=lambda item: item[1], reverse=True)
    return out[:limit]


def _starter_options(
    mode: str,
    tail: list[str],
    trigrams: dict[tuple[str, str], Counter[str]],
    bigrams: dict[str, Counter[str]],
    unigrams: Counter[str],
) -> list[tuple[str, float]]:
    if mode == "trigram" and len(tail) >= 2:
        counter = trigrams.get((tail[-2], tail[-1]))
        if counter:
            return _top_counter(counter)
    if mode in {"trigram", "bigram"} and tail:
        counter = bigrams.get(tail[-1])
        if counter:
            return _top_counter(counter)
    if unigrams:
        return [(word, float(count)) for word, count in unigrams.most_common(12)]
    return []


def _next_token(
    tail: list[str],
    trigrams: dict[tuple[str, str], Counter[str]],
    bigrams: dict[str, Counter[str]],
    unigrams: Counter[str],
) -> tuple[str, float] | None:
    if len(tail) >= 2:
        counter = trigrams.get((tail[-2], tail[-1]))
        if counter:
            token, count = counter.most_common(1)[0]
            return token, float(count)
    if tail:
        counter = bigrams.get(tail[-1])
        if counter:
            token, count = counter.most_common(1)[0]
            return token, float(count)
    if unigrams:
        token, count = unigrams.most_common(1)[0]
        return token, float(count)
    return None


def _top_counter(counter: Counter[str], limit: int = 8) -> list[tuple[str, float]]:
    return [(token, float(count)) for token, count in counter.most_common(limit)]
