"""One-shot document analysis for the insights panel / Rust bridge.

``analyze_document(text)`` keeps the original output shape. New: selectable
sections, per-section error isolation, timings, an LRU cache, input
truncation and optional extended extractors (links, emails, hashtags, stats).
"""

from __future__ import annotations

import copy
import hashlib
import re
import threading
import time
from collections import OrderedDict
from dataclasses import dataclass
from typing import Any, Callable, Iterable

from .dates import extract_dates
from .keywords import extract_keywords
from .language import detect_language
from .mentions import extract_mentions
from .outline import extract_outline
from .readability import reading_stats
from .sentiment import analyze_sentiment
from .summarize import summarize_text
from .tasks import extract_tasks
from .title import suggest_title

SECTION_NAMES: tuple[str, ...] = (
    "language", "keywords", "outline", "summary", "tasks",
    "readability", "sentiment", "mentions", "dates", "title",
)

# Output keys in the original order, with the value used when a section is
# skipped or fails. (readability/sentiment/mentions fall back to None because
# their concrete shape is owned by their modules.)
_DEFAULTS: dict[str, Any] = {
    "language": "unknown",
    "languageConfidence": 0.0,
    "keywords": [],
    "keyphrases": [],
    "outline": [],
    "summary": None,
    "summaryBullets": [],
    "openTaskCount": 0,
    "taskCount": 0,
    "readability": None,
    "sentiment": None,
    "mentions": None,
    "dates": [],
    "suggestedTitle": "",
    "suggestedSlug": "",
}

_EXTENDED_DEFAULTS: dict[str, Any] = {
    "stats": {},
    "links": [],
    "emails": [],
    "hashtags": [],
    "codeBlockCount": 0,
}


@dataclass(frozen=True)
class AnalysisOptions:
    keyword_limit: int = 12
    outline_limit: int = 24
    summary_sentences: int = 3
    min_summary_chars: int = 80
    sections: frozenset[str] = frozenset(SECTION_NAMES)
    extended: bool = False
    max_chars: int | None = None  # analyse only the first N characters


# --------------------------------------------------------------------------- #
# Sections (each returns a dict of output keys)
# --------------------------------------------------------------------------- #

def _sec_language(s: str, o: AnalysisOptions) -> dict[str, Any]:
    r = detect_language(s)
    return {
        "language": r.get("language", "unknown"),
        "languageConfidence": float(r.get("confidence") or 0.0),
    }


def _sec_keywords(s: str, o: AnalysisOptions) -> dict[str, Any]:
    r = extract_keywords(s, limit=o.keyword_limit)
    return {
        "keywords": r.get("keywords") or [],
        "keyphrases": [
            str(i.get("phrase") or "")
            for i in (r.get("keyphrases") or [])
            if i.get("phrase")
        ],
    }


def _sec_outline(s: str, o: AnalysisOptions) -> dict[str, Any]:
    return {"outline": extract_outline(s, limit=o.outline_limit).get("items") or []}


def _sec_summary(s: str, o: AnalysisOptions) -> dict[str, Any]:
    if len(s.strip()) < o.min_summary_chars:
        return {}
    r = summarize_text(s, max_sentences=o.summary_sentences)
    return {"summary": r.get("summary"), "summaryBullets": r.get("bullets") or []}


def _sec_tasks(s: str, o: AnalysisOptions) -> dict[str, Any]:
    t = extract_tasks(s)
    return {
        "openTaskCount": int(t.get("openCount") or 0),
        "taskCount": len(t.get("tasks") or []),
    }


def _sec_readability(s: str, o: AnalysisOptions) -> dict[str, Any]:
    return {"readability": reading_stats(s)}


def _sec_sentiment(s: str, o: AnalysisOptions) -> dict[str, Any]:
    return {"sentiment": analyze_sentiment(s)}


def _sec_mentions(s: str, o: AnalysisOptions) -> dict[str, Any]:
    return {"mentions": extract_mentions(s)}


def _sec_dates(s: str, o: AnalysisOptions) -> dict[str, Any]:
    return {"dates": extract_dates(s).get("events") or []}


def _sec_title(s: str, o: AnalysisOptions) -> dict[str, Any]:
    t = suggest_title(s)
    return {"suggestedTitle": t.get("title") or "", "suggestedSlug": t.get("slug") or ""}


_RUNNERS: dict[str, Callable[[str, AnalysisOptions], dict[str, Any]]] = {
    "language": _sec_language,
    "keywords": _sec_keywords,
    "outline": _sec_outline,
    "summary": _sec_summary,
    "tasks": _sec_tasks,
    "readability": _sec_readability,
    "sentiment": _sec_sentiment,
    "mentions": _sec_mentions,
    "dates": _sec_dates,
    "title": _sec_title,
}
assert set(_RUNNERS) == set(SECTION_NAMES)


# --------------------------------------------------------------------------- #
# Extended extractors (pure stdlib)
# --------------------------------------------------------------------------- #

_URL_RE = re.compile(r"https?://[^\s<>()\[\]\"']+")
_EMAIL_RE = re.compile(r"\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b")
_HASHTAG_RE = re.compile(r"(?<![\w&#])#([^\W\d_][\w-]*)")
_WORD_RE = re.compile(r"\w+", re.UNICODE)
_WPM = 200


def _unique(items: Iterable[str]) -> list[str]:
    return list(dict.fromkeys(items))


