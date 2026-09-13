//! Document image encode/optimize helpers.

use image::codecs::jpeg::JpegEncoder;
use image::codecs::png::{CompressionType, FilterType as PngFilterType, PngEncoder};
use image::imageops::FilterType;
use image::{ColorType, DynamicImage, ExtendedColorType, ImageEncoder, ImageFormat};
use std::io::Cursor;

/// Longest edge after downscale (keeps notes lean without looking soft on retina).
pub const DEFAULT_MAX_EDGE: u32 = 2048;
/// JPEG quality for opaque photos.
pub const DEFAULT_JPEG_QUALITY: u8 = 82;
/// Reject uploads larger than this before decoding (bytes).
pub const MAX_INPUT_BYTES: usize = 40 * 1024 * 1024;

#[derive(Debug, Clone)]
pub struct OptimizedImage {
    pub bytes: Vec<u8>,
    pub extension: String,
    /// True when output differs from the input payload (resized and/or re-encoded).
    pub changed: bool,
}

#[derive(Debug, Clone, Copy)]
pub struct OptimizeOptions {
    pub max_edge: u32,
    pub jpeg_quality: u8,
}

impl Default for OptimizeOptions {
    fn default() -> Self {
        Self {
            max_edge: DEFAULT_MAX_EDGE,
            jpeg_quality: DEFAULT_JPEG_QUALITY,
        }
    }
}

fn looks_like_svg(bytes: &[u8]) -> bool {
    let sample = bytes
        .iter()
        .take(512)
        .copied()
        .skip_while(|b| b.is_ascii_whitespace())
        .collect::<Vec<_>>();
    let head = String::from_utf8_lossy(&sample).to_ascii_lowercase();
    head.starts_with("<svg") || (head.starts_with("<?xml") && head.contains("<svg"))
}

fn has_useful_alpha(img: &DynamicImage) -> bool {
    match img.color() {
        ColorType::Rgba8 | ColorType::Rgba16 | ColorType::La8 | ColorType::La16 => {
            img.to_rgba8().pixels().any(|p| p.0[3] < 255)
        }
        _ => false,
    }
}

fn downscale(img: DynamicImage, max_edge: u32) -> DynamicImage {
    if max_edge == 0 {
        return img;
    }
    let (w, h) = (img.width(), img.height());
    let long = w.max(h);
    if long <= max_edge {
        return img;
    }
    let scale = max_edge as f32 / long as f32;
    let nw = ((w as f32) * scale).round().max(1.0) as u32;
    let nh = ((h as f32) * scale).round().max(1.0) as u32;
    img.resize(nw, nh, FilterType::Lanczos3)
}

fn encode_jpeg(img: &DynamicImage, quality: u8) -> Result<Vec<u8>, String> {
    let rgb = img.to_rgb8();
    let mut out = Cursor::new(Vec::new());
    let mut encoder = JpegEncoder::new_with_quality(&mut out, quality.clamp(40, 95));
    encoder
        .encode(
            rgb.as_raw(),
            rgb.width(),
            rgb.height(),
            ExtendedColorType::Rgb8,
        )
        .map_err(|e| format!("JPEG encode: {e}"))?;
    Ok(out.into_inner())
}

fn encode_png(img: &DynamicImage) -> Result<Vec<u8>, String> {
    let rgba = img.to_rgba8();
    let mut out = Cursor::new(Vec::new());
    let encoder = PngEncoder::new_with_quality(
        &mut out,
        CompressionType::Best,
        PngFilterType::Adaptive,
    );
    encoder
        .write_image(
            rgba.as_raw(),
            rgba.width(),
            rgba.height(),
            ExtendedColorType::Rgba8,
        )
        .map_err(|e| format!("PNG encode: {e}"))?;
    Ok(out.into_inner())
}

fn encode_webp_lossless(img: &DynamicImage) -> Result<Vec<u8>, String> {
    use image::codecs::webp::WebPEncoder;
    let rgba = img.to_rgba8();
    let mut out = Cursor::new(Vec::new());
    let encoder = WebPEncoder::new_lossless(&mut out);
    encoder
        .write_image(
            rgba.as_raw(),
            rgba.width(),
            rgba.height(),
            ExtendedColorType::Rgba8,
        )
        .map_err(|e| format!("WebP encode: {e}"))?;
    Ok(out.into_inner())
}

fn pick_best(candidates: Vec<(Vec<u8>, &str)>, original: &[u8], original_ext: &str) -> OptimizedImage {
    let mut best_bytes = original.to_vec();
    let mut best_ext = original_ext.to_string();
    let mut best_len = original.len();

    for (bytes, ext) in candidates {
        if bytes.is_empty() {
            continue;
        }
        if bytes.len() < best_len {
            best_len = bytes.len();
            best_bytes = bytes;
            best_ext = ext.to_string();
        }
    }

    let changed = best_bytes.as_slice() != original;
    OptimizedImage {
        bytes: best_bytes,
        extension: best_ext,
        changed,
    }
}

fn normalize_ext(ext: &str) -> String {
    match ext.to_ascii_lowercase().as_str() {
        "jpeg" => "jpg".into(),
        other => other.into(),
    }
}

