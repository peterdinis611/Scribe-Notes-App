//! Dedicated local revision / diff AI (Rust fallback when Python NLP is off).

use crate::diff::diff_lines;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::sync::OnceLock;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RevisionChangeKind {
    Identical,
    Expansion,
    Trim,
    Rewrite,
    Polish,
    Structural,
    Mixed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RevisionAiBullet {
    pub text: String,
    pub severity: String,
    pub kind: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RevisionHeadingChanges {
    pub added: Vec<String>,
    pub removed: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RevisionAiStats {
    pub change_ratio: f64,
    pub old_word_count: i64,
    pub new_word_count: i64,
    pub lines_added: usize,
    pub lines_removed: usize,
    pub net_words: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RevisionAiReport {
    pub summary: String,
    pub headline: String,
    pub change_kind: RevisionChangeKind,
    pub confidence: f64,
    pub bullets: Vec<RevisionAiBullet>,
    pub added_sentences: Vec<String>,
    pub removed_sentences: Vec<String>,
    pub gained_terms: Vec<String>,
    pub lost_terms: Vec<String>,
    pub heading_changes: RevisionHeadingChanges,
    pub risks: Vec<String>,
    pub stats: RevisionAiStats,
    pub source: String,
    /// Compatibility with older summarize_diff consumers.
    pub change_ratio: f64,
    pub old_word_count: i64,
    pub new_word_count: i64,
}

fn heading_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(?m)^(#{1,6})\s+(.+)$").expect("heading regex"))
}

fn todo_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(?i)\b(TODO|FIXME|XXX|HACK|WIP)\b").expect("todo regex"))
}

fn word_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"[\w\u00C0-\u024F]{2,}").expect("word regex"))
}

fn sentence_split(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut buf = String::new();
    for ch in text.chars() {
        buf.push(ch);
        if matches!(ch, '.' | '!' | '?' | '…') {
            let trimmed = buf.trim().to_string();
            if !trimmed.is_empty() {
                out.push(trimmed);
            }
            buf.clear();
        }
    }
    let trimmed = buf.trim().to_string();
    if !trimmed.is_empty() {
        out.push(trimmed);
    }
    out
}

fn tokens(text: &str) -> HashSet<String> {
    word_re()
        .find_iter(text)
        .map(|m| m.as_str().to_lowercase())
        .filter(|w| w.len() > 2)
        .collect()
}

fn extract_headings(text: &str) -> HashSet<String> {
    heading_re()
        .captures_iter(text)
        .filter_map(|caps| caps.get(2).map(|m| m.as_str().trim().to_string()))
        .filter(|s| !s.is_empty())
        .collect()
}

fn guess_language(text: &str) -> &'static str {
    let sample = text.chars().take(4000).collect::<String>().to_lowercase();
    let sk_markers = [" že ", " nie ", " alebo ", " pre ", " ako ", " toto "];
    let hits = sk_markers.iter().filter(|m| sample.contains(*m)).count();
    if hits >= 2 {
        "sk"
    } else {
        "en"
    }
}

