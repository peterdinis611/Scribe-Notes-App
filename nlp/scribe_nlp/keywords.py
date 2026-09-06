from __future__ import annotations

import math
from collections import Counter

from .normalize import stem_lite
from .text_utils import content_tokens, split_sentences


def extract_keywords(text: str, limit: int = 12) -> dict[str, object]:
    """TF-lite + bigram keyphrases with stopword filtering and stem grouping."""
    source = text or ""
    sentences = split_sentences(source)
    tokens = content_tokens(source)
    if not tokens:
        return {"keywords": [], "keyphrases": []}

    stem_tf: Counter[str] = Counter()
    surface: dict[str, Counter[str]] = {}
    for token in tokens:
        stem = stem_lite(token)
        stem_tf[stem] += 1
        surface.setdefault(stem, Counter())[token] += 1

    total = len(tokens)
    df: Counter[str] = Counter()
    for sentence in sentences or [source]:
        df.update({stem_lite(token) for token in content_tokens(sentence)})
    sentence_count = max(len(sentences), 1)

    scored: list[tuple[str, float, int]] = []
    for stem, count in stem_tf.items():
        idf = math.log((sentence_count + 1) / (df[stem] + 1)) + 1.0
        score = (count / total) * idf
        form = surface[stem].most_common(1)[0][0]
        if len(form) >= 6:
            score *= 1.08
        scored.append((form, score, count))
    scored.sort(key=lambda item: (-item[1], item[0]))
    keywords = [
        {"term": term, "score": round(score, 5), "count": count}
        for term, score, count in scored[:limit]
    ]

    stem_tokens = [stem_lite(token) for token in tokens]
    bigrams: Counter[str] = Counter()
    surface_bigrams: dict[str, Counter[str]] = {}
    for index in range(len(tokens) - 1):
        left, right = tokens[index], tokens[index + 1]
        left_stem, right_stem = stem_tokens[index], stem_tokens[index + 1]
        if left_stem == right_stem:
            continue
        key = f"{left_stem} {right_stem}"
        phrase = f"{left} {right}"
        bigrams[key] += 1
        surface_bigrams.setdefault(key, Counter())[phrase] += 1
    keyphrases = []
    for key, count in bigrams.most_common(max(4, limit // 2)):
        phrase = surface_bigrams[key].most_common(1)[0][0]
        if count >= 2 or len(phrase) >= 10:
            keyphrases.append({"phrase": phrase, "count": count})
        if len(keyphrases) >= max(4, limit // 2):
            break

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
        stem = stem_lite(term)
        if len(term) < 3 or stem in seen:
            continue
        seen.add(stem)
        tags.append(term)
    for item in result.get("keyphrases") or []:
        phrase = str(item.get("phrase") or "").strip().lower().replace(" ", "-")
        stem = stem_lite(phrase.replace("-", " "))
        if len(phrase) < 5 or stem in seen:
            continue
        seen.add(stem)
        tags.append(phrase)
        if len(tags) >= limit:
            break
    return tags[:limit]
