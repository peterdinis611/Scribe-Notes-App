import { invoke } from '@tauri-apps/api/core'

/** Soft-fail canvas audit events (Tauri allowlisted). */
export async function logCanvasAudit(
  action: string,
  summary: string,
  detail?: Record<string, unknown>,
): Promise<void> {
  try {
    await invoke('audit_canvas_event', {
      input: {
        action,
        summary,
        detail: detail ?? null,
        outcome: 'ok',
      },
    })
  } catch {
    // Audit must never block editing.
  }
}
