use serde_json::Value;

use super::types::{
    NlpAnswer, NlpCitation, NlpDateEvent, NlpDates, NlpDiffSummary, NlpDocumentAnalysis,
    NlpEntities, NlpEntity, NlpExtractedTask, NlpKeyword, NlpKeywordsResult, NlpLanguage,
    NlpMentionEdge, NlpMentionLink, NlpMentions, NlpOrganize, NlpOrganizeSuggestion, NlpOutline,
    NlpOutlineItem, NlpQueryRewrite, NlpReadingStats, NlpRewriteResult, NlpSentiment,
    NlpChunks, NlpDuplicatePair, NlpDuplicates, NlpLibraryReport, NlpSpellIssue, NlpSpellcheck,
    NlpSummary, NlpTasks, NlpTemplateHints, NlpTitleSuggestion, NlpWikiSuggestion,
    NlpWikiSuggestions,
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

pub fn parse_entities(result: &Value) -> NlpEntities {
    let entities = result
        .get("entities")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| {
                    Some(NlpEntity {
                        text: as_str(item.get("text")?)?.to_string(),
                        kind: as_str(item.get("kind")?)?.to_string(),
                    })
                })
                .collect()
        })
        .unwrap_or_default();
    NlpEntities {
        entities,
        tag_suggestions: string_list(result.get("tagSuggestions")),
        language: result.get("language").and_then(as_str).map(str::to_string),
    }
}

pub fn parse_mentions(result: &Value) -> NlpMentions {
    let markdown_links = result
        .get("markdownLinks")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| {
                    Some(NlpMentionLink {
                        label: item
                            .get("label")
                            .and_then(Value::as_str)
                            .unwrap_or("")
                            .to_string(),
                        href: as_str(item.get("href")?)?.to_string(),
                    })
                })
                .collect()
        })
        .unwrap_or_default();
    let edges: Vec<NlpMentionEdge> = result
        .get("edges")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| {
                    Some(NlpMentionEdge {
                        kind: as_str(item.get("kind")?)?.to_string(),
                        target: as_str(item.get("target")?)?.to_string(),
                    })
                })
                .collect()
        })
        .unwrap_or_default();
    let edge_count = result
        .get("edgeCount")
        .and_then(Value::as_i64)
        .unwrap_or(edges.len() as i64);
    NlpMentions {
        wiki_links: string_list(result.get("wikiLinks")),
        mentions: string_list(result.get("mentions")),
        hosts: string_list(result.get("hosts")),
        markdown_links,
        edges,
        edge_count,
    }
}

pub fn parse_tasks(result: &Value) -> NlpTasks {
    let tasks: Vec<NlpExtractedTask> = result
        .get("tasks")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| {
                    Some(NlpExtractedTask {
                        text: as_str(item.get("text")?)?.to_string(),
                        checked: item
                            .get("checked")
                            .and_then(Value::as_bool)
                            .unwrap_or(false),
                        source: item
                            .get("source")
                            .and_then(as_str)
                            .unwrap_or("phrase")
                            .to_string(),
                        due_hint: item.get("dueHint").and_then(as_str).map(str::to_string),
                    })
                })
                .collect()
        })
        .unwrap_or_default();
    let open_count = result
        .get("openCount")
        .and_then(Value::as_i64)
        .unwrap_or_else(|| tasks.iter().filter(|task| !task.checked).count() as i64);
    NlpTasks { tasks, open_count }
}

pub fn parse_outline_result(result: &Value) -> NlpOutline {
    let items = parse_outline(result.get("items"));
    NlpOutline {
        count: result
            .get("count")
            .and_then(Value::as_i64)
            .unwrap_or(items.len() as i64),
        items,
    }
}

pub fn parse_dates_result(result: &Value) -> NlpDates {
    let events = parse_dates(Some(result));
    NlpDates {
        count: result
            .get("count")
            .and_then(Value::as_i64)
            .unwrap_or(events.len() as i64),
        events,
    }
}

pub fn parse_summary(result: &Value) -> NlpSummary {
    NlpSummary {
        summary: result
            .get("summary")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string(),
        bullets: string_list(result.get("bullets")),
    }
}

pub fn parse_diff_summary(result: &Value) -> NlpDiffSummary {
    NlpDiffSummary {
        summary: result
            .get("summary")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string(),
        added_sentences: string_list(result.get("addedSentences")),
        removed_sentences: string_list(result.get("removedSentences")),
        gained_terms: string_list(result.get("gainedTerms")),
        lost_terms: string_list(result.get("lostTerms")),
        change_ratio: result
            .get("changeRatio")
            .and_then(Value::as_f64)
            .unwrap_or(0.0),
        old_word_count: result
            .get("oldWordCount")
            .and_then(Value::as_i64)
            .unwrap_or(0),
        new_word_count: result
            .get("newWordCount")
            .and_then(Value::as_i64)
            .unwrap_or(0),
        document_id: result
            .get("documentId")
            .and_then(as_str)
            .map(str::to_string),
        title: result.get("title").and_then(as_str).map(str::to_string),
        revision_id: result
            .get("revisionId")
            .and_then(as_str)
            .map(str::to_string),
    }
}

