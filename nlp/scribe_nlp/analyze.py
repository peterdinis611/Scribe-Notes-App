from __future__ import annotations

from .dates import extract_dates
from .keywords import extract_keywords
from .language import detect_language
from .mentions import extract_mentions
from .outline import extract_outline
from .readability import reading_stats
from .sentiment import analyze_sentiment
from .summarize import summarize_text
from .tasks import extract_tasks
from .title import suggest_title


def analyze_document(
    text: str,
    *,
    keyword_limit: int = 12,
    outline_limit: int = 24,
    summary_sentences: int = 3,
) -> dict[str, object]:
    """One-shot document analysis for the insights panel / Rust bridge."""
    source = text or ""
    language = detect_language(source)
    keywords = extract_keywords(source, limit=keyword_limit)
    outline = extract_outline(source, limit=outline_limit)
    tasks = extract_tasks(source)
    readability = reading_stats(source)
    sentiment = analyze_sentiment(source)
    mentions = extract_mentions(source)
    dates = extract_dates(source)
    title = suggest_title(source)

    summary: dict[str, object] | None = None
    if len(source.strip()) >= 80:
        summary = summarize_text(source, max_sentences=summary_sentences)

    return {
        "language": language.get("language", "unknown"),
        "languageConfidence": float(language.get("confidence") or 0.0),
        "keywords": keywords.get("keywords") or [],
        "keyphrases": [
            str(item.get("phrase") or "")
            for item in (keywords.get("keyphrases") or [])
            if item.get("phrase")
        ],
        "outline": outline.get("items") or [],
        "summary": summary.get("summary") if summary else None,
        "summaryBullets": summary.get("bullets") if summary else [],
        "openTaskCount": int(tasks.get("openCount") or 0),
        "taskCount": len(tasks.get("tasks") or []),
        "readability": readability,
        "sentiment": sentiment,
        "mentions": mentions,
        "dates": dates.get("events") or [],
        "suggestedTitle": title.get("title") or "",
        "suggestedSlug": title.get("slug") or "",
    }
