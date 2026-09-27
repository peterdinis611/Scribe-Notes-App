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
