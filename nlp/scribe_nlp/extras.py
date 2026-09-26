"""Optional third-party packages for Scribe NLP (soft imports).

Install groups (from nlp/):
  pip install 'scribe-nlp[enhance]'     # rapidfuzz, lingua, ftfy, dateparser
  pip install 'scribe-nlp[translate]'   # argostranslate
  pip install 'scribe-nlp[ner]'         # spacy (+ download xx_ent_wiki_sm)
  pip install 'scribe-nlp[onnx]'        # onnxruntime + numpy + tokenizers
  pip install 'scribe-nlp[faiss]'       # faiss-cpu + numpy
  pip install 'scribe-nlp[fast-embed]'  # model2vec static embeddings
  pip install 'scribe-nlp[lexical]'     # bm25s hybrid lexical ranking
  pip install 'scribe-nlp[hnsw]'        # pynear HNSW for large ANN
  pip install 'scribe-nlp[full]'        # everything including quality MiniLM
"""

from __future__ import annotations

from functools import lru_cache
from typing import Any


def _probe(name: str) -> bool:
    try:
        __import__(name)
        return True
    except Exception:
        return False


@lru_cache(maxsize=1)
def has_rapidfuzz() -> bool:
    return _probe("rapidfuzz")


@lru_cache(maxsize=1)
def has_lingua() -> bool:
    return _probe("lingua")


@lru_cache(maxsize=1)
def has_ftfy() -> bool:
    return _probe("ftfy")


@lru_cache(maxsize=1)
def has_dateparser() -> bool:
    return _probe("dateparser")


@lru_cache(maxsize=1)
def has_argos() -> bool:
    return _probe("argostranslate")


@lru_cache(maxsize=1)
def has_spacy() -> bool:
    return _probe("spacy")


@lru_cache(maxsize=1)
def has_onnx() -> bool:
    return _probe("onnxruntime") and _probe("numpy")


@lru_cache(maxsize=1)
def has_faiss() -> bool:
    return _probe("faiss") and _probe("numpy")


@lru_cache(maxsize=1)
def has_tokenizers() -> bool:
    return _probe("tokenizers")


@lru_cache(maxsize=1)
def has_model2vec() -> bool:
    return _probe("model2vec")


@lru_cache(maxsize=1)
def has_bm25s() -> bool:
    return _probe("bm25s")


@lru_cache(maxsize=1)
def has_pynear() -> bool:
    return _probe("pynear")


def extras_status() -> dict[str, bool]:
    """Capability flags for health RPC / Settings UI."""
    return {
        "rapidfuzz": has_rapidfuzz(),
        "lingua": has_lingua(),
        "ftfy": has_ftfy(),
        "dateparser": has_dateparser(),
        "argosTranslate": has_argos(),
        "spacy": has_spacy(),
        "onnxruntime": has_onnx(),
        "faiss": has_faiss(),
        "model2vec": has_model2vec(),
        "bm25s": has_bm25s(),
        "pynear": has_pynear(),
        "sentenceTransformers": _probe("sentence_transformers"),
    }


def extras_feature_flags() -> list[str]:
    """Extra FEATURES entries when packages are present."""
    flags: list[str] = []
    status = extras_status()
    mapping = {
        "rapidfuzz": "fuzzyMatch",
        "lingua": "linguaDetect",
        "ftfy": "unicodeFix",
        "dateparser": "dateparser",
        "argosTranslate": "argosTranslate",
        "spacy": "spacyNer",
        "onnxruntime": "onnxEmbed",
        "faiss": "faissSearch",
        "model2vec": "fastEmbed",
        "bm25s": "bm25Lexical",
        "pynear": "hnswSearch",
    }
    for key, flag in mapping.items():
        if status.get(key):
            flags.append(flag)
    return flags


def fix_unicode(text: str) -> str:
    """Repair mojibake / broken Unicode when ftfy is installed."""
    if not text:
        return text
    if not has_ftfy():
        return text
    try:
        import ftfy

        return ftfy.fix_text(text)
    except Exception:
        return text


def fuzzy_ratio(a: str, b: str) -> float:
    """0..1 similarity; rapidfuzz when available, else simple overlap."""
    left = (a or "").strip().lower()
    right = (b or "").strip().lower()
    if not left or not right:
        return 0.0
    if left == right:
        return 1.0
    if has_rapidfuzz():
        try:
            from rapidfuzz import fuzz

            return float(fuzz.token_set_ratio(left, right)) / 100.0
        except Exception:
            pass

    def bigrams(value: str) -> set[str]:
        if len(value) < 2:
            return {value}
        return {value[i : i + 2] for i in range(len(value) - 1)}

    a_set, b_set = bigrams(left), bigrams(right)
    if not a_set or not b_set:
        return 0.0
    return (2.0 * len(a_set & b_set)) / (len(a_set) + len(b_set))


def fuzzy_extract(
    query: str,
    choices: list[str],
    *,
    limit: int = 5,
    score_cutoff: float = 0.55,
) -> list[tuple[str, float]]:
    """Top fuzzy matches as (choice, 0..1 score)."""
    if not query or not choices:
        return []
    limit = max(1, min(limit, 20))
    if has_rapidfuzz():
        try:
            from rapidfuzz import fuzz, process

            hits = process.extract(
                query,
                choices,
                scorer=fuzz.WRatio,
                limit=limit,
                score_cutoff=score_cutoff * 100,
            )
            return [(str(choice), float(score) / 100.0) for choice, score, _ in hits]
        except Exception:
            pass
    scored = [(choice, fuzzy_ratio(query, choice)) for choice in choices]
    scored = [item for item in scored if item[1] >= score_cutoff]
    scored.sort(key=lambda item: item[1], reverse=True)
    return scored[:limit]


def parse_date_flexible(text: str, *, languages: list[str] | None = None) -> Any | None:
    """Return datetime.date when dateparser can resolve the phrase."""
    if not text or not has_dateparser():
        return None
    try:
        import dateparser

        parsed = dateparser.parse(
            text,
            languages=languages or ["sk", "en"],
            settings={
                "PREFER_DATES_FROM": "future",
                "RETURN_AS_TIMEZONE_AWARE": False,
            },
        )
        if parsed is None:
            return None
        return parsed.date()
    except Exception:
        return None
