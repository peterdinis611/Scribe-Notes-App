"""Offline spell / typo check for Scribe notes (stdlib only).

English uses a bundled google-10k wordlist. Slovak uses LibreOffice/Hunspell
`sk_SK.dic` + `sk_SK.aff` when present (morphology-aware), with a small wordlist
fallback. Unknown words are reported only when a close suggestion exists
(edit distance 1-2, or the same word with different diacritics), so rare proper
nouns stay quiet.

Offsets always refer to the text passed in by the caller.
"""

from __future__ import annotations

import re
import unicodedata
from collections import Counter
from functools import lru_cache
from importlib import resources
from pathlib import Path
from typing import Iterable, Protocol

from .hunspell_dict import load_slovak_hunspell
from .language import detect_language
from .stopwords import STOP_WORDS_EN, STOP_WORDS_SK
from .text_utils import EMAIL_RE, URL_RE

MAX_ISSUES = 80
MAX_SUGGESTIONS = 5
MIN_WORD_LEN = 3
MAX_TEXT_CHARS = 120_000
TRUST_FREQUENT_DEFAULT = 3  # a word used this often is probably intentional
EDITS2_SEEDS = 160  # cap on first-level edits expanded in the (slow) distance-2 search
OTHER_LANG_MIN_LEN = 5  # accept a word valid in the *other* language only from this length

_ALPHABET_EN = "abcdefghijklmnopqrstuvwxyz"
_ALPHABET_SK = "aáäbcčdďeéfghiíjklĺľmnňoóôpqrŕsštťuúvwxyýzž"
_ALPHABETS = {"en": _ALPHABET_EN, "sk": _ALPHABET_SK, "both": _ALPHABET_SK}

# Tokens we never flag (wiki / code / ids).
_SKIP_EXACT = frozenset({"scribe"})
_SKIP_PREFIXES = ("http", "www")

# English clitics: "Jan's" -> check "Jan"; "don't" -> skipped entirely.
_CLITICS = frozenset({"s", "re", "ve", "ll", "d", "m"})

# Legitimate doubled words.
_REPEAT_OK = frozenset({"had", "that"})

_TOKEN_RE = re.compile(r"\w+(?:['’]\w+)*", re.UNICODE)

# Markdown / note syntax that must not be spell-checked.
_CODE_FENCE_RE = re.compile(r"```.*?```|~~~.*?~~~", re.DOTALL)
_INLINE_CODE_RE = re.compile(r"`[^`\n]+`")
_TAG_MENTION_RE = re.compile(r"(?<!\w)[#@][\w\-.]+", re.UNICODE)
_NON_NEWLINE_RE = re.compile(r"[^\n]")

_LEADING_MARKUP = frozenset("#*>-_\"'“„”‘([«•+")


class WordDictionary(Protocol):
    def __contains__(self, item: object) -> bool: ...

    def __len__(self) -> int: ...


# --------------------------------------------------------------------------- #
# Dictionaries
# --------------------------------------------------------------------------- #


def _norm(word: str) -> str:
    return unicodedata.normalize("NFC", word).lower()


def _fold(word: str) -> str:
    """Strip diacritics: 'dôležité' -> 'dolezite'."""
    decomposed = unicodedata.normalize("NFD", word)
    return "".join(ch for ch in decomposed if not unicodedata.combining(ch))


def _suggestion_vocab(dictionary: WordDictionary) -> frozenset[str]:
    """O(1) membership set for generating suggestions.

    Hunspell membership walks affix rules and is far too slow to run against
    hundreds of thousands of edit candidates. Stems (+ plain wordlists) are enough
    for typo suggestions; full Hunspell is still used to accept valid words.
    """
    custom = getattr(dictionary, "suggestion_vocab", None)
    if callable(custom):
        vocab = custom()
        if isinstance(vocab, frozenset):
            return vocab
    if isinstance(dictionary, frozenset):
        return dictionary
    # Last resort: materialize (only for tiny dicts).
    return frozenset(str(item) for item in dictionary)  # type: ignore[arg-type]


