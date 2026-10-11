"""Chrome surface HTML — Whats New, Welcome, About, Privacy, Docs."""

from __future__ import annotations

from typing import Any, Mapping, Sequence

from ..docs_copy import DOCS_GROUP_LABELS, DOCS_PAGE, topic_copy
from ..docs_nav import docs_groups, docs_topic_ids
from ..privacy import PRIVACY_EFFECTIVE_DATE, privacy_article_ids
from ..version import short_version
from ..whats_new import whats_new_highlights
from .components import (
    articles_list,
    folio_count,
    folio_kicker,
    folio_lead,
    folio_numeral,
    folio_tags,
    folio_title,
    lead,
    points_list,
    sui_actions,
    sui_button,
    sui_card,
    sui_link_button,
    sui_meta_row,
    sui_panel,
)
from .document import wrap_document
from .nodes import Tag, el, text

StringMap = Mapping[str, str]

SURFACE_IDS: tuple[str, ...] = (
    "whats-new",
    "welcome",
    "privacy",
    "about",
    "docs",
)


def t(strings: StringMap, key: str) -> str:
    return strings.get(key, key)


def _replace(template: str, **vars: str) -> str:
    out = template
    for key, value in vars.items():
        out = out.replace("{{" + key + "}}", value)
    return out


def render_whats_new(
    *,
    strings: StringMap | None = None,
    version: str = "3.5.0",
    short: str | None = None,
    highlights: Sequence[tuple[str, str, str]] | None = None,
    full_document: bool = True,
) -> str:
    strings = strings or {}
    short = short or short_version()
    brand = _replace(t(strings, "welcome.brandWithEdition"), version=short)
    if brand == "welcome.brandWithEdition":
        brand = f"Scribe {short}"
    badge = _replace(t(strings, "whatsNew.badge"), version=version)
    if badge == "whatsNew.badge":
        badge = f"What's new · {version}"
    title = _replace(t(strings, "whatsNew.title"), version=short)
    if title == "whatsNew.title":
        title = f"Scribe {short}"
    subtitle = t(strings, "whatsNew.subtitle")
    if subtitle == "whatsNew.subtitle":
        subtitle = "Edition notes for this release."
    kicker = t(strings, "whatsNew.kicker")
    if kicker == "whatsNew.kicker":
        kicker = "Edition notes"
    edition = t(strings, "whatsNew.editionMark")
    if edition == "whatsNew.editionMark":
        edition = "Surfaces · Docs"
    foot = t(strings, "whatsNew.footNote")
    if foot == "whatsNew.footNote":
        foot = "Local-first · no cloud required"
    got_it = t(strings, "whatsNew.gotIt")
    if got_it == "whatsNew.gotIt":
        got_it = "Got it"

    if highlights is None:
        ids = whats_new_highlights()
        highlights = [
            (
                hid,
                t(strings, f"whatsNew.{hid}.title")
                if t(strings, f"whatsNew.{hid}.title") != f"whatsNew.{hid}.title"
                else hid,
                t(strings, f"whatsNew.{hid}.description")
                if t(strings, f"whatsNew.{hid}.description") != f"whatsNew.{hid}.description"
                else "",
            )
            for hid in ids
        ]

    tags = [
        t(strings, "whatsNew.tags.docs")
        if t(strings, "whatsNew.tags.docs") != "whatsNew.tags.docs"
        else "Docs",
        t(strings, "whatsNew.tags.surfaces")
        if t(strings, "whatsNew.tags.surfaces") != "whatsNew.tags.surfaces"
        else "Surfaces",
        t(strings, "whatsNew.tags.python")
        if t(strings, "whatsNew.tags.python") != "whatsNew.tags.python"
        else "Python UI",
    ]

    body = el(
        "div",
        el(
            "div",
            el(
                "aside",
                el("p", text(brand), class_="setup-folio-brand"),
                el(
                    "div",
                    folio_numeral(short),
                    el("p", text(edition), class_="setup-folio-edition-mark"),
                ),
                folio_count(badge),
                class_="setup-folio-margin",
            ),
            el(
                "div",
                el(
                    "header",
                    folio_kicker(kicker),
                    folio_title(title),
                    folio_lead(subtitle),
                    folio_tags(tags),
                    class_="setup-folio-head",
                ),
                points_list([(title, body) for _id, title, body in highlights]),
                el(
                    "footer",
                    el("span", text(foot), class_="setup-folio-foot-note"),
                    sui_button(got_it, event="whats-new-acked", variant="folio-next"),
                    class_="setup-folio-foot",
                ),
                class_="setup-folio-page",
            ),
            class_="setup-folio setup-folio--news",
        ),
        class_="setup-folio-root",
    ).render()

    return wrap_document(body, "whats-new") if full_document else body


