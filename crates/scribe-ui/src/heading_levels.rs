//! Heading level catalog (`src/lib/editor/heading-levels.ts`).

use serde::{Deserialize, Serialize};

/// TipTap / HTML heading levels 1–6.
pub const HEADING_LEVELS: [u8; 6] = [1, 2, 3, 4, 5, 6];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(transparent)]
pub struct HeadingLevel(pub u8);

impl HeadingLevel {
    pub fn new(level: u8) -> Option<Self> {
        if HEADING_LEVELS.contains(&level) {
            Some(Self(level))
        } else {
            None
        }
    }

    pub fn get(self) -> u8 {
        self.0
    }
}

pub fn is_heading_level(level: u8) -> bool {
    HEADING_LEVELS.contains(&level)
}

pub fn heading_levels() -> Vec<u8> {
    HEADING_LEVELS.to_vec()
}

/// Display label used by the editor toolbar (`Nadpis N`).
pub fn heading_label(level: u8) -> String {
    format!("Nadpis {level}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn levels_and_labels() {
        assert!(is_heading_level(3));
        assert!(!is_heading_level(0));
        assert_eq!(heading_levels().len(), 6);
        assert_eq!(heading_label(2), "Nadpis 2");
        assert!(HeadingLevel::new(7).is_none());
    }
}
