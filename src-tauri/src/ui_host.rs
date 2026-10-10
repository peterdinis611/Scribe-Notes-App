use scribe_ui::{render_ui_surface, UiSurface, UiSurfaceRequest};
use serde::Deserialize;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder};
use std::sync::Mutex;

pub const UI_WINDOW_LABEL: &str = "scribe-ui";

#[derive(Default)]
pub struct UiHostState {
    pub html_path: Mutex<Option<PathBuf>>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenUiSurfaceInput {
    pub request: UiSurfaceRequest,
}

#[derive(Debug, Clone, serde::Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UiSurfaceEventPayload {
    pub event: String,
    pub arg: Option<String>,
}

fn write_surface_html(request: &UiSurfaceRequest) -> Result<PathBuf, String> {
    let html = render_ui_surface(request);
    let dir = std::env::temp_dir().join("scribe-ui-surfaces");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(format!("{}.html", request.surface.as_id()));
    fs::write(&path, html).map_err(|e| e.to_string())?;
    Ok(path)
}

#[tauri::command]
pub fn render_ui_surface_html(request: UiSurfaceRequest) -> Result<String, String> {
    Ok(render_ui_surface(&request))
}

#[tauri::command]
pub fn open_ui_surface(
    app: AppHandle,
    host: State<'_, UiHostState>,
    input: OpenUiSurfaceInput,
) -> Result<(), String> {
    let path = write_surface_html(&input.request)?;
    {
        let mut guard = host.html_path.lock().map_err(|e| e.to_string())?;
        *guard = Some(path.clone());
    }

    let url = tauri::Url::from_file_path(&path)
        .map_err(|_| "Failed to build scribe-ui file URL".to_string())?;

    if let Some(window) = app.get_webview_window(UI_WINDOW_LABEL) {
        window
            .navigate(url)
            .map_err(|e| format!("navigate scribe-ui: {e}"))?;
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        return Ok(());
    }

    let title = match input.request.surface {
        UiSurface::WhatsNew => "What's new",
        UiSurface::Welcome => "Welcome",
        UiSurface::Privacy => "Privacy",
        UiSurface::About => "About",
        UiSurface::Docs => "Docs",
    };

    WebviewWindowBuilder::new(&app, UI_WINDOW_LABEL, WebviewUrl::External(url))
        .title(title)
        .inner_size(920.0, 720.0)
        .min_inner_size(640.0, 480.0)
        .resizable(true)
        .build()
        .map_err(|e| format!("create scribe-ui window: {e}"))?;

    Ok(())
}

#[tauri::command]
pub fn close_ui_surface(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(UI_WINDOW_LABEL) {
        let _ = window.hide();
    }
    Ok(())
}

#[tauri::command]
pub fn ui_surface_event(
    app: AppHandle,
    payload: UiSurfaceEventPayload,
) -> Result<(), String> {
    if payload.event == "surface-closed" || payload.event == "whats-new-acked" {
        let _ = close_ui_surface(app.clone());
    }
    app.emit_to("main", "scribe-ui-event", &payload)
        .or_else(|_| app.emit("scribe-ui-event", &payload))
        .map_err(|e| e.to_string())?;
    Ok(())
}
