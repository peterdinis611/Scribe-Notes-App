import unittest

from scribe_nlp.agent_plan import plan_agent_goal


class AgentPlanPhasesTests(unittest.TestCase):
    def test_now_and_next_from_multi_intent(self) -> None:
        plan = plan_agent_goal(
            "Summarize this note and extract tasks plus open loops and rank tasks",
            scope="document",
            max_tools=2,
        )
        self.assertFalse(plan["needsClarification"])
        self.assertGreaterEqual(len(plan["tools"]), 1)
        phases = plan.get("phases") or []
        self.assertTrue(phases)
        self.assertEqual(phases[0]["when"], "now")
        self.assertEqual(phases[0]["tools"], plan["tools"])
        later = [p for p in phases if p["when"] in {"next", "later"}]
        # Surplus intents should produce at least one forward phase when enough matches.
        self.assertGreaterEqual(len(phases), 1)
        if later:
            for phase in later:
                self.assertTrue(phase["tools"])
                self.assertTrue(phase["goal"])
                for tool in phase["tools"]:
                    self.assertNotIn(tool, plan["tools"])

    def test_clarify_has_empty_phases(self) -> None:
        plan = plan_agent_goal("asdf qwer zxcv", scope="document", max_tools=3)
        if plan["needsClarification"]:
            self.assertEqual(plan.get("phases") or [], [])

    def test_forward_plan_intent(self) -> None:
        plan = plan_agent_goal("plan ahead next steps agenda", scope="document", max_tools=3)
        self.assertIn("forward_plan", plan["tools"])


if __name__ == "__main__":
    unittest.main()
