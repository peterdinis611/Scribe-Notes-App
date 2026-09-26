//! Core load / stress smoke for scribe-core hot paths.
//!
//! Default `cargo test -p scribe-core --test load_core` runs a small smoke profile
//! (fast enough for CI). Heavy profile:
//!
//! ```bash
//! SCRIBE_LOAD=1 cargo test -p scribe-core --test load_core -- --nocapture
//! ```

use std::env;
use std::time::Instant;

use scribe_core::db::test_helpers::{in_memory_conn, seed_document, seed_folder};
use scribe_core::db::{fuse_search_hits, search_documents_in_conn, SearchHit};
use scribe_core::{diff_lines, merge_chapters, tiptap_to_markdown, tiptap_to_plain_text};

fn load_enabled() -> bool {
    matches!(
        env::var("SCRIBE_LOAD").as_deref(),
        Ok("1") | Ok("true") | Ok("yes")
    )
}

fn profile() -> LoadProfile {
    if load_enabled() {
        LoadProfile {
            docs: 800,
            paragraphs_per_doc: 40,
            search_rounds: 40,
            diff_lines: 4_000,
            chapters: 40,
            max_search_ms: 2_500,
            max_seed_ms: 25_000,
            max_diff_ms: 3_000,
            max_merge_ms: 2_000,
            max_convert_ms: 2_000,
        }
    } else {
        LoadProfile {
            docs: 60,
            paragraphs_per_doc: 8,
            search_rounds: 8,
            diff_lines: 400,
            chapters: 8,
            max_search_ms: 1_500,
            max_seed_ms: 8_000,
            max_diff_ms: 1_500,
            max_merge_ms: 1_000,
            max_convert_ms: 1_000,
        }
    }
}

struct LoadProfile {
    docs: usize,
    paragraphs_per_doc: usize,
    search_rounds: usize,
    diff_lines: usize,
    chapters: usize,
    max_search_ms: u128,
    max_seed_ms: u128,
    max_diff_ms: u128,
    max_merge_ms: u128,
    max_convert_ms: u128,
}