def render_welcome(
    *,
    strings: StringMap | None = None,
    short: str | None = None,
    recent: Sequence[Mapping[str, str]] | None = None,
    full_document: bool = True,
) -> str:
    strings = strings or {}
    short = short or short_version()
    brand = _replace(t(strings, "welcome.brandWithEdition"), version=short)
    if brand == "welcome.brandWithEdition":
        brand = f"Scribe {short}"
    name = t(strings, "welcome.brand")
    if name == "welcome.brand":
        name = "Scribe"
    subtitle = t(strings, "whatsNew.subtitle")
    if subtitle == "whatsNew.subtitle":
        subtitle = "Local notes, agents, and library tools."

    def label(key: str, fallback: str) -> str:
        value = t(strings, key)
        return fallback if value == key else value

    actions = sui_actions(
        sui_button(label("welcome.newDocument", "New"), event="welcome-new-document", variant="primary"),
        sui_button(label("welcome.todayNote", "Today"), event="welcome-today"),
        sui_button(label("common.import", "Import"), event="welcome-import"),
        sui_button(label("nav.docs", "Docs"), event="welcome-open-docs"),
    )

    children: list[Tag | str] = [
        folio_kicker(brand),
        folio_title(name),
        lead(subtitle),
        actions,
    ]
    recent = list(recent or [])
    if recent:
        children.append(el("h3", text(label("welcome.recentDocuments", "Recent"))))
        items = []
        for doc in recent:
            items.append(
                el(
                    "li",
                    sui_button(
                        [
                            el("strong", text(doc.get("title") or "Untitled")),
                            el("span", text(doc.get("updatedLabel") or doc.get("updated_label") or "")),
                        ],
                        event="welcome-open-document",
                        arg=doc.get("id") or "",
                    ),
                )
            )
        children.append(el("ul", *items, class_="sui-recent"))

    body = sui_panel(*children).render()
    return wrap_document(body, "welcome") if full_document else body


def render_about(
    *,
    strings: StringMap | None = None,
    version: str = "3.5.0",
    short: str | None = None,
    full_document: bool = True,
) -> str:
    strings = strings or {}
    short = short or short_version()

    def label(key: str, fallback: str) -> str:
        value = t(strings, key)
        return fallback if value == key else value

    tagline = _replace(label("settings.about.tagline", "Scribe {{version}}"), version=short)
    version_line = _replace(label("common.version", "Scribe {{version}}"), version=version)

    body = sui_panel(
        sui_card(
            el("h1", text(label("welcome.brand", "Scribe"))),
            lead(tagline),
            lead(version_line),
            sui_actions(
                sui_button(
                    label("settings.about.replayTour", "Tour"),
                    event="about-replay-tour",
                    variant="primary",
                )
            ),
        ),
        sui_meta_row(label("settings.about.platform", "Platform"), "macOS"),
        sui_meta_row(label("settings.about.fileFormat", "Format"), ".scribe"),
        sui_meta_row(label("settings.about.export", "Export"), "PDF, DOCX, TXT, Pages"),
        sui_actions(
            sui_link_button(
                label("settings.about.privacy", "Privacy"),
                event="about-open-privacy",
            )
        ),
    ).render()
    return wrap_document(body, "about") if full_document else body


