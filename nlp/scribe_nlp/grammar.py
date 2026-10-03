"""Grammar teachings for the Spellcheck Agent (stdlib only).

Standing rules from Scribe teachings (topic=grammar) are matched against note
text with lightweight heuristics — prefer/avoid pairs, capitalization hints,
and unmatched rules returned as guidance for the agent UI / MCP.
"""

from __future__ import annotations

import re
from typing import Any

from .text_utils import truncate_text

MAX_RULES = 24
MAX_FINDINGS = 40
MAX_RULE_LEN = 280

_PREFER_PATTERNS = (
    re.compile(
        r"(?i)\bprefer(?:s|red)?\s+[\"'“]?(.+?)[\"'”]?\s+over\s+[\"'“]?(.+?)[\"'”]?\s*$"
    ),
    re.compile(
        r"(?i)\buse\s+[\"'“]?(.+?)[\"'”]?\s+(?:instead of|not|rather than)\s+[\"'“]?(.+?)[\"'”]?\s*$"
    ),
    re.compile(
        r"(?i)\bpreferuj\s+[\"'“]?(.+?)[\"'”]?\s+(?:namiesto|pred|over)\s+[\"'“]?(.+?)[\"'”]?\s*$"
    ),
    re.compile(
        r"(?i)\bpouž[ií]vaj\s+[\"'“]?(.+?)[\"'”]?\s+(?:namiesto|nie)\s+[\"'“]?(.+?)[\"'”]?\s*$"
    ),
)

_AVOID_PATTERNS = (
    re.compile(r"(?i)\b(?:never|don't|do not)\s+(?:use|suggest|write)\s+[\"'“]?(.+?)[\"'”]?\s*$"),
    re.compile(r"(?i)\bavoid\s+[\"'“]?(.+?)[\"'”]?\s*$"),
    re.compile(r"(?i)\bnenavrhuj\s+[\"'“]?(.+?)[\"'”]?\s*$"),
    re.compile(r"(?i)\bnepouž[ií]vaj\s+[\"'“]?(.+?)[\"'”]?\s*$"),
)

_CAPITALIZE_PATTERNS = (
    re.compile(
        r"(?i)\b(?:keep|write|prefer)\s+[\"'“]?(.+?)[\"'”]?\s+(?:capitalized|with capitals?|uppercase)\s*$"
    ),
    re.compile(
        r"(?i)\b(?:názvy|produkt(?:y|ov)?)\s+.+\s+(?:s veľkým|veľkým písmenom)\s*$"
    ),
    re.compile(
        r"(?i)\bcapitalize\s+[\"'“]?(.+?)[\"'”]?\s*$"
    ),
)


def normalize_rules(rules: list[str] | None) -> list[str]:
    """Dedupe and trim standing grammar instructions."""
    out: list[str] = []
    seen: set[str] = set()
    for raw in rules or []:
        text = " ".join(str(raw).split()).strip()
        if len(text) < 2:
            continue
        text = text[:MAX_RULE_LEN]
        key = text.casefold()
        if key in seen:
            continue
        seen.add(key)
        out.append(text)
        if len(out) >= MAX_RULES:
            break
    return out


def check_grammar(
    text: str,
    *,
    rules: list[str] | None = None,
    limit: int = 24,
) -> dict[str, Any]:
    """Match grammar teachings against note text (offline)."""
    source = truncate_text(text or "", 120_000)
    applied = normalize_rules(rules)
    limit = max(1, min(int(limit or 24), MAX_FINDINGS))

    findings: list[dict[str, Any]] = []
    for rule in applied:
        parsed = _parse_rule(rule)
        if parsed["kind"] == "prefer":
            avoid = parsed["avoid"]
            prefer = parsed["prefer"]
            for match in _find_literal(source, avoid):
                findings.append(
                    {
                        "rule": rule,
                        "kind": "prefer",
                        "match": match["text"],
                        "suggestion": prefer,
                        "offset": match["offset"],
                        "length": match["length"],
                        "message": f"Prefer “{prefer}” over “{avoid}”",
                    }
                )
        elif parsed["kind"] == "avoid":
            avoid = parsed["avoid"]
            for match in _find_literal(source, avoid):
                findings.append(
                    {
                        "rule": rule,
                        "kind": "avoid",
                        "match": match["text"],
                        "suggestion": "",
                        "offset": match["offset"],
                        "length": match["length"],
                        "message": f"Avoid “{avoid}”",
                    }
                )
        elif parsed["kind"] == "capitalize":
            term = parsed["term"]
            for match in _find_literal(source, term, case_sensitive=False):
                if match["text"] == term:
                    continue
                if match["text"].casefold() != term.casefold():
                    continue
                if match["text"][:1].isupper() and term[:1].isupper():
                    # Already capitalized like the preferred form.
                    if match["text"] == term:
                        continue
                preferred = term if term[:1].isupper() else term[:1].upper() + term[1:]
                if match["text"] == preferred:
                    continue
                findings.append(
                    {
                        "rule": rule,
                        "kind": "capitalize",
                        "match": match["text"],
                        "suggestion": preferred,
                        "offset": match["offset"],
                        "length": match["length"],
                        "message": f"Capitalize as “{preferred}”",
                    }
                )
        else:
            findings.append(
                {
                    "rule": rule,
                    "kind": "guidance",
                    "match": "",
                    "suggestion": "",
                    "offset": 0,
                    "length": 0,
                    "message": rule,
                }
            )

    # Prefer concrete hits over bare guidance; keep guidance if nothing matched.
    concrete = [item for item in findings if item["kind"] != "guidance"]
    guidance = [item for item in findings if item["kind"] == "guidance"]
    ordered = concrete + (guidance if not concrete else guidance[:3])
    trimmed = ordered[:limit]

    return {
        "findings": trimmed,
        "findingCount": len(trimmed),
        "rulesApplied": len(applied),
        "source": "python",
    }


def _parse_rule(rule: str) -> dict[str, str]:
    for pattern in _PREFER_PATTERNS:
        match = pattern.search(rule.strip().rstrip("."))
        if match:
            prefer = match.group(1).strip(" \"'")
            avoid = match.group(2).strip(" \"'")
            if prefer and avoid and prefer.casefold() != avoid.casefold():
                return {"kind": "prefer", "prefer": prefer, "avoid": avoid}

    for pattern in _AVOID_PATTERNS:
        match = pattern.search(rule.strip().rstrip("."))
        if match:
            avoid = match.group(1).strip(" \"'")
            if avoid:
                return {"kind": "avoid", "avoid": avoid}

    for pattern in _CAPITALIZE_PATTERNS:
        match = pattern.search(rule.strip().rstrip("."))
        if match and match.lastindex:
            term = match.group(1).strip(" \"'")
            if term:
                return {"kind": "capitalize", "term": term}

    return {"kind": "guidance"}


def _find_literal(
    text: str,
    needle: str,
    *,
    case_sensitive: bool = False,
) -> list[dict[str, Any]]:
    needle = (needle or "").strip()
    if len(needle) < 2:
        return []
    flags = 0 if case_sensitive else re.IGNORECASE
    pattern = re.compile(rf"(?<!\w){re.escape(needle)}(?!\w)", flags)
    out: list[dict[str, Any]] = []
    for match in pattern.finditer(text):
        out.append(
            {
                "text": match.group(0),
                "offset": match.start(),
                "length": match.end() - match.start(),
            }
        )
        if len(out) >= 12:
            break
    return out
