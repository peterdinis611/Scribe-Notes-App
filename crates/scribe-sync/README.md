# scribe-sync

Disk ↔ SQLite sync for Scribe libraries.

- `.scribe` / legacy `.scribe.json` read/write
- Debounced disk persist queue
- Bidirectional reconcile (import from disk, push DB → disk, conflict counting)
- Watcher path filters (`should_ignore_path`)

## Host wiring

Implement [`ReconcileHooks`](crate::ReconcileHooks) for library id, FTS, revision snapshots, and conflict records. Platform `notify` watchers stay in Tauri (`src-tauri/src/storage/watch.rs`).

## Example

```rust
use scribe_sync::{get_documents_dir, reconcile_storage, ReconcileHooks};

fn sync(conn: &rusqlite::Connection, hooks: &dyn ReconcileHooks) -> Result<(), String> {
    let dir = get_documents_dir(conn)?;
    let _ = reconcile_storage(conn, &dir, hooks)?;
    Ok(())
}
```
