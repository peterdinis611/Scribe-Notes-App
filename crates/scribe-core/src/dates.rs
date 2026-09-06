//! Shared calendar helpers: journal date keys + lightweight due-date extraction for tasks.

use chrono::{Datelike, Duration, Local, NaiveDate};
use regex::Regex;
use std::sync::OnceLock;

fn absolute_date_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r"\b(\d{4}-\d{2}-\d{2}|\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?)\b")
            .expect("absolute date")
    })
}

fn deadline_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(
            r"(?i)\b(?:do|until|by|deadline|termín|termin|due)\s+(\d{4}-\d{2}-\d{2}|\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?|dnes|today|zajtra|tomorrow|pozajtra|včera|vcera|yesterday|(?:o|za|in)\s+\d{1,3}\s+(?:dní|dni|days?|týždne?|tyzdne?|weeks?|mesiace?|months?)|budúci\s+(?:týždeň|tyzden|mesiac)|buduci\s+(?:tyzden|mesiac)|next\s+(?:week|month)|budúci\s+(?:pondelok|utorok|streda|štvrtok|stvrtok|piatok|sobota|nedeľa|nedela)|buduci\s+(?:pondelok|utorok|streda|stvrtok|piatok|sobota|nedela)|next\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b",
        )
        .expect("deadline")
    })
}

fn relative_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(
            r"(?i)\b(dnes|today|zajtra|tomorrow|pozajtra|včera|vcera|yesterday|budúci\s+(?:týždeň|tyzden|mesiac)|buduci\s+(?:tyzden|mesiac)|next\s+(?:week|month)|tento\s+(?:týždeň|tyzden)|this\s+week|(?:o|za|in)\s+\d{1,3}\s+(?:dní|dni|days?|týždne?|tyzdne?|weeks?|mesiace?|months?)|budúci\s+(?:pondelok|utorok|streda|štvrtok|stvrtok|piatok|sobota|nedeľa|nedela)|buduci\s+(?:pondelok|utorok|streda|stvrtok|piatok|sobota|nedela)|next\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b",
        )
        .expect("relative")
    })
}

fn offset_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(
            r"(?i)^(?:o|za|in)\s+(\d{1,3})\s+(dní|dni|days?|týždne?|tyzdne?|weeks?|mesiace?|months?)$",
        )
        .expect("offset")
    })
}

/// Parse a journal / filter key (`YYYY-MM-DD`).
pub fn parse_date_key(value: &str) -> Result<NaiveDate, String> {
    NaiveDate::parse_from_str(value, "%Y-%m-%d")
        .map_err(|error| format!("Invalid date: {error}"))
}

/// Inclusive UTC second bounds for a date-key range.
pub fn date_key_bounds(from_date: &str, to_date: &str) -> Result<(i64, i64), String> {
    let from = parse_date_key(from_date)?;
    let to = parse_date_key(to_date)?;
    let start = from
        .and_hms_opt(0, 0, 0)
        .ok_or_else(|| "Invalid range start".to_string())?
        .and_utc()
        .timestamp();
    let end = to
        .and_hms_opt(23, 59, 59)
        .ok_or_else(|| "Invalid range end".to_string())?
        .and_utc()
        .timestamp();
    Ok((start, end))
}

/// Inclusive UTC millisecond bounds for a date-key range.
pub fn date_key_bounds_ms(from_date: &str, to_date: &str) -> Result<(i64, i64), String> {
    let (start, end) = date_key_bounds(from_date, to_date)?;
    Ok((start * 1000, end * 1000 + 999))
}

/// Best single due date (ISO `YYYY-MM-DD`) found in task text.
pub fn extract_due_hint(text: &str) -> Option<String> {
    extract_due_hint_on(text, Local::now().date_naive())
}

pub fn extract_due_hint_on(text: &str, today: NaiveDate) -> Option<String> {
    let source = text.trim();
    if source.is_empty() {
        return None;
    }

    let mut best: Option<(u8, NaiveDate)> = None;
    let mut push = |rank: u8, resolved: Option<NaiveDate>| {
        let Some(day) = resolved else {
            return;
        };
        let replace = match best {
            Some((prev_rank, prev_day)) => rank < prev_rank || (rank == prev_rank && day < prev_day),
            None => true,
        };
        if replace {
            best = Some((rank, day));
        }
    };

    for caps in deadline_re().captures_iter(source) {
        let raw = caps.get(1).map(|m| m.as_str()).unwrap_or("");
        push(
            0,
            parse_absolute(raw, today.year()).or_else(|| resolve_relative(raw, today)),
        );
    }
    for caps in relative_re().captures_iter(source) {
        let raw = caps.get(1).map(|m| m.as_str()).unwrap_or("");
        push(1, resolve_relative(raw, today));
    }
    for caps in absolute_date_re().captures_iter(source) {
        let raw = caps.get(1).map(|m| m.as_str()).unwrap_or("");
        push(2, parse_absolute(raw, today.year()));
    }

    best.map(|(_, day)| day.format("%Y-%m-%d").to_string())
}

