from __future__ import annotations

from collections import Counter

from .text_utils import normalize_text, top_terms


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

    lines = [
        "# Analýza knižnice",
        "",
        f"- **Dokumenty:** {total}",
        f"- **Otagované:** {tagged}",
        f"- **Bez tagov:** {total - tagged}",
        "",
        "## Časté výrazy",
    ]
    if terms:
        for word, count in terms:
            lines.append(f"- {word} ({count})")
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
            "topTags": [
                {"tag": tag, "count": count}
                for tag, count in tag_counter.most_common(10)
            ],
            "untaggedSample": untagged_titles,
        },
    }
