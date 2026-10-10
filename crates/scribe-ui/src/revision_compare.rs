//! Revision compare option builders (diff algorithms stay in scribe-core).

use serde::{Deserialize, Serialize};

use crate::CURRENT_REVISION_ID;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RevisionInput {
    pub id: String,
    pub title: String,
    pub created_at: i64,
    #[serde(default)]
    pub label: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RevisionCompareOption {
    pub id: String,
    pub label: String,
    pub created_at: i64,
    #[serde(default)]
    pub is_current: bool,
}

pub fn build_revision_compare_options(
    revisions: &[RevisionInput],
    current_updated_at: i64,
    current_label: &str,
) -> Vec<RevisionCompareOption> {
    let mut out = vec![RevisionCompareOption {
        id: CURRENT_REVISION_ID.into(),
        label: current_label.into(),
        created_at: current_updated_at,
        is_current: true,
    }];
    for revision in revisions {
        let label = revision
            .label
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or(revision.title.as_str())
            .to_string();
        out.push(RevisionCompareOption {
            id: revision.id.clone(),
            label,
            created_at: revision.created_at,
            is_current: false,
        });
    }
    out
}

pub fn get_revision_timestamp(
    revision_id: &str,
    revisions: &[RevisionInput],
    current_updated_at: i64,
) -> i64 {
    if revision_id == CURRENT_REVISION_ID {
        return current_updated_at;
    }
    revisions
        .iter()
        .find(|r| r.id == revision_id)
        .map(|r| r.created_at)
        .unwrap_or(0)
}

pub fn normalize_compare_pair(
    version_a_id: &str,
    version_b_id: &str,
    revisions: &[RevisionInput],
    current_updated_at: i64,
) -> (String, String) {
    let time_a = get_revision_timestamp(version_a_id, revisions, current_updated_at);
    let time_b = get_revision_timestamp(version_b_id, revisions, current_updated_at);
    if time_a <= time_b {
        (version_a_id.into(), version_b_id.into())
    } else {
        (version_b_id.into(), version_a_id.into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn orders_pair() {
        let revisions = [RevisionInput {
            id: "r1".into(),
            title: "Old".into(),
            created_at: 10,
            label: None,
        }];
        let (older, newer) = normalize_compare_pair("r1", CURRENT_REVISION_ID, &revisions, 20);
        assert_eq!(older, "r1");
        assert_eq!(newer, CURRENT_REVISION_ID);
    }
}
