"""Parity helpers for the Python ``scribe_ai`` package (mirrors Rust crate)."""

from __future__ import annotations

import unittest

from scribe_nlp.scribe_ai import (
    PromptKind,
    fold_text,
    match_document_chat_intent,
    plan_tools_from_question,
    rewrite_query,
    system_prompt,
    user_prompt,
)


class ScribeAiParityTests(unittest.TestCase):
    def test_rewrite_query_expands_deadline(self) -> None:
        result = rewrite_query("project deadline", max_expansions=8)
        self.assertEqual(result["query"], "project deadline")
        self.assertEqual(result["source"], "python")
        self.assertTrue(
            any(
                "due" in item or "termín" in item or "termin" in item
                for item in result["expansions"]
            )
        )

    def test_plan_tools_from_allowed(self) -> None:
        tools = plan_tools_from_question(
            "what tasks are open?",
            ["tasks", "task_rank", "library_search"],
            limit=3,
        )
        self.assertTrue("tasks" in tools or "task_rank" in tools)

    def test_prompts_document_chat(self) -> None:
        system = system_prompt(PromptKind.DOCUMENT_CHAT)
        self.assertTrue("document" in system.lower() or "passage" in system.lower())
        user = user_prompt(
            PromptKind.DOCUMENT_CHAT,
            "When is the deadline?",
            [{"title": "Note", "snippet": "Friday."}],
            2000,
        )
        self.assertIn("Friday.", user)
        self.assertIn("When is the deadline?", user)

    def test_prompts_slovak(self) -> None:
        system = system_prompt(PromptKind.AGENT, "sk")
        self.assertIn("Scribe", system)

    def test_prompts_built_in_locales(self) -> None:
        sk = system_prompt(PromptKind.AGENT, "sk")
        cs = system_prompt(PromptKind.AGENT, "cs-CZ")
        hu = system_prompt(PromptKind.AGENT, "hu")
        pl = system_prompt(PromptKind.AGENT, "pl")
        en = system_prompt(PromptKind.AGENT, "de")
        self.assertNotEqual(sk, cs)
        self.assertNotEqual(cs, hu)
        self.assertNotEqual(hu, pl)
        self.assertIn("local agent", en.lower())

    def test_fold_and_document_intent(self) -> None:
        self.assertEqual(fold_text("Úloha"), "uloha")
        self.assertEqual(match_document_chat_intent("Summarize this note"), "summarize")

    def test_reexport_sweep(self) -> None:
        from scribe_nlp.scribe_ai import (
            detect_pii,
            extract_decisions,
            extract_quotes,
            note_pulse,
            open_loops,
            rank_tasks,
            section_summaries,
            suggest_title,
        )

        self.assertTrue(suggest_title("Ship the release notes tomorrow.")["title"])
        self.assertIn("count", detect_pii("email me at a@b.com", limit=5))
        self.assertIn("decisions", extract_decisions("Decision: ship Friday.", limit=4))
        self.assertIn("quotes", extract_quotes('"Ship it." — Lead', limit=4))
        self.assertIn("tasks", rank_tasks("- [ ] Review PR", limit=4))
        self.assertIn("loops", open_loops("TODO: finish docs", limit=4))
        self.assertIn("score", note_pulse("# Note\n\nSome text here."))
        self.assertIn("sections", section_summaries("# A\nHello.\n\n# B\nWorld.", limit=4))


if __name__ == "__main__":
    unittest.main()
