//! User-created document templates (`src/lib/templates/custom.ts`).
//!
//! Template bodies (`content`) are TipTap / canvas JSON and stay as `serde_json::Value`.
//! Built-in templates are passed around as plain JSON values (`DocumentTemplate`).

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::templates_catalog::is_valid_category_id;

pub const CUSTOM_TEMPLATE_ID_PREFIX: &str = "custom-";
pub const DEFAULT_TEMPLATE_CATEGORY: &str = "general";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CustomDocumentTemplate {
    /// Always `custom-<uuid>`.
    pub id: String,
    pub name: String,
    pub description: String,
    pub category: String,
    pub title: String,
    pub content: Value,
    /// Always `true`; kept so the struct serializes to the same shape as the frontend.
    pub is_custom: bool,
    /// Unix epoch milliseconds.
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CustomTemplateInput {
    pub name: String,
    #[serde(default)]
    pub description: String,
    pub category: String,
    pub title: String,
    pub content: Value,
}

fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

pub fn create_custom_template(input: CustomTemplateInput) -> CustomDocumentTemplate {
    CustomDocumentTemplate {
        id: format!("{CUSTOM_TEMPLATE_ID_PREFIX}{}", uuid::Uuid::new_v4()),
        name: input.name,
        description: input.description,
        category: input.category,
        title: input.title,
        content: input.content,
        is_custom: true,
        created_at: now_ms(),
    }
}

/// `template.isCustom === true` on a JSON template.
pub fn is_custom_template(template: &Value) -> bool {
    template.get("isCustom") == Some(&Value::Bool(true))
}

/// Built-in templates first, then custom ones (custom serialized to JSON).
pub fn merge_templates(built_in: &[Value], custom: &[CustomDocumentTemplate]) -> Vec<Value> {
    built_in
        .iter()
        .cloned()
        .chain(custom.iter().map(|t| serde_json::to_value(t).unwrap_or(Value::Null)))
        .collect()
}

/// Parse persisted custom templates, dropping entries missing `id`/`name`/`title`/object `content`.
///
/// Missing `description` → `""`, unknown `category` → `"general"`, missing `createdAt` → now.
pub fn parse_stored_custom_templates(raw: &Value) -> Vec<CustomDocumentTemplate> {
    let Some(items) = raw.as_array() else {
        return Vec::new();
    };
    items
        .iter()
        .filter_map(|item| {
            let record = item.as_object()?;
            let id = record.get("id")?.as_str()?;
            let name = record.get("name")?.as_str()?;
            let title = record.get("title")?.as_str()?;
            let content = record.get("content")?;
            if !content.is_object() && !content.is_array() {
                return None;
            }
            let description = record.get("description").and_then(Value::as_str).unwrap_or("");
            let category = record
                .get("category")
                .and_then(Value::as_str)
                .filter(|c| is_valid_category_id(c))
                .unwrap_or(DEFAULT_TEMPLATE_CATEGORY);
            let created_at = record
                .get("createdAt")
                .and_then(Value::as_f64)
                .map(|n| n as i64)
                .unwrap_or_else(now_ms);
            Some(CustomDocumentTemplate {
                id: id.to_string(),
                name: name.to_string(),
                description: description.to_string(),
                category: category.to_string(),
                title: title.to_string(),
                content: content.clone(),
                is_custom: true,
                created_at,
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn input() -> CustomTemplateInput {
        CustomTemplateInput {
            name: "Weekly".into(),
            description: "d".into(),
            category: "business".into(),
            title: "Week".into(),
            content: json!({ "type": "doc", "content": [] }),
        }
    }

    #[test]
    fn creates_with_prefix_and_flags() {
        let t = create_custom_template(input());
        assert!(t.id.starts_with("custom-"));
        assert!(t.is_custom);
        assert!(t.created_at > 0);
        assert_ne!(t.id, create_custom_template(input()).id);
    }

    #[test]
    fn serializes_camel_case() {
        let v = serde_json::to_value(create_custom_template(input())).unwrap();
        assert_eq!(v["isCustom"], true);
        assert!(v.get("createdAt").is_some());
        assert!(is_custom_template(&v));
        assert!(!is_custom_template(&json!({ "id": "blank" })));
        assert!(!is_custom_template(&json!({ "isCustom": "yes" })));
    }

    #[test]
    fn merges_built_in_then_custom() {
        let built_in = vec![json!({ "id": "blank" }), json!({ "id": "notes" })];
        let custom = vec![create_custom_template(input())];
        let merged = merge_templates(&built_in, &custom);
        assert_eq!(merged.len(), 3);
        assert_eq!(merged[0]["id"], "blank");
        assert!(is_custom_template(&merged[2]));
    }

    #[test]
    fn parses_and_filters_stored() {
        let raw = json!([
            { "id": "custom-1", "name": "A", "title": "T", "content": { "type": "doc" },
              "description": "x", "category": "personal", "createdAt": 42 },
            { "id": "custom-2", "name": "B", "title": "T", "content": { "type": "doc" },
              "category": "bogus" },
            { "id": "custom-3", "name": "C", "title": "T", "content": { "type": "doc" },
              "category": "cat-abc", "description": 5 },
            { "id": "custom-4", "name": "D", "title": "T", "content": null },
            { "id": "custom-5", "name": "E", "content": {} },
            { "id": 6, "name": "F", "title": "T", "content": {} },
            "str", null
        ]);
        let out = parse_stored_custom_templates(&raw);
        assert_eq!(out.len(), 3);
        assert_eq!(out[0].category, "personal");
        assert_eq!(out[0].created_at, 42);
        assert_eq!(out[0].description, "x");
        assert_eq!(out[1].category, "general");
        assert_eq!(out[1].description, "");
        assert!(out[1].created_at > 0);
        assert_eq!(out[2].category, "cat-abc");
        assert!(out.iter().all(|t| t.is_custom));
        assert!(parse_stored_custom_templates(&json!({})).is_empty());
    }

    #[test]
    fn roundtrips_through_parse() {
        let t = create_custom_template(input());
        let raw = json!([serde_json::to_value(&t).unwrap()]);
        assert_eq!(parse_stored_custom_templates(&raw), vec![t]);
    }
}
