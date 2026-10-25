pub mod compile;
pub mod dates;
pub mod db;
pub mod db_crypto;
pub mod diff;
pub mod enhance;
pub mod file_antivirus;
pub mod file_integrity;
pub mod html;
pub mod html_paste;
pub mod journal;
pub mod manuscripts;
pub mod nlp;
pub mod office_import;
pub mod markup_import;
pub mod pdf_import;
pub mod xml_import;
pub mod rich_import;
pub mod source_code;
pub mod path;
pub mod plain_text;
pub mod store;
pub mod store_ext;
pub mod storage_fs;
pub mod syntax_highlight;
pub mod tags;
pub mod tasks;
pub mod vault;
pub mod vault_crypto;
pub mod wiki;

pub use compile::merge_chapters;
pub use dates::{date_key_bounds, date_key_bounds_ms, extract_due_hint, parse_date_key};
pub use enhance::{
    decode_bytes, decode_bytes_detailed, enhance_status, fuzzy_extract, fuzzy_ratio, DecodedText,
    EnhanceStatus,
};
pub use file_antivirus::{
    decide_import_gate, detect_engine, gate_import_path, list_quarantine, probe_and_scan_path,
    purge_all_quarantine, purge_quarantine, quarantine_copy, quarantine_file, restore_quarantine,
    scan_bytes, scan_bytes_with, scan_directory, scan_path, scan_path_with, scan_paths,
    scanner_status, self_test, AntivirusEngine, AntivirusPolicy, AntivirusStatus, BatchScanReport,
    FileHealthReport, ImportGateAction, ImportGateDecision, QuarantineEntry, ScanOptions,
    ScanReport, ScanVerdict, SelfTestReport, ThreatHit, DEFAULT_SCAN_TIMEOUT_SECS,
    EICAR_TEST_STRING, QUARANTINE_DIR,
};
pub use file_integrity::{
    detect_kind, is_healthy, probe_bytes, probe_path, FileKind, IntegrityIssue, IntegrityReport,
    IntegrityStatus, MAX_PROBE_BYTES,
};
pub use diff::{
    build_side_by_side_from_lines, diff_lines, diff_words, DiffLine, DiffLineType, DiffResult,
    DiffSegment, DiffSegmentType, SideBySideCell, SideBySideCellKind, SideBySideRow,
};
pub use html::{escape_html, tiptap_to_html};
pub use syntax_highlight::{highlight_code_html, list_syntax_names, supports_language};
pub use html_paste::{looks_like_dirty_html, normalize_clipboard_html, HtmlPasteResult};
pub use journal::{JournalNote, JournalSlot, JournalSummary, JournalSummaryInput};
pub use office_import::{
    csv_bytes_to_tiptap, csv_text_to_tiptap, docx_bytes_to_tiptap, extract_tables_from_tiptap,
    matrix_to_csv, tiptap_to_csv, xlsx_bytes_to_tiptap,
};
pub use markup_import::{
    adoc_text_to_tiptap, eml_text_to_tiptap, fountain_text_to_tiptap, ics_text_to_tiptap,
    is_markup_extension, markdown_to_tiptap, markup_bytes_to_tiptap, org_text_to_tiptap,
    rst_text_to_tiptap, wiki_text_to_tiptap,
};
pub use pdf_import::{pdf_bytes_to_tiptap, pdf_text_to_tiptap};
pub use xml_import::{
    is_xml_document_extension, xml_bytes_to_tiptap, xml_text_to_tiptap,
};
pub use rich_import::{
    epub_bytes_to_tiptap, html_bytes_to_tiptap, html_text_to_tiptap, json_bytes_to_tiptap,
    json_text_to_tiptap, ods_bytes_to_tiptap, odt_bytes_to_tiptap, opml_bytes_to_tiptap,
    opml_text_to_tiptap, pptx_bytes_to_tiptap, rtf_bytes_to_tiptap, rtf_text_to_tiptap,
    tiptap_to_opml, tiptap_to_structured_json,
};
pub use source_code::{
    is_source_extension, language_from_extension, source_bytes_to_tiptap, source_path_to_tiptap,
    source_text_to_tiptap,
};
pub use plain_text::{tiptap_to_markdown, tiptap_to_plain_text};
pub use vault_crypto::{
    create_vault_verifier, decrypt_content_json, encrypt_content_json, is_vault_cipher_json,
    verify_vault_password, VAULT_MARKER as VAULT_CRYPTO_MARKER,
};
pub use store::{search_library, sync_sidecar_backend};
pub use tags::{
    add_document_tag, document_matches_meta_filters, make_meta_tag, parse_meta_tag,
    remove_document_tag, IdTags, MetaFilters, ParsedTag, TagKind, STATUS_TAG_VALUES,
};
pub use wiki::{
    attach_link_suggestions, find_documents_by_title, list_graph_hubs, list_orphan_documents,
    list_stub_documents, list_unresolved_wiki_links, resolve_wiki_link_in_document, wiki_health,
    GraphHub, OrphanDocument, ResolveWikiLinkResult, StubDocument, TitleMatch, UnresolvedWikiLink,
    WikiHealth,
};
pub use manuscripts::{list_manuscripts, upsert_manuscript, ManuscriptRecord};
pub use store_ext::{
    delete_smart_folder_in_conn, evaluate_smart_folder_in_conn, list_smart_folders_in_conn,
    upsert_smart_folder_in_conn, SmartFolderEval, SmartFolderMatch, SmartFolderRecord,
};
pub use vault::{
    content_is_vault_cipher, document_is_vault, require_document_not_vault, vault_document_ids_among,
    McpVaultScope, ERR_VAULT_DENIED, ERR_VAULT_NLP, VAULT_CONTENT_MARKER,
};
pub use nlp::{
    filter_agent_slash_commands, list_agent_slash_commands, match_agent_intents,
    match_document_chat_intent, parse_agent_slash, AgentSlashCommandDef, ParsedAgentSlash,
};