/// Optimize raster image bytes for document storage.
///
/// SVG and GIF are stored as-is (vectors / possible animation).
/// Other formats are decoded, downscaled, re-encoded (JPEG / PNG / lossless WebP),
/// and the smallest result that beats the original is kept.
pub fn optimize_image_bytes(
    bytes: &[u8],
    preferred_ext: &str,
    options: OptimizeOptions,
) -> Result<OptimizedImage, String> {
    if bytes.is_empty() {
        return Err("Prázdny obrázok".into());
    }
    if bytes.len() > MAX_INPUT_BYTES {
        return Err(format!(
            "Obrázok je príliš veľký (max {} MB)",
            MAX_INPUT_BYTES / (1024 * 1024)
        ));
    }

    let preferred_ext = normalize_ext(preferred_ext);

    if preferred_ext == "svg" || looks_like_svg(bytes) {
        return Ok(OptimizedImage {
            bytes: bytes.to_vec(),
            extension: "svg".into(),
            changed: false,
        });
    }

    let format = image::guess_format(bytes).ok();
    if matches!(format, Some(ImageFormat::Gif)) || preferred_ext == "gif" {
        return Ok(OptimizedImage {
            bytes: bytes.to_vec(),
            extension: "gif".into(),
            changed: false,
        });
    }

    let img = image::load_from_memory(bytes).map_err(|e| format!("Nepodarilo sa načítať obrázok: {e}"))?;
    let img = downscale(img, options.max_edge);

    let mut candidates: Vec<(Vec<u8>, &str)> = Vec::new();

    if has_useful_alpha(&img) {
        if let Ok(png) = encode_png(&img) {
            candidates.push((png, "png"));
        }
        if let Ok(webp) = encode_webp_lossless(&img) {
            candidates.push((webp, "webp"));
        }
    } else {
        if let Ok(jpeg) = encode_jpeg(&img, options.jpeg_quality) {
            candidates.push((jpeg, "jpg"));
        }
        // Small UI graphics sometimes compress better as PNG than JPEG.
        if let Ok(png) = encode_png(&img) {
            candidates.push((png, "png"));
        }
        if let Ok(webp) = encode_webp_lossless(&img) {
            candidates.push((webp, "webp"));
        }
    }

    if candidates.is_empty() {
        return Ok(OptimizedImage {
            bytes: bytes.to_vec(),
            extension: preferred_ext,
            changed: false,
        });
    }

    Ok(pick_best(candidates, bytes, &preferred_ext))
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{ImageBuffer, Rgb, Rgba};

    fn solid_png(w: u32, h: u32) -> Vec<u8> {
        let img: ImageBuffer<Rgb<u8>, Vec<u8>> =
            ImageBuffer::from_fn(w, h, |x, y| Rgb([(x % 255) as u8, (y % 255) as u8, 120]));
        let mut out = Cursor::new(Vec::new());
        DynamicImage::ImageRgb8(img)
            .write_to(&mut out, ImageFormat::Png)
            .unwrap();
        out.into_inner()
    }

    fn alpha_png(w: u32, h: u32) -> Vec<u8> {
        let img: ImageBuffer<Rgba<u8>, Vec<u8>> =
            ImageBuffer::from_fn(w, h, |x, _y| Rgba([200, 40, 40, if x < w / 2 { 255 } else { 80 }]));
        let mut out = Cursor::new(Vec::new());
        DynamicImage::ImageRgba8(img)
            .write_to(&mut out, ImageFormat::Png)
            .unwrap();
        out.into_inner()
    }

    #[test]
    fn downscales_large_opaque_to_jpeg_or_smaller() {
        let raw = solid_png(3200, 2400);
        let result = optimize_image_bytes(&raw, "png", OptimizeOptions::default()).unwrap();
        assert!(result.bytes.len() < raw.len());
        assert!(["jpg", "png", "webp"].contains(&result.extension.as_str()));
        assert!(result.changed);
        let decoded = image::load_from_memory(&result.bytes).unwrap();
        assert!(decoded.width().max(decoded.height()) <= DEFAULT_MAX_EDGE);
    }

    #[test]
    fn keeps_transparency_as_png_or_webp() {
        let raw = alpha_png(400, 300);
        let result = optimize_image_bytes(&raw, "png", OptimizeOptions::default()).unwrap();
        assert!(["png", "webp"].contains(&result.extension.as_str()));
        let decoded = image::load_from_memory(&result.bytes).unwrap();
        assert!(has_useful_alpha(&decoded));
    }

    #[test]
    fn svg_passthrough() {
        let svg = br#"<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>"#;
        let result = optimize_image_bytes(svg, "svg", OptimizeOptions::default()).unwrap();
        assert_eq!(result.extension, "svg");
        assert!(!result.changed);
        assert_eq!(result.bytes, svg);
    }

    #[test]
    fn rejects_oversized_payload() {
        let huge = vec![0u8; MAX_INPUT_BYTES + 1];
        let err = optimize_image_bytes(&huge, "png", OptimizeOptions::default()).unwrap_err();
        assert!(err.contains("veľký"));
    }
}
