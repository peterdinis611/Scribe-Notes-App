//! Pure embedding helpers (no DB).

/// Cosine similarity in `0..1` (clamped). Empty / length-mismatch → `0.0`.
pub fn cosine_similarity(a: &[f32], b: &[f32]) -> f64 {
    if a.len() != b.len() || a.is_empty() {
        return 0.0;
    }
    let mut dot = 0.0f64;
    let mut norm_a = 0.0f64;
    let mut norm_b = 0.0f64;
    for (left, right) in a.iter().zip(b.iter()) {
        let l = f64::from(*left);
        let r = f64::from(*right);
        dot += l * r;
        norm_a += l * l;
        norm_b += r * r;
    }
    if norm_a <= 0.0 || norm_b <= 0.0 {
        return 0.0;
    }
    (dot / (norm_a.sqrt() * norm_b.sqrt())).clamp(0.0, 1.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn identical_vectors_score_one() {
        let v = [1.0f32, 0.0, 0.2];
        assert!((cosine_similarity(&v, &v) - 1.0).abs() < 1e-6);
    }
}
