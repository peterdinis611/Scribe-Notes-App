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
