from __future__ import annotations

import json
import os
import tempfile
import unittest
from pathlib import Path

from scribe_nlp import config as cfg
from scribe_nlp.server import handle_request


def rpc(method: str, params: dict | None = None) -> dict:
    return handle_request(
        {"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}}
    )


class ConfigTests(unittest.TestCase):
    def tearDown(self) -> None:
        for key in list(os.environ):
            if key.startswith("SCRIBE_NLP_") or key in {"SCRIBE_EMBED_BACKEND", "SCRIBE_FILES_API_URL"}:
                if key in getattr(self, "_env_backup", {}):
                    os.environ[key] = self._env_backup[key]
                else:
                    os.environ.pop(key, None)
        cfg.reload_config()

    def _backup_env(self, *names: str) -> None:
        self._env_backup = {name: os.environ[name] for name in names if name in os.environ}

    def test_env_overrides_defaults(self) -> None:
        self._backup_env("SCRIBE_NLP_MAX_TEXT_CHARS", "SCRIBE_NLP_AGENT_TOOL_LIMIT")
        os.environ["SCRIBE_NLP_MAX_TEXT_CHARS"] = "50000"
        os.environ["SCRIBE_NLP_AGENT_TOOL_LIMIT"] = "4"
        os.environ.pop("SCRIBE_NLP_CONFIG", None)
        loaded = cfg.reload_config()
        self.assertEqual(loaded.rpc.max_text_chars, 50000)
        self.assertEqual(loaded.agent.tool_limit, 4)
        self.assertEqual(cfg.MAX_TEXT_CHARS, 50000)

    def test_toml_file_and_env_precedence(self) -> None:
        self._backup_env("SCRIBE_NLP_CONFIG", "SCRIBE_NLP_MAX_EMBED_BATCH")
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "nlp.toml"
            path.write_text(
                "[rpc]\nmax_embed_batch = 64\n[agent]\ntool_limit = 2\n",
                encoding="utf-8",
            )
            os.environ["SCRIBE_NLP_CONFIG"] = str(path)
            os.environ["SCRIBE_NLP_MAX_EMBED_BATCH"] = "96"
            loaded = cfg.reload_config()
            self.assertEqual(loaded.rpc.max_embed_batch, 96)  # env wins
            self.assertEqual(loaded.agent.tool_limit, 2)  # from file
            self.assertEqual(loaded.config_path, str(path))

    def test_json_file(self) -> None:
        self._backup_env("SCRIBE_NLP_CONFIG")
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "nlp.json"
            path.write_text(
                json.dumps({"files": {"pdf_max_pages": 12}, "debug": True}),
                encoding="utf-8",
            )
            os.environ["SCRIBE_NLP_CONFIG"] = str(path)
            loaded = cfg.reload_config()
            self.assertEqual(loaded.files.pdf_max_pages, 12)
            self.assertTrue(loaded.debug)

    def test_health_and_reload_rpc(self) -> None:
        health = rpc("health")["result"]
        self.assertIn("config", health)
        self.assertIn("limits", health)
        self.assertIn("maxSourceBytes", health["limits"])
        self.assertIn("reloadConfig", health["features"])
        reloaded = rpc("reload_config")
        self.assertNotIn("error", reloaded)
        self.assertTrue(reloaded["result"]["ok"])


if __name__ == "__main__":
    unittest.main()