pub fn parse_library_answer(result: &Value) -> NlpAnswer {
    let citations = result
        .get("citations")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| {
                    Some(NlpCitation {
                        document_id: as_str(item.get("documentId")?)?.to_string(),
                        title: item
                            .get("title")
                            .and_then(Value::as_str)
                            .unwrap_or("Untitled")
                            .to_string(),
                        snippet: item
                            .get("snippet")
                            .and_then(Value::as_str)
                            .unwrap_or("")
                            .to_string(),
                    })
                })
                .collect()
        })
        .unwrap_or_default();
    NlpAnswer {
        answer: result
            .get("answer")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string(),
        citations,
        sentences: string_list(result.get("sentences")),
        followups: string_list(result.get("followups")),
        hit_count: result.get("hitCount").and_then(Value::as_i64),
        document_id: result
            .get("documentId")
            .and_then(as_str)
            .map(str::to_string),
        title: result.get("title").and_then(as_str).map(str::to_string),
    }
}

pub fn parse_wiki_suggestions(result: &Value) -> NlpWikiSuggestions {
    let suggestions: Vec<NlpWikiSuggestion> = result
        .get("suggestions")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| {
                    Some(NlpWikiSuggestion {
                        phrase: as_str(item.get("phrase")?)?.to_string(),
                        document_id: as_str(item.get("documentId")?)?.to_string(),
                        title: as_str(item.get("title")?)?.to_string(),
                        score: item.get("score").and_then(Value::as_f64).unwrap_or(0.0),
                        reason: item
                            .get("reason")
                            .and_then(as_str)
                            .unwrap_or("title_match")
                            .to_string(),
                    })
                })
                .collect()
        })
        .unwrap_or_default();
    NlpWikiSuggestions {
        count: result
            .get("count")
            .and_then(Value::as_i64)
            .unwrap_or(suggestions.len() as i64),
        suggestions,
    }
}

pub fn parse_organize(result: &Value) -> NlpOrganize {
    let suggestions: Vec<NlpOrganizeSuggestion> = result
        .get("suggestions")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| {
                    Some(NlpOrganizeSuggestion {
                        folder_id: as_str(item.get("folderId")?)?.to_string(),
                        name: as_str(item.get("name")?)?.to_string(),
                        score: item.get("score").and_then(Value::as_f64).unwrap_or(0.0),
                        reason: item
                            .get("reason")
                            .and_then(as_str)
                            .unwrap_or("match")
                            .to_string(),
                    })
                })
                .collect()
        })
        .unwrap_or_default();
    NlpOrganize {
        count: result
            .get("count")
            .and_then(Value::as_i64)
            .unwrap_or(suggestions.len() as i64),
        suggestions,
        best_folder_id: result
            .get("bestFolderId")
            .and_then(as_str)
            .map(str::to_string),
        best_folder_name: result
            .get("bestFolderName")
            .and_then(as_str)
            .map(str::to_string),
        create_new: result
            .get("createNew")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        document_id: result
            .get("documentId")
            .and_then(as_str)
            .map(str::to_string),
        current_folder_id: result
            .get("currentFolderId")
            .and_then(as_str)
            .map(str::to_string),
        current_tags: string_list(result.get("currentTags")),
    }
}

pub fn parse_duplicates(result: &Value) -> NlpDuplicates {
    let pairs: Vec<NlpDuplicatePair> = result
        .get("pairs")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| {
                    Some(NlpDuplicatePair {
                        left_id: as_str(item.get("leftId")?)?.to_string(),
                        left_title: item
                            .get("leftTitle")
                            .and_then(Value::as_str)
                            .unwrap_or("")
                            .to_string(),
                        right_id: as_str(item.get("rightId")?)?.to_string(),
                        right_title: item
                            .get("rightTitle")
                            .and_then(Value::as_str)
                            .unwrap_or("")
                            .to_string(),
                        score: item.get("score").and_then(Value::as_f64).unwrap_or(0.0),
                        jaccard: item.get("jaccard").and_then(Value::as_f64).unwrap_or(0.0),
                        embed_score: item.get("embedScore").and_then(Value::as_f64).unwrap_or(0.0),
                    })
                })
                .collect()
        })
        .unwrap_or_default();
    NlpDuplicates {
        compared: result
            .get("compared")
            .and_then(Value::as_i64)
            .unwrap_or(0),
        pairs,
    }
}

pub fn parse_template_hints(result: &Value) -> NlpTemplateHints {
    NlpTemplateHints {
        expected: string_list(result.get("expected")),
        present: string_list(result.get("present")),
        missing: string_list(result.get("missing")),
        coverage: result.get("coverage").and_then(Value::as_f64).unwrap_or(0.0),
        complete: result
            .get("complete")
            .and_then(Value::as_bool)
            .unwrap_or(false),
    }
}

