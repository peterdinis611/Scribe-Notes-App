//! Best-effort decode of imported text bytes.

/// Result of decoding imported bytes to UTF-8.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DecodedText {
    pub text: String,
    /// IANA / encoding_rs label (e.g. `utf-8`, `windows-1250`).
    pub encoding: String,
    /// True when bytes were not valid UTF-8 and were converted.
    pub converted: bool,
}

/// Decode bytes to UTF-8 string. With `unicode` feature, detects encoding via
/// chardetng and converts with encoding_rs; otherwise UTF-8 with lossy fallback.
pub fn decode_bytes(bytes: &[u8]) -> String {
    decode_bytes_detailed(bytes).text
}

/// Decode and report which encoding was used.
pub fn decode_bytes_detailed(bytes: &[u8]) -> DecodedText {
    if bytes.is_empty() {
        return DecodedText {
            text: String::new(),
            encoding: "utf-8".into(),
            converted: false,
        };
    }
    if let Ok(text) = std::str::from_utf8(bytes) {
        return DecodedText {
            text: text.to_string(),
            encoding: "utf-8".into(),
            converted: false,
        };
    }

    #[cfg(feature = "unicode")]
    {
        let mut detector =
            chardetng::EncodingDetector::new(chardetng::Iso2022JpDetection::Deny);
        detector.feed(bytes, true);
        let encoding = detector.guess(None, chardetng::Utf8Detection::Allow);
        let (cow, _, _) = encoding.decode(bytes);
        return DecodedText {
            text: cow.into_owned(),
            encoding: encoding.name().to_string(),
            converted: true,
        };
    }

    #[cfg(not(feature = "unicode"))]
    {
        DecodedText {
            text: String::from_utf8_lossy(bytes).into_owned(),
            encoding: "unknown".into(),
            converted: true,
        }
    }
}
