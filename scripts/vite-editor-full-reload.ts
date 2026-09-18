import type { Plugin } from 'vite'

export const EDITOR_RELOAD_ENDPOINT = '/__scribe_reload'

const EDITOR_PATH_MARKERS = [
  '/src/lib/editor/',
  '/src/components/editor/',
  '/src/components/editor-toolbar/',
  '/src/components/DocumentEditor.tsx',
  '/src/hooks/useEditor',
  '/src/hooks/useClipboardHistory.ts',
]

export function shouldFullReloadEditor(file: string): boolean {
  const normalized = file.replace(/\\/g, '/')
  return EDITOR_PATH_MARKERS.some((marker) => normalized.includes(marker))
}

/**
 * TipTap / ProseMirror does not survive Vite Fast Refresh. Changing editor
 * modules would look “updated” while typing stayed dead until Tauri restarted.
 * Force a webview full-reload instead so `tauri dev` can stay running.
 */
export function scribeEditorFullReload(): Plugin {
  return {
    name: 'scribe-editor-full-reload',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split('?')[0]
        if (path !== EDITOR_RELOAD_ENDPOINT) {
          next()
          return
        }
        server.ws.send({ type: 'full-reload' })
        res.statusCode = 200
        res.setHeader('content-type', 'text/plain; charset=utf-8')
        res.end('reload')
      })
    },
    handleHotUpdate({ file, server }) {
      if (!shouldFullReloadEditor(file)) return
      server.ws.send({ type: 'full-reload' })
      return []
    },
  }
}
