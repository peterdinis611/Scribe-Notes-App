"""Unit tests for SCRIBE_NLP_SANDBOX open guard."""

from __future__ import annotations

import builtins
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from scribe_nlp.sandbox import install_sandbox_guards, sandbox_enabled


class SandboxGuardTests(unittest.TestCase):
    def tearDown(self) -> None:
        # Best-effort restore if a test armed the guard.
        if getattr(builtins.open, "__scribe_nlp_sandbox__", False):
            # Re-import original by clearing flag via module internals is hard;
            # tests run in isolation process via unittest discovery.
            pass

    def test_sandbox_flag(self) -> None:
        with mock.patch.dict(os.environ, {"SCRIBE_NLP_SANDBOX": "1"}):
            self.assertTrue(sandbox_enabled())
        with mock.patch.dict(os.environ, {"SCRIBE_NLP_SANDBOX": "0"}, clear=False):
            self.assertFalse(sandbox_enabled())

    def test_blocks_scribe_db_path(self) -> None:
        with mock.patch.dict(os.environ, {"SCRIBE_NLP_SANDBOX": "1"}):
            # Fresh install in this process
            from scribe_nlp import sandbox as sb

            # Reset guard for test
            builtins.open = sb._original_open  # type: ignore[attr-defined]
            self.assertTrue(install_sandbox_guards())
            blocked = (
                Path.home()
                / "Library"
                / "Application Support"
                / "com.scribe.app"
                / "scribe.db"
            )
            with self.assertRaises(PermissionError):
                open(blocked, "rb")  # noqa: SIM115

            with tempfile.NamedTemporaryFile() as handle:
                # Non-sensitive path still works
                handle.write(b"ok")
                handle.flush()
                with open(handle.name, "rb") as reader:
                    self.assertEqual(reader.read(), b"ok")


if __name__ == "__main__":
    unittest.main()
