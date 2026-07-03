use crate::db::DbState;
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Comment {
    pub id: String,
    pub thread_id: String,
    pub author: String,
    pub body: String,
    pub created_at: i64,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CommentThread {
    pub id: String,
    pub document_id: String,
    pub quote: String,
    pub resolved: bool,
    pub created_at: i64,
    pub comments: Vec<Comment>,
}

fn now_ts() -> i64 {
    chrono::Utc::now().timestamp()
}

fn load_thread_comments(
    conn: &rusqlite::Connection,
    thread_id: &str,
) -> Result<Vec<Comment>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, thread_id, author, body, created_at FROM comments \
             WHERE thread_id = ?1 ORDER BY created_at ASC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![thread_id], |row| {
            Ok(Comment {
                id: row.get(0)?,
                thread_id: row.get(1)?,
                author: row.get(2)?,
                body: row.get(3)?,
                created_at: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_comment_threads(
    state: State<'_, DbState>,
    document_id: String,
) -> Result<Vec<CommentThread>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT id, document_id, quote, resolved, created_at FROM comment_threads \
             WHERE document_id = ?1 ORDER BY created_at ASC",
        )
        .map_err(|e| e.to_string())?;

    let threads = stmt
        .query_map(params![document_id], |row| {
            Ok(CommentThread {
                id: row.get(0)?,
                document_id: row.get(1)?,
                quote: row.get(2)?,
                resolved: row.get::<_, i64>(3)? != 0,
                created_at: row.get(4)?,
                comments: Vec::new(),
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    threads
        .into_iter()
        .map(|mut thread| {
            thread.comments = load_thread_comments(&conn, &thread.id)?;
            Ok(thread)
        })
        .collect()
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCommentThreadInput {
    /// Optional caller-provided id so the editor mark and DB row share the same anchor.
    pub id: Option<String>,
    pub document_id: String,
    pub quote: String,
    pub author: String,
    pub body: String,
}

#[tauri::command]
pub fn create_comment_thread(
    state: State<'_, DbState>,
    input: CreateCommentThreadInput,
) -> Result<CommentThread, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let thread_id = input
        .id
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    let comment_id = Uuid::new_v4().to_string();
    let now = now_ts();

    conn.execute(
        "INSERT INTO comment_threads (id, document_id, quote, resolved, created_at) \
         VALUES (?1, ?2, ?3, 0, ?4)",
        params![thread_id, input.document_id, input.quote, now],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO comments (id, thread_id, document_id, author, body, created_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            comment_id,
            thread_id,
            input.document_id,
            input.author,
            input.body,
            now
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(CommentThread {
        id: thread_id.clone(),
        document_id: input.document_id,
        quote: input.quote,
        resolved: false,
        created_at: now,
        comments: load_thread_comments(&conn, &thread_id)?,
    })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddCommentReplyInput {
    pub thread_id: String,
    pub author: String,
    pub body: String,
}

#[tauri::command]
pub fn add_comment_reply(
    state: State<'_, DbState>,
    input: AddCommentReplyInput,
) -> Result<Comment, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    let document_id: Option<String> = conn
        .query_row(
            "SELECT document_id FROM comment_threads WHERE id = ?1",
            params![input.thread_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;

    let document_id =
        document_id.ok_or_else(|| format!("Comment thread not found: {}", input.thread_id))?;

    let comment_id = Uuid::new_v4().to_string();
    let now = now_ts();

    conn.execute(
        "INSERT INTO comments (id, thread_id, document_id, author, body, created_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            comment_id,
            input.thread_id,
            document_id,
            input.author,
            input.body,
            now
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(Comment {
        id: comment_id,
        thread_id: input.thread_id,
        author: input.author,
        body: input.body,
        created_at: now,
    })
}

#[tauri::command]
pub fn resolve_comment_thread(
    state: State<'_, DbState>,
    thread_id: String,
    resolved: bool,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE comment_threads SET resolved = ?1 WHERE id = ?2",
        params![if resolved { 1 } else { 0 }, thread_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_comment_thread(state: State<'_, DbState>, thread_id: String) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM comments WHERE thread_id = ?1", params![thread_id])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM comment_threads WHERE id = ?1", params![thread_id])
        .map_err(|e| e.to_string())?;
    Ok(())
}
