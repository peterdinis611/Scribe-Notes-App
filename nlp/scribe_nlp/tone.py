"""Tone pack: readability + sentiment for proofreader / study agents."""

from __future__ import annotations

from typing import Any

from .readability import reading_stats
from .sentiment import analyze_sentiment
from .text_utils import normalize_text


def tone_pack(text: str) -> dict[str, Any]:
    source = text or ""
    stats = reading_stats(source) if source.strip() else {}
    sentiment = analyze_sentiment(source) if source.strip() else {}

    label = str(stats.get("readabilityLabel") or "unknown")
    minutes = float(stats.get("readingTimeMinutes") or 0.0)
    flesch = float(stats.get("flesch") or 0.0)
    polarity = str(sentiment.get("label") or sentiment.get("tone") or "neutral")
    score = sentiment.get("score")
    try:
        polarity_score = float(score) if score is not None else 0.0
    except (TypeError, ValueError):
        polarity_score = 0.0

    summary = normalize_text(
        f"{label} readability · ~{minutes:.1f} min · tone {polarity}"
    )
    hints: list[str] = []
    if label in {"difficult", "veryDifficult", "hard"}:
        hints.append("dense_prose")
    if minutes >= 12:
        hints.append("long_read")
    if polarity in {"negative", "mixed"}:
        hints.append("watch_tone")
    if float(stats.get("uniqueContentRatio") or 1.0) < 0.45:
        hints.append("repetitive")

    return {
        "summary": summary,
        "readabilityLabel": label,
        "flesch": flesch,
        "readingTimeMinutes": round(minutes, 2),
        "wordCount": int(stats.get("wordCount") or 0),
        "polarity": polarity,
        "polarityScore": round(polarity_score, 3),
        "hints": hints,
        "source": "python",
    }
