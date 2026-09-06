from __future__ import annotations

import re

from .keywords import keywords_as_tags
from .language import detect_language
from .normalize import fold_diacritics, stem_lite
from .text_utils import (
    CAP_PHRASE_RE,
    DATE_RE,
    EMAIL_RE,
    HASHTAG_RE,
    PHONE_RE,
    URL_RE,
    WIKI_LINK_RE,
    content_stems,
    normalize_text,
)

COMPANY_RE = re.compile(
    r"\b([\w\u00C0-\u024F][\w\u00C0-\u024F.&'’\- ]{1,60}?)\s+"
    r"(?:s\.?\s*r\.?\s*o\.?|a\.?\s*s\.?|spol\.?\s*s\s*r\.?\s*o\.?|n\.?\s*o\.?|"
    r"Ltd\.?|LLC|Inc\.?|GmbH|AG)\b",
    re.IGNORECASE | re.UNICODE,
)

SK_PLACES = {
    "bratislava",
    "košice",
    "kosice",
    "prešov",
    "presov",
    "žilina",
    "zilina",
    "nitra",
    "banská bystrica",
    "banska bystrica",
    "trnava",
    "trenčín",
    "trencin",
    "martin",
    "poprad",
    "zvolen",
    "slovensko",
    "slovakia",
    "česko",
    "cesko",
    "praha",
    "brno",
    "vienna",
    "viedeň",
    "vieden",
    "budapešť",
    "budapest",
    "krakow",
    "kraków",
    "warsaw",
    "varšava",
    "varsava",
    "tatry",
    "vysoké tatry",
    "vysoke tatry",
}

CAP_BLACKLIST = {
    "the",
    "and",
    "for",
    "with",
    "from",
    "this",
    "that",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
    "january",
    "february",
    "march",
    "april",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
    "pondelok",
    "utorok",
    "streda",
    "štvrtok",
    "stvrtok",
    "piatok",
    "sobota",
    "nedeľa",
    "nedela",
    "január",
    "januar",
    "február",
    "februar",
    "marec",
    "apríl",
    "april",
    "máj",
    "maj",
    "jún",
    "jun",
    "júl",
    "jul",
    "august",
    "september",
    "október",
    "oktober",
    "november",
    "december",
}


def _slugify(value: str) -> str:
    cleaned = normalize_text(value).lower()
    cleaned = re.sub(r"[^\w\u00C0-\u024F-]+", "-", cleaned, flags=re.UNICODE)
    cleaned = re.sub(r"-{2,}", "-", cleaned).strip("-")
    return cleaned or value.lower()


def _append_unique(items: list[str], seen: set[str], value: str) -> None:
    key = fold_diacritics(value)
    if key in seen:
        return
    seen.add(key)
    items.append(value)


def _is_blacklisted_phrase(phrase: str) -> bool:
    parts = [fold_diacritics(part) for part in phrase.split()]
    if not parts:
        return True
    if all(part in CAP_BLACKLIST for part in parts):
        return True
    if len(parts) == 2 and parts[0] in CAP_BLACKLIST:
        return True
    return False


def extract_entities(text: str) -> dict[str, object]:
    source = text or ""
    entities: list[dict[str, str]] = []
    suggestions: list[str] = []
    seen_suggestions: set[str] = set()
    seen_entities: set[str] = set()

    def _entity(value: str, kind: str) -> None:
        key = f"{kind}:{fold_diacritics(value)}"
        if key in seen_entities:
            return
        seen_entities.add(key)
        entities.append({"text": value, "kind": kind})

    for match in EMAIL_RE.finditer(source):
        _entity(match.group(0), "email")
        _append_unique(suggestions, seen_suggestions, "kontakt")

    for match in PHONE_RE.finditer(source):
        _entity(match.group(0), "phone")
        _append_unique(suggestions, seen_suggestions, "kontakt")

    for match in URL_RE.finditer(source):
        _entity(match.group(0), "url")
        _append_unique(suggestions, seen_suggestions, "odkaz")

    for match in DATE_RE.finditer(source):
        _entity(match.group(0), "date")
        _append_unique(suggestions, seen_suggestions, f"datum:{match.group(0)}")

    for match in HASHTAG_RE.finditer(source):
        tag = match.group(1)
        _entity(tag, "hashtag")
        _append_unique(suggestions, seen_suggestions, _slugify(tag))

    for match in WIKI_LINK_RE.finditer(source):
        target = normalize_text(match.group(1))
        if len(target) < 2:
            continue
        _entity(target, "person" if " " not in target and target[:1].isupper() else "wiki_link")
        # Prefer person/org tags from wiki titles.
        kind_tag = "osoba" if " " in target else _slugify(target)
        _append_unique(suggestions, seen_suggestions, kind_tag if kind_tag != "osoba" else _slugify(target))
        _append_unique(suggestions, seen_suggestions, _slugify(target))

    for match in COMPANY_RE.finditer(source):
        name = normalize_text(match.group(0))
        if len(name) < 4:
            continue
        _entity(name, "org")
        _append_unique(suggestions, seen_suggestions, _slugify(match.group(1)))
        _append_unique(suggestions, seen_suggestions, "firma")

    lowered = fold_diacritics(source)
    source_stems = set(content_stems(source))
    for place in SK_PLACES:
        place_fold = fold_diacritics(place)
        place_stem = stem_lite(place)
        if place_fold not in lowered and place_stem not in source_stems:
            continue
        display = place.title() if place.islower() else place
        canonical = {
            "kosice": "Košice",
            "presov": "Prešov",
            "zilina": "Žilina",
            "trencin": "Trenčín",
            "banska bystrica": "Banská Bystrica",
            "slovensko": "Slovensko",
            "cesko": "Česko",
            "vieden": "Viedeň",
            "varsava": "Varšava",
            "vysoke tatry": "Vysoké Tatry",
            "bratislava": "Bratislava",
        }.get(place_fold, display)
        _entity(canonical, "place")
        _append_unique(suggestions, seen_suggestions, _slugify(canonical))

    for match in CAP_PHRASE_RE.finditer(source):
        phrase = normalize_text(match.group(1))
        if len(phrase) < 4 or _is_blacklisted_phrase(phrase):
            continue
        _entity(phrase, "phrase")
        _append_unique(suggestions, seen_suggestions, _slugify(phrase))

    for tag in keywords_as_tags(source, limit=8):
        _append_unique(suggestions, seen_suggestions, tag)

    language = detect_language(source)

    return {
        "entities": entities,
        "tagSuggestions": suggestions[:16],
        "language": language.get("language"),
        "languageConfidence": language.get("confidence"),
    }
