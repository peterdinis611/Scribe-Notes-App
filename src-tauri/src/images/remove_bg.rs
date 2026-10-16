//! Solid / near-solid background removal via edge flood-fill.
//! Best for product photos and screenshots on uniform backgrounds.

use image::{DynamicImage, Rgba, RgbaImage};
use std::collections::VecDeque;

use super::{encode_png_public, MAX_INPUT_BYTES};

/// Default color distance (0–441 ≈ sqrt(3*255²)).
pub const DEFAULT_TOLERANCE: u32 = 48;

/// Remove a connected near-solid background starting from image edges.
pub fn remove_background_bytes(bytes: &[u8], tolerance: Option<u32>) -> Result<Vec<u8>, String> {
    if bytes.is_empty() {
        return Err("Empty image payload".into());
    }
    if bytes.len() > MAX_INPUT_BYTES {
        return Err(format!("Image too large (max {} bytes)", MAX_INPUT_BYTES));
    }
    let img = image::load_from_memory(bytes).map_err(|e| format!("Decode failed: {e}"))?;
    let out = remove_background_image(&img, tolerance.unwrap_or(DEFAULT_TOLERANCE))?;
    encode_png_public(&out)
}

pub fn remove_background_image(img: &DynamicImage, tolerance: u32) -> Result<DynamicImage, String> {
    let mut rgba = img.to_rgba8();
    let (w, h) = rgba.dimensions();
    if w == 0 || h == 0 {
        return Err("Image has zero size".into());
    }
    if w * h > 16_000_000 {
        return Err("Image is too large for background removal (max ~16 MP)".into());
    }

    let bg = estimate_background(&rgba);
    let tol = tolerance.min(500);
    let mut visited = vec![false; (w * h) as usize];
    let mut queue = VecDeque::new();

    for x in 0..w {
        try_enqueue(&rgba, x, 0, bg, tol, w, &mut queue, &mut visited);
        try_enqueue(&rgba, x, h - 1, bg, tol, w, &mut queue, &mut visited);
    }
    for y in 0..h {
        try_enqueue(&rgba, 0, y, bg, tol, w, &mut queue, &mut visited);
        try_enqueue(&rgba, w - 1, y, bg, tol, w, &mut queue, &mut visited);
    }

    let dirs = [(1i32, 0), (-1, 0), (0, 1), (0, -1)];
    while let Some((x, y)) = queue.pop_front() {
        rgba.put_pixel(x, y, Rgba([0, 0, 0, 0]));
        for (dx, dy) in dirs {
            let nx = x as i32 + dx;
            let ny = y as i32 + dy;
            if nx < 0 || ny < 0 || nx >= w as i32 || ny >= h as i32 {
                continue;
            }
            try_enqueue(
                &rgba,
                nx as u32,
                ny as u32,
                bg,
                tol,
                w,
                &mut queue,
                &mut visited,
            );
        }
    }

    // Soften the cut: lower alpha for opaque neighbors of removed pixels.
    feather_edges(&mut rgba, &visited, 2);

    let removed = visited.iter().filter(|v| **v).count();
    if removed == 0 {
        return Err("No background region found — try a higher tolerance or a flatter backdrop.".into());
    }
    if removed as u32 == w * h {
        return Err("Entire image matched the background — adjust tolerance.".into());
    }

    Ok(DynamicImage::ImageRgba8(rgba))
}

#[allow(clippy::too_many_arguments)]
fn try_enqueue(
    rgba: &RgbaImage,
    x: u32,
    y: u32,
    bg: Rgba<u8>,
    tol: u32,
    w: u32,
    queue: &mut VecDeque<(u32, u32)>,
    visited: &mut [bool],
) {
    let idx = (y * w + x) as usize;
    if visited[idx] {
        return;
    }
    let px = *rgba.get_pixel(x, y);
    if color_dist(px, bg) <= tol {
        visited[idx] = true;
        queue.push_back((x, y));
    }
}

fn estimate_background(img: &RgbaImage) -> Rgba<u8> {
    let (w, h) = img.dimensions();
    let samples = [
        *img.get_pixel(0, 0),
        *img.get_pixel(w - 1, 0),
        *img.get_pixel(0, h - 1),
        *img.get_pixel(w - 1, h - 1),
        *img.get_pixel(w / 2, 0),
        *img.get_pixel(w / 2, h - 1),
        *img.get_pixel(0, h / 2),
        *img.get_pixel(w - 1, h / 2),
    ];
    let mut sum = [0u32; 3];
    for px in samples {
        sum[0] += px[0] as u32;
        sum[1] += px[1] as u32;
        sum[2] += px[2] as u32;
    }
    let n = samples.len() as u32;
    Rgba([(sum[0] / n) as u8, (sum[1] / n) as u8, (sum[2] / n) as u8, 255])
}

fn color_dist(a: Rgba<u8>, b: Rgba<u8>) -> u32 {
    let dr = a[0] as i32 - b[0] as i32;
    let dg = a[1] as i32 - b[1] as i32;
    let db = a[2] as i32 - b[2] as i32;
    ((dr * dr + dg * dg + db * db) as f64).sqrt() as u32
}

fn feather_edges(img: &mut RgbaImage, removed: &[bool], radius: i32) {
    let (w, h) = img.dimensions();
    let mut soften: Vec<(u32, u32, u8)> = Vec::new();
    for y in 0..h {
        for x in 0..w {
            let idx = (y * w + x) as usize;
            if removed[idx] {
                continue;
            }
            let mut near = false;
            'search: for dy in -radius..=radius {
                for dx in -radius..=radius {
                    let nx = x as i32 + dx;
                    let ny = y as i32 + dy;
                    if nx < 0 || ny < 0 || nx >= w as i32 || ny >= h as i32 {
                        continue;
                    }
                    if removed[(ny as u32 * w + nx as u32) as usize] {
                        near = true;
                        break 'search;
                    }
                }
            }
            if near {
                let px = img.get_pixel(x, y);
                let alpha = (px[3] as f32 * 0.55).round() as u8;
                soften.push((x, y, alpha));
            }
        }
    }
    for (x, y, alpha) in soften {
        let mut px = *img.get_pixel(x, y);
        px[3] = alpha.min(px[3]);
        img.put_pixel(x, y, px);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{Rgba, RgbaImage};

    #[test]
    fn removes_white_border_keeps_center() {
        let mut img = RgbaImage::from_pixel(20, 20, Rgba([255, 255, 255, 255]));
        for y in 5..15 {
            for x in 5..15 {
                img.put_pixel(x, y, Rgba([20, 40, 200, 255]));
            }
        }
        let out = remove_background_image(&DynamicImage::ImageRgba8(img), 40).unwrap();
        let rgba = out.to_rgba8();
        assert_eq!(rgba.get_pixel(0, 0)[3], 0);
        assert_eq!(rgba.get_pixel(10, 10)[3], 255);
        assert_eq!(rgba.get_pixel(10, 10)[2], 200);
    }
}
