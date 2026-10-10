use scribe_ui::{
    app_version_info,
    build_ics_calendar as build_ics,
    can_nest_folder as nest_ok,
    clamp_editor_panel_width as clamp_editor,
    clamp_sidebar_width as clamp_sidebar,
    color_for_export as export_color,
    color_for_tag as tag_color,
    document_matches_smart_filter as matches_filter,
    flashcards_to_anki_tsv as anki_tsv,
    flashcards_to_markdown as cards_md,
    fuzzy_rank_strings as rank_strings,
    generate_random_theme as gen_theme,
    move_id_before as reorder_before,
    next_editor_panel_width_on_double_click as panel_dblclick,
    normalize_ui_skin as norm_skin,
    sanitize_snippet as clean_snippet,
    settings_section_ids, ui_manifest, AppVersionInfo, ColorScheme, FlashcardInput, FolderNestNode,
    FuzzyRankHit, FuzzyRankItem, IcsEventInput, LibrarySmartFilter, SmartFilterDoc,
    SmartFilterOptions, ThemeColors, UiManifest,
};

#[tauri::command]
pub fn get_ui_manifest() -> UiManifest {
    ui_manifest()
}

#[tauri::command]
pub fn get_app_version_info() -> AppVersionInfo {
    app_version_info()
}

#[tauri::command]
pub fn list_settings_section_ids() -> Vec<String> {
    settings_section_ids()
}

#[tauri::command]
pub fn generate_random_theme(scheme: Option<String>) -> ThemeColors {
    let parsed = scheme.as_deref().and_then(|value| match value {
        "light" => Some(ColorScheme::Light),
        "dark" => Some(ColorScheme::Dark),
        _ => None,
    });
    gen_theme(parsed)
}

#[tauri::command]
pub fn build_ics_calendar(events: Vec<IcsEventInput>, calendar_name: Option<String>) -> String {
    build_ics(&events, calendar_name.as_deref().unwrap_or("Scribe"))
}

#[tauri::command]
pub fn fuzzy_rank_strings(
    items: Vec<FuzzyRankItem>,
    query: String,
    limit: Option<usize>,
) -> Vec<FuzzyRankHit> {
    rank_strings(&items, &query, limit)
}

#[tauri::command]
pub fn color_for_tag(tag: String) -> String {
    tag_color(&tag)
}

#[tauri::command]
pub fn sanitize_snippet(html: String) -> String {
    clean_snippet(&html)
}

#[tauri::command]
pub fn color_for_export(color: String, background: Option<String>) -> String {
    export_color(&color, background.as_deref().unwrap_or("#ffffff"))
}

#[tauri::command]
pub fn flashcards_to_anki_tsv(cards: Vec<FlashcardInput>) -> String {
    anki_tsv(&cards)
}

#[tauri::command]
pub fn flashcards_to_markdown(cards: Vec<FlashcardInput>, title: Option<String>) -> String {
    cards_md(&cards, title.as_deref())
}

#[tauri::command]
pub fn move_id_before(ids: Vec<String>, from_id: String, to_id: String) -> Vec<String> {
    reorder_before(&ids, &from_id, &to_id)
}

#[tauri::command]
pub fn can_nest_folder(
    drag_id: String,
    target_id: Option<String>,
    folders: Vec<FolderNestNode>,
) -> bool {
    nest_ok(&drag_id, target_id.as_deref(), &folders)
}

#[tauri::command]
pub fn normalize_ui_skin(value: String) -> String {
    norm_skin(&value).as_id().to_string()
}

#[tauri::command]
pub fn is_ui_skin(value: String) -> bool {
    scribe_ui::is_ui_skin(&value)
}

#[tauri::command]
pub fn document_matches_smart_filter(
    doc: SmartFilterDoc,
    filter: String,
    options: Option<SmartFilterOptions>,
) -> bool {
    let parsed = LibrarySmartFilter::parse_id(&filter).unwrap_or(LibrarySmartFilter::None);
    matches_filter(&doc, parsed, &options.unwrap_or_default())
}

