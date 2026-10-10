//! Semver parse / bump / compare for plugin versioning.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum VersionBump {
    Patch,
    Minor,
    Major,
    Keep,
}

pub fn parse_semver(version: &str) -> Option<(u32, u32, u32)> {
    let trimmed = version.trim();
    let core = trimmed.split(['-', '+']).next().unwrap_or(trimmed);
    let mut parts = core.split('.');
    let major = parts.next()?.parse().ok()?;
    let minor = parts.next()?.parse().ok()?;
    let patch = parts.next()?.parse().ok()?;
    if parts.next().is_some() {
        return None;
    }
    Some((major, minor, patch))
}

pub fn bump_semver(version: &str, bump: VersionBump) -> String {
    if bump == VersionBump::Keep {
        let trimmed = version.trim();
        return if trimmed.is_empty() {
            "1.0.0".into()
        } else {
            trimmed.into()
        };
    }
    let (mut major, mut minor, mut patch) = parse_semver(version).unwrap_or((1, 0, 0));
    match bump {
        VersionBump::Major => {
            major += 1;
            minor = 0;
            patch = 0;
        }
        VersionBump::Minor => {
            minor += 1;
            patch = 0;
        }
        VersionBump::Patch => patch += 1,
        VersionBump::Keep => {}
    }
    format!("{major}.{minor}.{patch}")
}

pub fn compare_semver(a: &str, b: &str) -> i32 {
    let pa = parse_semver(a).unwrap_or((0, 0, 0));
    let pb = parse_semver(b).unwrap_or((0, 0, 0));
    if pa.0 != pb.0 {
        return (pa.0 as i32) - (pb.0 as i32);
    }
    if pa.1 != pb.1 {
        return (pa.1 as i32) - (pb.1 as i32);
    }
    (pa.2 as i32) - (pb.2 as i32)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bumps() {
        assert_eq!(bump_semver("1.2.3", VersionBump::Patch), "1.2.4");
        assert_eq!(bump_semver("1.2.3", VersionBump::Minor), "1.3.0");
        assert!(compare_semver("1.2.0", "1.1.9") > 0);
    }
}
