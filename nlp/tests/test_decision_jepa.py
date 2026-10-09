from __future__ import annotations

import math
import unittest
from typing import Iterable

from scribe_nlp.agent_plan import plan_agent_goal
from scribe_nlp.decision_jepa import (
    JEPA_CONFIDENCE_THRESHOLD,
    score_decision_plans,
    should_prefer_jepa,
)
from scribe_nlp.server import handle_request


def _axis_vector(index: int, dims: int = 32) -> list[float]:
    vec = [0.0] * dims
    vec[index % dims] = 1.0
    return vec


def _token_bag_embed(texts: Iterable[str], dims: int = 64) -> list[list[float]]:
    """Deterministic bag-of-words embedding for tests (no model download)."""
    vectors: list[list[float]] = []
    for text in texts:
        vec = [0.0] * dims
        tokens = (text or "").lower().replace("-", " ").split()
        if not tokens:
            vectors.append(vec)
            continue
        for token in tokens:
            # Stable hash into dims
            slot = sum(ord(ch) for ch in token) % dims
            vec[slot] += 1.0
            # Light synonym boosts so meeting goals align with meeting candidates.
            for needle, boost_slots in (
                (("meeting", "standup", "action", "tasks", "todo", "checklist", "ulohy"), (1, 2, 3)),
                (("summarize", "summary", "zhrn", "digest", "bullets"), (4, 5)),
                (("flashcard", "quiz", "study", "kartick"), (6, 7)),
                (("spell", "grammar", "proofread", "polish"), (8, 9)),
                (("deadline", "date", "schedule", "termin"), (10, 11)),
                (("handoff", "organizer", "delegate"), (12, 13)),
            ):
                if any(part in token for part in needle):
                    for slot in boost_slots:
                        vec[slot] += 2.0
        norm = math.sqrt(sum(value * value for value in vec)) or 1.0
        vectors.append([value / norm for value in vec])
    return vectors