/// Analyze a revision diff offline (no Python sidecar required).
pub fn analyze_revision_diff(
    old_text: &str,
    new_text: &str,
    max_bullets: usize,
    language: Option<&str>,
) -> RevisionAiReport {
    let max_bullets = max_bullets.clamp(1, 12);
    let old = old_text;
    let new = new_text;
    let lang = language
        .map(|value| {
            if value.to_ascii_lowercase().starts_with("sk") {
                "sk"
            } else {
                "en"
            }
        })
        .unwrap_or_else(|| guess_language(&format!("{old}\n{new}")));

    let old_sentences = sentence_split(old);
    let new_sentences = sentence_split(new);
    let old_set: HashSet<_> = old_sentences.iter().cloned().collect();
    let new_set: HashSet<_> = new_sentences.iter().cloned().collect();
    let added_sentences: Vec<String> = new_sentences
        .iter()
        .filter(|s| !old_set.contains(*s))
        .cloned()
        .take(max_bullets)
        .collect();
    let removed_sentences: Vec<String> = old_sentences
        .iter()
        .filter(|s| !new_set.contains(*s))
        .cloned()
        .take(max_bullets)
        .collect();

    let old_tokens = tokens(old);
    let new_tokens = tokens(new);
    let mut gained: Vec<String> = new_tokens.difference(&old_tokens).cloned().collect();
    let mut lost: Vec<String> = old_tokens.difference(&new_tokens).cloned().collect();
    gained.sort();
    lost.sort();
    gained.truncate(12);
    lost.truncate(12);

    let union = old_tokens.union(&new_tokens).count();
    let change_ratio = if union == 0 {
        0.0
    } else {
        old_tokens.symmetric_difference(&new_tokens).count() as f64 / union as f64
    };

    let old_word_count = old.split_whitespace().count() as i64;
    let new_word_count = new.split_whitespace().count() as i64;

    let diff = diff_lines(old, new);
    let lines_added = diff.added;
    let lines_removed = diff.removed;

    let old_headings = extract_headings(old);
    let new_headings = extract_headings(new);
    let mut heading_added: Vec<String> = new_headings.difference(&old_headings).cloned().collect();
    let mut heading_removed: Vec<String> = old_headings.difference(&new_headings).cloned().collect();
    heading_added.sort();
    heading_removed.sort();
    heading_added.truncate(8);
    heading_removed.truncate(8);

    let mut risks = Vec::new();
    if old_word_count > 40 && new_word_count < ((old_word_count as f64) * 0.55) as i64 {
        risks.push("large_deletion".into());
    }
    if change_ratio >= 0.65 && old_word_count > 80 {
        risks.push("heavy_rewrite".into());
    }
    if lines_removed >= 12 {
        risks.push("many_lines_removed".into());
    }
    if todo_re().is_match(new) && !todo_re().is_match(old) {
        risks.push("todo_introduced".into());
    }
    if new.trim().is_empty() && !old.trim().is_empty() {
        risks.push("content_cleared".into());
    }

    let change_kind = classify(
        old_word_count,
        new_word_count,
        change_ratio,
        !heading_added.is_empty() || !heading_removed.is_empty(),
        added_sentences.len(),
        removed_sentences.len(),
        lines_added,
        lines_removed,
    );
    let confidence = confidence(change_kind, change_ratio, old_word_count, new_word_count);
    let headline = headline(change_kind, old_word_count, new_word_count, change_ratio, lang);
    let summary = rich_summary(
        &headline,
        &added_sentences,
        &removed_sentences,
        &risks,
        lang,
    );
    let bullets = build_bullets(
        change_kind,
        &added_sentences,
        &removed_sentences,
        &heading_added,
        &heading_removed,
        &risks,
        &gained,
        &lost,
        max_bullets,
        lang,
    );

    RevisionAiReport {
        summary,
        headline,
        change_kind,
        confidence: (confidence * 1000.0).round() / 1000.0,
        bullets,
        added_sentences,
        removed_sentences,
        gained_terms: gained,
        lost_terms: lost,
        heading_changes: RevisionHeadingChanges {
            added: heading_added,
            removed: heading_removed,
        },
        risks,
        stats: RevisionAiStats {
            change_ratio: (change_ratio * 1000.0).round() / 1000.0,
            old_word_count,
            new_word_count,
            lines_added,
            lines_removed,
            net_words: new_word_count - old_word_count,
        },
        source: "rust".into(),
        change_ratio: (change_ratio * 1000.0).round() / 1000.0,
        old_word_count,
        new_word_count,
    }
}