fn tip_tap_body(title: &str, paragraphs: usize) -> String {
    let mut nodes = Vec::with_capacity(paragraphs + 1);
    nodes.push(format!(
        r#"{{"type":"heading","attrs":{{"level":1}},"content":[{{"type":"text","text":"{title}"}}]}}"#
    ));
    for index in 0..paragraphs {
        nodes.push(format!(
            r#"{{"type":"paragraph","content":[{{"type":"text","text":"Paragraph {index} about deadlines, wiki links, and local AI search for {title}."}}]}}"#
        ));
    }
    format!(r#"{{"type":"doc","content":[{}]}}"#, nodes.join(","))
}

fn elapsed_ms(started: Instant) -> u128 {
    started.elapsed().as_millis()
}

#[test]
fn load_seed_and_fts_search() {
    let p = profile();
    let conn = in_memory_conn();
    seed_folder(&conn, "folder-root", "Load", None);

    let seed_started = Instant::now();
    for index in 0..p.docs {
        let id = format!("doc-{index}");
        let title = format!("Note {index} project Acme");
        let content = tip_tap_body(&title, p.paragraphs_per_doc);
        seed_document(&conn, &id, &title, &content, Some("folder-root"));
    }
    let seed_ms = elapsed_ms(seed_started);
    eprintln!(
        "[load] seeded {} docs ({} paragraphs each) in {seed_ms}ms",
        p.docs, p.paragraphs_per_doc
    );
    assert!(
        seed_ms < p.max_seed_ms,
        "seed too slow: {seed_ms}ms >= {}ms",
        p.max_seed_ms
    );

    let search_started = Instant::now();
    let mut hit_total = 0usize;
    for round in 0..p.search_rounds {
        let query = if round % 2 == 0 {
            "deadlines"
        } else {
            "Acme"
        };
        let hits = search_documents_in_conn(&conn, query, 20).expect("search");
        hit_total += hits.len();
    }
    let search_ms = elapsed_ms(search_started);
    eprintln!(
        "[load] {} search rounds → {hit_total} hits in {search_ms}ms",
        p.search_rounds
    );
    assert!(hit_total > 0, "expected FTS hits");
    assert!(
        search_ms < p.max_search_ms,
        "search too slow: {search_ms}ms >= {}ms",
        p.max_search_ms
    );
}

#[test]
fn load_rrf_fuse_large_lists() {
    let n = if load_enabled() { 2_000 } else { 200 };
    let fts: Vec<SearchHit> = (0..n)
        .map(|index| SearchHit {
            document_id: format!("d{index}"),
            title: format!("Title {index}"),
            snippet: "snippet".into(),
            rank: index as f64 * 0.01,
            match_kind: None,
            chunk_index: None,
        })
        .collect();
    let semantic: Vec<SearchHit> = (0..n)
        .rev()
        .map(|index| SearchHit {
            document_id: format!("d{index}"),
            title: format!("Title {index}"),
            snippet: "semantic".into(),
            rank: (n - index) as f64 * 0.01,
            match_kind: None,
            chunk_index: Some(0),
        })
        .collect();

    let started = Instant::now();
    let fused = fuse_search_hits(&fts, &semantic, 50);
    let ms = elapsed_ms(started);
    eprintln!("[load] RRF fuse {n}+{n} → {} in {ms}ms", fused.len());
    assert_eq!(fused.len(), 50);
    assert!(ms < 500, "RRF fuse too slow: {ms}ms");
}

#[test]
fn load_diff_and_side_by_side() {
    let p = profile();
    let old: String = (0..p.diff_lines)
        .map(|i| format!("line {i} alpha\n"))
        .collect();
    let mut new = old.clone();
    new.push_str("line extra omega\n");
    // mutate a middle band
    new = new.replacen("line 10 alpha", "line 10 beta", 1);

    let started = Instant::now();
    let result = diff_lines(&old, &new);
    let ms = elapsed_ms(started);
    eprintln!(
        "[load] diff {} lines → +{} -{} side_by_side={} in {ms}ms",
        p.diff_lines,
        result.added,
        result.removed,
        result.side_by_side_rows.len()
    );
    assert!(result.added >= 1);
    assert!(result.removed >= 1);
    assert!(!result.side_by_side_rows.is_empty());
    assert!(
        ms < p.max_diff_ms,
        "diff too slow: {ms}ms >= {}ms",
        p.max_diff_ms
    );
}

#[test]
fn load_merge_chapters_and_convert() {
    let p = profile();
    let chapters: Vec<(String, String)> = (0..p.chapters)
        .map(|index| {
            let title = format!("Chapter {index}");
            (title.clone(), tip_tap_body(&title, p.paragraphs_per_doc))
        })
        .collect();

    let merge_started = Instant::now();
    let merged = merge_chapters(&chapters).expect("merge");
    let merge_ms = elapsed_ms(merge_started);
    eprintln!(
        "[load] merge {} chapters in {merge_ms}ms ({} bytes)",
        p.chapters,
        merged.len()
    );
    assert!(
        merge_ms < p.max_merge_ms,
        "merge too slow: {merge_ms}ms >= {}ms",
        p.max_merge_ms
    );

    let convert_started = Instant::now();
    let plain = tiptap_to_plain_text(&merged);
    let md = tiptap_to_markdown(&merged);
    let convert_ms = elapsed_ms(convert_started);
    eprintln!(
        "[load] convert plain={} md={} chars in {convert_ms}ms",
        plain.len(),
        md.len()
    );
    assert!(plain.contains("Chapter 0"));
    assert!(md.contains("# Chapter 0"));
    assert!(
        convert_ms < p.max_convert_ms,
        "convert too slow: {convert_ms}ms >= {}ms",
        p.max_convert_ms
    );
}
