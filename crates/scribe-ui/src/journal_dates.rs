//! Journal date-key helpers (open/create note I/O stays FE).

use chrono::{Datelike, Duration, Local, NaiveDate};

pub fn format_date_key(year: i32, month: u32, day: u32) -> Option<String> {
    NaiveDate::from_ymd_opt(year, month, day).map(|d| d.format("%Y-%m-%d").to_string())
}

pub fn format_date_key_today() -> String {
    Local::now().date_naive().format("%Y-%m-%d").to_string()
}

/// ISO week key: YYYY-Www
pub fn format_week_key(year: i32, month: u32, day: u32) -> Option<String> {
    let date = NaiveDate::from_ymd_opt(year, month, day)?;
    let iso = date.iso_week();
    Some(format!("{}-W{:02}", iso.year(), iso.week()))
}

pub fn compute_journal_streak(noted_dates: &[String], today: &str) -> usize {
    if noted_dates.is_empty() {
        return 0;
    }
    let set: std::collections::HashSet<&str> = noted_dates.iter().map(String::as_str).collect();
    let Ok(mut cursor) = NaiveDate::parse_from_str(today, "%Y-%m-%d") else {
        return 0;
    };
    let mut streak = 0;
    loop {
        let key = cursor.format("%Y-%m-%d").to_string();
        if !set.contains(key.as_str()) {
            break;
        }
        streak += 1;
        cursor -= Duration::days(1);
    }
    streak
}

/// Monday–Sunday date keys for the week containing `date`.
pub fn current_week_range(year: i32, month: u32, day: u32) -> Option<(String, String)> {
    let date = NaiveDate::from_ymd_opt(year, month, day)?;
    let monday_offset = date.weekday().num_days_from_monday();
    let start = date - Duration::days(monday_offset as i64);
    let end = start + Duration::days(6);
    Some((
        start.format("%Y-%m-%d").to_string(),
        end.format("%Y-%m-%d").to_string(),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Weekday;

    #[test]
    fn week_and_streak() {
        assert_eq!(format_date_key(2026, 10, 10).as_deref(), Some("2026-10-10"));
        let streak = compute_journal_streak(
            &["2026-10-10".into(), "2026-10-09".into()],
            "2026-10-10",
        );
        assert_eq!(streak, 2);
        let (from, to) = current_week_range(2026, 10, 10).unwrap();
        assert!(from <= to);
        assert_eq!(NaiveDate::parse_from_str(&from, "%Y-%m-%d").unwrap().weekday(), Weekday::Mon);
    }
}
