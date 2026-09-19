import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { scribeEditorFullReload } from './scripts/vite-editor-full-reload'

const rootDir = path.dirname(fileURLToPath(import.meta.url))
const tauriHost = process.env.TAURI_DEV_HOST

export default defineConfig({
  plugins: [react(), tailwindcss(), scribeEditorFullReload()],
  resolve: {
    alias: {
      '@': path.resolve(rootDir, './src'),
    },
  },
  clearScreen: false,
  server: {
    port: 5174,
    strictPort: true,
    host: tauriHost || '127.0.0.1',
    hmr: tauriHost ? { protocol: 'ws', host: tauriHost, port: 5175 } : undefined,
    watch: {
      ignored: ['**/src-tauri/**', '**/target/**'],
    },
  },
  envPrefix: ['VITE_', 'TAURI_', 'SCRIBE_'],
  optimizeDeps: {
    include: [
      '@tanstack/pacer/debouncer',
      '@tanstack/pacer/throttler',
      '@tanstack/react-pacer',
      'effect/Effect',
      'effect/Option',
      'effect/Fiber',
      'effect/Data',
      'effect/Function',
    ],
    exclude: ['takumi-pdf'],
  },
  assetsInclude: ['**/*.wasm'],
  build: {
    target: 'es2021',
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_DEBUG,
    chunkSizeWarningLimit: 1200,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'tiptap', test: /\/node_modules\/@tiptap\// },
            { name: 'prosemirror', test: /\/node_modules\/prosemirror-/ },
            { name: 'highlight', test: /\/node_modules\/(highlight\.js|lowlight)\// },
            { name: 'mathjs', test: /\/node_modules\/mathjs\// },
            { name: 'mermaid', test: /\/node_modules\/mermaid\// },
            { name: 'd3', test: /\/node_modules\/d3/ },
            { name: 'react-player', test: /\/node_modules\/react-player/ },
            { name: 'leaflet', test: /\/node_modules\/(leaflet|react-leaflet|@react-leaflet)\// },
            { name: 'react-dnd', test: /\/node_modules\/(react-dnd|react-dnd-html5-backend|dnd-core)\// },
            { name: 'emoji-picker', test: /\/node_modules\/emoji-picker-react\// },
          ],
        },
      },
    },
  },
})
