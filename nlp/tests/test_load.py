"""NLP sidecar load / stress smoke.

Smoke (default, CI-friendly):
  PYTHONPATH=nlp python3 -m unittest nlp.tests.test_load -v

Heavy profile:
  SCRIBE_LOAD=1 PYTHONPATH=nlp python3 -m unittest nlp.tests.test_load -v
"""

from __future__ import annotations

import os
import time
import unittest

from scribe_nlp.analyze import analyze_document
from scribe_nlp.embed import embed_text
from scribe_nlp.keywords import extract_keywords
from scribe_nlp.summarize import summarize_text


def _load_enabled() -> bool:
    return os.environ.get("SCRIBE_LOAD", "").strip().lower() in {"1", "true", "yes"}


def _profile() -> dict[str, int | float]:
    if _load_enabled():
        return {
            "embed_n": 80,
            "analyze_n": 20,
            "text_chars": 12_000,
            "max_embed_s": 45.0,
            "max_analyze_s": 40.0,
        }
    return {
        "embed_n": 12,
        "analyze_n": 4,
        "text_chars": 2_500,
        "max_embed_s": 12.0,
        "max_analyze_s": 12.0,
    }


def _sample_text(chars: int) -> str:
    chunk = (
        "Scribe local AI indexes notes for deadlines, wiki links, and tasks. "
        "Meeting notes pack captures decisions and attendees. "
    )
    return (chunk * ((chars // len(chunk)) + 1))[:chars]


class LoadNlpTests(unittest.TestCase):
    def test_embed_batch_throughput(self) -> None:
        p = _profile()
        text = _sample_text(int(p["text_chars"]))
        started = time.perf_counter()
        vectors = [embed_text(f"{text}\n#{i}") for i in range(int(p["embed_n"]))]
        elapsed = time.perf_counter() - started
        print(
            f"[load-nlp] embed n={p['embed_n']} chars={p['text_chars']} "
            f"in {elapsed:.2f}s dim={len(vectors[0])}"
        )
        self.assertEqual(len(vectors), int(p["embed_n"]))
        self.assertGreater(len(vectors[0]), 8)
        self.assertLess(elapsed, float(p["max_embed_s"]))

    def test_analyze_and_summarize_loop(self) -> None:
        p = _profile()
        text = _sample_text(int(p["text_chars"]))
        started = time.perf_counter()
        for i in range(int(p["analyze_n"])):
            body = f"{text}\nRound {i} about project Acme and flashcards."
            analysis = analyze_document(
                body, keyword_limit=8, outline_limit=8, summary_sentences=2
            )
            self.assertIn("summary", analysis)
            keywords = extract_keywords(body, limit=6)
            self.assertTrue(keywords.get("keywords") or keywords.get("keyphrases"))
            summary = summarize_text(body, max_sentences=2)
            self.assertTrue(str(summary.get("summary") or "").strip())
        elapsed = time.perf_counter() - started
        print(f"[load-nlp] analyze loop n={p['analyze_n']} in {elapsed:.2f}s")
        self.assertLess(elapsed, float(p["max_analyze_s"]))


if __name__ == "__main__":
    unittest.main()
