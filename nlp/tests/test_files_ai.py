"""Smoke tests for files_ai offline + extract helpers (no live server required)."""

from __future__ import annotations

import io
import unittest
import zipfile
from unittest.mock import MagicMock, patch

from scribe_nlp.files_ai import (
    FilesApiOfflineError,
    _extract_docx_text,
    extract_file_text,
    files_answer,
)
from scribe_nlp.storage_fs import StorageEntry, StorageFsError


def _minimal_docx(text: str) -> bytes:
    document_xml = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body><w:p><w:r><w:t>{text}</w:t></w:r></w:p></w:body>
</w:document>"""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as archive:
        archive.writestr("word/document.xml", document_xml)
        archive.writestr(
            "[Content_Types].xml",
            '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>',
        )
    return buf.getvalue()


class FilesAiTests(unittest.TestCase):
    def test_extract_docx_text(self) -> None:
        data = _minimal_docx("Hello sandbox")
        self.assertIn("Hello sandbox", _extract_docx_text(data))
        self.assertIn("Hello sandbox", extract_file_text("notes/demo.docx", data))

    def test_files_answer_offline_raises(self) -> None:
        with patch("scribe_nlp.files_ai._client") as client_factory:
            client = MagicMock()
            client.health.side_effect = StorageFsError("connection failed")
            client_factory.return_value = client
            with self.assertRaises(FilesApiOfflineError) as ctx:
                files_answer("What is in inbox?")
            self.assertIn("FilesApiOffline", str(ctx.exception))

    def test_files_answer_extractive_when_online(self) -> None:
        with patch("scribe_nlp.files_ai._client") as client_factory:
            client = MagicMock()
            client.health.return_value = {"ok": True}
            client.search.return_value = [
                StorageEntry(path="inbox/a.md", name="a.md", kind="file", size_bytes=12),
            ]
            client.read_text.return_value = "Alpha project deadline is Friday for shipping."
            client_factory.return_value = client

            result = files_answer("deadline shipping", use_index=False)

            self.assertTrue(result["citations"])
            self.assertEqual(result["retrieval"], "extractive")
            self.assertTrue(
                "Friday" in result["answer"] or "deadline" in result["answer"].lower()
            )


if __name__ == "__main__":
    unittest.main()
