"""HTTP client for Scribe Local Files API (loopback REST).

Uses stdlib only. Point at a running Storage Mode server, e.g.::

    from scribe_nlp.storage_fs import StorageFsClient
    fs = StorageFsClient("http://127.0.0.1:8787")
    fs.ensure_defaults()
    fs.write_text("scratch/hello.md", "# hi\\n", overwrite=True)
    print(fs.list("scratch"))
"""

from __future__ import annotations

import base64
import json
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any, Literal

EntryKind = Literal["file", "dir"]


class StorageFsError(RuntimeError):
    def __init__(self, message: str, *, status: int | None = None) -> None:
        super().__init__(message)
        self.status = status
        self.message = message


@dataclass
class StorageEntry:
    path: str
    name: str
    kind: EntryKind
    size_bytes: int | None = None
    modified_at: int | None = None
    extension: str | None = None

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> StorageEntry:
        return cls(
            path=d["path"],
            name=d["name"],
            kind=d["kind"],
            size_bytes=d.get("sizeBytes"),
            modified_at=d.get("modifiedAt"),
            extension=d.get("extension"),
        )


class StorageFsClient:
    """Thin REST client for `/v1/fs/*` on the Scribe Files API server."""

    def __init__(self, base_url: str = "http://127.0.0.1:8787", *, timeout: float = 30.0) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    def _url(self, path: str, query: dict[str, Any] | None = None) -> str:
        url = f"{self.base_url}{path}"
        if not query:
            return url
        pairs = []
        for key, value in query.items():
            if value is None:
                continue
            if isinstance(value, bool):
                value = "true" if value else "false"
            pairs.append((key, str(value)))
        return url + "?" + urllib.parse.urlencode(pairs)

    def _request(
        self,
        method: str,
        path: str,
        *,
        query: dict[str, Any] | None = None,
        body: dict[str, Any] | None = None,
    ) -> Any:
        data = None
        headers = {"Accept": "application/json"}
        if body is not None:
            data = json.dumps(body).encode("utf-8")
            headers["Content-Type"] = "application/json"
        req = urllib.request.Request(
            self._url(path, query),
            data=data,
            headers=headers,
            method=method,
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                raw = resp.read().decode("utf-8")
                if not raw:
                    return None
                return json.loads(raw)
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            try:
                payload = json.loads(detail)
                message = str(payload.get("error") or detail)
            except json.JSONDecodeError:
                message = detail or str(exc)
            raise StorageFsError(message, status=exc.code) from exc
        except urllib.error.URLError as exc:
            raise StorageFsError(f"connection failed: {exc.reason}") from exc

    def health(self) -> dict[str, Any]:
        return self._request("GET", "/v1/fs/health")

    def list(
        self,
        path: str = "",
        *,
        recursive: bool = False,
        depth: int | None = None,
    ) -> list[StorageEntry]:
        raw = self._request(
            "GET",
            "/v1/fs/list",
            query={"path": path, "recursive": recursive, "depth": depth},
        )
        return [StorageEntry.from_dict(e) for e in raw.get("entries", [])]

    def tree(self, path: str = "", *, depth: int | None = 4) -> dict[str, Any]:
        return self._request("GET", "/v1/fs/tree", query={"path": path, "depth": depth})

    def stat(self, path: str) -> StorageEntry:
        return StorageEntry.from_dict(self._request("GET", "/v1/fs/stat", query={"path": path}))

    def exists(self, path: str) -> dict[str, Any]:
        return self._request("GET", "/v1/fs/exists", query={"path": path})

    def read_bytes(self, path: str) -> bytes:
        raw = self._request("GET", "/v1/fs/read", query={"path": path})
        return base64.b64decode(raw["dataBase64"])

    def read_text(self, path: str) -> str:
        return self._request("GET", "/v1/fs/read-text", query={"path": path})["text"]

    def read_json(self, path: str) -> Any:
        return self._request("GET", "/v1/fs/read-json", query={"path": path})["value"]

    def preview(self, path: str, *, max_chars: int | None = None) -> dict[str, Any]:
        return self._request(
            "GET",
            "/v1/fs/preview",
            query={"path": path, "maxChars": max_chars},
        )

    def checksum(self, path: str) -> dict[str, Any]:
        return self._request("GET", "/v1/fs/checksum", query={"path": path})

    def search(
        self,
        query: str = "",
        *,
        path: str = "",
        glob: str | None = None,
        limit: int | None = None,
    ) -> list[StorageEntry]:
        raw = self._request(
            "GET",
            "/v1/fs/search",
            query={"query": query, "path": path, "glob": glob, "limit": limit},
        )
        return [StorageEntry.from_dict(e) for e in raw]

    def recent(
        self,
        path: str = "",
        *,
        limit: int | None = 50,
        files_only: bool = True,
    ) -> list[StorageEntry]:
        raw = self._request(
            "GET",
            "/v1/fs/recent",
            query={"path": path, "limit": limit, "filesOnly": files_only},
        )
        return [StorageEntry.from_dict(e) for e in raw]

    def disk_usage(self, path: str = "") -> dict[str, Any]:
        return self._request("GET", "/v1/fs/disk-usage", query={"path": path})

    def mkdir(self, path: str) -> StorageEntry:
        return StorageEntry.from_dict(self._request("POST", "/v1/fs/mkdir", body={"path": path}))

    def write_bytes(self, path: str, data: bytes, *, overwrite: bool = False) -> StorageEntry:
        return StorageEntry.from_dict(
            self._request(
                "POST",
                "/v1/fs/write",
                body={
                    "path": path,
                    "dataBase64": base64.b64encode(data).decode("ascii"),
                    "overwrite": overwrite,
                },
            )
        )

    def write_text(self, path: str, text: str, *, overwrite: bool = False) -> StorageEntry:
        return StorageEntry.from_dict(
            self._request(
                "POST",
                "/v1/fs/write-text",
                body={"path": path, "text": text, "overwrite": overwrite},
            )
        )

    def write_json(
        self,
        path: str,
        value: Any,
        *,
        overwrite: bool = False,
        pretty: bool = True,
    ) -> StorageEntry:
        return StorageEntry.from_dict(
            self._request(
                "POST",
                "/v1/fs/write-json",
                body={
                    "path": path,
                    "value": value,
                    "overwrite": overwrite,
                    "pretty": pretty,
                },
            )
        )

    def append_bytes(self, path: str, data: bytes) -> StorageEntry:
        return StorageEntry.from_dict(
            self._request(
                "POST",
                "/v1/fs/append",
                body={
                    "path": path,
                    "dataBase64": base64.b64encode(data).decode("ascii"),
                },
            )
        )

    def append_text(self, path: str, text: str) -> StorageEntry:
        return StorageEntry.from_dict(
            self._request(
                "POST",
                "/v1/fs/append-text",
                body={"path": path, "text": text},
            )
        )

    def touch(self, path: str) -> StorageEntry:
        return StorageEntry.from_dict(self._request("POST", "/v1/fs/touch", body={"path": path}))

    def delete(self, path: str, *, recursive: bool = False) -> None:
        self._request(
            "POST",
            "/v1/fs/delete",
            body={"path": path, "recursive": recursive},
        )

    def clear_dir(self, path: str) -> StorageEntry:
        return StorageEntry.from_dict(
            self._request("POST", "/v1/fs/clear-dir", body={"path": path})
        )

    def rename(self, src: str, dst: str) -> StorageEntry:
        return StorageEntry.from_dict(
            self._request("POST", "/v1/fs/rename", body={"from": src, "to": dst})
        )

    def move_into(self, src: str, directory: str) -> StorageEntry:
        return StorageEntry.from_dict(
            self._request(
                "POST",
                "/v1/fs/move-into",
                body={"from": src, "dir": directory},
            )
        )

    def copy(self, src: str, dst: str, *, overwrite: bool = False) -> StorageEntry:
        return StorageEntry.from_dict(
            self._request(
                "POST",
                "/v1/fs/copy",
                body={"from": src, "to": dst, "overwrite": overwrite},
            )
        )

    def ensure_defaults(self) -> list[str]:
        raw = self._request("POST", "/v1/fs/ensure-defaults", body={})
        return list(raw.get("created", []))

    def graphql(self, query: str, variables: dict[str, Any] | None = None) -> dict[str, Any]:
        payload: dict[str, Any] = {"query": query}
        if variables is not None:
            payload["variables"] = variables
        return self._request("POST", "/graphql", body=payload)
