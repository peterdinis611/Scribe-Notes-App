from __future__ import annotations

import unittest

from scribe_nlp.revision_ai import analyze_revision_diff


class RevisionAiTests(unittest.TestCase):
    def test_expansion_detected(self) -> None:
        old = "Meeting notes. We agreed on the timeline."
        new = (
            "Meeting notes. We agreed on the timeline. "
            "Next steps include drafting the proposal and scheduling a review. "
            "Action items were assigned to the design team."
        )
        result = analyze_revision_diff(old, new)
        self.assertEqual(result["source"], "python")
        self.assertIn(result["changeKind"], {"expansion", "mixed", "polish"})
        self.assertTrue(result["headline"])
        self.assertGreaterEqual(result["stats"]["netWords"], 1)
        self.assertTrue(result["bullets"])

    def test_large_deletion_risk(self) -> None:
        old = " ".join([f"Paragraph {i} with enough words to count." for i in range(20)])
        new = "Short leftover."
        result = analyze_revision_diff(old, new)
        self.assertIn(result["changeKind"], {"trim", "mixed", "rewrite"})
        self.assertIn("large_deletion", result["risks"])

    def test_identical(self) -> None:
        text = "Same text on both sides."
        result = analyze_revision_diff(text, text)
        self.assertEqual(result["changeKind"], "identical")
        self.assertGreaterEqual(result["confidence"], 0.9)

    def test_heading_structural(self) -> None:
        old = "# Intro\n\nBody stays similar with enough words here."
        new = "# Overview\n\nBody stays similar with enough words here."
        result = analyze_revision_diff(old, new)
        self.assertTrue(
            result["headingChanges"]["added"] or result["headingChanges"]["removed"]
        )


if __name__ == "__main__":
    unittest.main()
