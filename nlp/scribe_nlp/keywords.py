from __future__ import annotations

import math
from collections import Counter

from .text_utils import content_tokens, split_sentences


def extract_keywords(text: str, limit: int = 12) -> dict[str, object]:
    """TF-lite + bigram keyphrases with stopword filtering."""
    source = text or ""
    sentences = split_sentences(source)
    tokens = content_tokens(source)
    if not tokens:
        return {"keywords": [], "keyphrases": []}

    tf: Counter[str] = Counter(tokens)
    total = len(tokens)
    df: Counter[str] = Counter()
    for sentence in sentences or [source]:
        df.update(set(content_tokens(sentence)))
    sentence_count = max(len(sentences), 1)

    scored: list[tuple[str, float]] = []
    for term, count in tf.items():
        idf = math.log((sentence_count + 1) / (df[term] + 1)) + 1.0
        score = (count / total) * idf
        if len(term) >= 6:
            score *= 1.08
        scored.append((term, score))
    scored.sort(key=lambda item: (-item[1], item[0]))
    keywords = [
        {"term": term, "score": round(score, 5), "count": tf[term]}
        for term, score in scored[:limit]
    ]

    bigrams: Counter[str] = Counter()
    for index in range(len(tokens) - 1):
        left, right = tokens[index], tokens[index + 1]
        if left == right:
            continue
        bigrams[f"{left} {right}"] += 1
    keyphrases = [
        {"phrase": phrase, "count": count}
        for phrase, count in bigrams.most_common(max(4, limit // 2))
        if count >= 2 or len(phrase) >= 10
    ][: max(4, limit // 2)]

    return {
        "keywords": keywords,
        "keyphrases": keyphrases,
    }


def keywords_as_tags(text: str, limit: int = 8) -> list[str]:
    result = extract_keywords(text, limit=limit)
    tags: list[str] = []
    seen: set[str] = set()
    for item in result.get("keywords") or []:
        term = str(item.get("term") or "").strip().lower()
        if len(term) < 3 or term in seen:
            continue
        seen.add(term)
        tags.append(term)
    for item in result.get("keyphrases") or []:
        phrase = str(item.get("phrase") or "").strip().lower().replace(" ", "-")
        if len(phrase) < 5 or phrase in seen:
            continue
        seen.add(phrase)
        tags.append(phrase)
        if len(tags) >= limit:
            break
    return tags[:limit]