def _load_wordlist(name: str) -> frozenset[str]:
    try:
        root = resources.files("scribe_nlp.data")
        text = (root / name).read_text(encoding="utf-8")
    except (FileNotFoundError, ModuleNotFoundError, TypeError, OSError):
        path = Path(__file__).resolve().parent / "data" / name
        if not path.exists():
            return frozenset()
        text = path.read_text(encoding="utf-8")
    words = set()
    for line in text.splitlines():
        stripped = line.strip()
        if stripped and not stripped.startswith("#"):
            words.add(_norm(stripped))
    return frozenset(words)


class _UnionDict:
    def __init__(self, *parts: WordDictionary) -> None:
        self._parts = parts
        self._suggestion_vocab: frozenset[str] | None = None

    def __contains__(self, item: object) -> bool:
        return any(item in part for part in self._parts)

    def __len__(self) -> int:
        # Approximate (overlaps ignored) - for diagnostics only.
        return sum(len(part) for part in self._parts)

    def suggestion_vocab(self) -> frozenset[str]:
        if self._suggestion_vocab is None:
            merged: set[str] = set()
            for part in self._parts:
                merged.update(_suggestion_vocab(part))
            self._suggestion_vocab = frozenset(merged)
        return self._suggestion_vocab


@lru_cache(maxsize=1)
def _dictionaries() -> dict[str, WordDictionary]:
    en = set(_load_wordlist("words_en.txt"))
    en.update(STOP_WORDS_EN)
    sk_list = set(_load_wordlist("words_sk.txt"))
    sk_list.update(STOP_WORDS_SK)
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
    sk_list.update(shared)

    en_dict: WordDictionary = frozenset(en)
    hunspell = load_slovak_hunspell()
    if hunspell is not None:
        sk_dict: WordDictionary = _UnionDict(hunspell, frozenset(sk_list))
    else:
        sk_dict = frozenset(sk_list)

    return {
        "en": en_dict,
        "sk": sk_dict,
        "both": _UnionDict(en_dict, sk_dict),
    }


class _VocabIndex:
    """Lazily built lookup structures over a suggestion vocabulary."""

    def __init__(self, vocab: frozenset[str]) -> None:
        self.vocab = vocab  # keeps the vocab alive so id() stays valid
        self._folded: dict[str, tuple[str, ...]] | None = None
        self._by_len: dict[int, list[str]] | None = None

    @property
    def folded(self) -> dict[str, tuple[str, ...]]:
        """diacritics-free form -> vocab words that have diacritics."""
        if self._folded is None:
            groups: dict[str, list[str]] = {}
            for word in self.vocab:
                plain = _fold(word)
                if plain != word:
                    groups.setdefault(plain, []).append(word)
            self._folded = {key: tuple(sorted(val)) for key, val in groups.items()}
        return self._folded

    def with_lengths(self, lengths: Iterable[int]) -> list[str]:
        if self._by_len is None:
            buckets: dict[int, list[str]] = {}
            for word in self.vocab:
                buckets.setdefault(len(word), []).append(word)
            self._by_len = buckets
        out: list[str] = []
        for length in lengths:
            out.extend(self._by_len.get(length, ()))
        return out


_INDEXES: dict[int, _VocabIndex] = {}


def _index_for(vocab: frozenset[str]) -> _VocabIndex:
    key = id(vocab)
    index = _INDEXES.get(key)
    if index is None or index.vocab is not vocab:
        index = _INDEXES[key] = _VocabIndex(vocab)
    return index


# --------------------------------------------------------------------------- #
# Edit distance & suggestions
# --------------------------------------------------------------------------- #


def _levenshtein(a: str, b: str, *, max_dist: int) -> int:
    """Optimal string alignment distance (a transposition costs 1).

    Returns max_dist + 1 as soon as the distance is known to exceed max_dist.
    """
    if abs(len(a) - len(b)) > max_dist:
        return max_dist + 1
    if a == b:
        return 0
    prev2: list[int] | None = None
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, start=1):
        current = [i]
        for j, cb in enumerate(b, start=1):
            value = min(
                current[j - 1] + 1,
                prev[j] + 1,
                prev[j - 1] + (ca != cb),
            )
            if prev2 is not None and i > 1 and j > 1 and ca == b[j - 2] and a[i - 2] == cb:
                value = min(value, prev2[j - 2] + 1)
            current.append(value)
        # A transposition in the next row reads from `prev`, so keep it in the bound.
        if min(current) > max_dist and min(prev) + 1 > max_dist:
            return max_dist + 1
        prev2, prev = prev, current
    return prev[-1]


