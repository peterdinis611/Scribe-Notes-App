"""OS-global shortcut ids (`crates/scribe-ui` global_shortcuts)."""

from __future__ import annotations

GLOBAL_SHORTCUT_IDS: tuple[str, ...] = ("quickNote", "todayNote")


def global_shortcut_ids() -> list[str]:
    return list(GLOBAL_SHORTCUT_IDS)


def to_global_shortcut_accelerator(hotkey: str) -> str:
    parts: list[str] = []
    for part in hotkey.split("+"):
        key = part.strip()
        if key == "Mod":
            parts.append("CommandOrControl")
        elif key == "Meta":
            parts.append("Super")
        elif key == "Ctrl":
            parts.append("Control")
        elif key in ("Alt", "Shift"):
            parts.append(key)
        elif len(key) == 1:
            parts.append(key.upper())
        else:
            parts.append(key)
    return "+".join(parts)
