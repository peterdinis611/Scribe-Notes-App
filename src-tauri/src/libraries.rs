use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use uuid::Uuid;

use crate::storage::{ensure_documents_dir, set_documents_dir};

pub const DEFAULT_LIBRARY_ID: &str = "default";
pub const META_ACTIVE_LIBRARY: &str = "active_library_id";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Library {
    pub id: String,
    pub name: String,
    pub root_path: String,
    pub created_at: i64,
    pub last_opened_at: i64,
    pub sort_order: i32,
    pub is_active: bool,
}

fn now_ts() -> i64 {
    chrono::Utc::now().timestamp()
}

pub fn active_library_id(conn: &Connection) -> String {
    conn.query_row(
        "SELECT value FROM meta WHERE key = ?1",
        [META_ACTIVE_LIBRARY],
        |row| row.get(0),
    )
    .unwrap_or_else(|_| DEFAULT_LIBRARY_ID.to_string())
}

pub fn list_libraries(conn: &Connection) -> Result<Vec<Library>, String> {
    let active = active_library_id(conn);
    let mut stmt = conn
        .prepare(
            "SELECT id, name, root_path, created_at, last_opened_at, sort_order \
             FROM libraries ORDER BY sort_order ASC, name COLLATE NOCASE ASC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            let id: String = row.get(0)?;
            Ok(Library {
                is_active: id == active,
                id,
                name: row.get(1)?,
                root_path: row.get(2)?,
                created_at: row.get(3)?,
                last_opened_at: row.get(4)?,
                sort_order: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

pub fn create_library(conn: &Connection, name: &str, root_path: &Path) -> Result<Library, String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("Názov knižnice nemôže byť prázdny".into());
    }
    ensure_documents_dir(root_path)?;
    let canonical = root_path
        .canonicalize()
        .map_err(|e| format!("Neplatná cesta knižnice: {e}"))?;
    let id = Uuid::new_v4().to_string();
    let now = now_ts();
    let root = canonical.to_string_lossy().to_string();
    let max_order: i32 = conn
        .query_row("SELECT COALESCE(MAX(sort_order), 0) FROM libraries", [], |row| row.get(0))
        .unwrap_or(0);
    conn.execute(
        "INSERT INTO libraries (id, name, root_path, created_at, last_opened_at, sort_order) \
         VALUES (?1, ?2, ?3, ?4, ?4, ?5)",
        params![id, name, root, now, max_order + 1],
    )
    .map_err(|e| e.to_string())?;
    Ok(Library {
        id,
        name: name.to_string(),
        root_path: root,
        created_at: now,
        last_opened_at: now,
        sort_order: max_order + 1,
        is_active: false,
    })
}

pub fn switch_library(conn: &Connection, id: &str) -> Result<Library, String> {
    let now = now_ts();
    conn.execute(
        "UPDATE libraries SET last_opened_at = ?1 WHERE id = ?2",
        params![now, id],
    )
    .map_err(|e| e.to_string())?;
    let library = conn
        .query_row(
            "SELECT id, name, root_path, created_at, last_opened_at, sort_order FROM libraries WHERE id = ?1",
            [id],
            |row| {
                Ok(Library {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    root_path: row.get(2)?,
                    created_at: row.get(3)?,
                    last_opened_at: row.get(4)?,
                    sort_order: row.get(5)?,
                    is_active: true,
                })
            },
        )
        .optional()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Knižnica neexistuje: {id}"))?;

    if !library.root_path.is_empty() {
        set_documents_dir(conn, Path::new(&library.root_path))?;
    }
    conn.execute(
        "INSERT OR REPLACE INTO meta (key, value) VALUES (?1, ?2)",
        params![META_ACTIVE_LIBRARY, library.id],
    )
    .map_err(|e| e.to_string())?;
    Ok(library)
}

pub fn suggested_sibling_root(base: &Path, name: &str) -> PathBuf {
    let parent = base.parent().unwrap_or(base);
    parent.join(format!("Scribe {name}"))
}

pub fn update_active_root(conn: &Connection, path: &Path) -> Result<(), String> {
    let id = active_library_id(conn);
    conn.execute(
        "UPDATE libraries SET root_path = ?1 WHERE id = ?2",
        params![path.to_string_lossy().to_string(), id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncConflict {
    pub id: String,
    pub document_id: String,
    pub title: String,
    pub disk_updated_at: i64,
    pub db_updated_at: i64,
    pub created_at: i64,
}

pub fn list_open_conflicts(conn: &Connection) -> Result<Vec<SyncConflict>, String> {
    let library_id = active_library_id(conn);
    let mut stmt = conn
        .prepare(
            "SELECT id, document_id, title, disk_updated_at, db_updated_at, created_at \
             FROM sync_conflicts WHERE resolved = 0 AND library_id = ?1 ORDER BY created_at DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([library_id], |row| {
            Ok(SyncConflict {
                id: row.get(0)?,
                document_id: row.get(1)?,
                title: row.get(2)?,
                disk_updated_at: row.get(3)?,
                db_updated_at: row.get(4)?,
                created_at: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

pub fn record_conflict(
    conn: &Connection,
    document_id: &str,
    title: &str,
    disk_updated_at: i64,
    db_updated_at: i64,
) -> Result<(), String> {
    let now = now_ts();
    let library_id = active_library_id(conn);
    conn.execute(
        "INSERT INTO sync_conflicts (id, document_id, title, disk_updated_at, db_updated_at, created_at, resolved, library_id) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, ?7)",
        params![Uuid::new_v4().to_string(), document_id, title, disk_updated_at, db_updated_at, now, library_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn resolve_conflict(conn: &Connection, id: &str) -> Result<(), String> {
    conn.execute(
        "UPDATE sync_conflicts SET resolved = 1 WHERE id = ?1",
        [id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

use scribe_core::ManuscriptRecord as Manuscript;

pub fn list_manuscripts(conn: &Connection) -> Result<Vec<Manuscript>, String> {
    scribe_core::list_manuscripts(conn)
}

pub fn upsert_manuscript(
    conn: &Connection,
    id: Option<String>,
    title: &str,
    chapter_ids: &[String],
) -> Result<Manuscript, String> {
    if title.trim().is_empty() {
        return Err("Názov zostavenia nemôže byť prázdny".into());
    }
    scribe_core::upsert_manuscript(conn, id.as_deref(), title, chapter_ids)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_helpers::in_memory_conn;
    use rusqlite::params;

    fn insert_library(conn: &Connection, id: &str, name: &str) {
        conn.execute(
            "INSERT INTO libraries (id, name, root_path, created_at, last_opened_at, sort_order) \
             VALUES (?1, ?2, '', 1, 1, 1)",
            params![id, name],
        )
        .unwrap();
    }

    #[test]
    fn default_library_is_seeded_and_active() {
        let conn = in_memory_conn();
        let listed = list_libraries(&conn).unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].id, DEFAULT_LIBRARY_ID);
        assert!(listed[0].is_active);
        assert_eq!(active_library_id(&conn), DEFAULT_LIBRARY_ID);
    }

    #[test]
    fn create_library_rejects_blank_name() {
        let conn = in_memory_conn();
        let err = create_library(&conn, "   ", Path::new("/tmp")).unwrap_err();
        assert!(err.contains("prázdny"));
    }

    #[test]
    fn create_and_switch_library_updates_active_id() {
        let conn = in_memory_conn();
        let dir = std::env::temp_dir().join(format!("scribe-test-lib-{}", Uuid::new_v4()));
        let created = create_library(&conn, " Work ", &dir).unwrap();
        assert_eq!(created.name, "Work");
        assert!(!created.is_active);
        assert!(created.root_path.contains("scribe-test-lib-"));

        let listed = list_libraries(&conn).unwrap();
        assert_eq!(listed.len(), 2);
        assert!(listed.iter().any(|lib| lib.id == created.id && !lib.is_active));

        let switched = switch_library(&conn, &created.id).unwrap();
        assert!(switched.is_active);
        assert_eq!(active_library_id(&conn), created.id);

        let listed = list_libraries(&conn).unwrap();
        let active: Vec<_> = listed.iter().filter(|lib| lib.is_active).collect();
        assert_eq!(active.len(), 1);
        assert_eq!(active[0].id, created.id);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn switch_library_rejects_unknown_id() {
        let conn = in_memory_conn();
        let err = switch_library(&conn, "missing").unwrap_err();
        assert!(err.contains("Knižnica neexistuje"));
    }

    #[test]
    fn suggested_sibling_root_uses_parent_folder() {
        let base = Path::new("/Users/me/Documents/Scribe");
        assert_eq!(
            suggested_sibling_root(base, "Work"),
            PathBuf::from("/Users/me/Documents/Scribe Work")
        );
    }

    #[test]
    fn manuscripts_are_scoped_to_active_library() {
        let conn = in_memory_conn();
        insert_library(&conn, "work", "Work");

        let book = upsert_manuscript(&conn, None, "Draft", &["ch-1".into()]).unwrap();
        assert_eq!(book.library_id, DEFAULT_LIBRARY_ID);
        assert_eq!(list_manuscripts(&conn).unwrap().len(), 1);

        switch_library(&conn, "work").unwrap();
        assert!(list_manuscripts(&conn).unwrap().is_empty());

        let other = upsert_manuscript(&conn, None, "Work compile", &["ch-2".into()]).unwrap();
        assert_eq!(other.library_id, "work");
        let work_list = list_manuscripts(&conn).unwrap();
        assert_eq!(work_list.len(), 1);
        assert_eq!(work_list[0].title, "Work compile");

        switch_library(&conn, DEFAULT_LIBRARY_ID).unwrap();
        let default_list = list_manuscripts(&conn).unwrap();
        assert_eq!(default_list.len(), 1);
        assert_eq!(default_list[0].id, book.id);
    }

    #[test]
    fn upsert_manuscript_rejects_blank_title() {
        let conn = in_memory_conn();
        let err = upsert_manuscript(&conn, None, "  ", &[]).unwrap_err();
        assert!(err.contains("prázdny"));
    }

    #[test]
    fn upsert_manuscript_updates_existing_row() {
        let conn = in_memory_conn();
        let first = upsert_manuscript(&conn, None, "Draft", &["a".into()]).unwrap();
        let again = upsert_manuscript(
            &conn,
            Some(first.id.clone()),
            "Revised",
            &["a".into(), "b".into()],
        )
        .unwrap();
        assert_eq!(again.id, first.id);
        assert_eq!(again.title, "Revised");
        assert_eq!(again.chapter_ids, vec!["a", "b"]);
        assert_eq!(list_manuscripts(&conn).unwrap().len(), 1);
    }

    #[test]
    fn conflicts_are_scoped_and_can_be_resolved() {
        let conn = in_memory_conn();
        insert_library(&conn, "work", "Work");

        record_conflict(&conn, "doc-1", "Note", 20, 10).unwrap();
        assert_eq!(list_open_conflicts(&conn).unwrap().len(), 1);

        switch_library(&conn, "work").unwrap();
        assert!(list_open_conflicts(&conn).unwrap().is_empty());
        record_conflict(&conn, "doc-2", "Other", 30, 11).unwrap();
        let work_open = list_open_conflicts(&conn).unwrap();
        assert_eq!(work_open.len(), 1);
        assert_eq!(work_open[0].document_id, "doc-2");

        resolve_conflict(&conn, &work_open[0].id).unwrap();
        assert!(list_open_conflicts(&conn).unwrap().is_empty());

        switch_library(&conn, DEFAULT_LIBRARY_ID).unwrap();
        assert_eq!(list_open_conflicts(&conn).unwrap().len(), 1);
    }

    #[test]
    fn update_active_root_writes_current_library_path() {
        let conn = in_memory_conn();
        update_active_root(&conn, Path::new("/tmp/scribe-root")).unwrap();
        let path: String = conn
            .query_row(
                "SELECT root_path FROM libraries WHERE id = ?1",
                [DEFAULT_LIBRARY_ID],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(path, "/tmp/scribe-root");
    }
}
