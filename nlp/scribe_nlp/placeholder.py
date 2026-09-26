"""Generate placeholder / lorem-style filler text for the editor."""

from __future__ import annotations

import random
from typing import Any, Literal

Unit = Literal["paragraphs", "sentences", "words"]
Language = Literal["la", "en", "sk"]

_CLASSIC_LEAD = (
    "lorem",
    "ipsum",
    "dolor",
    "sit",
    "amet",
    "consectetur",
    "adipiscing",
    "elit",
)

_WORDS: dict[Language, tuple[str, ...]] = {
    "la": (
        "lorem",
        "ipsum",
        "dolor",
        "sit",
        "amet",
        "consectetur",
        "adipiscing",
        "elit",
        "sed",
        "do",
        "eiusmod",
        "tempor",
        "incididunt",
        "ut",
        "labore",
        "et",
        "dolore",
        "magna",
        "aliqua",
        "enim",
        "ad",
        "minim",
        "veniam",
        "quis",
        "nostrud",
        "exercitation",
        "ullamco",
        "laboris",
        "nisi",
        "aliquip",
        "ex",
        "ea",
        "commodo",
        "consequat",
        "duis",
        "aute",
        "irure",
        "in",
        "reprehenderit",
        "voluptate",
        "velit",
        "esse",
        "cillum",
        "fugiat",
        "nulla",
        "pariatur",
        "excepteur",
        "sint",
        "occaecat",
        "cupidatat",
        "non",
        "proident",
        "sunt",
        "culpa",
        "qui",
        "officia",
        "deserunt",
        "mollit",
        "anim",
        "id",
        "est",
        "laborum",
    ),
    "en": (
        "the",
        "quick",
        "brown",
        "fox",
        "jumps",
        "over",
        "lazy",
        "dog",
        "notes",
        "draft",
        "outline",
        "section",
        "heading",
        "paragraph",
        "example",
        "sample",
        "content",
        "placeholder",
        "document",
        "editor",
        "library",
        "folder",
        "task",
        "meeting",
        "agenda",
        "summary",
        "detail",
        "context",
        "decision",
        "action",
        "follow",
        "up",
        "review",
        "update",
        "progress",
        "idea",
        "thought",
        "remark",
        "reference",
        "source",
        "figure",
        "table",
        "list",
        "item",
        "point",
        "topic",
        "theme",
        "story",
        "chapter",
        "page",
        "line",
        "word",
        "sentence",
        "space",
        "layout",
        "design",
        "structure",
        "flow",
        "clarity",
        "focus",
        "drafting",
        "rewrite",
        "polish",
        "finish",
    ),
    "sk": (
        "rychly",
        "hnedy",
        "lisak",
        "preskakuje",
        "cez",
        "leneho",
        "psa",
        "poznamky",
        "koncept",
        "osnova",
        "sekcia",
        "nadpis",
        "odsek",
        "priklad",
        "ukazka",
        "obsah",
        "zastupny",
        "text",
        "dokument",
        "editor",
        "kniznica",
        "priecinok",
        "uloha",
        "stretnutie",
        "agenda",
        "zhrnutie",
        "detail",
        "kontext",
        "rozhodnutie",
        "akcia",
        "nasledny",
        "krok",
        "kontrola",
        "aktualizacia",
        "pokrok",
        "napad",
        "myslienka",
        "poznamka",
        "odkaz",
        "zdroj",
        "obrazok",
        "tabulka",
        "zoznam",
        "polozka",
        "bod",
        "tema",
        "pribeh",
        "kapitola",
        "strana",
        "riadok",
        "slovo",
        "veta",
        "medzera",
        "rozlozenie",
        "dizajn",
        "struktura",
        "tok",
        "jasnost",
        "sustredenie",
        "pisanie",
        "prepis",
        "uprava",
        "dokoncenie",
    ),
}


def _normalize_language(value: str | None) -> Language:
    raw = (value or "la").strip().lower()
    if raw.startswith("sk"):
        return "sk"
    if raw.startswith("en"):
        return "en"
    if raw in {"la", "latin", "lorem"}:
        return "la"
    return "la"


