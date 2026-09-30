"""Thin Storage Mode Files API client (same JSON contract as TS / Rust / MCP).

Does not implement filesystem logic — call MCP tools (or any transport that
implements the same command names and payloads).

Contract: docs/storage-fs-api.md
Root: {documentsDir}/files/
"""

from __future__ import annotations

import base64
import json
from typing import Any, Callable, Literal, Optional, TypedDict, Union

StorageEntryKind = Literal["file", "dir"]

ToolCaller = Callable[[str, dict[str, Any]], Any]


class StorageEntry(TypedDict, total=False):
    path: str
    name: str
    kind: StorageEntryKind
    sizeBytes: int
    modifiedAt: int


class StorageFsReadResult(TypedDict):
    path: str
    dataBase64: str
    sizeBytes: int


COMMANDS = {
    "list": "storage_fs_list",
    "stat": "storage_fs_stat",
    "mkdir": "storage_fs_mkdir",
    "write": "storage_fs_write",
    "read": "storage_fs_read",
    "delete": "storage_fs_delete",
    "rename": "storage_fs_rename",
}


def to_base64(data: Union[bytes, str]) -> str:
    if isinstance(data, str):
        data = data.encode("utf-8")
    return base64.b64encode(data).decode("ascii")


def from_base64(data_base64: str) -> bytes:
    payload = data_base64.split(",", 1)[-1]
    return base64.b64decode(payload)


def _unwrap(result: Any) -> Any:
    if isinstance(result, str):
        try:
            return json.loads(result)
        except json.JSONDecodeError:
            return result
    return result


class StorageFsClient:
    """Call storage_fs_* tools via an injected transport (e.g. MCP)."""

    def __init__(self, call_tool: ToolCaller) -> None:
        self._call = call_tool

    def list(
        self,
        path: Optional[str] = None,
        *,
        recursive: bool = False,
        depth: Optional[int] = None,
    ) -> list[StorageEntry]:
        payload: dict[str, Any] = {"recursive": recursive}
        if path is not None:
            payload["path"] = path
        if depth is not None:
            payload["depth"] = depth
        raw = _unwrap(self._call(COMMANDS["list"], payload))
        if isinstance(raw, dict) and "entries" in raw:
            return list(raw["entries"])
        if isinstance(raw, list):
            return raw
        raise TypeError(f"Unexpected list response: {type(raw)!r}")

    def stat(self, path: str = "") -> StorageEntry:
        return _unwrap(self._call(COMMANDS["stat"], {"path": path}))

    def mkdir(self, path: str) -> StorageEntry:
        return _unwrap(self._call(COMMANDS["mkdir"], {"path": path}))

    def write(
        self,
        path: str,
        data: Union[bytes, str],
        *,
        overwrite: bool = False,
    ) -> StorageEntry:
        return _unwrap(
            self._call(
                COMMANDS["write"],
                {
                    "path": path,
                    "dataBase64": to_base64(data),
                    "overwrite": overwrite,
                },
            )
        )

    def read(self, path: str) -> StorageFsReadResult:
        return _unwrap(self._call(COMMANDS["read"], {"path": path}))

    def read_bytes(self, path: str) -> bytes:
        result = self.read(path)
        return from_base64(result["dataBase64"])

    def delete(self, path: str, *, recursive: bool = False) -> None:
        _unwrap(self._call(COMMANDS["delete"], {"path": path, "recursive": recursive}))

    def rename(self, from_path: str, to_path: str) -> StorageEntry:
        return _unwrap(
            self._call(COMMANDS["rename"], {"from": from_path, "to": to_path})
        )