fn classify(
    old_words: i64,
    new_words: i64,
    change_ratio: f64,
    headings_moved: bool,
    added_n: usize,
    removed_n: usize,
    lines_added: usize,
    lines_removed: usize,
) -> RevisionChangeKind {
    if old_words == 0 && new_words == 0 {
        return RevisionChangeKind::Identical;
    }
    if change_ratio < 0.02 && lines_added == 0 && lines_removed == 0 {
        return RevisionChangeKind::Identical;
    }
    let growth = (new_words - old_words) as f64 / old_words.max(1) as f64;
    if headings_moved && growth.abs() < 0.25 && change_ratio < 0.45 {
        return RevisionChangeKind::Structural;
    }
    if growth >= 0.18 && change_ratio < 0.55 {
        return RevisionChangeKind::Expansion;
    }
    if growth <= -0.18 && change_ratio < 0.55 {
        return RevisionChangeKind::Trim;
    }
    if change_ratio >= 0.45 && growth.abs() < 0.2 {
        return RevisionChangeKind::Rewrite;
    }
    if change_ratio < 0.18 && growth.abs() < 0.12 && (added_n + removed_n) <= 4 {
        return RevisionChangeKind::Polish;
    }
    if growth.abs() >= 0.12 && change_ratio >= 0.35 {
        return RevisionChangeKind::Mixed;
    }
    if growth > 0.05 {
        RevisionChangeKind::Expansion
    } else if growth < -0.05 {
        RevisionChangeKind::Trim
    } else {
        RevisionChangeKind::Mixed
    }
}

fn confidence(kind: RevisionChangeKind, change_ratio: f64, old_words: i64, new_words: i64) -> f64 {
    if kind == RevisionChangeKind::Identical {
        return 0.99;
    }
    let mut base = 0.55 + change_ratio.min(0.3);
    if old_words + new_words < 40 {
        base -= 0.15;
    }
    base.clamp(0.35, 0.95)
}

fn headline(
    kind: RevisionChangeKind,
    old_words: i64,
    new_words: i64,
    change_ratio: f64,
    lang: &str,
) -> String {
    let pct = (((new_words - old_words).abs() as f64 / old_words.max(1) as f64) * 100.0).round() as i64;
    let ratio_pct = (change_ratio * 100.0).round() as i64;
    let sk = lang.starts_with("sk");
    match kind {
        RevisionChangeKind::Identical => {
            if sk {
                "Bez zmien".into()
            } else {
                "No changes".into()
            }
        }
        RevisionChangeKind::Expansion => {
            if sk {
                format!("Rozšírenie (+{pct} % slov)")
            } else {
                format!("Expansion (+{pct}% words)")
            }
        }
        RevisionChangeKind::Trim => {
            if sk {
                format!("Skrátenie (−{pct} % slov)")
            } else {
                format!("Trim (−{pct}% words)")
            }
        }
        RevisionChangeKind::Rewrite => {
            if sk {
                format!("Prepísanie (~{ratio_pct} % zmeny)")
            } else {
                format!("Rewrite (~{ratio_pct}% changed)")
            }
        }
        RevisionChangeKind::Polish => {
            if sk {
                "Jemná úprava".into()
            } else {
                "Light polish".into()
            }
        }
        RevisionChangeKind::Structural => {
            if sk {
                "Štrukturálna zmena (nadpisy)".into()
            } else {
                "Structural (headings)".into()
            }
        }
        RevisionChangeKind::Mixed => {
            if sk {
                format!("Zmiešaná úprava (~{ratio_pct} %)")
            } else {
                format!("Mixed edit (~{ratio_pct}%)")
            }
        }
    }
}

fn rich_summary(
    headline: &str,
    added: &[String],
    removed: &[String],
    risks: &[String],
    lang: &str,
) -> String {
    let mut parts = vec![headline.to_string()];
    if let Some(first) = added.first() {
        parts.push(first.clone());
    } else if let Some(first) = removed.first() {
        let prefix = if lang.starts_with("sk") {
            "Odstránené"
        } else {
            "Removed"
        };
        parts.push(format!("{prefix}: {first}"));
    }
    if risks.iter().any(|r| r == "large_deletion") {
        parts.push(if lang.starts_with("sk") {
            "Pozor: veľká časť textu zmizla.".into()
        } else {
            "Warning: a large part of the text was removed.".into()
        });
    }
    parts.join(" ")
}

