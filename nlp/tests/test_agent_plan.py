from __future__ import annotations

import unittest

from scribe_nlp.agent_plan import agent_document_brief, match_agent_intents, plan_agent_goal
from scribe_nlp.server import handle_request


def rpc(method: str, params: dict | None = None) -> dict:
    return handle_request(
        {
            "jsonrpc": "2.0",
            "id": 1,
            "method": method,
            "params": params or {},
        }
    )


class AgentPlanTests(unittest.TestCase):
    def test_match_intents_en_sk(self) -> None:
        tools = match_agent_intents("Summarize this note and extract takeaways")
        self.assertEqual(tools[0], "summarize")
        self.assertIn("takeaways", tools)

        dates = match_agent_intents("Aké termíny mám tento týždeň?")
        self.assertIn("dates", dates)

        self.assertIn("wiki_health", match_agent_intents("Check wiki health and broken links"))
        self.assertIn("canvas_summarize", match_agent_intents("Summarize canvas board"))
        self.assertIn("keywords", match_agent_intents("Extract keywords from this note"))

    def test_token_prefix_avoids_substring_false_positives(self) -> None:
        self.assertEqual(match_agent_intents("milestone stone path"), [])
        self.assertIn("files_answer", match_agent_intents("ask files/ about deadlines"))
        self.assertIn("files_ingest", match_agent_intents("ingest files from sandbox"))
        self.assertIn("code_brief", match_agent_intents("code review for this module"))
        self.assertIn("code_brief", match_agent_intents("explain this rust code"))
        self.assertIn("code_brief", match_agent_intents("vysvetli python"))

    def test_role_boost_soft_adds_persona_tools(self) -> None:
        plan = plan_agent_goal("please review this", role="proofreader", max_tools=3)
        self.assertTrue(set(plan["tools"]) & {"spellcheck", "grammar", "style"})
        dev = plan_agent_goal("please review this", role="developer", max_tools=3)
        self.assertTrue(set(dev["tools"]) & {"code_brief", "explain", "files_answer"})

    def test_brief_runs_new_document_tools(self) -> None:
        text = (
            "# Agenda\n\n"
            "We decided to ship Friday. I will follow up with Alex.\n"
            "- [ ] Write tests\n"
        )
        brief = agent_document_brief(
            text,
            tools=["decisions", "commitments", "open_loops", "note_pulse"],
            limit=6,
        )
        self.assertGreaterEqual(brief["count"], 1)
        self.assertTrue(brief["answer"])

    def test_plan_needs_clarification(self) -> None:
        plan = plan_agent_goal("What is this about?", scope="document")
        self.assertTrue(plan["needsClarification"])
        self.assertEqual(plan["tools"], [])
        self.assertEqual(plan["source"], "python")

    def test_document_brief_runs_tools(self) -> None:
        text = (
            "# Ship plan\n\n"
            "Important: release Scribe agent this Friday.\n"
            "- [ ] Write tests\n"
            "- [ ] Update docs\n"
            "We decided to keep NLP local-first.\n"
        )
        brief = agent_document_brief(
            text,
            goal="Summarize and list tasks",
            tools=["summarize", "tasks", "takeaways"],
            limit=6,
        )
        self.assertEqual(brief["source"], "python")
        self.assertGreaterEqual(brief["count"], 1)
        self.assertTrue(brief["answer"])

    def test_rpc_plan_and_brief(self) -> None:
        health = rpc("health")["result"]
        self.assertIn("planAgentGoal", health["features"])
        self.assertIn("agentDocumentBrief", health["features"])

        plan = rpc(
            "plan_agent_goal",
            {"goal": "Meeting notes and action items", "scope": "document", "maxTools": 3},
        )
        self.assertNotIn("error", plan)
        self.assertIn("meeting", plan["result"]["tools"])

        brief = rpc(
            "agent_document_brief",
            {
                "text": "Deadline: 2026-10-01. Important key point for shipping.",
                "goal": "Deadlines and takeaways",
                "tools": ["dates", "takeaways"],
            },
        )
        self.assertNotIn("error", brief)
        self.assertGreaterEqual(brief["result"]["count"], 0)


if __name__ == "__main__":
    unittest.main()
