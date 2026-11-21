//! Open Library search (books).

use crate::error::{ApiError, ApiResult};
use crate::http::get_json;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BookHit {
    pub title: String,
    pub authors: Vec<String>,
    pub first_publish_year: Option<i64>,
    pub isbn: Option<String>,
    pub open_library_key: Option<String>,
    pub url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct OlSearch {
    docs: Option<Vec<OlDoc>>,
}

#[derive(Debug, Deserialize)]
struct OlDoc {
    title: Option<String>,
    author_name: Option<Vec<String>>,
    first_publish_year: Option<i64>,
    isbn: Option<Vec<String>>,
    key: Option<String>,
}

pub fn search_books(query: &str, limit: usize) -> ApiResult<Vec<BookHit>> {
    let q = query.trim();
    if q.len() < 2 {
        return Err(ApiError::invalid("query too short"));
    }
    let limit = limit.clamp(1, 12);
    let url = format!(
        "https://openlibrary.org/search.json?limit={limit}&q={}",
        urlencoding::encode(q)
    );
    let raw: OlSearch = get_json(&url)?;
    Ok(raw
        .docs
        .unwrap_or_default()
        .into_iter()
        .filter_map(|doc| {
            let title = doc.title?.trim().to_string();
            if title.is_empty() {
                return None;
            }
            let key = doc.key;
            let url = key
                .as_ref()
                .map(|k| format!("https://openlibrary.org{k}"));
            Some(BookHit {
                title,
                authors: doc.author_name.unwrap_or_default(),
                first_publish_year: doc.first_publish_year,
                isbn: doc.isbn.and_then(|list| list.into_iter().next()),
                open_library_key: key,
                url,
            })
        })
        .take(limit)
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_short() {
        assert!(search_books("a", 3).is_err());
    }
}
