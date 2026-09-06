from __future__ import annotations

import re

from .language import detect_language
from .text_utils import content_tokens, split_sentences, tokenize

VOWELS_SK = set("aáäeéiíoóôuúyýAÁÄEÉIÍOÓÔUÚYÝ")
VOWELS_EN = set("aeiouyAEIOUY")


def _count_syllables(word: str, *, slovak: bool) -> int:
    cleaned = re.sub(r"[^a-záäčďéíĺľňóôŕšťúýž]", "", word.lower(), flags=re.UNICODE)
    if not cleaned:
        return 0
    vowels = VOWELS_SK if slovak else VOWELS_EN
    count = 0
    prev_vowel = False
    for char in cleaned:
        is_vowel = char in vowels
        if is_vowel and not prev_vowel:
            count += 1
        prev_vowel = is_vowel
    if not slovak and cleaned.endswith("e") and count > 1:
        count -= 1
    return max(1, count)


def reading_stats(text: str) -> dict[str, object]:
    """Reading time + Flesch-lite readability (SK/EN syllable heuristic)."""
    source = text or ""
    words = tokenize(source)
    sentences = split_sentences(source)
    word_count = len(words)
    sentence_count = max(len(sentences), 1)
    char_count = len(re.sub(r"\s+", "", source))

    language = str(detect_language(source).get("language") or "unknown")
    slovak = language == "sk"
    # SK readers average a bit slower on dense text.
    wpm = 180 if slovak else 200
    minutes = word_count / wpm if word_count else 0.0

    syllables = sum(_count_syllables(word, slovak=slovak) for word in words)
    if word_count == 0:
        flesch = 100.0
    else:
        # Classic Flesch; still informative for SK with syllable heuristic.
        flesch = (
            206.835
            - 1.015 * (word_count / sentence_count)
            - 84.6 * (syllables / word_count)
        )
        flesch = max(0.0, min(100.0, flesch))

    if flesch >= 80:
        label = "veryEasy"
    elif flesch >= 60:
        label = "easy"
    elif flesch >= 50:
        label = "plain"
    elif flesch >= 30:
        label = "dense"
    else:
        label = "hard"

    content = content_tokens(source)
    unique_ratio = (len(set(content)) / len(content)) if content else 0.0

    return {
        "wordCount": word_count,
        "sentenceCount": len(sentences),
        "characterCount": char_count,
        "syllableCount": syllables,
        "readingTimeMinutes": round(minutes, 2),
        "wordsPerMinute": wpm,
        "flesch": round(flesch, 1),
        "readabilityLabel": label,
        "uniqueContentRatio": round(unique_ratio, 3),
        "language": language,
    }
