use serde_json::{json, Value};

use crate::db::RankedDocumentChunk;

pub const DOCUMENT_PASSAGE_TARGET_CHARS: usize = 560;
pub const DOCUMENT_PASSAGE_MAX: usize = 64;
/// Candidate pool sent to Python — BM25 prunes before embed rerank (do not cut early).
pub const DOCUMENT_ANSWER_PASSAGE_LIMIT: usize = 80;
pub const DOCUMENT_EMBED_RANK_LIMIT: i64 = 24;

/// Split full note plaintext into overlapping-ish passages covering the whole document.
pub fn chunk_document_passages(document_id: &str, title: &str, text: &str) -> Vec<Value> {
    let snippets = split_document_text(text, DOCUMENT_PASSAGE_TARGET_CHARS, DOCUMENT_PASSAGE_MAX);
    snippets
        .into_iter()
        .enumerate()
        .map(|(index, snippet)| {
            json!({
                "documentId": document_id,
                "title": title,
                "snippet": snippet,
                "chunkIndex": index as i32,
                "score": 0.05,
            })
        })
        .collect()
}

/// Build passages for document Q&A: full-note coverage + ranked embedding hits, ordered for the question.
pub fn build_document_answer_passages(
    document_id: &str,
    title: &str,
    text: &str,
    question: &str,
    ranked: &[RankedDocumentChunk],
) -> Value {
    let full = chunk_document_passages(document_id, title, text);
    let mut combined: Vec<Value> = Vec::new();

    for chunk in ranked {
        combined.push(json!({
            "documentId": document_id,
            "title": title,
            "snippet": chunk.snippet,
            "score": chunk.score,
            "chunkIndex": chunk.chunk_index,
        }));
    }

    for item in full {
        if !has_similar_snippet(&combined, item.get("snippet").and_then(Value::as_str).unwrap_or("")) {
            combined.push(item);
        }
    }

    // Always keep a lead + mid + tail sample so long notes stay answerable end-to-end.
    if let Some(spread) = coverage_anchors(document_id, title, text) {
        for item in spread {
            if !has_similar_snippet(&combined, item.get("snippet").and_then(Value::as_str).unwrap_or("")) {
                combined.push(item);
            }
        }
    }

    let mut scored: Vec<(f64, Value)> = combined
        .into_iter()
        .map(|item| {
            let snippet = item.get("snippet").and_then(Value::as_str).unwrap_or("");
            let base = item
                .get("score")
                .and_then(Value::as_f64)
                .unwrap_or(0.0);
            let lexical = lexical_overlap(question, snippet);
            (base + lexical, item)
        })
        .collect();
    scored.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));

    let limited: Vec<Value> = scored
        .into_iter()
        .take(DOCUMENT_ANSWER_PASSAGE_LIMIT)
        .map(|(score, mut item)| {
            if let Some(object) = item.as_object_mut() {
                object.insert("score".to_string(), json!(score));
            }
            item
        })
        .collect();
    json!(limited)
}

fn split_document_text(text: &str, target_chars: usize, max_passages: usize) -> Vec<String> {
    let mut chunks: Vec<String> = Vec::new();
    let paragraphs: Vec<&str> = text
        .split("\n\n")
        .map(str::trim)
        .filter(|part| !part.is_empty())
        .collect();

    if paragraphs.is_empty() {
        let trimmed = text.trim();
        if !trimmed.is_empty() {
            chunks.push(trimmed.to_string());
        }
    } else {
        let mut buffer = String::new();
        for paragraph in paragraphs {
            if buffer.is_empty() {
                buffer.push_str(paragraph);
                continue;
            }
            if buffer.len() + paragraph.len() + 1 <= target_chars {
                buffer.push('\n');
                buffer.push_str(paragraph);
            } else {
                chunks.push(std::mem::take(&mut buffer));
                buffer.push_str(paragraph);
            }
        }
        if !buffer.trim().is_empty() {
            chunks.push(buffer);
        }
    }

    let mut refined: Vec<String> = Vec::new();
    for chunk in chunks {
        if chunk.len() <= target_chars * 2 {
            refined.push(chunk);
            continue;
        }
        let mut current = String::new();
        for part in chunk.split_inclusive(['.', '!', '?', '\n']) {
            let piece = part.trim();
            if piece.is_empty() {
                continue;
            }
            if current.is_empty() {
                current.push_str(piece);
            } else if current.len() + piece.len() + 1 <= target_chars {
                current.push(' ');
                current.push_str(piece);
            } else {
                refined.push(std::mem::take(&mut current));
                current.push_str(piece);
            }
        }
        if !current.trim().is_empty() {
            refined.push(current);
        }
    }

    // Hard-slice remaining oversized pieces so nothing is silently dropped.
    let mut final_chunks: Vec<String> = Vec::new();
    for chunk in refined {
        if chunk.chars().count() <= target_chars * 2 {
            final_chunks.push(chunk);
            continue;
        }
        let chars: Vec<char> = chunk.chars().collect();
        let mut start = 0usize;
        while start < chars.len() {
            let end = (start + target_chars).min(chars.len());
            final_chunks.push(chars[start..end].iter().collect());
            if end >= chars.len() {
                break;
            }
            start = end.saturating_sub(40);
        }
    }

    if final_chunks.len() <= max_passages {
        return final_chunks;
    }

    // Spread selection across the document instead of only keeping the head.
    let mut picked = Vec::new();
    let last = final_chunks.len().saturating_sub(1);
    let step = ((final_chunks.len() as f64) / (max_passages as f64)).max(1.0);
    let mut index = 0.0;
    while picked.len() < max_passages && (index as usize) <= last {
        let at = (index as usize).min(last);
        if picked.last().copied() != Some(at) {
            picked.push(at);
        }
        index += step;
    }
    if picked.last().copied() != Some(last) && picked.len() < max_passages {
        picked.push(last);
    }
    picked
        .into_iter()
        .map(|at| final_chunks[at].clone())
        .collect()
}