#[tauri::command]
pub fn clamp_sidebar_width(value: f64, viewport_width: Option<i32>) -> i32 {
    clamp_sidebar(value, viewport_width.unwrap_or(1440))
}

#[tauri::command]
pub fn clamp_editor_panel_width(
    value: f64,
    viewport_width: Option<i32>,
    sidebar_width: Option<i32>,
    min_width: Option<i32>,
) -> i32 {
    clamp_editor(
        value,
        viewport_width.unwrap_or(1440),
        sidebar_width.unwrap_or(scribe_ui::SIDEBAR_WIDTH_DEFAULT),
        min_width.unwrap_or(scribe_ui::EDITOR_PANEL_WIDTH_MIN),
    )
}

#[tauri::command]
pub fn next_editor_panel_width_on_double_click(
    current: i32,
    viewport_width: Option<i32>,
    sidebar_width: Option<i32>,
    min_width: Option<i32>,
) -> i32 {
    panel_dblclick(
        current,
        viewport_width.unwrap_or(1440),
        sidebar_width.unwrap_or(scribe_ui::SIDEBAR_WIDTH_DEFAULT),
        min_width.unwrap_or(scribe_ui::EDITOR_PANEL_WIDTH_MIN),
    )
}

#[tauri::command]
pub fn hotkey_to_display_keys(hotkey: String) -> Vec<String> {
    scribe_ui::hotkey_to_display_keys(&hotkey)
}

#[tauri::command]
pub fn parse_ui_tag(raw: String) -> scribe_ui::ParsedTag {
    scribe_ui::parse_tag(&raw)
}

#[tauri::command]
pub fn document_matches_meta_filters_ui(
    tags: Vec<String>,
    filters: scribe_ui::MetaFilters,
) -> bool {
    scribe_ui::document_matches_meta_filters(&tags, &filters)
}

#[tauri::command]
pub fn resolve_page_layout_ui(
    paper_id: String,
    margins: scribe_ui::PageMargins,
    header_footer_reserve: Option<f64>,
) -> scribe_ui::ResolvedPageLayout {
    scribe_ui::resolve_page_layout(&paper_id, &margins, header_footer_reserve.unwrap_or(0.0))
}

#[tauri::command]
pub fn tiptap_json_to_markdown_ui(content_json: String, title: String) -> String {
    scribe_ui::tiptap_json_to_markdown(&content_json, &title)
}

#[tauri::command]
pub fn flatten_folders_for_picker_ui(
    folders: Vec<scribe_ui::FolderNode>,
) -> Vec<scribe_ui::FolderPickerItem> {
    scribe_ui::flatten_folders_for_picker(&folders)
}

#[tauri::command]
pub fn filter_diff_lines_ui(
    lines: Vec<scribe_ui::DiffLine>,
    changes_only: bool,
    context_lines: Option<usize>,
) -> Vec<scribe_ui::DiffLine> {
    match context_lines {
        Some(n) => scribe_ui::filter_diff_lines_with_context(&lines, changes_only, n),
        None => scribe_ui::filter_diff_lines(&lines, changes_only),
    }
}

#[tauri::command]
pub fn analyze_graph_density_ui(
    seed_count: usize,
    edge_count: usize,
    orphan_count: usize,
) -> scribe_ui::GraphDensity {
    scribe_ui::analyze_graph_density(seed_count, edge_count, orphan_count)
}

#[tauri::command]
pub fn is_untitled_orphan_title_ui(title: String) -> bool {
    scribe_ui::is_untitled_orphan_title(&title)
}

#[tauri::command]
pub fn to_global_shortcut_accelerator_ui(hotkey: String) -> String {
    scribe_ui::to_global_shortcut_accelerator(&hotkey)
}

