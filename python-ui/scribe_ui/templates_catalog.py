"""Built-in template category ids (`crates/scribe-ui` templates_catalog)."""

from __future__ import annotations

BUILT_IN_TEMPLATE_CATEGORIES: tuple[str, ...] = ("general", "business", "personal", "creative")
NEW_CATEGORY_SELECT_VALUE = "__new_category__"


def built_in_template_categories() -> list[str]:
    return list(BUILT_IN_TEMPLATE_CATEGORIES)


def is_built_in_category(id_: str) -> bool:
    return id_ in BUILT_IN_TEMPLATE_CATEGORIES


def is_custom_category_id(id_: str) -> bool:
    return id_.startswith("cat-")


def is_valid_category_id(id_: str) -> bool:
    return is_built_in_category(id_) or is_custom_category_id(id_)
