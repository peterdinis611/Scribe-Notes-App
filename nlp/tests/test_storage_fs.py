from __future__ import annotations

import json
import unittest
from unittest.mock import patch

from scribe_nlp.storage_fs import StorageEntry, StorageFsClient, StorageFsError


class StorageFsClientUnitTests(unittest.TestCase):
    def test_entry_from_dict(self) -> None:
        entry = StorageEntry.from_dict(
            {
                "path": "inbox/a.md",
                "name": "a.md",
                "kind": "file",
                "sizeBytes": 12,
                "modifiedAt": 100,
                "extension": "md",
            }
        )
        self.assertEqual(entry.path, "inbox/a.md")
        self.assertEqual(entry.size_bytes, 12)
        self.assertEqual(entry.kind, "file")

    def test_list_parses_entries(self) -> None:
        client = StorageFsClient("http://127.0.0.1:8787")
        payload = {
            "path": "inbox",
            "count": 1,
            "entries": [
                {
                    "path": "inbox/a.md",
                    "name": "a.md",
                    "kind": "file",
                    "sizeBytes": 3,
                }
            ],
        }
        with patch.object(client, "_request", return_value=payload) as mocked:
            entries = client.list("inbox")
        mocked.assert_called_once()
        self.assertEqual(len(entries), 1)
        self.assertEqual(entries[0].name, "a.md")

    def test_write_text_body(self) -> None:
        client = StorageFsClient()
        entry = {
            "path": "scratch/x.md",
            "name": "x.md",
            "kind": "file",
            "sizeBytes": 4,
        }
        with patch.object(client, "_request", return_value=entry) as mocked:
            out = client.write_text("scratch/x.md", "# hi", overwrite=True)
        self.assertEqual(out.path, "scratch/x.md")
        args = mocked.call_args
        self.assertEqual(args.args[0], "POST")
        self.assertEqual(args.args[1], "/v1/fs/write-text")
        self.assertEqual(args.kwargs["body"]["overwrite"], True)

    def test_http_error_raises(self) -> None:
        client = StorageFsClient()

        class FakeHTTPError(Exception):
            def __init__(self) -> None:
                self.code = 404

            def read(self) -> bytes:
                return json.dumps({"error": "NotFound: missing"}).encode()

        import urllib.error

        def boom(*_a, **_k):
            err = urllib.error.HTTPError(
                url="http://127.0.0.1:8787/v1/fs/stat",
                code=404,
                msg="Not Found",
                hdrs=None,  # type: ignore[arg-type]
                fp=None,
            )
            err.read = lambda: json.dumps({"error": "NotFound: missing"}).encode()  # type: ignore[method-assign]
            raise err

        with patch("urllib.request.urlopen", side_effect=boom):
            with self.assertRaises(StorageFsError) as ctx:
                client.stat("nope")
        self.assertIn("NotFound", str(ctx.exception))
        self.assertEqual(ctx.exception.status, 404)


if __name__ == "__main__":
    unittest.main()
