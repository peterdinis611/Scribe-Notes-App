//! Offline query rewrite / expansion (Rust fallback).

use crate::normalize::{collapse_ws, fold_text};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct QueryRewrite {
    pub query: String,
    pub rewritten: String,
    pub expansions: Vec<String>,
    pub source: String,
}

/// Light rewrite: fold case/whitespace, expand SK/EN topical synonyms (parity with Python).
pub fn rewrite_query(query: &str) -> QueryRewrite {
    let trimmed = collapse_ws(query);
    let lower = trimmed.to_lowercase();
    let folded = fold_text(&lower);
    let mut expansions: Vec<String> = Vec::new();

    // Groups mirror `nlp/scribe_nlp/query_rewrite.py` (subset kept for offline size).
    let groups: &[&[&str]] = &[
        &["poznámka", "poznamka", "note", "notes"],
        &["dokument", "document", "documents", "file"],
        &["denník", "dennik", "journal", "diary"],
        &["úloha", "uloha", "task", "todo", "todos", "action", "checklist"],
        &["štítok", "stitok", "tag", "tags", "label"],
        &["zhrnutie", "súhrn", "summary", "summarize", "digest", "overview", "tl;dr"],
        &["vyhľadávanie", "vyhladavanie", "search", "find"],
        &["projekt", "project", "milestone", "epic"],
        &["schôdza", "schodza", "porada", "meeting", "call", "standup", "sync"],
        &["termín", "termin", "deadline", "due", "due date", "dátum odovzdania"],
        &["klient", "customer", "client"],
        &["zmluva", "contract", "agreement"],
        &["faktúra", "faktura", "invoice"],
        &["nápad", "napad", "idea", "ideas", "brainstorm"],
        &["cieľ", "ciel", "goal", "objective", "okr"],
        &["plán", "plan", "roadmap"],
        &["rozhodnutie", "decision", "decisions", "conclusion", "záver", "zaver"],
        &["riziko", "risk", "risks", "blocker", "problem", "issue"],
        &["definícia", "definicia", "definition", "definitions", "term", "pojmy"],
        &["prepojenie", "connection", "related", "similar", "wiki", "backlink"],
        &["osoba", "person", "people", "mention", "mentions", "ľudia", "ludia"],
        &["téma", "tema", "theme", "themes", "topic", "topics"],
        &["lokálne", "lokalne", "local", "offline"],
        &["embeddings", "embedding", "vektor", "vector"],
        &["knižnica", "kniznica", "library"],
        &["export", "pdf", "docx"],
    ];

    let tokens: Vec<String> = lower
        .split_whitespace()
        .map(|t| t.trim_matches(|c: char| !c.is_alphanumeric()).to_string())
        .filter(|t| !t.is_empty())
        .collect();

    for group in groups {
        let hit = group.iter().any(|needle| {
            let needle_l = needle.to_lowercase();
            let needle_f = fold_text(&needle_l);
            tokens.iter().any(|token| {
                let tf = fold_text(token);
                token == &needle_l || tf == needle_f
            }) || folded.contains(&needle_f)
        });
        if !hit {
            continue;
        }
        for candidate in *group {
            let cand = candidate.to_string();
            let already_in_query = tokens
                .iter()
                .any(|token| fold_text(token) == fold_text(&cand.to_lowercase()));
            if already_in_query {
                continue;
            }
            if !expansions
                .iter()
                .any(|item| fold_text(item) == fold_text(&cand.to_lowercase()))
            {
                expansions.push(cand);
            }
        }
    }
    expansions.truncate(8);

    let rewritten = if expansions.is_empty() {
        trimmed.clone()
    } else {
        format!("{trimmed} {}", expansions.join(" "))
    };

    QueryRewrite {
        query: trimmed,
        rewritten,
        expansions,
        source: "rust".into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn expands_deadline() {
        let result = rewrite_query("project deadline");
        assert!(result
            .expansions
            .iter()
            .any(|item| item.contains("due") || item.contains("termín") || item.contains("termin")));
        assert!(result.rewritten.contains("deadline"));
    }

    #[test]
    fn expands_slovak_uloha() {
        let result = rewrite_query("moja úloha");
        assert!(result
            .expansions
            .iter()
            .any(|item| item == "task" || item == "todo"));
    }
}
