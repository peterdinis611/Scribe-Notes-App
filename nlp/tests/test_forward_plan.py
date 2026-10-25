import unittest

from scribe_nlp.forward_plan import forward_plan
from scribe_nlp.server import handle_request


SAMPLE = """
Meeting notes

Agenda:
- Review roadmap
- Budget check

Next steps: ship the agent planner this week.
We will follow up by Friday on the launch checklist.
Upcoming: next meeting on Monday.
"""


SAMPLE_SK = """
Zápis

Ďalšie kroky: dokončiť plánovača.
Agenda: kontrola rozpočtu, review roadmapy.
Budúci týždeň doručím draft.
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


class ForwardPlanTests(unittest.TestCase):
    def test_extracts_en(self) -> None:
        result = forward_plan(SAMPLE, limit=12)
        total = (
            result["counts"]["nextSteps"]
            + result["counts"]["agenda"]
            + result["counts"]["upcoming"]
        )
        self.assertGreaterEqual(total, 2)
        joined = " ".join(
            item["text"]
            for bucket in (result["nextSteps"], result["agenda"], result["upcoming"])
            for item in bucket
        ).lower()
        self.assertTrue("roadmap" in joined or "ship" in joined or "friday" in joined)

    def test_extracts_sk(self) -> None:
        result = forward_plan(SAMPLE_SK, limit=12)
        total = (
            result["counts"]["nextSteps"]
            + result["counts"]["agenda"]
            + result["counts"]["upcoming"]
        )
        self.assertGreaterEqual(total, 1)

    def test_rpc(self) -> None:
        health = rpc("health")["result"]
        self.assertIn("forwardPlan", health["features"])
        out = rpc("forward_plan", {"text": SAMPLE, "limit": 8})
        self.assertNotIn("error", out)
        self.assertEqual(out["result"]["source"], "python")


if __name__ == "__main__":
    unittest.main()
