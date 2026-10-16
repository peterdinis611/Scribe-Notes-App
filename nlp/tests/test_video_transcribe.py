from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from scribe_nlp.server import handle_request
from scribe_nlp.video_transcribe import (
    TranscribeValidationError,
    validate_language,
    validate_model,
    validate_source_path,
    validate_video_id,
)


class VideoTranscribeValidationTests(unittest.TestCase):
    def test_model_and_language(self) -> None:
        self.assertEqual(validate_model(None), "base")
        self.assertEqual(validate_model("BASE"), "base")
        with self.assertRaises(TranscribeValidationError):
            validate_model("gpt-4")
        self.assertEqual(validate_language("SK"), "sk")
        self.assertEqual(validate_language("en-US"), "en-us")
        self.assertIsNone(validate_language(None))
        with self.assertRaises(TranscribeValidationError):
            validate_language("english")

    def test_video_id(self) -> None:
        self.assertEqual(validate_video_id("clip-1"), "clip-1")
        self.assertIsNone(validate_video_id(None))
        with self.assertRaises(TranscribeValidationError):
            validate_video_id("../etc")

    def test_source_path_checks(self) -> None:
        with self.assertRaises(TranscribeValidationError):
            validate_source_path("https://example.com/a.mp4")
        with self.assertRaises(TranscribeValidationError):
            validate_source_path("relative/clip.mp4")
        with tempfile.TemporaryDirectory() as tmp:
            bad = Path(tmp) / "note.txt"
            bad.write_text("hello world " * 8, encoding="utf-8")
            with self.assertRaises(TranscribeValidationError):
                validate_source_path(str(bad))
            tiny = Path(tmp) / "tiny.mp4"
            tiny.write_bytes(b"x")
            with self.assertRaises(TranscribeValidationError):
                validate_source_path(str(tiny))
            ok = Path(tmp) / "clip.mp4"
            ok.write_bytes(b"0" * 128)
            resolved = validate_source_path(str(ok))
            self.assertTrue(resolved.is_file())

    def test_rpc_validation_error_code(self) -> None:
        response = handle_request(
            {
                "jsonrpc": "2.0",
                "id": 91,
                "method": "transcribe_video",
                "params": {"sourcePath": "https://example.com/a.mp4", "model": "base"},
            }
        )
        self.assertIn("error", response)
        self.assertEqual(response["error"]["code"], -32602)


if __name__ == "__main__":
    unittest.main()
