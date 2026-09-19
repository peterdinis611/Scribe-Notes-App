use serde_json::Value;

use super::types::{
    NlpDateEvent, NlpDocumentAnalysis, NlpKeyword, NlpKeywordsResult, NlpLanguage,
    NlpOutlineItem, NlpQueryRewrite, NlpReadingStats, NlpRewriteResult, NlpSentiment,
    NlpSpellIssue, NlpSpellcheck, NlpTitleSuggestion,
};

fn as_str(value: &Value) -> Option<&str> {
    value.as_str().map(str::trim).filter(|item| !item.is_empty())
}

fn string_list(value: Option<&Value>) -> Vec<String> {
    value
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| {
                    if let Some(text) = as_str(item) {
                        return Some(text.to_string());
                    }
                    item.get("phrase")
                        .and_then(as_str)
                        .map(str::to_string)
                        .or_else(|| item.get("term").and_then(as_str).map(str::to_string))
                })
                .collect()
        })
        .unwrap_or_default()
}

fn parse_keywords(value: Option<&Value>) -> Vec<NlpKeyword> {
    value
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| {
                    Some(NlpKeyword {
                        term: as_str(item.get("term")?)?.to_string(),
                        score: item.get("score").and_then(Value::as_f64).unwrap_or(0.0),
                        count: item.get("count").and_then(Value::as_i64).unwrap_or(0),
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

fn parse_outline(value: Option<&Value>) -> Vec<NlpOutlineItem> {
    value
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| {
                    Some(NlpOutlineItem {
                        title: as_str(item.get("title")?)?.to_string(),
                        level: item.get("level").and_then(Value::as_i64).unwrap_or(1),
                        kind: item
                            .get("kind")
                            .and_then(as_str)
                            .unwrap_or("heading")
                            .to_string(),
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

fn parse_dates(value: Option<&Value>) -> Vec<NlpDateEvent> {
    let items = value.and_then(|raw| {
        raw.get("events")
            .and_then(Value::as_array)
            .or_else(|| raw.as_array())
    });
    items
        .map(|rows| {
            rows.iter()
                .filter_map(|item| {
                    Some(NlpDateEvent {
                        text: as_str(item.get("text")?)?.to_string(),
                        kind: item
                            .get("kind")
                            .and_then(as_str)
                            .unwrap_or("absolute")
                            .to_string(),
                        resolved_date: item
                            .get("resolvedDate")
                            .and_then(as_str)
                            .map(str::to_string),
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

/// Flatten sidecar `analyze_document` JSON into the app/MCP analysis shape.
pub fn parse_document_analysis(result: &Value) -> NlpDocumentAnalysis {
    let readability = result.get("readability");
    let sentiment = result.get("sentiment");
    let mentions = result.get("mentions");
    let suggested_title = result
        .get("suggestedTitle")
        .and_then(as_str)
        .map(str::to_string);
    let suggested_slug = result
        .get("suggestedSlug")
        .and_then(as_str)
        .map(str::to_string);

    NlpDocumentAnalysis {
        language: result
            .get("language")
            .and_then(as_str)
            .unwrap_or("unknown")
            .to_string(),
        language_confidence: result
            .get("languageConfidence")
            .and_then(Value::as_f64)
            .unwrap_or(0.0),
        keywords: parse_keywords(result.get("keywords")),
        keyphrases: string_list(result.get("keyphrases")),
        outline: parse_outline(result.get("outline")),
        summary: result.get("summary").and_then(as_str).map(str::to_string),
        suggested_title,
        readability_label: readability
            .and_then(|value| value.get("readabilityLabel"))
            .and_then(as_str)
            .map(str::to_string),
        reading_time_minutes: readability
            .and_then(|value| value.get("readingTimeMinutes"))
            .and_then(Value::as_f64),
        flesch: readability
            .and_then(|value| value.get("flesch"))
            .and_then(Value::as_f64),
        tone: sentiment
            .and_then(|value| value.get("label"))
            .and_then(as_str)
            .map(str::to_string),
        tone_score: sentiment
            .and_then(|value| value.get("score"))
            .and_then(Value::as_f64),
        wiki_links: string_list(mentions.and_then(|value| value.get("wikiLinks"))),
        mentions: string_list(mentions.and_then(|value| value.get("mentions"))),
        hosts: string_list(mentions.and_then(|value| value.get("hosts"))),
        dates: parse_dates(result.get("dates")),
        summary_bullets: string_list(result.get("summaryBullets")),
        suggested_slug,
        open_task_count: result.get("openTaskCount").and_then(Value::as_i64),
    }
}

pub fn parse_rewrite_result(
    result: &Value,
    fallback_mode: &str,
    fallback_original: &str,
) -> NlpRewriteResult {
    NlpRewriteResult {
        output: result
            .get("output")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string(),
        mode: result
            .get("mode")
            .and_then(as_str)
            .unwrap_or(fallback_mode)
            .to_string(),
        original: result
            .get("original")
            .and_then(Value::as_str)
            .unwrap_or(fallback_original)
            .to_string(),
    }
}

pub fn parse_keywords_result(result: &Value) -> NlpKeywordsResult {
    NlpKeywordsResult {
        keywords: parse_keywords(result.get("keywords")),
        keyphrases: string_list(result.get("keyphrases")),
    }
}

pub fn parse_sentiment(result: &Value) -> NlpSentiment {
    NlpSentiment {
        label: result
            .get("label")
            .and_then(as_str)
            .unwrap_or("neutral")
            .to_string(),
        score: result.get("score").and_then(Value::as_f64).unwrap_or(0.0),
        positive_hits: result
            .get("positiveHits")
            .and_then(Value::as_i64)
            .unwrap_or(0),
        negative_hits: result
            .get("negativeHits")
            .and_then(Value::as_i64)
            .unwrap_or(0),
        confidence: result
            .get("confidence")
            .and_then(Value::as_f64)
            .unwrap_or(0.0),
    }
}

pub fn parse_language(result: &Value) -> NlpLanguage {
    NlpLanguage {
        language: result
            .get("language")
            .and_then(as_str)
            .unwrap_or("unknown")
            .to_string(),
        confidence: result
            .get("confidence")
            .or_else(|| result.get("languageConfidence"))
            .and_then(Value::as_f64)
            .unwrap_or(0.0),
    }
}

pub fn parse_reading_stats(result: &Value) -> NlpReadingStats {
    NlpReadingStats {
        readability_label: result
            .get("readabilityLabel")
            .and_then(as_str)
            .unwrap_or("plain")
            .to_string(),
        reading_time_minutes: result
            .get("readingTimeMinutes")
            .and_then(Value::as_f64)
            .unwrap_or(0.0),
        flesch: result.get("flesch").and_then(Value::as_f64).unwrap_or(0.0),
        word_count: result.get("wordCount").and_then(Value::as_i64).unwrap_or(0),
        sentence_count: result
            .get("sentenceCount")
            .and_then(Value::as_i64)
            .unwrap_or(0),
    }
}

pub fn parse_title_suggestion(result: &Value) -> NlpTitleSuggestion {
    NlpTitleSuggestion {
        title: result
            .get("title")
            .and_then(as_str)
            .unwrap_or("")
            .to_string(),
        slug: result
            .get("slug")
            .and_then(as_str)
            .unwrap_or("")
            .to_string(),
        source: result
            .get("source")
            .and_then(as_str)
            .unwrap_or("")
            .to_string(),
    }
}

pub fn parse_query_rewrite(result: &Value) -> NlpQueryRewrite {
    NlpQueryRewrite {
        query: result
            .get("query")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string(),
        rewritten: result
            .get("rewritten")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string(),
        expansions: string_list(result.get("expansions")),
    }
}

pub fn parse_spellcheck(result: &Value) -> NlpSpellcheck {
    let issues = result
        .get("issues")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| {
                    Some(NlpSpellIssue {
                        word: as_str(item.get("word")?)?.to_string(),
                        offset: item.get("offset").and_then(Value::as_i64).unwrap_or(0),
                        suggestions: string_list(item.get("suggestions")),
                    })
                })
                .collect()
        })
        .unwrap_or_default();
    NlpSpellcheck {
        language: result
            .get("language")
            .and_then(as_str)
            .unwrap_or("unknown")
            .to_string(),
        issues,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn flattens_analyze_document_sidecar_payload() {
        let raw = json!({
            "language": "sk",
            "languageConfidence": 0.91,
            "keywords": [{"term": "poznámka", "score": 0.4, "count": 2}],
            "keyphrases": ["denný záznam", {"phrase": "lokálne AI"}],
            "outline": [{"title": "Úvod", "level": 1, "kind": "heading"}],
            "summary": "Krátky prehľad.",
            "summaryBullets": ["bod 1"],
            "suggestedTitle": "Denník",
            "suggestedSlug": "dennik",
            "openTaskCount": 3,
            "readability": {
                "readabilityLabel": "easy",
                "readingTimeMinutes": 1.5,
                "flesch": 72.0
            },
            "sentiment": {"label": "positive", "score": 0.6},
            "mentions": {
                "wikiLinks": ["Cieľ"],
                "mentions": ["@peter"],
                "hosts": ["example.com"]
            },
            "dates": {
                "events": [{
                    "text": "zajtra",
                    "kind": "relative",
                    "resolvedDate": "2026-09-20"
                }]
            }
        });
        let analysis = parse_document_analysis(&raw);
        assert_eq!(analysis.language, "sk");
        assert_eq!(analysis.keywords[0].term, "poznámka");
        assert!(analysis.keyphrases.contains(&"denný záznam".into()));
        assert!(analysis.keyphrases.contains(&"lokálne AI".into()));
        assert_eq!(analysis.outline[0].title, "Úvod");
        assert_eq!(analysis.suggested_title.as_deref(), Some("Denník"));
        assert_eq!(analysis.suggested_slug.as_deref(), Some("dennik"));
        assert_eq!(analysis.tone.as_deref(), Some("positive"));
        assert_eq!(analysis.wiki_links, vec!["Cieľ"]);
        assert_eq!(analysis.dates[0].resolved_date.as_deref(), Some("2026-09-20"));
        assert_eq!(analysis.open_task_count, Some(3));
        assert_eq!(analysis.summary_bullets, vec!["bod 1"]);
    }

    #[test]
    fn parse_rewrite_uses_fallbacks() {
        let parsed = parse_rewrite_result(
            &json!({ "output": "Hello." }),
            "rephrase_professional",
            "hi",
        );
        assert_eq!(parsed.output, "Hello.");
        assert_eq!(parsed.mode, "rephrase_professional");
        assert_eq!(parsed.original, "hi");
    }

    #[test]
    fn parse_keywords_flattens_phrase_objects() {
        let parsed = parse_keywords_result(&json!({
            "keywords": [{"term": "note", "score": 1.0, "count": 4}],
            "keyphrases": [{"phrase": "local ai", "count": 2}]
        }));
        assert_eq!(parsed.keywords[0].term, "note");
        assert_eq!(parsed.keyphrases, vec!["local ai"]);
    }

    #[test]
    fn parse_sentiment_and_language() {
        let sentiment = parse_sentiment(&json!({
            "label": "negative",
            "score": -0.4,
            "positiveHits": 0,
            "negativeHits": 2,
            "confidence": 0.8
        }));
        assert_eq!(sentiment.label, "negative");
        assert_eq!(sentiment.negative_hits, 2);
        let language = parse_language(&json!({ "language": "en", "confidence": 0.7 }));
        assert_eq!(language.language, "en");
    }

    #[test]
    fn parse_query_rewrite_and_spellcheck() {
        let query = parse_query_rewrite(&json!({
            "query": "note",
            "rewritten": "note memo",
            "expansions": ["memo"]
        }));
        assert_eq!(query.expansions, vec!["memo"]);
        let spell = parse_spellcheck(&json!({
            "language": "en",
            "issues": [{"word": "teh", "offset": 0, "suggestions": ["the"]}]
        }));
        assert_eq!(spell.issues[0].suggestions, vec!["the"]);
    }
}
