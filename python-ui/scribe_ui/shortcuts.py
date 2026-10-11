"""App shortcut binding catalog (`crates/scribe-ui` shortcuts)."""

from __future__ import annotations

from typing import TypedDict


class AppShortcutBinding(TypedDict):
    id: str
    scope: str
    defaultHotkey: str
    labelKey: str
    descriptionKey: str


def _binding(id_: str, hotkey: str, label: str, description: str) -> AppShortcutBinding:
    return {
        "id": id_,
        "scope": "app",
        "defaultHotkey": hotkey,
        "labelKey": label,
        "descriptionKey": description,
    }


def app_shortcut_bindings() -> list[AppShortcutBinding]:
    return [
        _binding("commandPalette", "Mod+K", "shortcuts.commandPalette.label", "shortcuts.commandPalette.description"),
        _binding("link", "Mod+Shift+K", "shortcuts.link.label", "shortcuts.link.description"),
        _binding("newDocument", "Mod+N", "shortcuts.newDocument.label", "shortcuts.newDocument.description"),
        _binding("quickNote", "Mod+Shift+N", "shortcuts.quickNote.label", "shortcuts.quickNote.description"),
        _binding("todayNote", "Mod+Shift+D", "shortcuts.todayNote.label", "shortcuts.todayNote.description"),
        _binding("save", "Mod+S", "shortcuts.save.label", "shortcuts.save.description"),
        _binding("import", "Mod+O", "shortcuts.import.label", "shortcuts.import.description"),
        _binding("toggleTheme", "Mod+Shift+L", "shortcuts.toggleTheme.label", "shortcuts.toggleTheme.description"),
        _binding("settings", "Mod+,", "shortcuts.settings.label", "shortcuts.settings.description"),
        _binding("focusMode", "Mod+Shift+F", "shortcuts.focusMode.label", "shortcuts.focusMode.description"),
        _binding("readingMode", "Mod+Shift+R", "shortcuts.readingMode.label", "shortcuts.readingMode.description"),
        _binding("closeTab", "Mod+W", "shortcuts.closeTab.label", "shortcuts.closeTab.description"),
        _binding("reopenClosedTab", "Mod+Shift+T", "shortcuts.reopenClosedTab.label", "shortcuts.reopenClosedTab.description"),
        _binding("libraryFindReplace", "Mod+Shift+H", "shortcuts.libraryFindReplace.label", "shortcuts.libraryFindReplace.description"),
        _binding("clipboardHistory", "Mod+Shift+V", "shortcuts.clipboardHistory.label", "shortcuts.clipboardHistory.description"),
        _binding("connections", "Mod+Shift+B", "shortcuts.connections.label", "shortcuts.connections.description"),
        _binding("askThisNote", "Mod+Shift+A", "shortcuts.askThisNote.label", "shortcuts.askThisNote.description"),
    ]


def shortcut_ids() -> list[str]:
    return [b["id"] for b in app_shortcut_bindings()]
