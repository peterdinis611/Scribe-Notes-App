//! Digest schedule predicates (local wall-clock).

use crate::store::AgentDigestSchedule;

fn today_key(year: i32, month: u32, day: u32) -> String {
    format!("{year:04}-{month:02}-{day:02}")
}

fn local_hm(hour: u32, minute: u32) -> String {
    format!("{hour:02}:{minute:02}")
}

pub fn should_run_digest_now(
    schedule: &AgentDigestSchedule,
    year: i32,
    month: u32,
    day: u32,
    hour: u32,
    minute: u32,
    weekday: u32,
) -> bool {
    if !schedule.enabled {
        return false;
    }
    let hm = local_hm(hour, minute);
    if hm != schedule.time_local {
        return false;
    }
    let today = today_key(year, month, day);
    if schedule.last_run_date == today {
        return false;
    }
    if schedule.period == "week" && weekday != schedule.weekday as u32 {
        return false;
    }
    true
}

/// App opened after the scheduled time — still run once today.
pub fn should_catch_up_digest(
    schedule: &AgentDigestSchedule,
    year: i32,
    month: u32,
    day: u32,
    hour: u32,
    minute: u32,
    weekday: u32,
) -> bool {
    if !schedule.enabled {
        return false;
    }
    let today = today_key(year, month, day);
    if schedule.last_run_date == today {
        return false;
    }
    if schedule.period == "week" && weekday != schedule.weekday as u32 {
        return false;
    }
    local_hm(hour, minute) >= schedule.time_local
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::AgentDigestSchedule;

    fn sched(enabled: bool, time: &str, period: &str, weekday: i32, last: &str) -> AgentDigestSchedule {
        AgentDigestSchedule {
            enabled,
            time_local: time.into(),
            period: period.into(),
            weekday,
            last_run_date: last.into(),
        }
    }

    #[test]
    fn runs_at_exact_minute() {
        let s = sched(true, "08:00", "day", 1, "");
        assert!(should_run_digest_now(&s, 2026, 10, 25, 8, 0, 0));
        assert!(!should_run_digest_now(&s, 2026, 10, 25, 8, 1, 0));
    }

    #[test]
    fn catch_up_after_time() {
        let s = sched(true, "08:00", "day", 1, "");
        assert!(should_catch_up_digest(&s, 2026, 10, 25, 9, 0, 0));
        assert!(!should_catch_up_digest(&s, 2026, 10, 25, 7, 0, 0));
    }
}