#[tauri::command]
pub fn compute_journal_streak_ui(noted_dates: Vec<String>, today: Option<String>) -> usize {
    let today = today.unwrap_or_else(scribe_ui::format_date_key_today);
    scribe_ui::compute_journal_streak(&noted_dates, &today)
}

#[tauri::command]
pub fn format_week_key_ui(year: i32, month: u32, day: u32) -> Option<String> {
    scribe_ui::format_week_key(year, month, day)
}

#[tauri::command]
pub fn current_week_range_ui(year: i32, month: u32, day: u32) -> Option<(String, String)> {
    scribe_ui::current_week_range(year, month, day)
}

#[tauri::command]
pub fn build_revision_compare_options_ui(
    revisions: Vec<scribe_ui::RevisionInput>,
    current_updated_at: i64,
    current_label: Option<String>,
) -> Vec<scribe_ui::RevisionCompareOption> {
    scribe_ui::build_revision_compare_options(
        &revisions,
        current_updated_at,
        current_label.as_deref().unwrap_or("Aktuálna verzia"),
    )
}

#[tauri::command]
pub fn normalize_compare_pair_ui(
    version_a_id: String,
    version_b_id: String,
    revisions: Vec<scribe_ui::RevisionInput>,
    current_updated_at: i64,
) -> (String, String) {
    scribe_ui::normalize_compare_pair(
        &version_a_id,
        &version_b_id,
        &revisions,
        current_updated_at,
    )
}

#[tauri::command]
pub fn bump_semver_ui(version: String, bump: String) -> String {
    let parsed = match bump.as_str() {
        "major" => scribe_ui::VersionBump::Major,
        "minor" => scribe_ui::VersionBump::Minor,
        "keep" => scribe_ui::VersionBump::Keep,
        _ => scribe_ui::VersionBump::Patch,
    };
    scribe_ui::bump_semver(&version, parsed)
}

#[tauri::command]
pub fn compare_semver_ui(a: String, b: String) -> i32 {
    scribe_ui::compare_semver(&a, &b)
}

