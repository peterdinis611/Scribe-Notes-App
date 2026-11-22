//! Wikidata entity lookup (wbgetentities).

use crate::error::{ApiError, ApiResult};
use crate::http::get_json;
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WikidataEntity {
    pub id: String,
    pub label: String,
    pub description: Option<String>,
    pub url: String,
}

#[derive(Debug, Deserialize)]
struct WbGetEntities {
    entities: Option<std::collections::HashMap<String, EntityRaw>>,
}

#[derive(Debug, Clone, Deserialize)]
struct EntityRaw {
    id: Option<String>,
    labels: Option<std::collections::HashMap<String, LabelRaw>>,
    descriptions: Option<std::collections::HashMap<String, LabelRaw>>,
    missing: Option<Value>,
}

#[derive(Debug, Clone, Deserialize)]
struct LabelRaw {
    value: String,
}

pub fn entity(id: &str, lang: &str) -> ApiResult<WikidataEntity> {
    let id = id.trim().to_ascii_uppercase();
    if !id.starts_with('Q') || id.len() < 2 {
        return Err(ApiError::invalid("expected Wikidata Q-id"));
    }
    let lang = {
        let lang = lang.trim().to_ascii_lowercase();
        if lang.len() == 2 || lang.len() == 3 {
            lang
        } else {
            "en".into()
        }
    };
    let url = format!(
        "https://www.wikidata.org/w/api.php?action=wbgetentities&ids={}&props=labels|descriptions&languages={lang}|en&format=json",
        urlencoding::encode(&id)
    );
    let raw: WbGetEntities = get_json(&url)?;
    let ent = raw
        .entities
        .and_then(|map| map.get(&id).cloned())
        .ok_or_else(|| ApiError::not_found("entity missing"))?;
    if ent.missing.is_some() {
        return Err(ApiError::not_found("entity missing"));
    }
    let label = ent
        .labels
        .as_ref()
        .and_then(|labels| labels.get(&lang).or_else(|| labels.get("en")))
        .map(|l| l.value.clone())
        .unwrap_or_else(|| id.clone());
    let description = ent
        .descriptions
        .as_ref()
        .and_then(|map| map.get(&lang).or_else(|| map.get("en")))
        .map(|l| l.value.clone());
    Ok(WikidataEntity {
        id: ent.id.unwrap_or(id.clone()),
        label,
        description,
        url: format!("https://www.wikidata.org/wiki/{id}"),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_bad_id() {
        assert!(entity("bratislava", "en").is_err());
    }
}