def _edits1_parts(word: str, alphabet: str = _ALPHABET_SK) -> tuple[set[str], set[str], set[str], set[str]]:
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
        for char in alphabet
    }
    inserts = {left + char + right for left, right in splits for char in alphabet}
    return deletes, transposes, replaces, inserts


def _edits1(word: str, alphabet: str = _ALPHABET_SK) -> set[str]:
    deletes, transposes, replaces, inserts = _edits1_parts(word, alphabet)
    return deletes | transposes | replaces | inserts


def _edits2_hits(
    seeds: list[str],
    vocab: frozenset[str],
    alphabet: str,
    original: str,
    *,
    cap: int,
) -> list[str]:
    hits: list[str] = []
    seen: set[str] = set()
    for seed in seeds:
        for second in _edits1(seed, alphabet):
            if second in seen:
                continue
            seen.add(second)
            if second in vocab and _levenshtein(original, second, max_dist=2) <= 2:
                hits.append(second)
                if len(hits) >= cap:
                    return hits
    return hits


def _suggest(
    word: str,
    dictionary: WordDictionary,
    *,
    limit: int = MAX_SUGGESTIONS,
    alphabet: str = _ALPHABET_SK,
) -> list[str]:
    lower = word.lower()
    if lower in dictionary:
        return []

    vocab = _suggestion_vocab(dictionary)
    index = _index_for(vocab)
    first = lower[:1]
    max_dist = 1 if len(lower) <= 5 else 2

    # candidate -> distance (0 = same word, only diacritics differ)
    ranked: dict[str, int] = {}

    # 1) Missing / wrong diacritics ("dolezite" -> "dôležité"). Plain edit distance
    #    would count every accent as a substitution and miss these.
    plain = _fold(lower)
    if plain != lower and plain in vocab:
        ranked[plain] = 0
    for hit in index.folded.get(plain, ()):
        if hit != lower:
            ranked[hit] = 0

    # 2) Edit distance 1. Reaching a vocab word via one edit means distance <= 1.
    deletes, transposes, replaces, inserts = _edits1_parts(lower, alphabet)
    edits = deletes | transposes | replaces | inserts
    for item in edits:
        if item in vocab and item != lower:
            ranked.setdefault(item, 1)

    # 3) Edit distance 2 - expensive, so only when nothing closer was found.
    #    Seeds are ordered deterministically (structural edits first).
    if max_dist >= 2 and not ranked and len(lower) <= 12:
        seeds: list[str] = []
        seen_seeds: set[str] = set()
        for group in (deletes, transposes, replaces, inserts):
            for item in sorted(group):
                if item not in seen_seeds:
                    seen_seeds.add(item)
                    seeds.append(item)
        for item in _edits2_hits(seeds[:EDITS2_SEEDS], vocab, alphabet, lower, cap=limit * 4):
            ranked.setdefault(item, 2)

    if ranked:
        ordered = sorted(
            ranked.items(),
            key=lambda pair: (
                pair[1],
                pair[0][:1] != first,
                abs(len(pair[0]) - len(lower)),
                pair[0],
            ),
        )
        return [item for item, _ in ordered[:limit]]

    # Optional fuzzy fallback for heavier typos. Only compares against words of a
    # similar length (instead of an arbitrary slice of the vocabulary).
    try:
        from .extras import fuzzy_extract, has_rapidfuzz

        if has_rapidfuzz() and vocab:
            delta = max(2, len(lower) // 4)
            lengths = range(max(MIN_WORD_LEN, len(lower) - delta), len(lower) + delta + 1)
            choices = index.with_lengths(lengths)
            if choices:
                hits = fuzzy_extract(lower, choices, limit=limit * 4, score_cutoff=0.82)
                filtered = [choice for choice, _score in hits if choice != lower]
                if filtered:
                    return filtered[:limit]
    except Exception:
        pass

    return []


@lru_cache(maxsize=8192)
def _suggest_cached(lang: str, word: str) -> tuple[str, ...]:
    dictionary = _dictionaries()[lang]
    return tuple(_suggest(word, dictionary, alphabet=_ALPHABETS.get(lang, _ALPHABET_SK)))


def _match_case(original: str, suggestion: str) -> str:
    if original[:1].isupper():
        return suggestion[:1].upper() + suggestion[1:]
    return suggestion


# --------------------------------------------------------------------------- #
# Tokenizing
# --------------------------------------------------------------------------- #


def _should_skip(token: str) -> bool:
    if len(token) < MIN_WORD_LEN:
        return True
    if "_" in token or any(ch.isdigit() for ch in token):
        return True
    # ALLCAPS acronyms and camelCase / mixed-case identifiers (iPhone, McDonald).
    if any(ch.isupper() for ch in token[1:]):
        return True
    lower = token.lower()
    return lower in _SKIP_EXACT or lower.startswith(_SKIP_PREFIXES)


def _blank(match: re.Match[str]) -> str:
    """Replace a match with spaces of the same length (newlines kept)."""
    return _NON_NEWLINE_RE.sub(" ", match.group(0))


def _mask_non_prose(text: str) -> str:
    """Blank out code, URLs, e-mails, #tags and @mentions without shifting offsets."""
    for pattern in (_CODE_FENCE_RE, _INLINE_CODE_RE, URL_RE, EMAIL_RE, _TAG_MENTION_RE):
        text = pattern.sub(_blank, text)
    return text


def _iter_words(text: str) -> Iterable[tuple[str, int]]:
    for match in _TOKEN_RE.finditer(text or ""):
        token = match.group(0)
        if "'" in token or "’" in token:
            stem, _, suffix = token.replace("’", "'").partition("'")
            suffix = suffix.lower()
            if suffix in _CLITICS:
                token = stem  # "Jan's" -> "Jan"
            else:
                continue  # "don't", "o'clock", ... - not worth checking
        yield token, match.start()


def _is_sentence_start(text: str, offset: int) -> bool:
    i = offset - 1
    while i >= 0:
        ch = text[i]
        if ch == "\n" or ch in ".!?…":
            return True
        if ch.isspace() or ch in _LEADING_MARKUP:
            i -= 1
            continue
        return False
    return True


def _find_repeats(text: str, tokens: list[tuple[str, int]]) -> list[dict[str, object]]:
    """Detect doubled words such as 'the the' / 'sa sa' (same line or wrapped once)."""
    issues: list[dict[str, object]] = []
    for (prev_tok, prev_off), (tok, off) in zip(tokens, tokens[1:]):
        if len(tok) < 2 or any(ch.isdigit() for ch in tok):
            continue
        key = _norm(tok)
        if key != _norm(prev_tok) or key in _REPEAT_OK:
            continue
        prev_end = prev_off + len(prev_tok)
        gap = text[prev_end:off]
        if gap.strip() or gap.count("\n") > 1:
            continue
        issues.append(
            {
                "word": tok,
                "offset": off,
                "length": len(tok),
                "suggestions": [],
                "kind": "repeat",
                # Removing the whitespace + the second word fixes it.
                "fix": {"offset": prev_end, "length": off + len(tok) - prev_end, "replacement": ""},
            }
        )
    return issues


# --------------------------------------------------------------------------- #
# Public API
# --------------------------------------------------------------------------- #


def _resolve_language(text: str, language: str | None) -> tuple[str, dict[str, object] | None]:
    requested = (language or "").strip().lower()
    if requested in {"sk", "en"}:
        return requested, None
    detected = detect_language(text)
    if requested == "both":
        return "both", detected
    lang = str(detected.get("language") or "unknown").lower()
    if lang in {"sk", "en"}:
        return lang, detected
    # Prefer the stronger score; default to both dictionaries.
    scores = detected.get("scores") or {}
    sk_score = float(scores.get("sk") or 0)
    en_score = float(scores.get("en") or 0)
    if sk_score > en_score * 1.1:
        return "sk", detected
    if en_score > sk_score * 1.1:
        return "en", detected
    return "both", detected


def _is_known(lower: str, lang: str, dictionaries: dict[str, WordDictionary]) -> bool:
    if lang == "both":
        return lower in dictionaries["both"]
    if lower in dictionaries[lang]:
        return True
    # Notes mix languages ("meeting" in a Slovak note). Accept longer words that are
    # valid in the other language; short ones collide with real typos too often.
    if len(lower) >= OTHER_LANG_MIN_LEN:
        return lower in dictionaries["sk" if lang == "en" else "en"]
    return False


def spellcheck_text(
    text: str,
    *,
    language: str | None = None,
    max_issues: int = MAX_ISSUES,
    ignore: Iterable[str] | None = None,
    dedupe: bool = True,
    check_repeats: bool = True,
    skip_proper_nouns: bool = True,
    trust_frequent: int = TRUST_FREQUENT_DEFAULT,
) -> dict[str, object]:
    """Check `text` and return typo issues (backward compatible shape).

    ignore:            extra words to accept (e.g. the user's personal dictionary).
    dedupe:            report each misspelled word once (False = every occurrence,
                       useful for underlining in an editor).
    check_repeats:     also report doubled words ("the the").
    skip_proper_nouns: ignore Capitalised words in mid-sentence.
    trust_frequent:    unknown words used this many times are treated as
                       intentional (0 disables).

    Each issue has `word`, `offset`, `length`, `suggestions` and `kind`
    ("typo" | "repeat"; repeats also carry a `fix` span to delete).
    """
    from .extras import fix_unicode

    raw = text or ""
    normalized = fix_unicode(raw)
    if len(normalized) != len(raw):
        # Keep offsets valid for the caller's text.
        normalized = raw
    if len(normalized) > MAX_TEXT_CHARS:
        cut = normalized.rfind(" ", 0, MAX_TEXT_CHARS)
        normalized = normalized[: cut if cut > 0 else MAX_TEXT_CHARS]

    cleaned = _mask_non_prose(normalized)
    lang, detected = _resolve_language(cleaned, language)
    dictionaries = _dictionaries()
    dictionary = dictionaries[lang]

    limit = max(1, min(int(max_issues), MAX_ISSUES))
    ignored = frozenset(_norm(word) for word in (ignore or ()))
    tokens = list(_iter_words(cleaned))
    counts = Counter(_norm(token) for token, _ in tokens)

    typos: list[dict[str, object]] = []
    seen: set[str] = set()
    known_cache: dict[str, bool] = {}
    truncated = False

    for token, offset in tokens:
        if _should_skip(token):
            continue
        lower = _norm(token)
        if dedupe and lower in seen:
            continue
        known = known_cache.get(lower)
        if known is None:
            known = known_cache[lower] = _is_known(lower, lang, dictionaries)
        if known or lower in ignored:
            continue
        if trust_frequent and counts[lower] >= trust_frequent:
            continue
        if skip_proper_nouns and token[:1].isupper() and not _is_sentence_start(cleaned, offset):
            continue
        suggestions = _suggest_cached(lang, lower)
        if not suggestions:
            # Unknown without a close neighbor -> ignore (proper noun / rare word).
            continue
        if len(typos) >= limit:
            truncated = True
            break
        seen.add(lower)
        typos.append(
            {
                "word": token,
                "offset": offset,
                "length": len(token),
                "suggestions": [_match_case(token, item) for item in suggestions],
                "kind": "typo",
            }
        )

    issues = typos
    if check_repeats:
        issues = sorted(typos + _find_repeats(normalized, tokens), key=lambda item: item["offset"])
    if len(issues) > limit:
        issues = issues[:limit]
        truncated = True

    return {
        "language": lang if lang != "both" else (detected or {}).get("language") or "unknown",
        "checkedLanguage": lang,
        "issueCount": len(issues),
        "issues": issues,
        "truncated": truncated,
        "dictionarySize": len(dictionary),
    }