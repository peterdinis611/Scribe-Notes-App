//! Custom template category helpers (`src/lib/templates/categories.ts`).
//! Built-in ids / `is_custom_category_id` live in `templates_catalog`; this adds the custom-category model.

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::templates_catalog::{is_built_in_category, is_custom_category_id};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CustomTemplateCategory {
    /// Always `cat-<uuid>`.
    pub id: String,
    pub name: String,
    /// Unix epoch milliseconds.
    pub created_at: i64,
}

/// Slovak fallback label for a built-in category (FE `builtInCategoryLabels`).
pub fn built_in_category_label(id: &str) -> Option<&'static str> {
    Some(match id {
        "general" => "Všeobecné",
        "business" => "Biznis",
        "personal" => "Osobné",
        "creative" => "Kreatívne",
        _ => return None,
    })
}

fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

pub fn create_custom_category(name: &str) -> CustomTemplateCategory {
    CustomTemplateCategory {
        id: format!("cat-{}", uuid::Uuid::new_v4()),
        name: name.trim().to_string(),
        created_at: now_ms(),
    }
}

/// Label for any category id; unknown custom ids fall back to "Custom category".
pub fn category_label(id: &str, custom: &[CustomTemplateCategory]) -> String {
    if is_built_in_category(id) {
        return built_in_category_label(id).unwrap_or(id).to_string();
    }
    custom
        .iter()
        .find(|c| c.id == id)
        .map(|c| c.name.clone())
        .unwrap_or_else(|| "Custom category".to_string())
}

/// Parse persisted custom categories, dropping invalid entries (non-`cat-` ids, blank names).
pub fn parse_stored_custom_categories(raw: &Value) -> Vec<CustomTemplateCategory> {
    let Some(items) = raw.as_array() else {
        return Vec::new();
    };
    items
        .iter()
        .filter_map(|item| {
            let record = item.as_object()?;
            let id = record.get("id")?.as_str()?;
            if !is_custom_category_id(id) {
                return None;
            }
            let name = record.get("name")?.as_str()?.trim();
            if name.is_empty() {
                return None;
            }
            let created_at = record
                .get("createdAt")
                .and_then(Value::as_f64)
                .map(|n| n as i64)
                .unwrap_or_else(now_ms);
            Some(CustomTemplateCategory { id: id.to_string(), name: name.to_string(), created_at })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn creates_with_prefix_and_trim() {
        let c = create_custom_category("  Work  ");
        assert!(c.id.starts_with("cat-"));
        assert_eq!(c.name, "Work");
        assert!(c.created_at > 0);
        assert_ne!(c.id, create_custom_category("x").id);
    }

    #[test]
    fn parses_and_filters() {
        let raw = json!([
            { "id": "cat-1", "name": " One ", "createdAt": 42 },
            { "id": "general", "name": "Nope", "createdAt": 1 },
            { "id": "cat-2", "name": "   " },
            { "id": "cat-3", "name": "Three" },
            null,
            "str"
        ]);
        let out = parse_stored_custom_categories(&raw);
        assert_eq!(out.len(), 2);
        assert_eq!(out[0], CustomTemplateCategory { id: "cat-1".into(), name: "One".into(), created_at: 42 });
        assert_eq!(out[1].id, "cat-3");
        assert!(out[1].created_at > 0);
        assert!(parse_stored_custom_categories(&json!({})).is_empty());
    }

    #[test]
    fn labels() {
        let custom = vec![CustomTemplateCategory { id: "cat-1".into(), name: "Mine".into(), created_at: 0 }];
        assert_eq!(category_label("business", &custom), "Biznis");
        assert_eq!(category_label("cat-1", &custom), "Mine");
        assert_eq!(category_label("cat-zzz", &custom), "Custom category");
    }

    #[test]
    fn serializes_camel_case() {
        let json = serde_json::to_value(create_custom_category("A")).unwrap();
        assert!(json.get("createdAt").is_some());
    }
}