#[tauri::command]
pub fn parse_template_pack_ui(raw: String) -> Result<scribe_ui::TemplatePack, String> {
    scribe_ui::parse_template_pack_str(&raw).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn serialize_template_pack_ui(pack: scribe_ui::TemplatePack) -> String {
    scribe_ui::serialize_template_pack(&pack)
}

#[tauri::command]
pub fn generate_lorem_ipsum_ui(
    unit: String,
    count: u32,
    start_with_lorem: Option<bool>,
) -> String {
    let unit = match unit.as_str() {
        "words" => scribe_ui::LoremUnit::Words,
        "sentences" => scribe_ui::LoremUnit::Sentences,
        _ => scribe_ui::LoremUnit::Paragraphs,
    };
    let opts = scribe_ui::LoremOptions {
        unit,
        count,
        start_with_lorem: start_with_lorem.unwrap_or(true),
    };
    scribe_ui::generate_lorem_ipsum(&opts)
}

#[tauri::command]
pub fn sanitize_file_name_ui(name: String, ext: Option<String>) -> String {
    scribe_ui::sanitize_file_name(&name, ext.as_deref().unwrap_or(""))
}

#[tauri::command]
pub fn locale_section_groups_ui() -> Vec<scribe_ui::LocaleSectionGroup> {
    scribe_ui::locale_section_groups()
}

#[tauri::command]
pub fn ui_font_presets_ui() -> Vec<scribe_ui::UiFontPreset> {
    scribe_ui::ui_font_presets()
}

#[tauri::command]
pub fn extract_title_from_content_ui(content_json: String, fallback: Option<String>) -> String {
    match fallback {
        Some(fb) => scribe_ui::extract_title_from_content_with_fallback(&content_json, &fb),
        None => scribe_ui::extract_title_from_content(&content_json),
    }
}

#[tauri::command]
pub fn count_words_ui(content_json: String) -> usize {
    scribe_ui::count_words(&content_json)
}

#[tauri::command]
pub fn count_characters_ui(content_json: String) -> usize {
    scribe_ui::count_characters(&content_json)
}

#[tauri::command]
pub fn collect_headings_from_json_ui(content_json: String) -> Vec<String> {
    scribe_ui::collect_headings_from_json(&content_json)
}

#[tauri::command]
pub fn plain_text_to_content_json_ui(text: String) -> String {
    scribe_ui::plain_text_to_content_json(&text)
}

#[tauri::command]
pub fn title_from_html_ui(html: String, fallback: String) -> String {
    scribe_ui::title_from_html(&html, &fallback)
}

#[tauri::command]
pub fn validate_snippet_input_ui(
    input: scribe_ui::ValidateSnippetInput,
    existing_custom_count: Option<usize>,
    is_update: Option<bool>,
) -> serde_json::Value {
    serde_json::to_value(scribe_ui::validate_snippet_input(
        &input,
        existing_custom_count,
        is_update.unwrap_or(false),
    ))
    .unwrap_or(serde_json::json!({ "ok": false }))
}

#[tauri::command]
pub fn is_video_url_ui(value: String) -> bool {
    scribe_ui::is_video_url(&value)
}

#[tauri::command]
pub fn video_provider_label_ui(src: String) -> String {
    scribe_ui::video_provider_label(&src)
}

#[tauri::command]
pub fn video_export_embed_ui(src: String) -> scribe_ui::VideoExportEmbed {
    scribe_ui::video_export_embed(&src)
}

#[tauri::command]
pub fn document_style_presets_ui() -> Vec<scribe_ui::DocumentStylePreset> {
    scribe_ui::document_style_presets()
}

#[tauri::command]
pub fn apply_document_style_preset_ui(id: String) -> scribe_ui::PageSetup {
    scribe_ui::apply_document_style_preset(&id)
}

#[tauri::command]
pub fn parse_canvas_document_ui(content_json: String) -> Option<scribe_ui::CanvasDocument> {
    scribe_ui::parse_canvas_document(&content_json)
}

#[tauri::command]
pub fn serialize_canvas_document_ui(doc: scribe_ui::CanvasDocument) -> String {
    scribe_ui::serialize_canvas_document(&doc)
}

#[tauri::command]
pub fn promote_markdown_special_blocks_ui(doc: serde_json::Value) -> serde_json::Value {
    scribe_ui::promote_markdown_special_blocks(&doc)
}

#[tauri::command]
pub fn collect_markdown_heading_outline_ui(markdown: String) -> serde_json::Value {
    serde_json::to_value(scribe_ui::collect_markdown_heading_outline(&markdown))
        .unwrap_or(serde_json::json!([]))
}

#[tauri::command]
pub fn parse_map_spec_ui(source: String) -> Result<serde_json::Value, String> {
    scribe_ui::parse_map_spec(&source).and_then(|spec| {
        serde_json::to_value(spec).map_err(|e| e.to_string())
    })
}

#[tauri::command]
pub fn import_title_from_path_ui(path: String, fallback: String) -> String {
    scribe_ui::import_title_from_path(&path, &fallback)
}

#[tauri::command]
pub fn is_pages_path_ui(path: String) -> bool {
    scribe_ui::is_pages_path(&path)
}

#[tauri::command]
pub fn theme_preset_ids_ui() -> Vec<String> {
    scribe_ui::theme_preset_ids()
}

#[tauri::command]
pub fn suggest_orphan_links_ui(
    rows: Vec<scribe_ui::OrphanSuggestionRow>,
) -> Vec<scribe_ui::OrphanLinkSuggestion> {
    scribe_ui::suggest_orphan_links(&rows)
}

#[tauri::command]
pub fn resolve_color_ui(color: String, tokens: scribe_ui::ColorTokens) -> String {
    scribe_ui::resolve_color(&color, &tokens)
}
