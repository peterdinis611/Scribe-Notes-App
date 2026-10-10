"""Privacy policy article ids (copy lives in FE i18n / PRIVACY.md)."""

from __future__ import annotations

PRIVACY_ARTICLE_IDS: tuple[str, ...] = (
    "localFirst",
    "storedData",
    "noCollection",
    "optionalNetwork",
    "mcp",
    "capture",
    "yourControl",
    "children",
    "changes",
    "contact",
)

PRIVACY_EFFECTIVE_DATE = "2026-09-19"


def privacy_article_ids() -> list[str]:
    return list(PRIVACY_ARTICLE_IDS)
