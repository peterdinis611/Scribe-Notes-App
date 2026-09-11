use rusqlite::{params, Connection};
use uuid::Uuid;

const MAX_REVISIONS_PER_DOCUMENT: i64 = 50;

fn map_revision_error(error: rusqlite::Error) -> String {
    match error {
        rusqlite::Error::QueryReturnedNoRows => "Verzia neexistuje".to_string(),
        other => other.to_string(),
    }
}

pub fn fetch_revision(
    conn: &Connection,
    revision_id: &str,
) -> Result<(String, String, String), String> {
    conn.query_row(
        "SELECT document_id, title, content_json FROM document_revisions WHERE id = ?1",
        params![revision_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    )
    .map_err(map_revision_error)
}

pub fn restore_document_content(
    conn: &Connection,
    document_id: &str,
    new_title: &str,
    new_content_json: &str,
    current_title: &str,
    current_content_json: &str,
    updated_at: i64,
) -> Result<(), String> {
    conn.execute("BEGIN IMMEDIATE", [])
        .map_err(|error| error.to_string())?;

    let restore_result = (|| -> Result<(), String> {
        if current_content_json != new_content_json || current_title != new_title {
            save_revision(conn, document_id, current_title, current_content_json, None, false)?;
        }

        conn.execute(
            "UPDATE documents SET title = ?1, content_json = ?2, updated_at = ?3 WHERE id = ?4",
            params![new_title, new_content_json, updated_at, document_id],
        )
        .map_err(|error| error.to_string())?;

        crate::db::sync_document_fts(conn, document_id, new_title, new_content_json)?;
        Ok(())
    })();

    if let Err(error) = restore_result {
        let _ = conn.execute("ROLLBACK", []);
        return Err(error);
    }

    conn.execute("COMMIT", [])
        .map_err(|error| error.to_string())?;

    Ok(())
}

pub fn save_revision(
    conn: &Connection,
    document_id: &str,
    title: &str,
    content_json: &str,
    label: Option<&str>,
    pinned: bool,
) -> Result<String, String> {
    let id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp();
    let label = label.map(str::trim).filter(|value| !value.is_empty());
    let pinned_flag = if pinned { 1 } else { 0 };

    conn.execute(
        "INSERT INTO document_revisions (id, document_id, title, content_json, created_at, label, pinned)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![id, document_id, title, content_json, now, label, pinned_flag],
    )
    .map_err(|e| e.to_string())?;

    // Keep pinned revisions; prune oldest unpinned beyond the cap.
    conn.execute(
        "DELETE FROM document_revisions
         WHERE document_id = ?1
           AND pinned = 0
           AND id NOT IN (
             SELECT id FROM document_revisions
             WHERE document_id = ?1 AND pinned = 0
             ORDER BY created_at DESC
             LIMIT ?2
           )",
        params![document_id, MAX_REVISIONS_PER_DOCUMENT],
    )
    .map_err(|e| e.to_string())?;

    Ok(id)
}

pub fn set_revision_label(
    conn: &Connection,
    revision_id: &str,
    label: Option<&str>,
    pinned: bool,
) -> Result<(), String> {
    let label = label.map(str::trim).filter(|value| !value.is_empty());
    let updated = conn
        .execute(
            "UPDATE document_revisions SET label = ?1, pinned = ?2 WHERE id = ?3",
            params![label, if pinned { 1 } else { 0 }, revision_id],
        )
        .map_err(|e| e.to_string())?;
    if updated == 0 {
        return Err("Verzia neexistuje".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_helpers::in_memory_conn;

    #[test]
    fn saves_revision_and_prunes_old_entries() {
        let conn = in_memory_conn();
        conn.execute(
            "INSERT INTO documents (id, title, content_json, folder_id, file_path, created_at, updated_at) VALUES ('doc-1', 'A', '{}', NULL, NULL, 1, 1)",
            [],
        )
        .unwrap();

        for index in 0..55 {
            save_revision(
                &conn,
                "doc-1",
                &format!("Title {index}"),
                &format!(r#"{{"v":{index}}}"#),
                None,
                false,
            )
            .unwrap();
        }

        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM document_revisions WHERE document_id = 'doc-1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 50);
    }

    #[test]
    fn pinned_revision_survives_prune() {
        let conn = in_memory_conn();
        conn.execute(
            "INSERT INTO documents (id, title, content_json, folder_id, file_path, created_at, updated_at) VALUES ('doc-1', 'A', '{}', NULL, NULL, 1, 1)",
            [],
        )
        .unwrap();

        let pinned_id = save_revision(&conn, "doc-1", "Pinned", r#"{"v":0}"#, Some("Release"), true)
            .unwrap();

        for index in 1..60 {
            save_revision(
                &conn,
                "doc-1",
                &format!("Title {index}"),
                &format!(r#"{{"v":{index}}}"#),
                None,
                false,
            )
            .unwrap();
        }

        let pinned: i64 = conn
            .query_row(
                "SELECT pinned FROM document_revisions WHERE id = ?1",
                params![pinned_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(pinned, 1);

        let label: String = conn
            .query_row(
                "SELECT label FROM document_revisions WHERE id = ?1",
                params![pinned_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(label, "Release");
    }

    #[test]
    fn restore_saves_current_content_as_revision_before_overwrite() {
        let conn = in_memory_conn();
        conn.execute(
            "INSERT INTO documents (id, title, content_json, folder_id, file_path, created_at, updated_at) VALUES ('doc-1', 'Current', '{\"v\":\"current\"}', NULL, NULL, 1, 1)",
            [],
        )
        .unwrap();

        restore_document_content(
            &conn,
            "doc-1",
            "Restored",
            r#"{"v":"restored"}"#,
            "Current",
            r#"{"v":"current"}"#,
            2,
        )
        .unwrap();

        let title: String = conn
            .query_row(
                "SELECT title FROM documents WHERE id = 'doc-1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(title, "Restored");

        let revision_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM document_revisions WHERE document_id = 'doc-1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(revision_count, 1);
    }

    #[test]
    fn restore_skips_revision_when_content_is_unchanged() {
        let conn = in_memory_conn();
        conn.execute(
            "INSERT INTO documents (id, title, content_json, folder_id, file_path, created_at, updated_at) VALUES ('doc-1', 'Same', '{\"v\":\"same\"}', NULL, NULL, 1, 1)",
            [],
        )
        .unwrap();

        restore_document_content(
            &conn,
            "doc-1",
            "Same",
            r#"{"v":"same"}"#,
            "Same",
            r#"{"v":"same"}"#,
            2,
        )
        .unwrap();

        let revision_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM document_revisions WHERE document_id = 'doc-1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(revision_count, 0);
    }
}
