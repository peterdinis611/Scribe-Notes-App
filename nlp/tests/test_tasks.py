from __future__ import annotations

import unittest

from scribe_nlp.tasks import extract_tasks


class TaskExtractionTests(unittest.TestCase):
    def test_markdown_checkboxes(self) -> None:
        text = "- [ ] Buy milk\n- [x] Done item\nTodo: ship release"
        result = extract_tasks(text)
        tasks = result["tasks"]
        self.assertEqual(len(tasks), 2)
        self.assertFalse(tasks[0]["checked"])
        self.assertEqual(tasks[0]["source"], "markdown")
        self.assertEqual(tasks[0]["text"], "Buy milk")

    def test_imperative_phrases(self) -> None:
        text = "Treba: zavolať klientovi do 2026-03-01"
        result = extract_tasks(text)
        tasks = result["tasks"]
        self.assertEqual(len(tasks), 1)
        self.assertEqual(tasks[0]["source"], "phrase")
        self.assertEqual(tasks[0]["dueHint"], "2026-03-01")

    def test_open_count_excludes_checked(self) -> None:
        text = "- [x] done\n- [ ] open"
        result = extract_tasks(text)
        self.assertEqual(result["openCount"], 1)


if __name__ == "__main__":
    unittest.main()