def render_privacy(
    *,
    strings: StringMap | None = None,
    version: str = "3.5.0",
    articles: Sequence[Mapping[str, Any]] | None = None,
    full_document: bool = True,
) -> str:
    strings = strings or {}

    def label(key: str, fallback: str) -> str:
        value = t(strings, key)
        return fallback if value == key else value

    if articles is None:
        packed = []
        for article_id in privacy_article_ids():
            title = label(f"settings.privacy.articles.{article_id}.title", article_id)
            paragraph = label(
                f"settings.privacy.articles.{article_id}.paragraphs",
                "",
            )
            packed.append((title, [paragraph] if paragraph else []))
        article_rows = packed
    else:
        article_rows = [
            (
                str(item.get("title") or item.get("id") or ""),
                list(item.get("paragraphs") or []),
            )
            for item in articles
        ]

    effective = _replace(
        label("settings.privacy.effective", "Effective for Scribe {{version}}"),
        version=version,
    )
    body = sui_panel(
        el(
            "header",
            folio_kicker(label("settings.privacy.kicker", "Privacy")),
            folio_title(label("settings.privacy.title", "Privacy")),
            lead(effective),
            lead(label("settings.privacy.lead", "Local-first notes.")),
            lead(f"Effective date: {PRIVACY_EFFECTIVE_DATE}"),
        ),
        articles_list(article_rows),
        lead(label("settings.privacy.colophon", "")),
        class_="privacy-notice",
    ).render()
    return wrap_document(body, "privacy") if full_document else body


def _string_list(strings: StringMap, prefix: str) -> list[str] | None:
    """Collect ``prefix.0``, ``prefix.1``, … from a flat i18n string map."""
    items: list[str] = []
    index = 0
    while True:
        key = f"{prefix}.{index}"
        if key not in strings:
            break
        items.append(strings[key])
        index += 1
    return items if items else None


def _resolve_docs_topic(
    topic_id: str,
    *,
    strings: StringMap,
    short: str,
    override: Mapping[str, Any] | None,
) -> dict[str, Any]:
    fallback = topic_copy(topic_id, version=short)
    if override is not None:
        paragraphs = list(override.get("paragraphs") or [])
        points = list(override.get("points") or [])
        return {
            "id": topic_id,
            "title": _replace(str(override.get("title") or fallback["title"]), version=short),
            "summary": _replace(
                str(override.get("summary") or fallback["summary"]), version=short
            ),
            "paragraphs": [_replace(str(p), version=short) for p in paragraphs]
            or fallback["paragraphs"],
            "points": [_replace(str(p), version=short) for p in points] or fallback["points"],
        }

    base = f"settings.docs.topics.{topic_id}"
    title = t(strings, f"{base}.title")
    summary = t(strings, f"{base}.summary")
    paragraphs = _string_list(strings, f"{base}.paragraphs")
    points = _string_list(strings, f"{base}.points")
    return {
        "id": topic_id,
        "title": _replace(title if title != f"{base}.title" else fallback["title"], version=short),
        "summary": _replace(
            summary if summary != f"{base}.summary" else fallback["summary"], version=short
        ),
        "paragraphs": [
            _replace(p, version=short) for p in (paragraphs if paragraphs is not None else fallback["paragraphs"])
        ],
        "points": [
            _replace(p, version=short) for p in (points if points is not None else fallback["points"])
        ],
    }


