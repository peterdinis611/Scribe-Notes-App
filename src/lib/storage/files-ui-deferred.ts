/**
 * Storage Mode UI wiring (deferred)
 *
 * The Files API (`{documentsDir}/files/`) is ready via:
 * - Rust: scribe_core::storage_fs
 * - Tauri: storage_fs_* commands
 * - TS: src/lib/storage/files-api.ts
 * - MCP + Python: storage_fs_* / scribe_nlp.storage_fs
 *
 * Current StorageModeView still browses document media under assets/{documentId}/.
 * Next UI work: tree browser over storageFsList / mkdir / write / delete / reveal
 * behind storageModeEnabled — keep assets gallery or add a Files tab.
 *
 * See docs/storage-fs-api.md.
 */
export const STORAGE_MODE_FILES_UI_DEFERRED = true as const
