import unittest
from scribe_nlp.rewrite import rewrite_selection


class TestRewrite(unittest.TestCase):
    def test_rephrase_professional(self):
        res = rewrite_selection("pls send report asap", mode="rephrase_professional")
        self.assertIn("kindly", res["output"].lower())
        self.assertIn("earliest convenience", res["output"].lower())

    def test_summarize_bullets(self):
        text = "First point. Second point. Third point."
        res = rewrite_selection(text, mode="summarize_bullets")
        self.assertTrue(res["output"].startswith("- First point"))
        self.assertEqual(len(res["output"].split("\n")), 3)

    def test_shorten_and_simplify(self):
        shortened = rewrite_selection(
            "First sentence stays. Second sentence may drop. Third is extra.",
            mode="shorten",
        )
        self.assertIn("First sentence", shortened["output"])
        self.assertLess(len(shortened["output"]), 70)

        simplified = rewrite_selection(
            "We utilize tools in order to facilitate delivery.",
            mode="simplify",
        )
        self.assertIn("use", simplified["output"].lower())
        self.assertNotIn("utilize", simplified["output"].lower())

    def test_expand_bullets(self):
        res = rewrite_selection("- alpha\n- beta", mode="expand_bullets")
        self.assertIn("Alpha.", res["output"])
        self.assertIn("Beta.", res["output"])

    def test_translation(self):
        res_sk = rewrite_selection("Meeting notes", mode="translate_sk")
        self.assertIn("Stretnutie", res_sk["output"])

        res_en = rewrite_selection("Stretnutie poznámky", mode="translate_en")
        self.assertIn("Meeting", res_en["output"])


if __name__ == "__main__":
    unittest.main()
