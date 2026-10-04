//! Offline reading plan from section headings (Rust fallback).

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use super::section_summaries::section_summaries;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NlpReadingStep {
    pub order: i64,
    pub title: String,
    pub focus: String,
    #[serde(default)]
    pub bullets: Vec<String>,
    #[serde(default)]
    pub estimated_minutes: i64,
    #[serde(default)]
    pub char_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NlpReadingPlan {
    #[serde(default)]
    pub steps: Vec<NlpReadingStep>,
    #[serde(default)]
    pub count: i64,
    #[serde(default)]
    pub estimated_minutes: i64,
    #[serde(default)]
    pub source: String,
}

pub fn reading_plan(text: &str, limit: usize) -> NlpReadingPlan {
    let limit = limit.clamp(1, 20);
    let sections = section_summaries(text, limit, 2);
    let mut steps = Vec::new();
    for (index, section) in sections.sections.into_iter().enumerate() {
        let minutes = if section.char_count > 1200 {
            10
        } else if section.char_count > 500 {
            6
        } else {
            3
        };
        let focus = if !section.summary.is_empty() {
            section.summary.chars().take(280).collect()
        } else if let Some(first) = section.bullets.first() {
            first.clone()
        } else {
            section.title.clone()
        };
        steps.push(NlpReadingStep {
            order: (index + 1) as i64,
            title: section.title,
            focus,
            bullets: section.bullets,
            estimated_minutes: minutes,
            char_count: section.char_count,
        });
    }
    let estimated_minutes = steps.iter().map(|s| s.estimated_minutes).sum();
    NlpReadingPlan {
        count: steps.len() as i64,
        estimated_minutes,
        steps,
        source: "rust".to_string(),
    }
}

pub fn reading_plan_value(text: &str, limit: usize) -> Value {
    serde_json::to_value(reading_plan(text, limit)).unwrap_or_else(|_| json!({}))
}
