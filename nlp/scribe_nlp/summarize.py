from __future__ import annotations

from collections import Counter

from .text_utils import jaccard_similarity, split_sentences, tokenize


def _sentence_weight(
    index: int,
    sentence: str,
    total_sentences: int,
    doc_freq: Counter[str],
) -> float:
    tokens = tokenize(sentence)
    if not tokens:
        return 0.0

    # Rare terms in the document score higher (IDF-lite).
    score = sum(1.0 / max(doc_freq[token], 1) for token in tokens) / len(tokens)

    if index == 0:
        score *= 1.25
    elif index == total_sentences - 1:
        score *= 1.1

    # Prefer informative sentences over very short fragments.
    if len(tokens) >= 6:
        score *= 1.05

    return score


def _select_with_mmr(
    sentences: list[str],
    weights: list[float],
    max_sentences: int,
    lambda_param: float = 0.72,
) -> list[int]:
    chosen: list[int] = []
    candidates = list(range(len(sentences)))

    while len(chosen) < max_sentences and candidates:
        best_index = -1
        best_score = float("-inf")

        for index in candidates:
            if index in chosen:
                continue

            relevance = weights[index]
            if not chosen:
                mmr = relevance
            else:
                max_similarity = max(
                    jaccard_similarity(sentences[index], sentences[picked])
                    for picked in chosen
                )
                mmr = lambda_param * relevance - (1.0 - lambda_param) * max_similarity

            if mmr > best_score:
                best_score = mmr
                best_index = index

        if best_index < 0:
            break

        chosen.append(best_index)
        candidates.remove(best_index)

    return sorted(chosen)


def summarize_text(text: str, max_sentences: int = 4) -> dict[str, object]:
    sentences = split_sentences(text)
    max_sentences = max(1, min(max_sentences, 12))

    if not sentences:
        return {"summary": "", "bullets": []}
    if len(sentences) <= max_sentences:
        return {"summary": " ".join(sentences), "bullets": sentences[:max_sentences]}

    doc_freq = Counter(tokenize(" ".join(sentences)))
    weights = [
        _sentence_weight(index, sentence, len(sentences), doc_freq)
        for index, sentence in enumerate(sentences)
    ]
    chosen_indices = _select_with_mmr(sentences, weights, max_sentences)
    bullets = [sentences[index] for index in chosen_indices]

    return {"summary": " ".join(bullets), "bullets": bullets}
