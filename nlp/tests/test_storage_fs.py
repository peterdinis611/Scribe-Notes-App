"""Unit tests for StorageFsClient (mock transport — no real FS)."""

from __future__ import annotations

import base64

from scribe_nlp.storage_fs import StorageFsClient, to_base64


def test_list_and_write_via_mock_transport():
    calls: list[tuple[str, dict]] = []

    def call_tool(name: str, args: dict):
        calls.append((name, args))
        if name == "storage_fs_list":
            return {"count": 1, "entries": [{"path": "a.txt", "name": "a.txt", "kind": "file"}]}
        if name == "storage_fs_write":
            return {"path": args["path"], "name": "a.txt", "kind": "file", "sizeBytes": 2}
        if name == "storage_fs_read":
            return {
                "path": args["path"],
                "dataBase64": base64.b64encode(b"hi").decode("ascii"),
                "sizeBytes": 2,
            }
        raise AssertionError(name)

    client = StorageFsClient(call_tool)
    listed = client.list(recursive=True)
    assert listed[0]["path"] == "a.txt"
    written = client.write("a.txt", b"hi", overwrite=True)
    assert written["path"] == "a.txt"
    assert client.read_bytes("a.txt") == b"hi"
    assert calls[0][0] == "storage_fs_list"
    assert calls[1][1]["dataBase64"] == to_base64(b"hi")
