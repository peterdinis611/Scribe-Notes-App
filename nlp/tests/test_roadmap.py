import unittest

from scribe_nlp.roadmap import roadmap, roadmap_to_markdown
from scribe_nlp.server import handle_request


SAMPLE_HEADINGS = """
# Product plan

## Now
- Ship agent planner
- Fix wiki ghost hint

## Next
- Roadmap from notes
- Logging diagnostics

## Later
- Public API
"""


SAMPLE_FORWARD = """
Meeting notes

Next steps: ship the agent planner this week.
Upcoming: launch checklist review on Friday.
Agenda: budget check.
"""


def rpc(method: str, params: dict | None = None) -> dict:
    return handle_request(
        {
            "jsonrpc": "2.0",
            "id": 1,
            "method": method,
            "params": params or {},
        }
    )


class RoadmapTests(unittest.TestCase):
    def test_phases_from_headings(self) -> None:
        result = roadmap(SAMPLE_HEADINGS, limit=8)
        self.assertEqual(result["strategy"], "headings")
        self.assertGreaterEqual(result["count"], 3)
        titles = [phase["title"].lower() for phase in result["phases"]]
        self.assertTrue(any("now" in title for title in titles))
        md = roadmap_to_markdown(result)
        self.assertIn("## Roadmap", md)
        self.assertIn("- [ ]", md)

    def test_falls_back_to_forward_plan(self) -> None:
        result = roadmap(SAMPLE_FORWARD, limit=8)
        self.assertIn(result["strategy"], ("forward_plan", "outline", "headings"))
        self.assertGreaterEqual(result["count"], 1)

    def test_empty(self) -> None:
        result = roadmap("hi", limit=4)
        self.assertEqual(result["count"], 0)
        self.assertEqual(roadmap_to_markdown(result), "")

    def test_rpc(self) -> None:
        out = rpc("roadmap", {"text": SAMPLE_HEADINGS, "limit": 8})
        self.assertNotIn("error", out)
        self.assertEqual(out["result"]["source"], "python")
        self.assertGreaterEqual(out["result"]["count"], 2)


if __name__ == "__main__":
    unittest.main()
