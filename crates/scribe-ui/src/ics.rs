//! Minimal VCALENDAR builder (RFC 5545 subset) — mirrors FE `buildIcsCalendar`.

use chrono::Utc;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct IcsEventInput {
    pub summary: String,
    /// YYYY-MM-DD preferred; also accepts ISO datetime.
    pub date: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub uid: Option<String>,
}

fn escape_ics_text(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('\n', "\\n")
        .replace(';', "\\;")
        .replace(',', "\\,")
}

fn fold_line(line: &str) -> String {
    if line.len() <= 75 {
        return line.to_string();
    }
    let mut chunks = Vec::new();
    let mut rest = line;
    chunks.push(rest[..75].to_string());
    rest = &rest[75..];
    while !rest.is_empty() {
        let take = rest.len().min(74);
        chunks.push(format!(" {}", &rest[..take]));
        rest = &rest[take..];
    }
    chunks.join("\r\n")
}

fn stamp_now() -> String {
    Utc::now()
        .format("%Y%m%dT%H%M%SZ")
        .to_string()
}

fn to_date_value(raw: &str) -> Option<(bool, String)> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    if trimmed.len() >= 10 {
        let day = &trimmed[..10];
        if day.as_bytes().get(4) == Some(&b'-') && day.as_bytes().get(7) == Some(&b'-') {
            let digits: String = day.chars().filter(|c| c.is_ascii_digit()).collect();
            if digits.len() == 8 {
                return Some((true, digits));
            }
        }
    }
    if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(trimmed) {
        return Some((false, dt.with_timezone(&Utc).format("%Y%m%dT%H%M%SZ").to_string()));
    }
    None
}

/// Build a minimal VCALENDAR body.
pub fn build_ics_calendar(events: &[IcsEventInput], calendar_name: &str) -> String {
    let mut lines = vec![
        "BEGIN:VCALENDAR".into(),
        "VERSION:2.0".into(),
        "PRODID:-//Scribe//EN".into(),
        "CALSCALE:GREGORIAN".into(),
        "METHOD:PUBLISH".into(),
        format!("X-WR-CALNAME:{}", escape_ics_text(calendar_name)),
    ];
    let now = stamp_now();
    for (index, event) in events.iter().enumerate() {
        let Some((all_day, value)) = to_date_value(&event.date) else {
            continue;
        };
        let summary = event.summary.trim().chars().take(200).collect::<String>();
        let summary = if summary.is_empty() {
            "Untitled".to_string()
        } else {
            summary
        };
        let uid = event
            .uid
            .as_deref()
            .map(str::trim)
            .filter(|v| !v.is_empty())
            .map(|v| v.to_string())
            .unwrap_or_else(|| format!("scribe-{now}-{index}-{}@local", Uuid::new_v4()));
        lines.push("BEGIN:VEVENT".into());
        lines.push(format!("UID:{uid}"));
        lines.push(format!("DTSTAMP:{now}"));
        if all_day {
            lines.push(format!("DTSTART;VALUE=DATE:{value}"));
        } else {
            lines.push(format!("DTSTART:{value}"));
        }
        lines.push(format!("SUMMARY:{}", escape_ics_text(&summary)));
        if let Some(desc) = event
            .description
            .as_deref()
            .map(str::trim)
            .filter(|v| !v.is_empty())
        {
            let clipped: String = desc.chars().take(500).collect();
            lines.push(format!("DESCRIPTION:{}", escape_ics_text(&clipped)));
        }
        lines.push("END:VEVENT".into());
    }
    lines.push("END:VCALENDAR".into());
    let body = lines
        .iter()
        .map(|line| fold_line(line))
        .collect::<Vec<_>>()
        .join("\r\n");
    format!("{body}\r\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_all_day_event() {
        let ics = build_ics_calendar(
            &[IcsEventInput {
                summary: "Ship 3.4".into(),
                date: "2026-10-12".into(),
                description: Some("From Scribe".into()),
                uid: Some("test@local".into()),
            }],
            "Scribe",
        );
        assert!(ics.contains("BEGIN:VCALENDAR"));
        assert!(ics.contains("DTSTART;VALUE=DATE:20261012"));
        assert!(ics.contains("SUMMARY:Ship 3.4"));
    }
}
