//! Native HTML → PDF via an off-screen WKWebView + NSPrintOperation (macOS).
//!
//! Replaces the frontend html2pdf/html2canvas pipeline with WebKit's print
//! engine so the shipped app no longer embeds ~1 MB of JS PDF libraries.

use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{mpsc, Mutex};
use std::time::{Duration, Instant};

use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::Deserialize;
use tauri::{AppHandle, WebviewUrl, WebviewWindowBuilder};

static EXPORT_SEQ: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenderPdfInput {
    pub html: String,
    /// CSS px at 96dpi (same units as the editor page setup).
    pub paper_width_px: f64,
    pub paper_height_px: f64,
    pub margin_top_px: f64,
    pub margin_right_px: f64,
    pub margin_bottom_px: f64,
    pub margin_left_px: f64,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RenderPdfResult {
    pub data_base64: String,
}

fn px_to_pt(px: f64) -> f64 {
    px * 72.0 / 96.0
}

fn cleanup(window: &tauri::WebviewWindow, temp_html: &Path, temp_pdf: &Path) {
    let _ = window.close();
    let _ = std::fs::remove_file(temp_html);
    let _ = std::fs::remove_file(temp_pdf);
}

fn wait_for_written_file(path: &Path) -> Result<(), String> {
    let deadline = Instant::now() + Duration::from_secs(60);
    let mut last_len: Option<u64> = None;
    while Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(200));
        let len = match std::fs::metadata(path) {
            Ok(meta) if meta.len() > 0 => meta.len(),
            _ => continue,
        };
        if last_len == Some(len) {
            return Ok(());
        }
        last_len = Some(len);
    }
    Err("Časový limit pri zápise PDF vypršal.".into())
}

/// Render HTML to a PDF and return base64 (for preview + save).
#[tauri::command]
pub async fn render_html_to_pdf(
    app: AppHandle,
    input: RenderPdfInput,
) -> Result<RenderPdfResult, String> {
    let seq = EXPORT_SEQ.fetch_add(1, Ordering::Relaxed);
    let pid = std::process::id();

    let mut temp_html = std::env::temp_dir();
    temp_html.push(format!("scribe-export-{pid}-{seq}.html"));
    std::fs::write(&temp_html, &input.html)
        .map_err(|e| format!("Nepodarilo sa pripraviť HTML pre PDF: {e}"))?;

    let mut temp_pdf = std::env::temp_dir();
    temp_pdf.push(format!("scribe-export-{pid}-{seq}.pdf"));
    let _ = std::fs::remove_file(&temp_pdf);

    let url = tauri::Url::from_file_path(&temp_html)
        .map_err(|_| "Nepodarilo sa vytvoriť URL pre export HTML.".to_string())?;

    let (load_tx, load_rx) = mpsc::channel::<()>();
    let load_tx = Mutex::new(Some(load_tx));

    let label = format!("pdf-export-{seq}");
    let window = WebviewWindowBuilder::new(&app, &label, WebviewUrl::External(url))
        .visible(false)
        .skip_taskbar(true)
        .title("")
        .inner_size(input.paper_width_px, input.paper_height_px)
        .on_page_load(move |_w, payload| {
            if matches!(payload.event(), tauri::webview::PageLoadEvent::Finished) {
                if let Ok(mut guard) = load_tx.lock() {
                    if let Some(tx) = guard.take() {
                        let _ = tx.send(());
                    }
                }
            }
        })
        .build()
        .map_err(|e| format!("Nepodarilo sa vytvoriť export webview: {e}"))?;

    if load_rx.recv_timeout(Duration::from_secs(30)).is_err() {
        cleanup(&window, &temp_html, &temp_pdf);
        return Err("Časový limit pri renderovaní dokumentu pre PDF vypršal.".into());
    }

    std::thread::sleep(Duration::from_millis(350));

    let pdf_path = temp_pdf.to_string_lossy().to_string();
    let margins = PrintMargins {
        top: px_to_pt(input.margin_top_px),
        right: px_to_pt(input.margin_right_px),
        bottom: px_to_pt(input.margin_bottom_px),
        left: px_to_pt(input.margin_left_px),
        paper_width: px_to_pt(input.paper_width_px),
        paper_height: px_to_pt(input.paper_height_px),
    };

    let (done_tx, done_rx) = mpsc::channel::<Result<(), String>>();
    if let Err(e) = window.with_webview(move |platform| {
        let result = unsafe { print_to_pdf(platform, &pdf_path, &margins) };
        let _ = done_tx.send(result);
    }) {
        cleanup(&window, &temp_html, &temp_pdf);
        return Err(format!("Nepodarilo sa pristúpiť k export webview: {e}"));
    }

    let outcome = done_rx
        .recv_timeout(Duration::from_secs(120))
        .unwrap_or_else(|_| Err("Časový limit pri štarte PDF exportu vypršal.".into()));

    let outcome = outcome.and_then(|()| wait_for_written_file(&temp_pdf));
    if let Err(error) = outcome {
        cleanup(&window, &temp_html, &temp_pdf);
        return Err(error);
    }

    let bytes = match std::fs::read(&temp_pdf) {
        Ok(bytes) if !bytes.is_empty() => bytes,
        Ok(_) => {
            cleanup(&window, &temp_html, &temp_pdf);
            return Err("PDF súbor je prázdny.".into());
        }
        Err(e) => {
            cleanup(&window, &temp_html, &temp_pdf);
            return Err(format!("Nepodarilo sa prečítať PDF: {e}"));
        }
    };

    cleanup(&window, &temp_html, &temp_pdf);

    Ok(RenderPdfResult {
        data_base64: STANDARD.encode(bytes),
    })
}

