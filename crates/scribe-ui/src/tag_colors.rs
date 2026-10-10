//! Stable HSL color for tag labels (library + graph).

/// Match FE `colorForTag` — signed 32-bit string hash → HSL.
pub fn color_for_tag(tag: &str) -> String {
    let mut hash: i32 = 0;
    for ch in tag.chars() {
        hash = hash
            .wrapping_shl(5)
            .wrapping_sub(hash)
            .wrapping_add(ch as i32);
    }
    let hue = hash.unsigned_abs() % 360;
    format!("hsl({hue} 52% 52%)")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stable_and_hsl() {
        assert_eq!(color_for_tag("journal"), color_for_tag("journal"));
        assert!(color_for_tag("journal").starts_with("hsl("));
        assert_ne!(color_for_tag("alpha"), color_for_tag("beta"));
    }
}
