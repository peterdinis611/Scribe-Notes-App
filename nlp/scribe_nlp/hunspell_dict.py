"""Minimal Hunspell-style dictionary check (stdlib only).

Loads LibreOffice/Hunspell `.aff` + `.dic` and supports membership tests via
suffix/prefix stripping — enough for offline SK spellcheck without native bindings.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from functools import lru_cache
from importlib import resources
from pathlib import Path


def _parse_condition(cond: str) -> re.Pattern[str]:
    if not cond or cond == ".":
        return re.compile(r".*")
    i = 0
    out: list[str] = []
    while i < len(cond):
        ch = cond[i]
        if ch == "[":
            j = cond.find("]", i)
            if j < 0:
                break
            out.append(cond[i : j + 1])
            i = j + 1
        elif ch == ".":
            out.append(".")
            i += 1
        else:
            out.append(re.escape(ch))
            i += 1
    return re.compile("".join(out) + r"$")


@dataclass(frozen=True)
class AffixRule:
    strip: str
    add: str
    condition: re.Pattern[str]
    continuation: str


def _load_text(*names: str) -> str | None:
    for name in names:
        try:
            root = resources.files("scribe_nlp.data")
            return (root / name).read_text(encoding="utf-8")
        except (FileNotFoundError, ModuleNotFoundError, TypeError, OSError, AttributeError):
            path = Path(__file__).resolve().parent / "data" / name
            if path.exists():
                return path.read_text(encoding="utf-8")
    return None


def _parse_aff(text: str) -> tuple[dict[str, list[AffixRule]], dict[str, list[AffixRule]]]:
    sfx: dict[str, list[AffixRule]] = {}
    pfx: dict[str, list[AffixRule]] = {}
    mode: str | None = None
    current_flag: str | None = None
    remaining = 0

    for raw in text.splitlines():
        line = raw.split("#", 1)[0].strip()
        if not line:
            continue
        parts = line.split()
        if (
            parts[0] in {"SFX", "PFX"}
            and len(parts) >= 4
            and parts[2] in {"Y", "N"}
            and parts[3].isdigit()
        ):
            mode = parts[0]
            current_flag = parts[1]
            remaining = int(parts[3])
            bucket = sfx if mode == "SFX" else pfx
            bucket.setdefault(current_flag, [])
            continue
        if not (mode and current_flag and remaining > 0):
            continue
        if parts[0] != mode or parts[1] != current_flag:
            continue
        strip = "" if parts[2] == "0" else parts[2]
        add = "" if parts[3] == "0" else parts[3]
        cond = parts[4] if len(parts) > 4 else "."
        cont = ""
        if "/" in add:
            add, cont = add.split("/", 1)
        try:
            rule = AffixRule(strip, add, _parse_condition(cond), cont)
        except re.error:
            remaining -= 1
            continue
        (sfx if mode == "SFX" else pfx)[current_flag].append(rule)
        remaining -= 1
        if remaining <= 0:
            mode = None
            current_flag = None
    return sfx, pfx


def _parse_dic(text: str) -> dict[str, str]:
    """Map lowercase stem -> flag string."""
    stems: dict[str, str] = {}
    for i, raw in enumerate(text.splitlines()):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if i == 0 and line.isdigit():
            continue
        left = line.split("\t", 1)[0].strip()
        if "/" in left:
            stem, flags = left.split("/", 1)
        else:
            stem, flags = left, ""
        stem = stem.strip().lower()
        if not stem:
            continue
        # Keep union of flags if duplicated casing variants collide.
        prev = stems.get(stem, "")
        stems[stem] = "".join(sorted(set(prev + flags)))
    return stems


class HunspellDictionary:
    """Membership test for Hunspell dic+aff (suffix/prefix strip)."""

    def __init__(self, dic_text: str, aff_text: str) -> None:
        self.stems = _parse_dic(dic_text)
        self.sfx, self.pfx = _parse_aff(aff_text)
        # Reverse index: added suffix -> rules that produce it (for stripping).
        self._sfx_by_add: dict[str, list[tuple[str, AffixRule]]] = {}
        for flag, rules in self.sfx.items():
            for rule in rules:
                self._sfx_by_add.setdefault(rule.add, []).append((flag, rule))
        self._pfx_by_add: dict[str, list[tuple[str, AffixRule]]] = {}
        for flag, rules in self.pfx.items():
            for rule in rules:
                self._pfx_by_add.setdefault(rule.add, []).append((flag, rule))

    def __contains__(self, word: object) -> bool:
        if not isinstance(word, str) or not word:
            return False
        return self.lookup(word)

    def __len__(self) -> int:
        return len(self.stems)

    def lookup(self, word: str) -> bool:
        lower = word.lower()
        if lower in self.stems:
            return True
        return self._check_affixed(lower)

    def _stem_has_flag(self, stem: str, flag: str) -> bool:
        flags = self.stems.get(stem)
        return flags is not None and flag in flags

    def _check_affixed(self, word: str) -> bool:
        # Try suffix strip first (most common for SK).
        for add, entries in self._sfx_by_add.items():
            if add and not word.endswith(add):
                continue
            if not add and word not in self.stems:
                # empty add: stem may equal word already handled
                pass
            core = word[: len(word) - len(add)] if add else word
            for flag, rule in entries:
                stem = core + rule.strip
                if not stem:
                    continue
                if not rule.condition.search(stem):
                    continue
                if not self._stem_has_flag(stem, flag):
                    continue
                if not rule.continuation:
                    return True
                # Continuation: form must also satisfy another flag on the *form*.
                # Approximate: accept if stem has cont flags applied already via nested strip.
                if any(self._stem_has_flag(stem, c) for c in rule.continuation):
                    return True
                # Or the affixed form itself is a stem.
                if word in self.stems:
                    return True

        for add, entries in self._pfx_by_add.items():
            if add and not word.startswith(add):
                continue
            rest = word[len(add) :] if add else word
            for flag, rule in entries:
                stem = rule.strip + rest
                if not stem:
                    continue
                if not rule.condition.search(stem):
                    continue
                if self._stem_has_flag(stem, flag):
                    return True
        return False


@lru_cache(maxsize=1)
def load_slovak_hunspell() -> HunspellDictionary | None:
    dic = _load_text("sk_SK.dic")
    aff = _load_text("sk_SK.aff")
    if not dic or not aff:
        return None
    return HunspellDictionary(dic, aff)
