use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum JournalSlot {
    Day,
    Morning,
    Evening,
}

impl JournalSlot {
    pub fn parse(value: Option<&str>) -> Result<Self, String> {
        match value.unwrap_or("day").trim().to_lowercase().as_str() {
            "" | "day" | "today" => Ok(Self::Day),
            "morning" | "rano" | "ráno" => Ok(Self::Morning),
            "evening" | "vecer" | "večer" => Ok(Self::Evening),
            other => Err(format!(
                "Invalid journal slot: {other}. Use day, morning, or evening."
            )),
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Day => "day",
            Self::Morning => "morning",
            Self::Evening => "evening",
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JournalNote {
    pub id: String,
    pub title: String,
    pub folder_id: String,
    pub date: String,
    pub slot: String,
    pub created: bool,
    pub plain_text: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JournalSummary {
    pub summary: String,
    pub bullets: Vec<String>,
    pub document_count: i64,
}

pub struct JournalSummaryInput {
    pub from_date: String,
    pub to_date: String,
    pub journal_folder_id: Option<String>,
    pub document_ids: Option<Vec<String>>,
}