def render_docs(
    *,
    strings: StringMap | None = None,
    short: str | None = None,
    topics: Sequence[Mapping[str, Any]] | None = None,
    groups: Sequence[tuple[str, Sequence[str]]] | None = None,
    full_document: bool = True,
) -> str:
    strings = strings or {}
    short = short or short_version()

    def label(key: str, fallback: str) -> str:
        value = t(strings, key)
        return fallback if value == key else value

    brand = _replace(label("welcome.brandWithEdition", "Scribe {{version}}"), version=short)
    page_title = _replace(
        label("settings.docs.pageTitle", DOCS_PAGE["pageTitle"]), version=short
    )
    page_desc = _replace(
        label("settings.docs.pageDescription", DOCS_PAGE["pageDescription"]),
        version=short,
    )
    search_ph = label(
        "settings.docs.searchPlaceholder", DOCS_PAGE["searchPlaceholder"]
    )

    overrides = {str(item.get("id")): item for item in topics} if topics else {}
    topic_map = {
        tid: _resolve_docs_topic(
            tid, strings=strings, short=short, override=overrides.get(tid)
        )
        for tid in docs_topic_ids()
    }
    # Include any extra topics passed by the host that aren't in the catalog.
    for tid, item in overrides.items():
        if tid not in topic_map:
            topic_map[tid] = _resolve_docs_topic(
                tid, strings=strings, short=short, override=item
            )

    if groups is None:
        group_rows = [(g["id"], g["topics"]) for g in docs_groups()]
    else:
        group_rows = [(gid, list(topic_ids)) for gid, topic_ids in groups]

    group_nodes: list[Tag] = []
    for group_id, topic_ids in group_rows:
        articles: list[Tag] = []
        for topic_id in topic_ids:
            topic = topic_map.get(topic_id)
            if not topic:
                continue
            summary = str(topic.get("summary") or "")
            kids: list[Any] = [
                el("h3", text(str(topic.get("title") or topic_id))),
            ]
            if summary:
                kids.append(el("p", text(summary), class_="docs-topic-summary"))
            for paragraph in topic.get("paragraphs") or []:
                kids.append(el("p", text(str(paragraph))))
            points = list(topic.get("points") or [])
            if points:
                kids.append(el("ul", *[el("li", text(str(p))) for p in points]))
            articles.append(
                el("article", *kids, class_="docs-topic", id=f"docs-{topic_id}")
            )
        group_label = label(
            f"settings.docs.groups.{group_id}",
            DOCS_GROUP_LABELS.get(group_id, group_id),
        )
        group_nodes.append(
            el(
                "section",
                el("h2", text(group_label)),
                *articles,
                class_="docs-group",
            )
        )

    body = el(
        "div",
        folio_kicker(brand),
        folio_title(page_title),
        lead(page_desc),
        el(
            "input",
            class_="docs-search",
            type="search",
            placeholder=search_ph,
            data_sui_filter="docs",
            aria_label=search_ph,
            void=True,
        ),
        el("div", *group_nodes, class_="docs-groups"),
        class_="docs-shell",
    ).render()
    return wrap_document(body, "docs") if full_document else body


def render_surface(
    surface: str,
    *,
    strings: StringMap | None = None,
    version: str = "3.5.0",
    short_version: str | None = None,
    highlights: Sequence[tuple[str, str, str]] | None = None,
    recent: Sequence[Mapping[str, str]] | None = None,
    privacy_articles: Sequence[Mapping[str, Any]] | None = None,
    docs_topics: Sequence[Mapping[str, Any]] | None = None,
    docs_groups_data: Sequence[tuple[str, Sequence[str]]] | None = None,
    full_document: bool = True,
) -> str:
    """Render a chrome surface by id (``whats-new`` / ``welcome`` / …)."""
    key = surface.strip().lower().replace("_", "-")
    if key in {"whatsnew", "whats-new"}:
        return render_whats_new(
            strings=strings,
            version=version,
            short=short_version,
            highlights=highlights,
            full_document=full_document,
        )
    if key == "welcome":
        return render_welcome(
            strings=strings,
            short=short_version,
            recent=recent,
            full_document=full_document,
        )
    if key == "about":
        return render_about(
            strings=strings,
            version=version,
            short=short_version,
            full_document=full_document,
        )
    if key == "privacy":
        return render_privacy(
            strings=strings,
            version=version,
            articles=privacy_articles,
            full_document=full_document,
        )
    if key == "docs":
        return render_docs(
            strings=strings,
            short=short_version,
            topics=docs_topics,
            groups=docs_groups_data,
            full_document=full_document,
        )
    raise ValueError(f"Unknown surface: {surface}")