def _normalize_unit(value: str | None) -> Unit:
    raw = (value or "paragraphs").strip().lower()
    if raw in {"paragraphs", "sentences", "words"}:
        return raw  # type: ignore[return-value]
    return "paragraphs"


def _clamp_count(count: int, unit: Unit) -> int:
    if unit == "words":
        return max(1, min(int(count), 2000))
    if unit == "sentences":
        return max(1, min(int(count), 200))
    return max(1, min(int(count), 50))


def _capitalize(word: str) -> str:
    if not word:
        return word
    return word[:1].upper() + word[1:]


def _build_words(
    rng: random.Random,
    *,
    count: int,
    language: Language,
    start_with_classic: bool,
) -> list[str]:
    bank = _WORDS[language]
    words: list[str] = []
    if start_with_classic and language == "la":
        words.extend(_CLASSIC_LEAD[: min(len(_CLASSIC_LEAD), count)])
    while len(words) < count:
        words.append(rng.choice(bank))
    return words[:count]


def _words_to_sentences(words: list[str], sentence_count: int, rng: random.Random) -> list[str]:
    if not words or sentence_count < 1:
        return []
    sentences: list[str] = []
    cursor = 0
    for index in range(sentence_count):
        remaining_sentences = sentence_count - index
        remaining_words = len(words) - cursor
        if remaining_words <= 0:
            break
        if index == sentence_count - 1:
            take = remaining_words
        else:
            target = max(5, min(14, remaining_words // remaining_sentences))
            jitter = rng.randint(-2, 2)
            take = max(3, min(remaining_words - remaining_sentences + 1, target + jitter))
        chunk = words[cursor : cursor + take]
        cursor += take
        if not chunk:
            break
        chunk[0] = _capitalize(chunk[0])
        sentences.append(f"{' '.join(chunk)}.")
    return sentences


def _sentences_to_paragraphs(sentences: list[str], paragraph_count: int) -> list[str]:
    if not sentences or paragraph_count < 1:
        return []
    paragraphs: list[str] = []
    base = max(1, len(sentences) // paragraph_count)
    cursor = 0
    for index in range(paragraph_count):
        remaining_paragraphs = paragraph_count - index
        remaining_sentences = len(sentences) - cursor
        if remaining_sentences <= 0:
            break
        if index == paragraph_count - 1:
            take = remaining_sentences
        else:
            take = max(1, min(base + (index % 2), remaining_sentences - remaining_paragraphs + 1))
        chunk = sentences[cursor : cursor + take]
        cursor += take
        if chunk:
            paragraphs.append(" ".join(chunk))
    return paragraphs


def generate_placeholder(
    *,
    unit: str = "paragraphs",
    count: int = 3,
    language: str | None = "la",
    start_with_classic: bool = True,
    seed: int | None = None,
) -> dict[str, Any]:
    """Return placeholder text plus metadata for the editor / Tauri command."""
    normalized_unit = _normalize_unit(unit)
    normalized_language = _normalize_language(language)
    normalized_count = _clamp_count(count, normalized_unit)
    rng = random.Random(seed)

    if normalized_unit == "words":
        words = _build_words(
            rng,
            count=normalized_count,
            language=normalized_language,
            start_with_classic=start_with_classic,
        )
        text = " ".join(words)
    elif normalized_unit == "sentences":
        approx_words = max(normalized_count * 8, normalized_count)
        words = _build_words(
            rng,
            count=approx_words,
            language=normalized_language,
            start_with_classic=start_with_classic,
        )
        text = " ".join(_words_to_sentences(words, normalized_count, rng))
    else:
        sentence_count = max(normalized_count * 4, normalized_count)
        approx_words = max(sentence_count * 8, sentence_count)
        words = _build_words(
            rng,
            count=approx_words,
            language=normalized_language,
            start_with_classic=start_with_classic,
        )
        sentences = _words_to_sentences(words, sentence_count, rng)
        text = "\n\n".join(_sentences_to_paragraphs(sentences, normalized_count))

    return {
        "text": text,
        "unit": normalized_unit,
        "count": normalized_count,
        "language": normalized_language,
        "source": "python",
        "startWithClassic": bool(start_with_classic),
    }
