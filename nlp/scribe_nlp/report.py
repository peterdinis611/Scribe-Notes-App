from __future__ import annotations

from collections import Counter

from .text_utils import top_terms


def library_report(documents: list[dict[str, object]]) -> dict[str, object]:
    total = len(documents)
    tagged = sum(1 for doc in documents if doc.get("tags"))
    texts = [str(doc.get("text") or "") for doc in documents]
    titles = [str(doc.get("title") or "") for doc in documents]
    tag_counter: Counter[str] = Counter()
    for doc in documents:
        for tag in doc.get("tags") or []:
            tag_counter[str(tag)] += 1

    terms = top_terms(texts, limit=10)
    lines = [
        "# Library analysis",
        "",
        f"- **Documents:** {total}",
        f"- **Tagged:** {tagged}",
        f"- **Untagged:** {total - tagged}",
        "",
        "## Frequent terms",
    ]
    if terms:
        for word, count in terms:
            lines.append(f"- {word} ({count})")
    else:
        lines.append("- —")

    lines.extend(["", "## Top tags"])
    if tag_counter:
        for tag, count in tag_counter.most_common(10):
            lines.append(f"- {tag} ({count})")
    else:
        lines.append("- —")

    lines.extend(["", "## Recent titles"])
    for title in titles[:12]:
        lines.append(f"- {title}")

    markdown = "\n".join(lines)
    return {
        "markdown": markdown,
        "stats": {
            "documentCount": total,
            "taggedCount": tagged,
            "topTerms": [{"term": term, "count": count} for term, count in terms],
            "topTags": [{"tag": tag, "count": count} for tag, count in tag_counter.most_common(10)],
        },
    }
