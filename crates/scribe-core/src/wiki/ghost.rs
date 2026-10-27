//! Wiki ghost text: longest plain-text phrase that can become a `[[wiki]]` link.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WikiGhostCandidate {
    pub id: String,
    pub title: String,
    pub phrase: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WikiGhostMatch {
    pub id: String,
    pub title: String,
    pub phrase: String,
    pub start: usize,
    pub end: usize,
}

fn is_word_char(ch: char) -> bool {
    ch.is_alphanumeric() || ch == '_'
}

/// Longest title/phrase that already appears as plain text in the paragraph.
pub fn find_wiki_ghost_match(
    paragraph: &str,
    candidates: &[WikiGhostCandidate],
    min_length: usize,
) -> Option<WikiGhostMatch> {
    let hay = paragraph.to_ascii_lowercase();
    let mut best: Option<WikiGhostMatch> = None;

    for item in candidates {
        let phrase = if item.phrase.trim().is_empty() {
            item.title.trim()
        } else {
            item.phrase.trim()
        };
        if phrase.len() < min_length {
            continue;
        }
        let needle = phrase.to_ascii_lowercase();
        let Some(idx) = hay.rfind(&needle) else {
            continue;
        };
        let end = idx + phrase.len();
        // Skip if already a wiki link opener.
        if paragraph.get(idx.saturating_sub(2)..idx) == Some("[[") {
            continue;
        }
        let before = if idx > 0 {
            paragraph.get(..idx).and_then(|s| s.chars().next_back())
        } else {
            None
        };
        let after = paragraph.get(end..).and_then(|s| s.chars().next());
        if before.is_some_and(is_word_char) {
            continue;
        }
        if after.is_some_and(is_word_char) {
            continue;
        }
        let better = best
            .as_ref()
            .map(|b| phrase.len() > b.phrase.len())
            .unwrap_or(true);
        if better {
            best = Some(WikiGhostMatch {
                id: item.id.clone(),
                title: item.title.clone(),
                phrase: phrase.to_string(),
                start: idx,
                end,
            });
        }
    }
    best
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_longest_boundary_safe() {
        let cands = vec![
            WikiGhostCandidate {
                id: "1".into(),
                title: "Ship".into(),
                phrase: "Ship".into(),
            },
            WikiGhostCandidate {
                id: "2".into(),
                title: "Ship plan".into(),
                phrase: "Ship plan".into(),
            },
        ];
        let hit = find_wiki_ghost_match("See Ship plan today", &cands, 4).unwrap();
        assert_eq!(hit.id, "2");
        assert_eq!(hit.phrase, "Ship plan");
        assert!(find_wiki_ghost_match("[[Ship plan]] already", &cands, 4).is_none());
    }
}