def _extended(s: str) -> dict[str, Any]:
    words = len(_WORD_RE.findall(s))
    paragraphs = [p for p in re.split(r"\n\s*\n", s) if p.strip()]
    lines = [ln for ln in s.splitlines() if ln.strip()]
    return {
        "stats": {
            "charCount": len(s),
            "wordCount": words,
            "lineCount": len(lines),
            "paragraphCount": len(paragraphs),
            "readingMinutes": round(words / _WPM, 1),
        },
        "links": _unique(u.rstrip(".,;:!?") for u in _URL_RE.findall(s)),
        "emails": _unique(_EMAIL_RE.findall(s)),
        "hashtags": _unique(_HASHTAG_RE.findall(s)),
        "codeBlockCount": s.count("```") // 2,
    }


# --------------------------------------------------------------------------- #
# Cache
# --------------------------------------------------------------------------- #

class _LRU:
    def __init__(self, maxsize: int = 32) -> None:
        self.maxsize = maxsize
        self._data: OrderedDict[Any, Any] = OrderedDict()
        self._lock = threading.Lock()

    def get(self, key: Any) -> Any | None:
        with self._lock:
            if key not in self._data:
                return None
            self._data.move_to_end(key)
            return copy.deepcopy(self._data[key])

    def put(self, key: Any, value: Any) -> None:
        with self._lock:
            self._data[key] = copy.deepcopy(value)
            self._data.move_to_end(key)
            while len(self._data) > self.maxsize:
                self._data.popitem(last=False)

    def clear(self) -> None:
        with self._lock:
            self._data.clear()


_CACHE = _LRU()


def clear_analysis_cache() -> None:
    _CACHE.clear()


# --------------------------------------------------------------------------- #
# Core
# --------------------------------------------------------------------------- #

def _run(text: str, opts: AnalysisOptions, *, strict: bool, use_cache: bool) -> dict[str, Any]:
    unknown = opts.sections - set(SECTION_NAMES)
    if unknown:
        raise ValueError(f"unknown sections: {sorted(unknown)}")

    source = text or ""
    truncated = bool(opts.max_chars is not None and len(source) > opts.max_chars)
    if truncated:
        source = source[: opts.max_chars]

    text_hash = hashlib.sha1(source.encode("utf-8")).hexdigest()
    key = (text_hash, opts)
    if use_cache:
        hit = _CACHE.get(key)
        if hit is not None:
            hit["cacheHit"] = True
            return hit

    out: dict[str, Any] = copy.deepcopy(_DEFAULTS)
    if opts.extended:
        out.update(copy.deepcopy(_EXTENDED_DEFAULTS))
    errors: dict[str, str] = {}
    timings: dict[str, float] = {}

    for name in SECTION_NAMES:  # fixed order => deterministic output
        if name not in opts.sections:
            continue
        t0 = time.perf_counter()
        try:
            out.update(_RUNNERS[name](source, opts))
        except Exception as exc:  # noqa: BLE001
            if strict:
                raise
            errors[name] = f"{type(exc).__name__}: {exc}"
        timings[name] = round((time.perf_counter() - t0) * 1000, 3)

    if opts.extended:
        t0 = time.perf_counter()
        try:
            out.update(_extended(source))
        except Exception as exc:  # noqa: BLE001
            if strict:
                raise
            errors["extended"] = f"{type(exc).__name__}: {exc}"
        timings["extended"] = round((time.perf_counter() - t0) * 1000, 3)

    result = {
        "analysis": out,
        "errors": errors,
        "timingsMs": timings,
        "truncated": truncated,
        "textHash": text_hash,
        "cacheHit": False,
    }
    if use_cache and not errors:  # never cache partial results
        _CACHE.put(key, result)
    return result


def _opts(
    keyword_limit: int,
    outline_limit: int,
    summary_sentences: int,
    sections: Iterable[str] | None,
    extended: bool,
    max_chars: int | None,
    min_summary_chars: int,
) -> AnalysisOptions:
    return AnalysisOptions(
        keyword_limit=keyword_limit,
        outline_limit=outline_limit,
        summary_sentences=summary_sentences,
        min_summary_chars=min_summary_chars,
        sections=frozenset(SECTION_NAMES if sections is None else sections),
        extended=extended,
        max_chars=max_chars,
    )


def analyze_document(
    text: str,
    *,
    keyword_limit: int = 12,
    outline_limit: int = 24,
    summary_sentences: int = 3,
    min_summary_chars: int = 80,
    sections: Iterable[str] | None = None,
    extended: bool = False,
    max_chars: int | None = None,
    use_cache: bool = False,
    strict: bool = True,
) -> dict[str, object]:
    """Original API. By default behaves as before (errors propagate).

    ``strict=False`` isolates failures: a failing section keeps its default value.
    """
    opts = _opts(keyword_limit, outline_limit, summary_sentences, sections,
                 extended, max_chars, min_summary_chars)
    return _run(text, opts, strict=strict, use_cache=use_cache)["analysis"]


def analyze_document_detailed(
    text: str,
    *,
    keyword_limit: int = 12,
    outline_limit: int = 24,
    summary_sentences: int = 3,
    min_summary_chars: int = 80,
    sections: Iterable[str] | None = None,
    extended: bool = True,
    max_chars: int | None = 200_000,
    use_cache: bool = True,
) -> dict[str, Any]:
    """Resilient variant for the UI: never raises on a section failure.

    Returns ``{"analysis", "errors", "timingsMs", "truncated", "textHash", "cacheHit"}``.
    """
    opts = _opts(keyword_limit, outline_limit, summary_sentences, sections,
                 extended, max_chars, min_summary_chars)
    return _run(text, opts, strict=False, use_cache=use_cache)