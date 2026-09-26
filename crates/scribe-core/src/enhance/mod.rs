//! Optional Rust extras — Cargo features with stdlib fallbacks.
//!
//! Enable via `scribe-core` features (or meta-feature `enhance`):
//! - `fuzzy` — rapidfuzz title / label matching
//! - `search-fast` — rayon over embedding scoring
//! - `vectors` — simsimd cosine
//! - `unicode` — encoding_rs + chardetng for imports

mod fuzzy;
mod unicode;
mod vectors;

pub use fuzzy::{fuzzy_extract, fuzzy_ratio};
pub use unicode::{decode_bytes, decode_bytes_detailed, DecodedText};
pub use vectors::cosine_similarity;

use serde::Serialize;
use std::collections::BTreeMap;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnhanceStatus {
    pub fuzzy: bool,
    pub search_fast: bool,
    pub vectors: bool,
    pub unicode: bool,
}

pub fn status() -> EnhanceStatus {
    EnhanceStatus {
        fuzzy: cfg!(feature = "fuzzy"),
        search_fast: cfg!(feature = "search-fast"),
        vectors: cfg!(feature = "vectors"),
        unicode: cfg!(feature = "unicode"),
    }
}

/// Alias for callers that mirror the Python `extras_status` naming.
pub fn enhance_status() -> EnhanceStatus {
    status()
}

pub fn status_map() -> BTreeMap<&'static str, bool> {
    let s = status();
    BTreeMap::from([
        ("rapidfuzz", s.fuzzy),
        ("rayon", s.search_fast),
        ("simsimd", s.vectors),
        ("encoding_rs", s.unicode),
    ])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn status_keys_stable() {
        let map = status_map();
        assert!(map.contains_key("rapidfuzz"));
        assert!(map.contains_key("rayon"));
        assert!(map.contains_key("simsimd"));
        assert!(map.contains_key("encoding_rs"));
    }

    #[test]
    fn fuzzy_ratio_identical_is_one() {
        assert!((fuzzy_ratio("Hello", "hello") - 1.0).abs() < 1e-6);
    }

    #[test]
    fn cosine_identical_is_one() {
        let v = [1.0f32, 0.0, 0.2];
        assert!((cosine_similarity(&v, &v) - 1.0).abs() < 1e-5);
    }

    #[test]
    fn decode_utf8_passthrough() {
        assert_eq!(decode_bytes(b"ahoj svet"), "ahoj svet");
    }
}
