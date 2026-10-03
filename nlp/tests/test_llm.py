from __future__ import annotations

import unittest

from scribe_nlp.llm import (
    DEFAULT_OPENAI_BASE_URL,
    normalize_base_url,
    normalize_provider,
    llm_status,
)


class LlmClientTests(unittest.TestCase):
    def test_normalize_accepts_localhost(self) -> None:
        self.assertEqual(normalize_base_url("http://127.0.0.1:11434/"), "http://127.0.0.1:11434")
        self.assertEqual(normalize_base_url("http://localhost:11434"), "http://localhost:11434")

    def test_normalize_rejects_remote(self) -> None:
        with self.assertRaises(ValueError):
            normalize_base_url("http://example.com:11434")

    def test_normalize_openai_strips_v1(self) -> None:
        self.assertEqual(
            normalize_base_url("http://127.0.0.1:1234/v1", provider="openai_compatible"),
            "http://127.0.0.1:1234",
        )
        self.assertEqual(
            normalize_base_url(None, provider="openai_compatible"),
            DEFAULT_OPENAI_BASE_URL,
        )

    def test_normalize_provider_aliases(self) -> None:
        self.assertEqual(normalize_provider("LM Studio"), "openai_compatible")
        self.assertEqual(normalize_provider("ollama"), "ollama")

    def test_status_soft_fails_on_bad_host(self) -> None:
        result = llm_status(base_url="http://example.com:9")
        self.assertFalse(result["reachable"])
        self.assertIsNotNone(result["error"])


if __name__ == "__main__":
    unittest.main()
