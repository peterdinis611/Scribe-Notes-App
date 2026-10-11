"""First-party plugin preset catalogs (`crates/scribe-ui` plugin_presets)."""

from __future__ import annotations

from typing import TypedDict


class PluginPreset(TypedDict):
    id: str
    pluginIds: list[str]


def plugin_presets() -> list[PluginPreset]:
    return [
        {
            "id": "writing",
            "pluginIds": [
                "scribe.daily-journal",
                "scribe.meeting-wrap",
                "scribe.plaintext-export",
            ],
        },
        {
            "id": "study",
            "pluginIds": ["scribe.flashcards", "scribe.citation-pack"],
        },
        {
            "id": "workspace",
            "pluginIds": ["scribe.status-meta", "scribe.theme-pack"],
        },
        {
            "id": "all",
            "pluginIds": [
                "scribe.daily-journal",
                "scribe.meeting-wrap",
                "scribe.plaintext-export",
                "scribe.flashcards",
                "scribe.citation-pack",
                "scribe.status-meta",
                "scribe.theme-pack",
                "scribe.standup",
            ],
        },
    ]


def plugin_preset_ids() -> list[str]:
    return [p["id"] for p in plugin_presets()]
