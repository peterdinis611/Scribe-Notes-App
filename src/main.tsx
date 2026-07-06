import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import { HotkeysProvider } from '@tanstack/react-hotkeys'
import { bootstrapTheme } from '@/store/settingsSlice'
import { store } from '@/store/index'
import 'highlight.js/styles/github-dark.min.css'
import './index.css'
import App from './App.tsx'

bootstrapTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Provider store={store}>
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
    </Provider>
  </StrictMode>,
)
