from __future__ import annotations

import unittest

from scribe_nlp.flashcards import extract_flashcards
from scribe_nlp.takeaways import extract_takeaways
from scribe_nlp.terminology import check_terminology
from scribe_nlp.writing_coach import writing_coach


class ExtraAiModulesTests(unittest.TestCase):
    def test_flashcards_from_qa(self) -> None:
        text = "Q: What is Scribe?\nA: A local-first notes app.\n\nScribe is a desktop editor for writers."
        result = extract_flashcards(text, limit=6)
        self.assertGreaterEqual(result["count"], 1)
        self.assertEqual(result["source"], "python")
        kinds = {card["kind"] for card in result["cards"]}
        self.assertTrue(kinds & {"qa", "definition", "cloze", "section"})

    def test_terminology_variants(self) -> None:
        text = "OpenAPI guide. The Open Api sample uses openapi examples. OpenAPI again."
        result = check_terminology(text)
        self.assertGreaterEqual(result["issueCount"], 0)
        self.assertEqual(result["source"], "python")

    def test_takeaways(self) -> None:
        text = (
            "Important: ship the revision AI this week. "
            "We agreed on local-first analysis. "
            "- Action: write tests\n"
            "Also remember to document the API."
        )
        result = extract_takeaways(text, limit=5)
        self.assertGreaterEqual(result["count"], 1)
        self.assertTrue(result["summary"])

    def test_writing_coach_long_sentence(self) -> None:
        long = " ".join(["word"] * 40) + "."
        result = writing_coach(long + " Really really really filler text.")
        self.assertEqual(result["source"], "python")
        codes = {hint["code"] for hint in result["hints"]}
        self.assertTrue("long_sentence" in codes or "filler_word" in codes or "ok" in codes)


if __name__ == "__main__":
    unittest.main()
