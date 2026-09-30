# Storage Mode Files API

Lightweight sandboxed file/folder store for Scribe Storage Mode.

## Root

```
{documentsDir}/files/
```

Document media stays under `assets/{documentId}/` and is **out of scope** for this API.

## Path rules

- Client paths are **relative** to `files/` (POSIX `/`)
- No `..`, no absolute paths, no `\`
- Empty path / `.` means the `files/` root (list/stat only)

## Shared types (camelCase JSON)

| Field | Type | Notes |
|-------|------|--------|
| `path` | string | Relative, e.g. `inbox/a.png` |
| `name` | string | Basename |
| `kind` | `"file"` \| `"dir"` | |
| `sizeBytes` | number? | Files only |
| `modifiedAt` | number? | Unix seconds |

## Commands

| Command | Args | Result |
|---------|------|--------|
| `storage_fs_list` | `path?`, `recursive?`, `depth?` | `StorageEntry[]` |
| `storage_fs_stat` | `path` | `StorageEntry` |
| `storage_fs_mkdir` | `path` | `StorageEntry` |
| `storage_fs_write` | `path`, `dataBase64`, `overwrite?` | `StorageEntry` |
| `storage_fs_read` | `path` | `{ path, dataBase64, sizeBytes }` |
| `storage_fs_delete` | `path`, `recursive?` | `void` |
| `storage_fs_rename` | `from`, `to` | `StorageEntry` |
| `storage_fs_reveal` | `path` | `void` (Finder) |

## Bindings

| Layer | Location |
|-------|----------|
| Rust core | `crates/scribe-core/src/storage_fs.rs` |
| Tauri | `src-tauri/src/commands/storage_fs.rs` |
| TypeScript | `src/lib/storage/files-api.ts` |
| MCP | `storage_fs_*` tools in `scribe-mcp` |
| Python | `nlp/scribe_nlp/storage_fs.py` (thin MCP/tool client) |

## UI

Storage Mode gallery over `assets/` stays as-is. Wiring a `files/` browser is a follow-up.