struct PrintMargins {
    top: f64,
    right: f64,
    bottom: f64,
    left: f64,
    paper_width: f64,
    paper_height: f64,
}

/// # Safety
/// Must run on the AppKit main thread that owns the webview (`with_webview`).
#[cfg(target_os = "macos")]
unsafe fn print_to_pdf(
    platform: tauri::webview::PlatformWebview,
    path: &str,
    margins: &PrintMargins,
) -> Result<(), String> {
    use objc2::msg_send;
    use objc2::runtime::{AnyObject, Bool, ProtocolObject, Sel};
    use objc2_app_kit::{
        NSPrintInfo, NSPrintJobSavingURL, NSPrintOperation, NSPrintSaveJob,
        NSPrintingPaginationMode, NSWindow,
    };
    use objc2_foundation::{NSString, NSURL, NSSize};

    let webview = (platform.inner() as *mut AnyObject)
        .as_ref()
        .ok_or("WKWebView nie je dostupný")?;
    let ns_window = (platform.ns_window() as *mut NSWindow)
        .as_ref()
        .ok_or("Export okno nie je dostupné")?;

    let selector = Sel::register(c"printOperationWithPrintInfo:");
    let responds: Bool = msg_send![webview, respondsToSelector: selector];
    if !responds.as_bool() {
        return Err("PDF export vyžaduje macOS 11 alebo novší".into());
    }

    let print_info = NSPrintInfo::new();
    print_info.setJobDisposition(NSPrintSaveJob);
    let url = NSURL::fileURLWithPath(&NSString::from_str(path));
    let url_obj: &AnyObject = &*url;
    print_info
        .dictionary()
        .setObject_forKey(url_obj, ProtocolObject::from_ref(NSPrintJobSavingURL));

    print_info.setPaperSize(NSSize {
        width: margins.paper_width,
        height: margins.paper_height,
    });
    print_info.setTopMargin(margins.top);
    print_info.setBottomMargin(margins.bottom);
    print_info.setLeftMargin(margins.left);
    print_info.setRightMargin(margins.right);
    print_info.setHorizontalPagination(NSPrintingPaginationMode::Fit);
    print_info.setVerticalPagination(NSPrintingPaginationMode::Automatic);

    // WKWebView.printOperationWithPrintInfo: — typed via msg_send to avoid
    // pulling objc2-web-kit (and its optional JSCore deps) into the crate graph.
    let op: *const NSPrintOperation =
        msg_send![webview, printOperationWithPrintInfo: &*print_info];
    let op = op
        .as_ref()
        .ok_or("Nepodarilo sa vytvoriť NSPrintOperation")?;

    op.setShowsPrintPanel(false);
    op.setShowsProgressPanel(false);
    if let Some(view) = op.view() {
        let frame: objc2_foundation::NSRect = msg_send![webview, frame];
        view.setFrame(frame);
    }

    op.runOperationModalForWindow_delegate_didRunSelector_contextInfo(
        ns_window,
        None,
        None,
        std::ptr::null_mut(),
    );

    Ok(())
}

#[cfg(not(target_os = "macos"))]
unsafe fn print_to_pdf(
    _platform: tauri::webview::PlatformWebview,
    _path: &str,
    _margins: &PrintMargins,
) -> Result<(), String> {
    Err("Natívny PDF export je dostupný len na macOS.".into())
}
