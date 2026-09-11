from __future__ import annotations

import unittest

from scribe_nlp.spellcheck import spellcheck_text


class SpellcheckTests(unittest.TestCase):
    def test_finds_english_typo(self) -> None:
        result = spellcheck_text("This is a documnet about work.", language="en")
        words = {issue["word"].lower() for issue in result["issues"]}
        self.assertIn("documnet", words)
        issue = next(item for item in result["issues"] if item["word"].lower() == "documnet")
        self.assertTrue(any("document" == suggestion for suggestion in issue["suggestions"]))

    def test_finds_slovak_typo(self) -> None:
        result = spellcheck_text("Toto je dokumnet o práci.", language="sk")
        words = {issue["word"].lower() for issue in result["issues"]}
        self.assertIn("dokumnet", words)

    def test_ignores_unknown_without_suggestion(self) -> None:
        result = spellcheck_text("Xyzzyplugh visited the city.", language="en")
        words = {issue["word"].lower() for issue in result["issues"]}
        self.assertNotIn("xyzzyplugh", words)

    def test_skips_urls_and_numbers(self) -> None:
        result = spellcheck_text("See https://example.com and room 42A please.", language="en")
        self.assertEqual(result["issueCount"], 0)


if __name__ == "__main__":
    unittest.main()
