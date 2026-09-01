from __future__ import annotations

from collections import Counter

from .text_utils import split_sentences, tokenize


def summarize_text(text: str, max_sentences: int = 4) -> dict[str, object]:
    sentences = split_sentences(text)
    if not sentences:
        return {"summary": "", "bullets": []}
    if len(sentences) <= max_sentences:
        return {"summary": " ".join(sentences), "bullets": sentences[:max_sentences]}

    freq = Counter(tokenize(" ".join(sentences)))
    scored: list[tuple[float, int, str]] = []
    for index, sentence in enumerate(sentences):
        tokens = tokenize(sentence)
        if not tokens:
            continue
        score = sum(freq[token] for token in tokens) / len(tokens)
        scored.append((score, index, sentence))

    scored.sort(key=lambda item: (-item[0], item[1]))
    chosen = sorted(scored[:max_sentences], key=lambda item: item[1])
    bullets = [sentence for _, _, sentence in chosen]
    return {"summary": " ".join(bullets), "bullets": bullets}
