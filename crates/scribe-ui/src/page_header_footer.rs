//! Page header / footer text resolution for export (`src/lib/editor/page-header-footer.ts`).
//!
//! i18n is injected: callers pass the `pagination.summary` template and the UI language
//! instead of this module reaching for a global translator.

use chrono::{Datelike, Local, NaiveDate};
use serde::{Deserialize, Serialize};

use crate::document_style_presets::PageHeaderFooter;

/// `pagination.summary` fallback templates (`{{current}}` / `{{total}}` placeholders).
pub const PAGINATION_SUMMARY_EN: &str = "Page {{current}} / {{total}}";
pub const PAGINATION_SUMMARY_SK: &str = "Strana {{current}} / {{total}}";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct HeaderFooterContext {
    pub title: String,
    pub page: u32,
    pub pages: u32,
    pub date: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct HeaderFooterLines {
    pub header: String,
    pub footer: String,
}

/// Replace `{title}`, `{page}`, `{pages}`, `{date}` (in that order) and trim.
pub fn resolve_header_footer_template(template: &str, context: &HeaderFooterContext) -> String {
    template
        .replace("{title}", &context.title)
        .replace("{page}", &context.page.to_string())
        .replace("{pages}", &context.pages.to_string())
        .replace("{date}", &context.date)
        .trim()
        .to_string()
}

/// Interpolate `{{current}}` / `{{total}}` into a pagination summary template.
pub fn format_pagination_summary(template: &str, current: u32, total: u32) -> String {
    template
        .replace("{{current}}", &current.to_string())
        .replace("{{total}}", &total.to_string())
}

/// Pagination summary template for a UI language (`sk*` → Slovak, else English).
pub fn pagination_summary_template(language: &str) -> &'static str {
    if language.starts_with("sk") {
        PAGINATION_SUMMARY_SK
    } else {
        PAGINATION_SUMMARY_EN
    }
}

/// Header / footer strings for one page. `pagination_summary` is the translated
/// `pagination.summary` template; the page label is appended to the footer with ` · `.
pub fn build_header_footer_lines(
    config: &PageHeaderFooter,
    context: &HeaderFooterContext,
    pagination_summary: &str,
) -> HeaderFooterLines {
    if !config.enabled {
        return HeaderFooterLines { header: String::new(), footer: String::new() };
    }

    let header = resolve_header_footer_template(&config.header_text, context);
    let footer_base = resolve_header_footer_template(&config.footer_text, context);
    let page_label = if config.show_page_number {
        format_pagination_summary(pagination_summary, context.page, context.pages)
    } else {
        String::new()
    };
    let footer = [footer_base, page_label]
        .into_iter()
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join(" · ");

    HeaderFooterLines { header, footer }
}

const MONTHS_EN: [&str; 12] = [
    "January", "February", "March", "April", "May", "June", "July", "August", "September",
    "October", "November", "December",
];
/// Genitive forms, as used in `10. októbra 2026`.
const MONTHS_SK: [&str; 12] = [
    "januára", "februára", "marca", "apríla", "mája", "júna", "júla", "augusta", "septembra",
    "októbra", "novembra", "decembra",
];

/// `toLocaleDateString` with `{ day: 'numeric', month: 'long', year: 'numeric' }`:
/// `sk*` → `10. októbra 2026` (sk-SK), anything else → `October 10, 2026` (en-US).
pub fn format_export_date(date: NaiveDate, language: &str) -> String {
    let month = date.month0() as usize;
    if language.starts_with("sk") {
        format!("{}. {} {}", date.day(), MONTHS_SK[month], date.year())
    } else {
        format!("{} {}, {}", MONTHS_EN[month], date.day(), date.year())
    }
}

/// [`format_export_date`] for today's local date.
pub fn format_export_date_today(language: &str) -> String {
    format_export_date(Local::now().date_naive(), language)
}

/// px at 96dpi → jsPDF points (72dpi), rounded like JS `Math.round`.
pub fn px_to_pt(px: f64) -> i32 {
    (px * 0.75 + 0.5).floor() as i32
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ctx() -> HeaderFooterContext {
        HeaderFooterContext { title: "My Note".into(), page: 2, pages: 5, date: "today".into() }
    }

    fn config(enabled: bool, show_page_number: bool) -> PageHeaderFooter {
        PageHeaderFooter {
            enabled,
            header_text: "  {title} — {date} ".into(),
            footer_text: "p{page}/{pages}".into(),
            show_page_number,
        }
    }

    #[test]
    fn resolves_placeholders_and_trims() {
        assert_eq!(
            resolve_header_footer_template("  {title} {page}/{pages} {date} ", &ctx()),
            "My Note 2/5 today"
        );
        assert_eq!(resolve_header_footer_template("{title}{title}", &ctx()), "My NoteMy Note");
        assert_eq!(resolve_header_footer_template("plain", &ctx()), "plain");
    }

    #[test]
    fn disabled_yields_empty() {
        let lines = build_header_footer_lines(&config(false, true), &ctx(), PAGINATION_SUMMARY_EN);
        assert_eq!(lines, HeaderFooterLines { header: String::new(), footer: String::new() });
    }

    #[test]
    fn footer_appends_page_label() {
        let lines = build_header_footer_lines(&config(true, true), &ctx(), PAGINATION_SUMMARY_EN);
        assert_eq!(lines.header, "My Note — today");
        assert_eq!(lines.footer, "p2/5 · Page 2 / 5");

        let sk = build_header_footer_lines(&config(true, true), &ctx(), pagination_summary_template("sk-SK"));
        assert_eq!(sk.footer, "p2/5 · Strana 2 / 5");

        let none = build_header_footer_lines(&config(true, false), &ctx(), PAGINATION_SUMMARY_EN);
        assert_eq!(none.footer, "p2/5");
    }

    #[test]
    fn empty_footer_text_shows_only_label() {
        let mut c = config(true, true);
        c.footer_text = "   ".into();
        let lines = build_header_footer_lines(&c, &ctx(), PAGINATION_SUMMARY_EN);
        assert_eq!(lines.footer, "Page 2 / 5");
    }

    #[test]
    fn formats_dates() {
        let d = NaiveDate::from_ymd_opt(2026, 10, 3).unwrap();
        assert_eq!(format_export_date(d, "en"), "October 3, 2026");
        assert_eq!(format_export_date(d, "sk"), "3. októbra 2026");
        assert_eq!(format_export_date(d, "de"), "October 3, 2026");
        assert!(!format_export_date_today("en").is_empty());
    }

    #[test]
    fn converts_px_to_pt() {
        assert_eq!(px_to_pt(96.0), 72);
        assert_eq!(px_to_pt(10.0), 8); // 7.5 → 8 like Math.round
        assert_eq!(px_to_pt(0.0), 0);
    }

    #[test]
    fn serde_camel_case() {
        let v = serde_json::to_value(ctx()).unwrap();
        assert_eq!(v["pages"], 5);
        let lines: HeaderFooterLines = serde_json::from_str(r#"{"header":"h","footer":"f"}"#).unwrap();
        assert_eq!(lines.header, "h");
    }
}
