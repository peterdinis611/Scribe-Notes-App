use rusqlite::Connection;

const SCHEMA_VERSION: i32 = 4;

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

    if current < SCHEMA_VERSION {
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
            [SCHEMA_VERSION.to_string()],
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
