import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HotkeysProvider } from '@tanstack/react-hotkeys'
import { Provider as JotaiProvider, getDefaultStore } from 'jotai'
import { bootstrapTheme } from '@/store/settings'
import 'highlight.js/styles/github-dark.min.css'
import './index.css'
import App from './App.tsx'

bootstrapTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <JotaiProvider store={getDefaultStore()}>
      <HotkeysProvider
        defaultOptions={{
          hotkey: {
            preventDefault: true,
            ignoreInputs: false,
            platform: 'mac',
          },
        }}
      >
        <App />
      </HotkeysProvider>
    </JotaiProvider>
  </StrictMode>,
)
