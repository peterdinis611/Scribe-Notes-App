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

    def test_translation(self):
        res_sk = rewrite_selection("Meeting notes", mode="translate_sk")
        self.assertIn("Stretnutie", res_sk["output"])

        res_en = rewrite_selection("Stretnutie poznámky", mode="translate_en")
        self.assertIn("Meeting", res_en["output"])


if __name__ == "__main__":
    unittest.main()
