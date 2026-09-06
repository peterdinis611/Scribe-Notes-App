from __future__ import annotations

from collections import Counter

from .duplicates import find_duplicates
from .keywords import extract_keywords
from .language import detect_language
from .sentiment import analyze_sentiment
from .text_utils import top_terms


def _sort_by_updated(documents: list[dict[str, object]]) -> list[dict[str, object]]:
    return sorted(
        documents,
        key=lambda doc: int(doc.get("updatedAt") or 0),
        reverse=True,
    )


def library_report(documents: list[dict[str, object]]) -> dict[str, object]:
    total = len(documents)
    tagged = sum(1 for doc in documents if doc.get("tags"))
    texts = [str(doc.get("text") or "") for doc in documents]
    sorted_docs = _sort_by_updated(documents)
    titles = [str(doc.get("title") or "Bez názvu") for doc in sorted_docs]

    tag_counter: Counter[str] = Counter()
    for doc in documents:
        for tag in doc.get("tags") or []:
            tag_counter[str(tag)] += 1

    terms = top_terms(texts, limit=10)
    untagged_titles = [
        str(doc.get("title") or "Bez názvu")
        for doc in sorted_docs
        if not doc.get("tags")
    ][:8]

    language_counter: Counter[str] = Counter()
    phrase_counter: Counter[str] = Counter()
    sentiment_counter: Counter[str] = Counter()
    # Sample up to 80 docs for language / keyphrase / tone stats.
    sample = sorted_docs[:80]
    for doc in sample:
        blob = f"{doc.get('title') or ''}\n{doc.get('text') or ''}".strip()
        if not blob:
            continue
        lang = str(detect_language(blob).get("language") or "unknown")
        language_counter[lang] += 1
        sentiment_counter[str(analyze_sentiment(blob).get("label") or "neutral")] += 1
        for item in extract_keywords(blob, limit=6).get("keyphrases") or []:
            phrase = str(item.get("phrase") or "").strip()
            if phrase:
                phrase_counter[phrase] += 1

    # Near-duplicates on a smaller recent sample (O(n²)).
    dup_sample = [
        {
            "id": str(doc.get("id") or f"idx-{index}"),
            "title": str(doc.get("title") or "Bez názvu"),
            "text": str(doc.get("text") or "")[:4_000],
        }
        for index, doc in enumerate(sorted_docs[:40])
        if doc.get("id") or doc.get("text") or doc.get("title")
    ]
    duplicates = find_duplicates(dup_sample, limit=8, min_score=0.78, use_embeddings=True)

    lines = [
        "# Analýza knižnice",
        "",
        f"- **Dokumenty:** {total}",
        f"- **Otagované:** {tagged}",
        f"- **Bez tagov:** {total - tagged}",
        "",
        "## Jazyky (vzorka)",
    ]
    if language_counter:
        for lang, count in language_counter.most_common():
            label = {"sk": "slovenčina", "en": "angličtina"}.get(lang, lang)
            lines.append(f"- {label} ({count})")
    else:
        lines.append("- —")

    lines.extend(["", "## Tón (vzorka)"])
    if sentiment_counter:
        label_map = {
            "positive": "pozitívny",
            "negative": "negatívny",
            "mixed": "zmiešaný",
            "neutral": "neutrálny",
        }
        for label, count in sentiment_counter.most_common():
            lines.append(f"- {label_map.get(label, label)} ({count})")
    else:
        lines.append("- —")

    lines.extend(["", "## Časté výrazy"])
    if terms:
        for word, count in terms:
            lines.append(f"- {word} ({count})")
    else:
        lines.append("- —")

    lines.extend(["", "## Časté frázy"])
    if phrase_counter:
        for phrase, count in phrase_counter.most_common(8):
            lines.append(f"- {phrase} ({count})")
    else:
        lines.append("- —")

    lines.extend(["", "## Možné duplikáty"])
    dup_pairs = duplicates.get("pairs") or []
    if dup_pairs:
        for pair in dup_pairs[:6]:
            lines.append(
                f"- {pair.get('leftTitle')} ↔ {pair.get('rightTitle')} "
                f"({pair.get('score')})"
            )
    else:
        lines.append("- —")

    lines.extend(["", "## Najpoužívanejšie tagy"])
    if tag_counter:
        for tag, count in tag_counter.most_common(10):
            lines.append(f"- {tag} ({count})")
    else:
        lines.append("- —")

    lines.extend(["", "## Nedávne dokumenty"])
    for title in titles[:12]:
        lines.append(f"- {title}")

    if untagged_titles:
        lines.extend(["", "## Bez tagov (kandidáti na otagovanie)"])
        for title in untagged_titles:
            lines.append(f"- {title}")

    markdown = "\n".join(lines)
    return {
        "markdown": markdown,
        "stats": {
            "documentCount": total,
            "taggedCount": tagged,
            "topTerms": [{"term": term, "count": count} for term, count in terms],
            "topPhrases": [
                {"phrase": phrase, "count": count}
                for phrase, count in phrase_counter.most_common(8)
            ],
            "languages": [
                {"language": lang, "count": count}
                for lang, count in language_counter.most_common()
            ],
            "sentiments": [
                {"label": label, "count": count}
                for label, count in sentiment_counter.most_common()
            ],
            "duplicatePairs": dup_pairs,
            "topTags": [
                {"tag": tag, "count": count}
                for tag, count in tag_counter.most_common(10)
            ],
            "untaggedSample": untagged_titles,
        },
    }
