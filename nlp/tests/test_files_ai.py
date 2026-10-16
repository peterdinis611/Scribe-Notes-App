"""Smoke tests for files_ai offline + extract helpers (no live server required)."""

from __future__ import annotations

import io
import unittest
import zipfile
from unittest.mock import MagicMock, patch

from scribe_nlp.files_ai import (
    FilesApiOfflineError,
    _answer_from_index,
    _cosine_scores_for_chunks,
    _extract_docx_text,
    clear_files_index_memory,
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
    def setUp(self) -> None:
        clear_files_index_memory()

    def test_cosine_scores_shape(self) -> None:
        query = [1.0, 0.0, 0.0]
        chunks = [
            {"vector": [1.0, 0.0, 0.0], "snippet": "a"},
            {"vector": [0.0, 1.0, 0.0], "snippet": "b"},
            {"vector": [0.5, 0.5, 0.0], "snippet": "c"},
        ]
        scores = _cosine_scores_for_chunks(query, chunks)
        self.assertEqual(len(scores), 3)
        self.assertGreater(scores[0], scores[1])

    def test_answer_from_index_semantic(self) -> None:
        index = {
            "namespace": "files",
            "chunks": [
                {
                    "id": "files:a.md#0",
                    "path": "a.md",
                    "chunkIndex": 0,
                    "snippet": "Project deadline is Friday for the release.",
                    "vector": [1.0, 0.0, 0.0],
                },
                {
                    "id": "files:b.md#0",
                    "path": "b.md",
                    "chunkIndex": 0,
                    "snippet": "Tomato soup recipe with basil.",
                    "vector": [0.0, 1.0, 0.0],
                },
            ],
        }
        with patch("scribe_nlp.files_ai.embed_text", return_value=[1.0, 0.0, 0.0]):
            result = _answer_from_index(
                "deadline release",
                path="",
                limit=2,
                index=index,
                mode="semantic",
                min_score=0.01,
            )
        self.assertIsNotNone(result)
        assert result is not None
        self.assertEqual(result["citations"][0]["path"], "a.md")

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
