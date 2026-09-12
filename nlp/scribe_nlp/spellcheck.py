"""Offline spell / typo check for Scribe notes (stdlib only).

Uses bundled EN/SK wordlists (google-10k English + LibreOffice/Hunspell-derived
Slovak forms). Unknown words are reported only when a close suggestion exists
(edit distance 1–2), so rare proper nouns stay quiet.
"""

from __future__ import annotations

from functools import lru_cache
from importlib import resources
from pathlib import Path
from typing import Iterable

from .language import detect_language
from .stopwords import STOP_WORDS_EN, STOP_WORDS_SK
from .text_utils import EMAIL_RE, URL_RE, WORD_RE, truncate_text

MAX_ISSUES = 80
MAX_SUGGESTIONS = 5
MIN_WORD_LEN = 3

# Tokens we never flag (wiki / code / ids).
SKIP_RE_PARTS = (
    "http",
    "www",
    "scribe",
)


def _load_wordlist(name: str) -> frozenset[str]:
    try:
        root = resources.files("scribe_nlp.data")
        text = (root / name).read_text(encoding="utf-8")
    except (FileNotFoundError, ModuleNotFoundError, TypeError, OSError):
        path = Path(__file__).resolve().parent / "data" / name
        if not path.exists():
            return frozenset()
        text = path.read_text(encoding="utf-8")
    return frozenset(
        line.strip().lower()
        for line in text.splitlines()
        if line.strip() and not line.startswith("#")
    )


@lru_cache(maxsize=1)
def _dictionaries() -> dict[str, frozenset[str]]:
    en = set(_load_wordlist("words_en.txt"))
    en.update(STOP_WORDS_EN)
    sk = set(_load_wordlist("words_sk.txt"))
    sk.update(STOP_WORDS_SK)
    # Shared tech / product vocabulary used in the app itself.
    shared = {
        "scribe",
        "markdown",
        "json",
        "pdf",
        "html",
        "css",
        "api",
        "mcp",
        "nlp",
        "macos",
        "icloud",
        "dropbox",
        "github",
        "tauri",
        "tiptap",
        "sqlite",
    }
    en.update(shared)
    sk.update(shared)
    return {
        "en": frozenset(en),
        "sk": frozenset(sk),
        "both": frozenset(en | sk),
    }


def _levenshtein(a: str, b: str, *, max_dist: int) -> int:
    if abs(len(a) - len(b)) > max_dist:
        return max_dist + 1
    if a == b:
        return 0
    previous = list(range(len(b) + 1))
    for i, ca in enumerate(a, start=1):
        current = [i]
        row_min = current[0]
        for j, cb in enumerate(b, start=1):
            insert = current[j - 1] + 1
            delete = previous[j] + 1
            replace = previous[j - 1] + (ca != cb)
            value = min(insert, delete, replace)
            current.append(value)
            if value < row_min:
                row_min = value
        if row_min > max_dist:
            return max_dist + 1
        previous = current
    return previous[-1]


def _edits1(word: str) -> set[str]:
    letters = "aáäbcčdďeéfghiíjklĺľmnňoóôpqrŕsštťuúvwxyýzž"
    splits = [(word[:i], word[i:]) for i in range(len(word) + 1)]
    deletes = {left + right[1:] for left, right in splits if right}
    transposes = {
        left + right[1] + right[0] + right[2:]
        for left, right in splits
        if len(right) > 1
    }
    replaces = {
        left + char + right[1:]
        for left, right in splits
        if right
        for char in letters
    }
    inserts = {
        left + char + right
        for left, right in splits
        for char in letters
    }
    return deletes | transposes | replaces | inserts


def _suggest(word: str, dictionary: frozenset[str], *, limit: int = MAX_SUGGESTIONS) -> list[str]:
    lower = word.lower()
    if lower in dictionary:
        return []

    max_dist = 1 if len(lower) <= 5 else 2
    candidates: list[tuple[int, str]] = []

    # Fast path: generate edits and intersect dictionary.
    edits = _edits1(lower)
    for item in edits:
        if item in dictionary:
            dist = _levenshtein(lower, item, max_dist=max_dist)
            if dist <= max_dist:
                candidates.append((dist, item))

    if max_dist >= 2 and len(candidates) < limit:
        # One more edit from the edit-1 set (bounded).
        for item in list(edits)[:400]:
            for second in _edits1(item):
                if second in dictionary:
                    dist = _levenshtein(lower, second, max_dist=max_dist)
                    if dist <= max_dist:
                        candidates.append((dist, second))

    # Prefer shorter distance, then similar length, then alpha.
    ranked: dict[str, int] = {}
    for dist, item in candidates:
        prev = ranked.get(item)
        if prev is None or dist < prev:
            ranked[item] = dist

    ordered = sorted(
        ranked.items(),
        key=lambda pair: (pair[1], abs(len(pair[0]) - len(lower)), pair[0]),
    )
    return [word for word, _ in ordered[:limit]]


def _should_skip(token: str) -> bool:
    if len(token) < MIN_WORD_LEN:
        return True
    if any(ch.isdigit() for ch in token):
        return True
    if token.isupper() and len(token) <= 5:
        return True
    lower = token.lower()
    if any(part in lower for part in SKIP_RE_PARTS):
        return True
    # Likely code / camelCase identifiers.
    if "_" in token or token != token.lower() and token != token.title() and any(
        ch.isupper() for ch in token[1:]
    ):
        return True
    return False


def _iter_words(text: str) -> Iterable[tuple[str, int]]:
    for match in WORD_RE.finditer(text or ""):
        yield match.group(0), match.start()


def spellcheck_text(
    text: str,
    *,
    language: str | None = None,
    max_issues: int = MAX_ISSUES,
) -> dict[str, object]:
    cleaned = truncate_text(text or "", 120_000)
    # Avoid tokenizing URL / email fragments as words.
    cleaned = URL_RE.sub(" ", cleaned)
    cleaned = EMAIL_RE.sub(" ", cleaned)
    detected = detect_language(cleaned)
    lang = (language or str(detected.get("language") or "unknown")).lower()
    if lang not in {"sk", "en"}:
        # Prefer the stronger score; default to both dictionaries.
        scores = detected.get("scores") or {}
        sk_score = float(scores.get("sk") or 0)
        en_score = float(scores.get("en") or 0)
        if sk_score > en_score * 1.1:
            lang = "sk"
        elif en_score > sk_score * 1.1:
            lang = "en"
        else:
            lang = "both"

    dictionaries = _dictionaries()
    dictionary = dictionaries.get(lang, dictionaries["both"])

    issues: list[dict[str, object]] = []
    seen: set[str] = set()

    for token, offset in _iter_words(cleaned):
        if len(issues) >= max(1, min(max_issues, MAX_ISSUES)):
            break
        if _should_skip(token):
            continue
        lower = token.lower()
        if lower in dictionary or lower in seen:
            continue
        suggestions = _suggest(lower, dictionary)
        if not suggestions:
            # Unknown without a close neighbor → ignore (proper noun / rare word).
            continue
        seen.add(lower)
        issues.append(
            {
                "word": token,
                "offset": offset,
                "length": len(token),
                "suggestions": suggestions,
            }
        )

    return {
        "language": lang if lang != "both" else detected.get("language") or "unknown",
        "checkedLanguage": lang,
        "issueCount": len(issues),
        "issues": issues,
        "dictionarySize": len(dictionary),
    }
