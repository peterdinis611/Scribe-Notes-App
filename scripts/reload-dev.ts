#!/usr/bin/env node
/**
 * Reload the running Vite / Tauri webview without restarting `tauri dev`.
 *
 *   npm run dev:reload
 */
const base = (process.env.SCRIBE_DEV_URL ?? 'http://127.0.0.1:5174').replace(/\/$/, '')
const url = `${base}/__scribe_reload`

try {
  const response = await fetch(url)
  if (!response.ok) {
    console.error(`[reload] ${url} → HTTP ${response.status}`)
    process.exit(1)
  }
  console.log(`[reload] editor webview refreshed via ${url}`)
} catch (error) {
  const detail = error instanceof Error ? error.message : String(error)
  console.error(`[reload] nothing listening at ${url}`)
  console.error(`[reload] start the app with: npm run tauri:dev`)
  console.error(`[reload] ${detail}`)
  process.exit(1)
}
