import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
  },
  envPrefix: ['VITE_', 'TAURI_'],
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
            { name: 'embedpdf', test: /\/node_modules\/@embedpdf\// },
          ],
        },
      },
    },
  },
})