fn coverage_anchors(document_id: &str, title: &str, text: &str) -> Option<Vec<Value>> {
    let trimmed = text.trim();
    if trimmed.chars().count() < 1_200 {
        return None;
    }
    let chars: Vec<char> = trimmed.chars().collect();
    let window = 420usize;
    let mid = chars.len() / 2;
    let tail_start = chars.len().saturating_sub(window);
    let mid_start = mid.saturating_sub(window / 2);
    let slices = [
        (0usize, window.min(chars.len()), 0.02),
        (mid_start, (mid_start + window).min(chars.len()), 0.015),
        (tail_start, chars.len(), 0.02),
    ];
    Some(
        slices
            .into_iter()
            .filter(|(start, end, _)| end > start)
            .map(|(start, end, score)| {
                let snippet: String = chars[start..end].iter().collect();
                json!({
                    "documentId": document_id,
                    "title": title,
                    "snippet": snippet,
                    "score": score,
                })
            })
            .collect(),
    )
}

fn has_similar_snippet(items: &[Value], snippet: &str) -> bool {
    let needle = normalize_key(snippet);
    if needle.is_empty() {
        return true;
    }
    let prefix: String = needle.chars().take(96).collect();
    items.iter().any(|item| {
        let existing = item
            .get("snippet")
            .and_then(Value::as_str)
            .map(normalize_key)
            .unwrap_or_default();
        existing.starts_with(&prefix) || prefix.starts_with(existing.chars().take(96).collect::<String>().as_str())
    })
}

fn normalize_key(text: &str) -> String {
    text.chars()
        .filter(|ch| ch.is_alphanumeric() || ch.is_whitespace())
        .flat_map(char::to_lowercase)
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn lexical_overlap(question: &str, snippet: &str) -> f64 {
    let query_terms = significant_terms(question);
    if query_terms.is_empty() {
        return 0.0;
    }
    let hay = normalize_key(snippet);
    let mut hits = 0.0;
    for term in &query_terms {
        if hay.contains(term) {
            hits += 1.0;
        }
    }
    (hits / query_terms.len() as f64) * 0.55
}

fn significant_terms(text: &str) -> Vec<String> {
    const STOP: &[&str] = &[
        "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "is", "are", "was", "were",
        "what", "which", "who", "where", "when", "how", "do", "does", "did", "my", "me", "i",
        "this", "that", "these", "those", "note", "document", "about", "with", "from",
        "co", "je", "su", "sa", "na", "do", "po", "od", "za", "ako", "aky", "aka", "ake", "ktory",
        "ktora", "ktore", "mam", "ma", "moj", "moja", "moje", "tato", "toto", "tam", "tu",
        "poznamka", "poznamke", "dokument", "dokumente",
    ];
    normalize_key(text)
        .split_whitespace()
        .filter(|term| term.len() >= 3 && !STOP.contains(term))
        .map(ToOwned::to_owned)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::RankedDocumentChunk;

    #[test]
    fn chunks_cover_long_document_tail() {
        let mut text = String::from("Intro paragraph about setup.\n\n");
        for index in 0..40 {
            text.push_str(&format!("Section {index}. Details about topic {index} continue here.\n\n"));
        }
        text.push_str("Final secret deadline is Friday night.");
        let chunks = split_document_text(&text, 200, 20);
        assert!(chunks.len() <= 20);
        let joined = chunks.join("\n");
        assert!(joined.contains("Final secret deadline"));
    }

    #[test]
    fn merges_ranked_with_full_document_and_ranks_by_question() {
        let text = "Alpha section talks about milk.\n\nBeta section explains the release plan.\n\nGamma has the deadline Friday.";
        let ranked = vec![RankedDocumentChunk {
            snippet: "Beta section explains the release plan.".into(),
            score: 0.4,
            chunk_index: 1,
        }];
        let passages = build_document_answer_passages("d1", "Note", text, "When is the deadline?", &ranked);
        let list = passages.as_array().expect("array");
        assert!(list.len() >= 2);
        let joined = list
            .iter()
            .filter_map(|item| item.get("snippet").and_then(Value::as_str))
            .collect::<Vec<_>>()
            .join("\n");
        assert!(joined.to_lowercase().contains("deadline") || joined.to_lowercase().contains("friday"));
        assert!(list[0]
            .get("snippet")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_lowercase()
            .contains("deadline")
            || list[0]
                .get("snippet")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_lowercase()
                .contains("friday")
            || list.iter().any(|item| {
                item.get("snippet")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_lowercase()
                    .contains("deadline")
            }));
    }
}