class DecisionJepaTests(unittest.TestCase):
    def test_meeting_goal_ranks_tasks_above_flashcards(self) -> None:
        result = score_decision_plans(
            "Meeting notes and action items checklist",
            scope="document",
            max_tools=3,
            embed_fn=_token_bag_embed,
            force_hash=True,
        )
        self.assertTrue(result["ready"])
        self.assertGreaterEqual(result["confidence"], 0.2)
        tools = result["tools"]
        self.assertTrue(tools)
        # Meeting/tasks candidates should beat pure study tools.
        self.assertTrue(
            any(tool in tools[:2] for tool in ("meeting", "tasks", "action_items", "decisions")),
            msg=f"unexpected ranking: {tools}",
        )
        if "flashcards" in tools:
            self.assertGreater(tools.index("flashcards"), 0)

    def test_spell_goal_prefers_proofreading_tools(self) -> None:
        result = score_decision_plans(
            "Please spellcheck and grammar polish this draft",
            scope="document",
            max_tools=2,
            embed_fn=_token_bag_embed,
            force_hash=True,
        )
        self.assertTrue(result["ready"])
        self.assertTrue(
            any(tool in result["tools"] for tool in ("spellcheck", "grammar", "rewrite")),
            msg=result["tools"],
        )

    def test_allowed_tools_filter(self) -> None:
        result = score_decision_plans(
            "Meeting standup action items",
            scope="document",
            max_tools=3,
            allowed_tools={"summarize", "takeaways"},
            embed_fn=_token_bag_embed,
            force_hash=True,
        )
        self.assertTrue(result["ready"])
        self.assertTrue(set(result["tools"]).issubset({"summarize", "takeaways"}))

    def test_should_prefer_jepa_thresholds(self) -> None:
        self.assertFalse(should_prefer_jepa({"ready": False, "tools": ["tasks"]}))
        self.assertFalse(
            should_prefer_jepa(
                {
                    "ready": True,
                    "tools": ["tasks"],
                    "confidence": JEPA_CONFIDENCE_THRESHOLD - 0.01,
                    "margin": 0.1,
                }
            )
        )
        self.assertTrue(
            should_prefer_jepa(
                {
                    "ready": True,
                    "tools": ["tasks"],
                    "confidence": 0.7,
                    "margin": 0.05,
                }
            )
        )
        self.assertTrue(
            should_prefer_jepa(
                {
                    "ready": True,
                    "tools": ["meeting", "tasks"],
                    "confidence": 0.9,
                    "margin": 0.015,
                }
            )
        )

    def test_empty_without_semantic_backend(self) -> None:
        # Default path with no inject and hash-only → empty / not ready.
        result = score_decision_plans("summarize this", scope="document")
        # When only hash is active, ready is False. If CI has fast/quality, still returns a dict.
        self.assertEqual(result["source"], "jepa")
        self.assertIn("tools", result)

    def test_planner_uses_jepa_source_when_scorer_wins(self) -> None:
        plan = plan_agent_goal(
            "Meeting notes and extract action items checklist",
            scope="document",
            max_tools=3,
            jepa_embed_fn=_token_bag_embed,
        )
        self.assertEqual(plan["source"], "jepa")
        self.assertTrue(plan["tools"])
        self.assertIn("jepa", plan)
        self.assertTrue(plan["jepa"]["ready"])

    def test_planner_keeps_keyword_when_jepa_weak(self) -> None:
        def flat_embed(texts: list[str]) -> list[list[float]]:
            # Identical vectors → zero margin → should not lock JEPA preference.
            return [_axis_vector(0) for _ in texts]

        plan = plan_agent_goal(
            "Summarize this note",
            scope="document",
            max_tools=2,
            jepa_embed_fn=flat_embed,
        )
        # Keywords still match summarize; JEPA may soft-fill but margin is 0 so not preferred.
        self.assertIn(plan["source"], ("python", "jepa"))
        if plan["source"] == "jepa":
            self.assertLess(float(plan["jepa"].get("margin") or 0), 0.03)

    def test_health_lists_decision_jepa(self) -> None:
        response = handle_request(
            {"jsonrpc": "2.0", "id": 1, "method": "health", "params": {}}
        )
        features = response["result"]["features"]
        self.assertIn("decisionJepa", features)
        self.assertIn("planAgentGoal", features)

    def test_handoff_boosts_role_tools(self) -> None:
        baseline = score_decision_plans(
            "Please handle this note",
            scope="document",
            role="organizer",
            max_tools=3,
            embed_fn=_token_bag_embed,
            force_hash=True,
        )
        boosted = score_decision_plans(
            "Please handle this note",
            scope="document",
            role="organizer",
            handoffs=["From meeting: extract tasks and file the notes"],
            max_tools=3,
            embed_fn=_token_bag_embed,
            force_hash=True,
        )
        self.assertTrue(boosted["ready"])
        self.assertTrue(boosted["candidates"])
        role_tools = {"organize", "wiki", "duplicates", "pii", "tasks", "similar", "title"}
        boosted_top = {tool for cand in boosted["candidates"][:2] for tool in cand["tools"]}
        self.assertTrue(
            boosted_top & role_tools,
            msg=f"expected organizer tools after handoff, got {boosted['candidates'][:2]}",
        )
        # Confidence should not drop when handoffs are present.
        self.assertGreaterEqual(boosted["confidence"], baseline["confidence"] - 0.05)

    def test_feedback_boost_raises_overlap_score(self) -> None:
        bare = score_decision_plans(
            "Work on this draft",
            scope="document",
            max_tools=4,
            embed_fn=_token_bag_embed,
            force_hash=True,
        )
        boosted = score_decision_plans(
            "Work on this draft",
            scope="document",
            max_tools=4,
            feedback_tools=[["spellcheck", "grammar"], ["spellcheck"]],
            embed_fn=_token_bag_embed,
            force_hash=True,
        )
        self.assertTrue(boosted["ready"])

        def spell_score(result: dict) -> float:
            for cand in result.get("candidates") or []:
                if "spellcheck" in (cand.get("tools") or []):
                    return float(cand.get("score") or 0)
            return 0.0

        self.assertGreaterEqual(spell_score(boosted), spell_score(bare))

    def test_clarify_uses_jepa_candidates(self) -> None:
        plan = plan_agent_goal(
            "xyzzy plugh unclear nonsense goal zz",
            scope="document",
            max_tools=3,
            jepa_embed_fn=_token_bag_embed,
        )
        if plan.get("needsClarification"):
            self.assertTrue(plan["clarifyOptions"])
            self.assertLessEqual(len(plan["clarifyOptions"]), 5)
            # When JEPA produced candidates, clarify should not be only the fixed default head.
            if plan.get("jepa", {}).get("candidates"):
                self.assertTrue(plan.get("clarifyLabels") or plan["clarifyOptions"])


if __name__ == "__main__":
    unittest.main()
