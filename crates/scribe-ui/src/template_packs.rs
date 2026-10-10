//! Template pack schema parse / serialize (import DB I/O stays FE).

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::error::UiError;

pub const TEMPLATE_PACK_VERSION: u32 = 1;
pub const TEMPLATE_PACK_EXTENSION: &str = "scribe-templates.json";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TemplatePackItem {
    pub name: String,
    pub title: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub category_id: Option<String>,
    pub content: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TemplatePack {
    pub version: u32,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub locale: Option<String>,
    pub templates: Vec<TemplatePackItem>,
}

pub fn is_template_pack(value: &Value) -> bool {
    let Some(obj) = value.as_object() else {
        return false;
    };
    obj.get("version").and_then(|v| v.as_u64()) == Some(TEMPLATE_PACK_VERSION as u64)
        && obj
            .get("name")
            .and_then(|v| v.as_str())
            .map(|s| !s.trim().is_empty())
            .unwrap_or(false)
        && obj.get("templates").map(|v| v.is_array()).unwrap_or(false)
}

pub fn parse_template_pack(raw: &Value) -> Result<TemplatePack, UiError> {
    if !is_template_pack(raw) {
        return Err(UiError::Message(
            "Invalid template pack format (.scribe-templates.json)".into(),
        ));
    }
    let obj = raw.as_object().expect("checked");
    let name = obj
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    let locale = obj
        .get("locale")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string);
    let items = obj
        .get("templates")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    let mut templates = Vec::new();
    for item in items {
        let Some(rec) = item.as_object() else {
            continue;
        };
        let Some(item_name) = rec.get("name").and_then(|v| v.as_str()).map(str::trim).filter(|s| !s.is_empty()) else {
            continue;
        };
        let Some(title) = rec.get("title").and_then(|v| v.as_str()).map(str::trim).filter(|s| !s.is_empty()) else {
            continue;
        };
        let Some(content) = rec.get("content").filter(|v| v.is_object()) else {
            continue;
        };
        let description = rec
            .get("description")
            .and_then(|v| v.as_str())
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string);
        let category_id = rec
            .get("categoryId")
            .and_then(|v| v.as_str())
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string);
        templates.push(TemplatePackItem {
            name: item_name.to_string(),
            title: title.to_string(),
            description,
            category_id,
            content: content.clone(),
        });
    }

    if templates.is_empty() {
        return Err(UiError::Message(
            "Template pack contains no valid templates".into(),
        ));
    }

    Ok(TemplatePack {
        version: TEMPLATE_PACK_VERSION,
        name,
        locale,
        templates,
    })
}

pub fn parse_template_pack_str(raw: &str) -> Result<TemplatePack, UiError> {
    let value: Value = serde_json::from_str(raw)
        .map_err(|_| UiError::Message("Invalid template pack JSON".into()))?;
    parse_template_pack(&value)
}

pub fn serialize_template_pack(pack: &TemplatePack) -> String {
    let normalized = TemplatePack {
        version: TEMPLATE_PACK_VERSION,
        name: pack.name.trim().to_string(),
        locale: pack
            .locale
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string),
        templates: pack
            .templates
            .iter()
            .map(|item| TemplatePackItem {
                name: item.name.trim().to_string(),
                title: item.title.trim().to_string(),
                description: item
                    .description
                    .as_deref()
                    .map(str::trim)
                    .filter(|s| !s.is_empty())
                    .map(str::to_string),
                category_id: item
                    .category_id
                    .as_deref()
                    .map(str::trim)
                    .filter(|s| !s.is_empty())
                    .map(str::to_string),
                content: item.content.clone(),
            })
            .collect(),
    };
    serde_json::to_string_pretty(&normalized).unwrap_or_else(|_| "{}".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn parses_pack() {
        let raw = json!({
            "version": 1,
            "name": "Demo",
            "templates": [{
                "name": "a",
                "title": "A",
                "content": { "type": "doc", "content": [] }
            }]
        });
        let pack = parse_template_pack(&raw).unwrap();
        assert_eq!(pack.templates.len(), 1);
        assert!(serialize_template_pack(&pack).contains("Demo"));
    }
}
