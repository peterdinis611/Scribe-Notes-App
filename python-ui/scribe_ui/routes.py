"""App route path catalog (`crates/scribe-ui` routes_catalog)."""

from __future__ import annotations

from typing import TypedDict


class RoutePaths(TypedDict):
    home: str
    document: str
    docs: str
    graph: str
    plugins: str
    storageMode: str
    settingsPrefix: str


def route_paths() -> RoutePaths:
    return {
        "home": "/",
        "document": "/doc/$documentId",
        "docs": "/docs",
        "graph": "/graph",
        "plugins": "/plugins",
        "storageMode": "/storage",
        "settingsPrefix": "/settings",
    }


def settings_path(section: str) -> str:
    return f"/settings/{section}"


def document_path(document_id: str) -> str:
    return f"/doc/{document_id}"
