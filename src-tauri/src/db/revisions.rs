use rusqlite::{params, Connection};
use uuid::Uuid;

const MAX_REVISIONS_PER_DOCUMENT: i64 = 50;

pub fn save_revision(
    conn: &Connection,
    document_id: &str,
    title: &str,
    content_json: &str,
) -> Result<(), String> {
    let id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp();

    conn.execute(
        "INSERT INTO document_revisions (id, document_id, title, content_json, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, document_id, title, content_json, now],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "DELETE FROM document_revisions WHERE document_id = ?1 AND id NOT IN (
            SELECT id FROM document_revisions WHERE document_id = ?1 ORDER BY created_at DESC LIMIT ?2
        )",
        params![document_id, MAX_REVISIONS_PER_DOCUMENT],
    )
    .map_err(|e| e.to_string())?;

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
}
