use rusqlite::Connection;

const SCHEMA_VERSION: i32 = 9;

pub fn run_migrations(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS folders (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            parent_id TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            FOREIGN KEY (parent_id) REFERENCES folders(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS documents (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            content_json TEXT NOT NULL DEFAULT '{"type":"doc","content":[{"type":"paragraph"}]}',
            folder_id TEXT,
            file_path TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE SET NULL
        );
        "#,
    )?;

    let version: Option<String> = conn
        .query_row(
            "SELECT value FROM meta WHERE key = 'schema_version'",
            [],
            |row| row.get(0),
        )
        .ok();

    let current = version
        .and_then(|v| v.parse::<i32>().ok())
        .unwrap_or(0);

    if current < 2 {
        let _ = conn.execute("ALTER TABLE documents ADD COLUMN file_path TEXT", []);
    }

    if current < 3 {
        conn.execute_batch(
            r#"
            CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
                document_id UNINDEXED,
                title,
                body,
                tokenize='unicode61'
            );

            CREATE TABLE IF NOT EXISTS document_revisions (
                id TEXT PRIMARY KEY,
                document_id TEXT NOT NULL,
                title TEXT NOT NULL,
                content_json TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_revisions_document
                ON document_revisions(document_id, created_at DESC);
            "#,
        )?;

        let _ = crate::db::backfill_fts(conn);

        conn.execute(
            "INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', ?1)",
            ["3".to_string()],
        )?;
    }

    if current < 4 {
        conn.execute_batch(
            r#"
            CREATE INDEX IF NOT EXISTS idx_documents_folder ON documents(folder_id);
            CREATE INDEX IF NOT EXISTS idx_documents_updated ON documents(updated_at DESC);
            CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parent_id);
            "#,
        )?;

        conn.execute(
            "INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', ?1)",
            ["4".to_string()],
        )?;
    }

    if current < 5 {
        conn.execute_batch(
            r#"
            CREATE INDEX IF NOT EXISTS idx_documents_file_path ON documents(file_path);
            "#,
        )?;

        conn.execute(
            "INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', ?1)",
            ["5".to_string()],
        )?;
    }

    if current < 6 {
        // Soft-delete (trash), favorites and tags live directly on the document row.
        let _ = conn.execute("ALTER TABLE documents ADD COLUMN deleted_at INTEGER", []);
        let _ = conn.execute(
            "ALTER TABLE documents ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0",
            [],
        );
        let _ = conn.execute("ALTER TABLE documents ADD COLUMN tags TEXT", []);

        conn.execute_batch(
            r#"
            CREATE INDEX IF NOT EXISTS idx_documents_deleted ON documents(deleted_at);
            CREATE INDEX IF NOT EXISTS idx_documents_favorite ON documents(is_favorite);

            CREATE TABLE IF NOT EXISTS comment_threads (
                id TEXT PRIMARY KEY,
                document_id TEXT NOT NULL,
                quote TEXT NOT NULL DEFAULT '',
                resolved INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL,
                FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS comments (
                id TEXT PRIMARY KEY,
                thread_id TEXT NOT NULL,
                document_id TEXT NOT NULL,
                author TEXT NOT NULL,
                body TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                FOREIGN KEY (thread_id) REFERENCES comment_threads(id) ON DELETE CASCADE,
                FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_comment_threads_document
                ON comment_threads(document_id, created_at);
            CREATE INDEX IF NOT EXISTS idx_comments_thread
                ON comments(thread_id, created_at);
            "#,
        )?;

        conn.execute(
            "INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', ?1)",
            ["6".to_string()],
        )?;
    }

    if current < 7 {
        // Wiki-link edges between documents power the backlinks panel.
        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS document_links (
                source_id TEXT NOT NULL,
                target_id TEXT NOT NULL,
                PRIMARY KEY (source_id, target_id),
                FOREIGN KEY (source_id) REFERENCES documents(id) ON DELETE CASCADE,
                FOREIGN KEY (target_id) REFERENCES documents(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_document_links_target
                ON document_links(target_id);
            "#,
        )?;

        let _ = crate::db::backfill_links(conn);

        conn.execute(
            "INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', ?1)",
            ["7".to_string()],
        )?;
    }

    if current < 8 {
        // Repair: older builds could mark schema v7 before document_links existed.
        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS document_links (
                source_id TEXT NOT NULL,
                target_id TEXT NOT NULL,
                PRIMARY KEY (source_id, target_id),
                FOREIGN KEY (source_id) REFERENCES documents(id) ON DELETE CASCADE,
                FOREIGN KEY (target_id) REFERENCES documents(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_document_links_target
                ON document_links(target_id);
            "#,
        )?;

        let _ = crate::db::backfill_links(conn);

        conn.execute(
            "INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', ?1)",
            [SCHEMA_VERSION.to_string()],
        )?;
    }

    if current < 9 {
        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS custom_template_categories (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS custom_templates (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                category TEXT NOT NULL,
                title TEXT NOT NULL,
                content_json TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );
            "#,
        )?;

        conn.execute(
            "INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', ?1)",
            [SCHEMA_VERSION.to_string()],
        )?;
    }

    Ok(())
}

pub fn seed_if_empty(conn: &Connection) -> Result<(), rusqlite::Error> {
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM documents", [], |row| row.get(0))?;

    if count > 0 {
        return Ok(());
    }

    let now = chrono::Utc::now().timestamp();
    let folder_id = uuid::Uuid::new_v4().to_string();
    let doc_id = uuid::Uuid::new_v4().to_string();

    conn.execute(
        "INSERT INTO folders (id, name, parent_id, created_at, updated_at) VALUES (?1, ?2, NULL, ?3, ?3)",
        rusqlite::params![folder_id, "Moje dokumenty", now],
    )?;

    let welcome_content = r#"{"type":"doc","content":[{"type":"heading","attrs":{"level":1},"content":[{"type":"text","text":"Vitajte v Scribe"}]},{"type":"paragraph","content":[{"type":"text","text":"Vaše dokumenty sa automaticky ukladajú ako súbory do priečinka Dokumenty/Scribe na tomto počítači."}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Formátovanie ako v Pages"}]},{"type":"paragraph","content":[{"type":"text","text":"Skúste "},{"type":"text","marks":[{"type":"bold"}],"text":"tučné"},{"type":"text","text":", "},{"type":"text","marks":[{"type":"italic"}],"text":"kurzívu"},{"type":"text","text":", "},{"type":"text","marks":[{"type":"underline"}],"text":"podčiarknutie"},{"type":"text","text":" alebo "},{"type":"text","marks":[{"type":"highlight"}],"text":"zvýraznenie"},{"type":"text","text":"."}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Auto-save do SQLite aj na disk"}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Prepínač svetlej / tmavej témy"}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Zarovnanie textu a odkazy"}]}]}]}]}"#;

    conn.execute(
        "INSERT INTO documents (id, title, content_json, folder_id, file_path, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, NULL, ?5, ?5)",
        rusqlite::params![doc_id, "Vitajte v Scribe", welcome_content, folder_id, now],
    )?;

    let _ = crate::db::sync_document_fts(conn, &doc_id, "Vitajte v Scribe", welcome_content);

    Ok(())
}

#[cfg(test)]
mod tests {
    use crate::db::test_helpers::in_memory_conn;
    use rusqlite::params;

    fn column_names(conn: &rusqlite::Connection, table: &str) -> Vec<String> {
        let mut stmt = conn
            .prepare(&format!("PRAGMA table_info({table})"))
            .unwrap();
        let rows = stmt
            .query_map([], |row| row.get::<_, String>(1))
            .unwrap();
        rows.collect::<Result<Vec<_>, _>>().unwrap()
    }

    #[test]
    fn migration_adds_soft_delete_favorite_and_tag_columns() {
        let conn = in_memory_conn();
        let columns = column_names(&conn, "documents");
        assert!(columns.contains(&"deleted_at".to_string()));
        assert!(columns.contains(&"is_favorite".to_string()));
        assert!(columns.contains(&"tags".to_string()));
    }

    #[test]
    fn migration_creates_document_links_table() {
        let conn = in_memory_conn();
        let exists: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'document_links'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(exists, 1);
    }

    #[test]
    fn migration_repairs_schema_v7_without_document_links() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute_batch(
            r#"
            CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
            CREATE TABLE folders (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                parent_id TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
            CREATE TABLE documents (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                content_json TEXT NOT NULL,
                folder_id TEXT,
                file_path TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                deleted_at INTEGER,
                is_favorite INTEGER NOT NULL DEFAULT 0,
                tags TEXT
            );
            INSERT INTO meta (key, value) VALUES ('schema_version', '7');
            "#,
        )
        .unwrap();

        super::run_migrations(&conn).unwrap();

        let version: String = conn
            .query_row(
                "SELECT value FROM meta WHERE key = 'schema_version'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(version, super::SCHEMA_VERSION.to_string());

        let exists: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'document_links'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(exists, 1);
    }

    #[test]
    fn schema_version_reaches_latest() {
        let conn = in_memory_conn();
        let version: String = conn
            .query_row(
                "SELECT value FROM meta WHERE key = 'schema_version'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(version, super::SCHEMA_VERSION.to_string());
    }

    #[test]
    fn comment_tables_support_thread_with_replies() {
        let conn = in_memory_conn();
        let now = 1_000i64;

        conn.execute(
            "INSERT INTO documents (id, title, content_json, folder_id, file_path, created_at, updated_at) \
             VALUES ('doc1', 'Doc', '{}', NULL, NULL, ?1, ?1)",
            params![now],
        )
        .unwrap();

        conn.execute(
            "INSERT INTO comment_threads (id, document_id, quote, resolved, created_at) \
             VALUES ('t1', 'doc1', 'quoted', 0, ?1)",
            params![now],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO comments (id, thread_id, document_id, author, body, created_at) \
             VALUES ('c1', 't1', 'doc1', 'Ja', 'first', ?1)",
            params![now],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO comments (id, thread_id, document_id, author, body, created_at) \
             VALUES ('c2', 't1', 'doc1', 'Ja', 'reply', ?1)",
            params![now + 1],
        )
        .unwrap();

        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM comments WHERE thread_id = 't1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 2);
    }

    #[test]
    fn deleting_document_cascades_to_comments() {
        let conn = in_memory_conn();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        let now = 1_000i64;

        conn.execute(
            "INSERT INTO documents (id, title, content_json, folder_id, file_path, created_at, updated_at) \
             VALUES ('doc1', 'Doc', '{}', NULL, NULL, ?1, ?1)",
            params![now],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO comment_threads (id, document_id, quote, resolved, created_at) \
             VALUES ('t1', 'doc1', '', 0, ?1)",
            params![now],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO comments (id, thread_id, document_id, author, body, created_at) \
             VALUES ('c1', 't1', 'doc1', 'Ja', 'body', ?1)",
            params![now],
        )
        .unwrap();

        conn.execute("DELETE FROM documents WHERE id = 'doc1'", [])
            .unwrap();

        let threads: i64 = conn
            .query_row("SELECT COUNT(*) FROM comment_threads", [], |row| row.get(0))
            .unwrap();
        let comments: i64 = conn
            .query_row("SELECT COUNT(*) FROM comments", [], |row| row.get(0))
            .unwrap();
        assert_eq!(threads, 0);
        assert_eq!(comments, 0);
    }
}
