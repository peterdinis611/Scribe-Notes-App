//! Group document tasks into agenda buckets by due hint.

use serde::{Deserialize, Serialize};

use crate::tasks::DocumentTask;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AgendaBucketId {
    Overdue,
    Today,
    Upcoming,
    Later,
}

impl AgendaBucketId {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Overdue => "overdue",
            Self::Today => "today",
            Self::Upcoming => "upcoming",
            Self::Later => "later",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AgendaBucket {
    pub id: AgendaBucketId,
    pub items: Vec<DocumentTask>,
}

/// Parse `YYYY-MM-DD…` due hint to UTC midnight millis.
pub fn parse_due_hint_ms(due_hint: Option<&str>) -> Option<i64> {
    let due = due_hint?.trim();
    if due.len() < 10 {
        return None;
    }
    let y: i32 = due.get(0..4)?.parse().ok()?;
    let m: u32 = due.get(5..7)?.parse().ok()?;
    let d: u32 = due.get(8..10)?.parse().ok()?;
    if due.as_bytes().get(4) != Some(&b'-') || due.as_bytes().get(7) != Some(&b'-') {
        return None;
    }
    // UTC midnight like JS Date.UTC
    let days = civil_days_from_ymd(y, m, d)?;
    Some(days * 86_400_000)
}

fn civil_days_from_ymd(y: i32, m: u32, d: u32) -> Option<i64> {
    if !(1..=12).contains(&m) || !(1..=31).contains(&d) {
        return None;
    }
    // Algorithm from civil_from_days inverse (Howard Hinnant)
    let y = if m <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = (y - era * 400) as u32;
    let m = m as i64;
    let d = d as i64;
    let doy = (153 * (m + if m > 2 { -3 } else { 9 }) + 2) / 5 + d - 1;
    let doe = (yoe as i64) * 365 + (yoe as i64) / 4 - (yoe as i64) / 100 + doy;
    Some(era as i64 * 146_097 + doe - 719_468)
}

/// Local midnight for `now_ms` given local offset minutes east of UTC
/// (JS `getTimezoneOffset` is west-of-UTC minutes — pass `-getTimezoneOffset()`).
pub fn start_of_local_day_ms(now_ms: i64, offset_minutes_east: i32) -> i64 {
    let local = now_ms + i64::from(offset_minutes_east) * 60_000;
    let day = local.div_euclid(86_400_000);
    day * 86_400_000 - i64::from(offset_minutes_east) * 60_000
}

fn due_local_midnight_ms(y: i32, m: u32, d: u32, offset_minutes_east: i32) -> Option<i64> {
    // Local calendar date as "local midnight" expressed in UTC millis.
    let utc_guess = parse_due_hint_ms(Some(&format!("{y:04}-{m:02}-{d:02}")))?;
    // Treat YYYY-MM-DD as local civil date: subtract offset so local midnight maps correctly.
    // JS: new Date(y, m-1, d).getTime()
    Some(utc_guess - i64::from(offset_minutes_east) * 60_000)
}

pub fn agenda_bucket_for_due(
    due_hint: Option<&str>,
    now_ms: i64,
    offset_minutes_east: i32,
) -> AgendaBucketId {
    let Some(due) = due_hint.map(str::trim).filter(|s| s.len() >= 10) else {
        return AgendaBucketId::Later;
    };
    let Ok(y) = due[0..4].parse::<i32>() else {
        return AgendaBucketId::Later;
    };
    let Ok(m) = due[5..7].parse::<u32>() else {
        return AgendaBucketId::Later;
    };
    let Ok(d) = due[8..10].parse::<u32>() else {
        return AgendaBucketId::Later;
    };
    if due.as_bytes().get(4) != Some(&b'-') || due.as_bytes().get(7) != Some(&b'-') {
        return AgendaBucketId::Later;
    }
    let Some(due_local) = due_local_midnight_ms(y, m, d, offset_minutes_east) else {
        return AgendaBucketId::Later;
    };
    let today = start_of_local_day_ms(now_ms, offset_minutes_east);
    let tomorrow = today + 86_400_000;
    let week = today + 7 * 86_400_000;
    if due_local < today {
        AgendaBucketId::Overdue
    } else if due_local < tomorrow {
        AgendaBucketId::Today
    } else if due_local < week {
        AgendaBucketId::Upcoming
    } else {
        AgendaBucketId::Later
    }
}

pub fn group_tasks_by_agenda(
    tasks: &[DocumentTask],
    now_ms: i64,
    offset_minutes_east: i32,
) -> Vec<AgendaBucket> {
    let mut overdue = Vec::new();
    let mut today = Vec::new();
    let mut upcoming = Vec::new();
    let mut later = Vec::new();

    for task in tasks {
        match agenda_bucket_for_due(task.due_hint.as_deref(), now_ms, offset_minutes_east) {
            AgendaBucketId::Overdue => overdue.push(task.clone()),
            AgendaBucketId::Today => today.push(task.clone()),
            AgendaBucketId::Upcoming => upcoming.push(task.clone()),
            AgendaBucketId::Later => later.push(task.clone()),
        }
    }

    let sort_bucket = |items: &mut Vec<DocumentTask>| {
        items.sort_by(|a, b| {
            let a_due = parse_due_hint_ms(a.due_hint.as_deref()).unwrap_or(i64::MAX);
            let b_due = parse_due_hint_ms(b.due_hint.as_deref()).unwrap_or(i64::MAX);
            a_due
                .cmp(&b_due)
                .then_with(|| a.text.to_ascii_lowercase().cmp(&b.text.to_ascii_lowercase()))
        });
    };
    sort_bucket(&mut overdue);
    sort_bucket(&mut today);
    sort_bucket(&mut upcoming);
    sort_bucket(&mut later);

    [
        (AgendaBucketId::Overdue, overdue),
        (AgendaBucketId::Today, today),
        (AgendaBucketId::Upcoming, upcoming),
        (AgendaBucketId::Later, later),
    ]
    .into_iter()
    .filter(|(_, items)| !items.is_empty())
    .map(|(id, items)| AgendaBucket { id, items })
    .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn task(text: &str, due: Option<&str>) -> DocumentTask {
        DocumentTask {
            text: text.into(),
            checked: false,
            source: "checklist".into(),
            due_hint: due.map(str::to_string),
            document_id: None,
            document_title: None,
        }
    }

    #[test]
    fn buckets_local_day() {
        // 2026-10-25 12:00 UTC, offset 0
        let now = parse_due_hint_ms(Some("2026-10-25")).unwrap() + 12 * 3_600_000;
        assert_eq!(
            agenda_bucket_for_due(Some("2026-10-24"), now, 0),
            AgendaBucketId::Overdue
        );
        assert_eq!(
            agenda_bucket_for_due(Some("2026-10-25"), now, 0),
            AgendaBucketId::Today
        );
        assert_eq!(
            agenda_bucket_for_due(Some("2026-10-28"), now, 0),
            AgendaBucketId::Upcoming
        );
        assert_eq!(
            agenda_bucket_for_due(Some("2026-12-01"), now, 0),
            AgendaBucketId::Later
        );
        let grouped = group_tasks_by_agenda(
            &[
                task("a", Some("2026-10-28")),
                task("b", Some("2026-10-24")),
            ],
            now,
            0,
        );
        assert_eq!(grouped[0].id, AgendaBucketId::Overdue);
        assert_eq!(grouped[1].id, AgendaBucketId::Upcoming);
    }
}
