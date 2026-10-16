//! HTML figure markup for export / print.

use crate::embed::video_export_embed;
use crate::markdown::VideoBlockAttrs;

fn escape_html(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

/// Render a `<figure class="video-block">…` suitable for HTML/PDF export.
pub fn render_video_figure_html(attrs: &VideoBlockAttrs) -> String {
    let source = attrs.src.as_deref().unwrap_or("").trim();
    let embed = video_export_embed(source);
    let caption_html = attrs
        .caption
        .as_deref()
        .map(str::trim)
        .filter(|c| !c.is_empty())
        .map(|c| format!("<figcaption>{}</figcaption>", escape_html(c)))
        .unwrap_or_default();

    if source.is_empty() {
        return format!(
            "<figure class=\"video-block\" style=\"margin:16pt 0;\"><p>Video</p>{caption_html}</figure>"
        );
    }

    match embed.kind.as_str() {
        "iframe" => format!(
            "<figure class=\"video-block\" style=\"margin:16pt 0;\"><div style=\"aspect-ratio:16/9;\"><iframe src=\"{}\" width=\"100%\" height=\"360\" frameborder=\"0\" allowfullscreen allow=\"accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture\"></iframe></div>{caption_html}</figure>",
            escape_html(&embed.href)
        ),
        "video" => format!(
            "<figure class=\"video-block\" style=\"margin:16pt 0;\"><video src=\"{}\" controls playsinline style=\"width:100%;max-height:420px;\"></video>{caption_html}</figure>",
            escape_html(&embed.href)
        ),
        _ => format!(
            "<figure class=\"video-block\" style=\"margin:16pt 0;\"><p><a href=\"{}\">{}</a></p>{caption_html}</figure>",
            escape_html(&embed.href),
            escape_html(source)
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn renders_youtube_iframe() {
        let html = render_video_figure_html(&VideoBlockAttrs {
            src: Some("https://youtu.be/abc123".into()),
            caption: Some("Clip".into()),
        });
        assert!(html.contains("youtube-nocookie.com/embed/abc123"));
        assert!(html.contains("<figcaption>Clip</figcaption>"));
        assert!(html.contains("allowfullscreen"));
    }
}