fn parse_absolute(raw: &str, default_year: i32) -> Option<NaiveDate> {
    let value = raw.trim();
    if value.contains('-') && value.len() >= 8 && value.as_bytes().get(4) == Some(&b'-') {
        return NaiveDate::parse_from_str(&value[..10.min(value.len())], "%Y-%m-%d").ok();
    }
    let parts: Vec<&str> = value.split(['.', '/']).collect();
    match parts.as_slice() {
        [d, m] => {
            let day: u32 = d.parse().ok()?;
            let month: u32 = m.parse().ok()?;
            NaiveDate::from_ymd_opt(default_year, month, day)
        }
        [d, m, y] => {
            let day: u32 = d.parse().ok()?;
            let month: u32 = m.parse().ok()?;
            let mut year: i32 = y.parse().ok()?;
            if year < 100 {
                year += 2000;
            }
            NaiveDate::from_ymd_opt(year, month, day)
        }
        _ => None,
    }
}

fn resolve_relative(raw: &str, base: NaiveDate) -> Option<NaiveDate> {
    let text = collapse_ws(&fold_diacritics(raw)).to_lowercase();
    match text.as_str() {
        "dnes" | "today" => return Some(base),
        "zajtra" | "tomorrow" => return Some(base + Duration::days(1)),
        "pozajtra" => return Some(base + Duration::days(2)),
        "vcera" | "yesterday" => return Some(base - Duration::days(1)),
        "buduci tyzden" | "next week" => return Some(base + Duration::days(7)),
        "buduci mesiac" | "next month" => return Some(add_months(base, 1)),
        "tento tyzden" | "this week" => {
            return Some(base - Duration::days(base.weekday().num_days_from_monday() as i64))
        }
        _ => {}
    }

    if let Some(caps) = offset_re().captures(&text) {
        let amount: i64 = caps.get(1)?.as_str().parse().ok()?;
        let unit = caps.get(2)?.as_str().to_lowercase();
        if unit.starts_with('d') {
            return Some(base + Duration::days(amount));
        }
        if unit.starts_with('t') || unit.starts_with('w') {
            return Some(base + Duration::weeks(amount));
        }
        if unit.starts_with('m') {
            return Some(add_months(base, amount as i32));
        }
    }

    const WEEKDAYS: &[(&str, u32)] = &[
        ("pondelok", 0),
        ("utorok", 1),
        ("streda", 2),
        ("stvrtok", 3),
        ("piatok", 4),
        ("sobota", 5),
        ("nedela", 6),
        ("monday", 0),
        ("tuesday", 1),
        ("wednesday", 2),
        ("thursday", 3),
        ("friday", 4),
        ("saturday", 5),
        ("sunday", 6),
    ];
    for (name, weekday) in WEEKDAYS {
        if text.contains(name) {
            let current = base.weekday().num_days_from_monday();
            let mut delta = (*weekday + 7 - current) % 7;
            if delta == 0 {
                delta = 7;
            }
            return Some(base + Duration::days(delta as i64));
        }
    }
    None
}

fn add_months(base: NaiveDate, months: i32) -> NaiveDate {
    let month_index = (base.month0() as i32) + months;
    let year = base.year() + month_index.div_euclid(12);
    let month = (month_index.rem_euclid(12) as u32) + 1;
    let day = base.day().min(days_in_month(year, month));
    NaiveDate::from_ymd_opt(year, month, day).unwrap_or(base)
}

fn days_in_month(year: i32, month: u32) -> u32 {
    match month {
        2 => {
            if NaiveDate::from_ymd_opt(year, 2, 29).is_some() {
                29
            } else {
                28
            }
        }
        4 | 6 | 9 | 11 => 30,
        _ => 31,
    }
}

fn fold_diacritics(value: &str) -> String {
    value
        .chars()
        .map(|ch| match ch {
            'á' | 'ä' | 'Á' | 'Ä' => 'a',
            'č' | 'Č' => 'c',
            'ď' | 'Ď' => 'd',
            'é' | 'É' => 'e',
            'í' | 'Í' => 'i',
            'ĺ' | 'ľ' | 'Ĺ' | 'Ľ' => 'l',
            'ň' | 'Ň' => 'n',
            'ó' | 'ô' | 'Ó' | 'Ô' => 'o',
            'ŕ' | 'Ŕ' => 'r',
            'š' | 'Š' => 's',
            'ť' | 'Ť' => 't',
            'ú' | 'Ú' => 'u',
            'ý' | 'Ý' => 'y',
            'ž' | 'Ž' => 'z',
            other => other.to_ascii_lowercase(),
        })
        .collect()
}

fn collapse_ws(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_relative_and_deadline() {
        let today = NaiveDate::from_ymd_opt(2026, 9, 6).unwrap();
        assert_eq!(
            extract_due_hint_on("Meeting zajtra", today).as_deref(),
            Some("2026-09-07")
        );
        assert_eq!(
            extract_due_hint_on("deadline do 15.3.2026", today).as_deref(),
            Some("2026-03-15")
        );
        assert_eq!(
            extract_due_hint_on("o 3 dni", today).as_deref(),
            Some("2026-09-09")
        );
    }

    #[test]
    fn date_key_bounds_inclusive() {
        let (start, end) = date_key_bounds("2026-09-06", "2026-09-06").unwrap();
        assert!(end > start);
    }
}
