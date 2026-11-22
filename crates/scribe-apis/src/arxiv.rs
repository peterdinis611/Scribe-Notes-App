//! arXiv Atom API — preprint search (no key). Parses Atom XML lightly.

use crate::error::{ApiError, ApiResult};
use crate::http::USER_AGENT;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArxivPaper {
    pub id: String,
    pub title: String,
    pub summary: Option<String>,
    pub authors: Vec<String>,
    pub published: Option<String>,
    pub pdf_url: Option<String>,
    pub abs_url: String,
    pub categories: Vec<String>,
}

fn get_text(url: &str) -> ApiResult<String> {
    let response = ureq::get(url)
        .set("User-Agent", USER_AGENT)
        .set("Accept", "application/atom+xml, application/xml, text/xml")
        .timeout(std::time::Duration::from_secs(15))
        .call()
        .map_err(|err| ApiError::network(err.to_string()))?;
    response
        .into_string()
        .map_err(|err| ApiError::parse(err.to_string()))
}

fn tag_contents<'a>(xml: &'a str, tag: &str) -> Vec<&'a str> {
    let open = format!("<{tag}");
    let close = format!("</{tag}>");
    let mut out = Vec::new();
    let mut rest = xml;
    while let Some(start) = rest.find(&open) {
        let after_open = &rest[start + open.len()..];
        let Some(gt) = after_open.find('>') else { break };
        let content_start = &after_open[gt + 1..];
        let Some(end) = content_start.find(&close) else { break };
        out.push(content_start[..end].trim());
        rest = &content_start[end + close.len()..];
    }
    out
}

fn first_tag<'a>(xml: &'a str, tag: &str) -> Option<&'a str> {
    tag_contents(xml, tag).into_iter().next()
}

fn strip_ns_inner(s: &str) -> String {
    // Remove nested tags roughly and collapse whitespace
    let mut out = String::new();
    let mut in_tag = false;
    for ch in s.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => out.push(ch),
            _ => {}
        }
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

pub fn search_papers(query: &str, limit: usize) -> ApiResult<Vec<ArxivPaper>> {
    let q = query.trim();
    if q.len() < 2 {
        return Err(ApiError::invalid("query too short"));
    }
    let limit = limit.clamp(1, 12);
    let url = format!(
        "http://export.arxiv.org/api/query?search_query=all:{}&start=0&max_results={limit}",
        urlencoding::encode(q)
    );
    // Prefer https
    let url = url.replacen("http://", "https://", 1);
    let xml = get_text(&url)?;
    let entries: Vec<&str> = {
        let mut parts = Vec::new();
        let mut rest = xml.as_str();
        while let Some(start) = rest.find("<entry>") {
            let after = &rest[start + 7..];
            if let Some(end) = after.find("</entry>") {
                parts.push(&after[..end]);
                rest = &after[end + 8..];
            } else {
                break;
            }
        }
        parts
    };
    let mut out = Vec::new();
    for entry in entries.into_iter().take(limit) {
        let id_raw = first_tag(entry, "id").unwrap_or("").trim();
        let title = first_tag(entry, "title")
            .map(strip_ns_inner)
            .unwrap_or_default();
        if title.is_empty() {
            continue;
        }
        let summary = first_tag(entry, "summary").map(strip_ns_inner);
        let authors = tag_contents(entry, "name")
            .into_iter()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();
        let published = first_tag(entry, "published").map(|s| s.trim().to_string());
        let abs_url = if id_raw.is_empty() {
            format!("https://arxiv.org/search/?query={}", urlencoding::encode(&title))
        } else {
            id_raw.replace("http://", "https://")
        };
        let arxiv_id = abs_url
            .rsplit('/')
            .next()
            .unwrap_or("")
            .to_string();
        let pdf_url = if arxiv_id.is_empty() {
            None
        } else {
            Some(format!("https://arxiv.org/pdf/{arxiv_id}.pdf"))
        };
        // <category term="cs.AI" …/>
        let mut categories = Vec::new();
        let mut rest = entry;
        while let Some(idx) = rest.find("<category") {
            let slice = &rest[idx..];
            if let Some(term) = slice.split("term=\"").nth(1) {
                if let Some(end) = term.find('"') {
                    categories.push(term[..end].to_string());
                }
            }
            rest = &slice[1..];
        }
        out.push(ArxivPaper {
            id: arxiv_id,
            title,
            summary,
            authors,
            published,
            pdf_url,
            abs_url,
            categories,
        });
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_short() {
        assert!(search_papers("a", 3).is_err());
    }
}
