use crate::db::DbState;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CustomTemplateCategoryRow {
    pub id: String,
    pub name: String,
    pub created_at: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CustomTemplateRow {
    pub id: String,
    pub name: String,
    pub description: String,
    pub category: String,
    pub title: String,
    pub content_json: String,
    pub created_at: i64,
}

fn map_category(row: &rusqlite::Row<'_>) -> rusqlite::Result<CustomTemplateCategoryRow> {
    Ok(CustomTemplateCategoryRow {
        id: row.get(0)?,
        name: row.get(1)?,
        created_at: row.get(2)?,
    })
}

fn map_template(row: &rusqlite::Row<'_>) -> rusqlite::Result<CustomTemplateRow> {
    Ok(CustomTemplateRow {
        id: row.get(0)?,
        name: row.get(1)?,
        description: row.get(2)?,
        category: row.get(3)?,
        title: row.get(4)?,
        content_json: row.get(5)?,
        created_at: row.get(6)?,
    })
}

fn validate_category_id(id: &str) -> Result<(), String> {
    if id.starts_with("cat-") && id.len() > 4 {
        Ok(())
    } else {
        Err("Neplatné ID kategórie".to_string())
    }
}

#[tauri::command]
pub fn list_custom_template_categories(
    state: State<'_, DbState>,
) -> Result<Vec<CustomTemplateCategoryRow>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    list_categories(&conn)
}

fn list_categories(conn: &Connection) -> Result<Vec<CustomTemplateCategoryRow>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, name, created_at FROM custom_template_categories ORDER BY name COLLATE NOCASE ASC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], map_category)
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCustomTemplateCategoryInput {
    pub id: String,
    pub name: String,
    pub created_at: i64,
}

#[tauri::command]
pub fn create_custom_template_category(
    state: State<'_, DbState>,
    input: CreateCustomTemplateCategoryInput,
) -> Result<CustomTemplateCategoryRow, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    validate_category_id(&input.id)?;

    let name = input.name.trim();
    if name.is_empty() {
        return Err("Názov kategórie nemôže byť prázdny".to_string());
    }

    conn.execute(
        "INSERT INTO custom_template_categories (id, name, created_at) VALUES (?1, ?2, ?3)",
        params![input.id, name, input.created_at],
    )
    .map_err(|e| e.to_string())?;

    Ok(CustomTemplateCategoryRow {
        id: input.id,
        name: name.to_string(),
        created_at: input.created_at,
    })
}

#[tauri::command]
pub fn list_custom_templates(state: State<'_, DbState>) -> Result<Vec<CustomTemplateRow>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    list_templates(&conn)
}

fn list_templates(conn: &Connection) -> Result<Vec<CustomTemplateRow>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, name, description, category, title, content_json, created_at
             FROM custom_templates
             ORDER BY name COLLATE NOCASE ASC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], map_template)
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCustomTemplateInput {
    pub id: String,
    pub name: String,
    pub description: String,
    pub category: String,
    pub title: String,
    pub content_json: String,
    pub created_at: i64,
}

#[tauri::command]
pub fn create_custom_template(
    state: State<'_, DbState>,
    input: CreateCustomTemplateInput,
) -> Result<CustomTemplateRow, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    let name = input.name.trim();
    let title = input.title.trim();
    if name.is_empty() {
        return Err("Názov šablóny nemôže byť prázdny".to_string());
    }
    if title.is_empty() {
        return Err("Názov dokumentu nemôže byť prázdny".to_string());
    }

    conn.execute(
        "INSERT INTO custom_templates (id, name, description, category, title, content_json, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            input.id,
            name,
            input.description.trim(),
            input.category,
            title,
            input.content_json,
            input.created_at,
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(CustomTemplateRow {
        id: input.id,
        name: name.to_string(),
        description: input.description.trim().to_string(),
        category: input.category,
        title: title.to_string(),
        content_json: input.content_json,
        created_at: input.created_at,
    })
}

#[tauri::command]
pub fn delete_custom_template_category(
    state: State<'_, DbState>,
    id: String,
) -> Result<u32, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    validate_category_id(&id)?;

    conn.execute(
        "UPDATE custom_templates SET category = 'general' WHERE category = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;

    let reassigned = conn.changes() as u32;

    let affected = conn
        .execute(
            "DELETE FROM custom_template_categories WHERE id = ?1",
            params![id],
        )
        .map_err(|e| e.to_string())?;

    if affected == 0 {
        return Err("Kategória neexistuje".to_string());
    }

    Ok(reassigned)
}

#[tauri::command]
pub fn delete_custom_template(state: State<'_, DbState>, id: String) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM custom_templates WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}
