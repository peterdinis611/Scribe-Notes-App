"""Minimal HTML element builder (stdlib-only, escaped by default)."""

from __future__ import annotations

from html import escape
from typing import Any, Iterable, Mapping, Sequence, Union

Child = Union["Tag", str, None]
Attrs = Mapping[str, Any]


def text(value: Any) -> str:
    return escape(str(value), quote=False)


def attr(name: str, value: Any | None) -> str:
    if value is None or value is False:
        return ""
    if value is True:
        return f" {name}"
    return f' {name}="{escape(str(value), quote=True)}"'


class Tag:
    __slots__ = ("name", "attrs", "children", "void")

    def __init__(
        self,
        name: str,
        attrs: Attrs | None = None,
        children: Sequence[Child] | None = None,
        *,
        void: bool = False,
    ) -> None:
        self.name = name
        self.attrs = dict(attrs or {})
        self.children = list(children or [])
        self.void = void

    def render(self) -> str:
        attrs = "".join(attr(key, value) for key, value in self.attrs.items())
        if self.void:
            return f"<{self.name}{attrs} />"
        inner = "".join(_render_child(child) for child in self.children)
        return f"<{self.name}{attrs}>{inner}</{self.name}>"

    def __str__(self) -> str:
        return self.render()


def _render_child(child: Child) -> str:
    if child is None:
        return ""
    if isinstance(child, Tag):
        return child.render()
    return str(child)


def el(name: str, *children: Child, void: bool = False, **attrs: Any) -> Tag:
    # Allow class_ → class, for_ → for, data_sui_event → data-sui-event
    normalized: dict[str, Any] = {}
    for key, value in attrs.items():
        if key.endswith("_") and key in {"class_", "for_", "type_"}:
            normalized[key[:-1]] = value
        elif key == "class_":
            normalized["class"] = value
        elif key == "for_":
            normalized["for"] = value
        elif key.startswith("data_"):
            normalized["data-" + key[5:].replace("_", "-")] = value
        elif key.startswith("aria_"):
            normalized["aria-" + key[5:].replace("_", "-")] = value
        else:
            normalized[key] = value
    return Tag(name, normalized, children, void=void)


def fragment(*children: Child) -> str:
    return "".join(_render_child(child) for child in children)


def raw(html: str) -> str:
    """Insert trusted HTML without escaping (use sparingly)."""
    return html


def join(parts: Iterable[Child]) -> str:
    return "".join(_render_child(part) for part in parts)