pub fn parse_library_report(result: &Value) -> NlpLibraryReport {
    NlpLibraryReport {
        markdown: result
            .get("markdown")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string(),
        stats: result.get("stats").cloned().unwrap_or(Value::Object(Default::default())),
    }
}

pub fn parse_chunks(result: &Value) -> NlpChunks {
    let chunks = string_list(result.get("chunks"));
    NlpChunks {
        count: result
            .get("count")
            .and_then(Value::as_i64)
            .unwrap_or(chunks.len() as i64),
        chunks,
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

    #[test]
    fn parse_entities_mentions_tasks_and_dates() {
        let entities = parse_entities(&json!({
            "entities": [{"text": "Peter", "kind": "person"}],
            "tagSuggestions": ["osoba"],
            "language": "sk"
        }));
        assert_eq!(entities.entities[0].kind, "person");
        assert_eq!(entities.tag_suggestions, vec!["osoba"]);

        let mentions = parse_mentions(&json!({
            "wikiLinks": ["Cieľ"],
            "mentions": ["peter"],
            "hosts": ["example.com"],
            "markdownLinks": [{"label": "Site", "href": "https://example.com"}],
            "edges": [{"kind": "wiki", "target": "Cieľ"}],
            "edgeCount": 1
        }));
        assert_eq!(mentions.wiki_links, vec!["Cieľ"]);
        assert_eq!(mentions.markdown_links[0].href, "https://example.com");

        let tasks = parse_tasks(&json!({
            "tasks": [{
                "text": "Buy milk",
                "checked": false,
                "source": "markdown",
                "dueHint": "2026-09-20"
            }],
            "openCount": 1
        }));
        assert_eq!(tasks.open_count, 1);
        assert_eq!(tasks.tasks[0].due_hint.as_deref(), Some("2026-09-20"));

        let dates = parse_dates_result(&json!({
            "events": [{"text": "zajtra", "kind": "relative", "resolvedDate": "2026-09-20"}],
            "count": 1
        }));
        assert_eq!(dates.events[0].kind, "relative");
    }

    #[test]
    fn parse_summary_diff_answer_wiki_organize() {
        let summary = parse_summary(&json!({
            "summary": "Hello world.",
            "bullets": ["Hello world."]
        }));
        assert_eq!(summary.bullets.len(), 1);

        let diff = parse_diff_summary(&json!({
            "summary": "Added a sentence.",
            "addedSentences": ["New line."],
            "removedSentences": ["Old line."],
            "gainedTerms": ["new"],
            "lostTerms": ["old"],
            "changeRatio": 0.5,
            "oldWordCount": 2,
            "newWordCount": 2
        }));
        assert_eq!(diff.added_sentences, vec!["New line."]);

        let answer = parse_library_answer(&json!({
            "answer": "Based on your notes: Friday.",
            "citations": [{
                "documentId": "d1",
                "title": "Plan",
                "snippet": "due Friday"
            }],
            "sentences": ["due Friday"],
            "followups": ["What else?"]
        }));
        assert_eq!(answer.citations[0].document_id, "d1");

        let wiki = parse_wiki_suggestions(&json!({
            "suggestions": [{
                "phrase": "Target",
                "documentId": "t1",
                "title": "Target",
                "score": 0.9,
                "reason": "title_match"
            }],
            "count": 1
        }));
        assert_eq!(wiki.suggestions[0].document_id, "t1");

        let organize = parse_organize(&json!({
            "suggestions": [{
                "folderId": "f1",
                "name": "Work",
                "score": 3.0,
                "reason": "exact"
            }],
            "count": 1,
            "bestFolderId": "f1",
            "bestFolderName": "Work",
            "createNew": false
        }));
        assert_eq!(organize.best_folder_id.as_deref(), Some("f1"));
    }

    #[test]
    fn parse_duplicates_template_report_chunks() {
        let dups = parse_duplicates(&json!({
            "pairs": [{
                "leftId": "a",
                "leftTitle": "Alpha",
                "rightId": "b",
                "rightTitle": "Beta",
                "score": 0.9,
                "jaccard": 0.8,
                "embedScore": 0.85
            }],
            "compared": 4
        }));
        assert_eq!(dups.compared, 4);
        assert_eq!(dups.pairs[0].left_id, "a");

        let hints = parse_template_hints(&json!({
            "expected": ["Intro", "Outro"],
            "present": ["Intro"],
            "missing": ["Outro"],
            "coverage": 0.5,
            "complete": false
        }));
        assert_eq!(hints.missing, vec!["Outro"]);
        assert!(!hints.complete);

        let report = parse_library_report(&json!({
            "markdown": "# Report",
            "stats": {"documents": 3}
        }));
        assert_eq!(report.markdown, "# Report");
        assert_eq!(report.stats["documents"], 3);

        let chunks = parse_chunks(&json!({
            "chunks": ["one", "two"],
            "count": 2
        }));
        assert_eq!(chunks.chunks.len(), 2);
        assert_eq!(chunks.count, 2);
    }
}
