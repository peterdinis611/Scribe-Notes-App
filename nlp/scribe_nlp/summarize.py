from __future__ import annotations

from collections import Counter
from typing import Any

from .text_utils import content_tokens, jaccard_similarity, split_sentences


def _sentence_weight(
    index: int,
    sentence: str,
    total_sentences: int,
    doc_freq: Counter[str],
) -> float:
    tokens = content_tokens(sentence)
    if not tokens:
        return 0.0

    # Rare content terms in the document score higher (IDF-lite).
    score = sum(1.0 / max(doc_freq[token], 1) for token in tokens) / len(tokens)

    if index == 0:
        score *= 1.25
    elif index == total_sentences - 1:
        score *= 1.1

    if len(tokens) >= 5:
        score *= 1.08

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


def summarize_text(
    text: str,
    max_sentences: int = 4,
    *,
    llm: dict[str, Any] | None = None,
) -> dict[str, object]:
    sentences = split_sentences(text)
    max_sentences = max(1, min(max_sentences, 12))

    if not sentences:
        return {"summary": "", "bullets": [], "enhanced": False, "source": "python"}
    if len(sentences) <= max_sentences:
        result: dict[str, object] = {
            "summary": " ".join(sentences),
            "bullets": sentences[:max_sentences],
            "enhanced": False,
            "source": "python",
        }
    else:
        doc_freq = Counter(content_tokens(" ".join(sentences)))
        weights = [
            _sentence_weight(index, sentence, len(sentences), doc_freq)
            for index, sentence in enumerate(sentences)
        ]
        chosen_indices = _select_with_mmr(sentences, weights, max_sentences)
        bullets = [sentences[index] for index in chosen_indices]
        result = {
            "summary": " ".join(bullets),
            "bullets": bullets,
            "enhanced": False,
            "source": "python",
        }

    if isinstance(llm, dict) and llm:
        from .llm import try_complete_from_options

        polished = try_complete_from_options(
            llm,
            prompt=(
                "Rewrite this extractive summary into 2-4 crisp sentences. "
                "Stay faithful; do not invent facts.\n\n"
                f"{result['summary']}\n\nSource excerpt:\n{(text or '')[:2500]}"
            ),
            system="Output only the polished summary paragraph.",
            max_tokens=280,
        )
        if polished:
            result["summary"] = polished
            result["llmSummary"] = polished
            result["enhanced"] = True

    return result
