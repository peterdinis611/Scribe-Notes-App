from __future__ import annotations

from .keywords import extract_keywords
from .language import detect_language
from .outline import extract_outline
from .summarize import summarize_text
from .tasks import extract_tasks


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
    }
