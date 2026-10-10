"""Reusable chrome primitives — mirror Dioxus ``scribe_ui::components``."""

from __future__ import annotations

from typing import Any, Sequence

from .nodes import Child, Tag, el, fragment, text


def sui_button(
    label: str | Tag | Sequence[Child],
    *,
    event: str = "",
    arg: str = "",
    variant: str = "default",
    class_: str = "",
) -> Tag:
    classes: list[str] = []
    if variant == "primary":
        classes.append("primary")
    elif variant == "folio-next":
        classes.append("setup-folio-next")
    elif variant == "link":
        classes.append("sui-link-btn")
    if class_:
        classes.append(class_)
    attrs: dict[str, Any] = {"type": "button"}
    if classes:
        attrs["class"] = " ".join(classes)
    if event:
        attrs["data-sui-event"] = event
    if arg:
        attrs["data-sui-arg"] = arg
    children: list[Child]
    if isinstance(label, Tag):
        children = [label]
    elif isinstance(label, (list, tuple)):
        children = list(label)
    else:
        children = [text(label)]
    return el("button", *children, **attrs)


def sui_panel(*children: Child, class_: str = "") -> Tag:
    cls = "sui-panel" if not class_ else f"sui-panel {class_}"
    return el("div", *children, class_=cls)


def sui_card(*children: Child) -> Tag:
    return el("div", *children, class_="sui-card")


def sui_actions(*children: Child) -> Tag:
    return el("div", *children, class_="sui-actions")


def sui_meta_row(label: str, value: str) -> Tag:
    return el(
        "div",
        el("span", text(label)),
        el("strong", text(value)),
        class_="sui-row",
    )


def sui_link_button(label: str, *, event: str, arg: str = "") -> Tag:
    return sui_button(label, event=event, arg=arg, variant="link")


def folio_kicker(value: str) -> Tag:
    return el("p", text(value), class_="setup-folio-kicker")


def folio_title(value: str) -> Tag:
    return el("h1", text(value), class_="setup-folio-title")


def folio_lead(value: str) -> Tag:
    return el("p", text(value), class_="setup-folio-lead")


def folio_numeral(value: str) -> Tag:
    return el("span", text(value), class_="setup-folio-numeral")


def folio_count(value: str) -> Tag:
    return el("p", text(value), class_="setup-folio-count")


def folio_tags(tags: Sequence[str]) -> Tag:
    return el(
        "ul",
        *[el("li", text(tag)) for tag in tags],
        class_="setup-folio-tags",
    )


def lead(value: str) -> Tag:
    return el("p", text(value), class_="lead")


def points_list(items: Sequence[tuple[str, str]]) -> Tag:
    """Numbered folio points: (title, body)."""
    rows: list[Tag] = []
    for index, (title, body) in enumerate(items, start=1):
        rows.append(
            el(
                "li",
                el("span", text(f"{index:02d}")),
                el(
                    "div",
                    el("strong", text(title)),
                    el("p", text(body)),
                ),
            )
        )
    return el("ol", *rows, class_="setup-folio-points")


def articles_list(articles: Sequence[tuple[str, Sequence[str]]]) -> Tag:
    """Privacy-style articles: (title, paragraphs)."""
    rows: list[Tag] = []
    for index, (title, paragraphs) in enumerate(articles, start=1):
        rows.append(
            el(
                "li",
                el("span", text(f"{index:02d}")),
                el(
                    "div",
                    el("h3", text(title)),
                    *[lead(p) for p in paragraphs],
                ),
            )
        )
    return el("ol", *rows, class_="sui-articles")


def join_html(*parts: Child) -> str:
    return fragment(*parts)
