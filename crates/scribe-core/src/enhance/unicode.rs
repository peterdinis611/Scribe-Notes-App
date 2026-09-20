//! Best-effort decode of imported text bytes.

/// Decode bytes to UTF-8 string. With `unicode` feature, detects encoding via
/// chardetng and converts with encoding_rs; otherwise UTF-8 with lossy fallback.
pub fn decode_bytes(bytes: &[u8]) -> String {
    if bytes.is_empty() {
        return String::new();
    }
    if let Ok(text) = std::str::from_utf8(bytes) {
        return text.to_string();
    }

    #[cfg(feature = "unicode")]
    {
        let mut detector =
            chardetng::EncodingDetector::new(chardetng::Iso2022JpDetection::Deny);
        detector.feed(bytes, true);
        let encoding = detector.guess(None, chardetng::Utf8Detection::Allow);
        let (cow, _, _) = encoding.decode(bytes);
        return cow.into_owned();
    }

    #[cfg(not(feature = "unicode"))]
    {
        String::from_utf8_lossy(bytes).into_owned()
    }
}