fn build_bullets(
    _kind: RevisionChangeKind,
    added: &[String],
    removed: &[String],
    heading_added: &[String],
    heading_removed: &[String],
    risks: &[String],
    gained: &[String],
    lost: &[String],
    max_bullets: usize,
    lang: &str,
) -> Vec<RevisionAiBullet> {
    let mut bullets = Vec::new();
    let sk = lang.starts_with("sk");

    let push = |bullets: &mut Vec<RevisionAiBullet>, text: String, severity: &str, kind: &str| {
        if bullets.len() >= max_bullets || text.trim().is_empty() {
            return;
        }
        bullets.push(RevisionAiBullet {
            text,
            severity: severity.into(),
            kind: kind.into(),
        });
    };

    for risk in risks {
        let severity = if matches!(risk.as_str(), "content_cleared" | "large_deletion") {
            "critical"
        } else {
            "warn"
        };
        push(&mut bullets, risk_label(risk, sk), severity, "risk");
    }
    for title in heading_added.iter().take(2) {
        let label = if sk { "Nový nadpis" } else { "New heading" };
        push(&mut bullets, format!("{label}: {title}"), "info", "heading");
    }
    for title in heading_removed.iter().take(2) {
        let label = if sk {
            "Odstránený nadpis"
        } else {
            "Removed heading"
        };
        push(&mut bullets, format!("{label}: {title}"), "warn", "heading");
    }
    for sentence in added.iter().take(3) {
        push(&mut bullets, sentence.clone(), "info", "added");
    }
    for sentence in removed.iter().take(2) {
        push(&mut bullets, sentence.clone(), "warn", "removed");
    }
    if !gained.is_empty() && bullets.len() < max_bullets {
        let label = if sk { "Nové termíny" } else { "New terms" };
        push(
            &mut bullets,
            format!("{label}: {}", gained.iter().take(5).cloned().collect::<Vec<_>>().join(", ")),
            "info",
            "terms",
        );
    }
    if !lost.is_empty() && bullets.len() < max_bullets {
        let label = if sk { "Stratené termíny" } else { "Lost terms" };
        push(
            &mut bullets,
            format!("{label}: {}", lost.iter().take(5).cloned().collect::<Vec<_>>().join(", ")),
            "info",
            "terms",
        );
    }
    bullets
}

fn risk_label(risk: &str, sk: bool) -> String {
    match (risk, sk) {
        ("large_deletion", true) => "Veľké vymazanie textu".into(),
        ("large_deletion", false) => "Large text deletion".into(),
        ("heavy_rewrite", true) => "Silné prepísanie obsahu".into(),
        ("heavy_rewrite", false) => "Heavy content rewrite".into(),
        ("many_lines_removed", true) => "Veľa odstránených riadkov".into(),
        ("many_lines_removed", false) => "Many lines removed".into(),
        ("todo_introduced", true) => "Pribudol TODO/FIXME".into(),
        ("todo_introduced", false) => "TODO/FIXME introduced".into(),
        ("content_cleared", true) => "Obsah bol úplne vymazaný".into(),
        ("content_cleared", false) => "Content was fully cleared".into(),
        (other, _) => other.into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn expansion_report() {
        let old = "Meeting notes. We agreed on the timeline.";
        let new = "Meeting notes. We agreed on the timeline. Next steps include drafting the proposal and scheduling a review for Friday.";
        let report = analyze_revision_diff(old, new, 6, Some("en"));
        assert_eq!(report.source, "rust");
        assert!(matches!(
            report.change_kind,
            RevisionChangeKind::Expansion | RevisionChangeKind::Mixed | RevisionChangeKind::Polish
        ));
        assert!(!report.headline.is_empty());
    }

    #[test]
    fn identical_report() {
        let report = analyze_revision_diff("Same", "Same", 4, Some("en"));
        assert_eq!(report.change_kind, RevisionChangeKind::Identical);
    }
}
