import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import { HotkeysProvider } from '@tanstack/react-hotkeys'
import '@/i18n'
import { bootstrapTheme } from '@/store/settingsSlice'
import { store } from '@/store/index'
import 'highlight.js/styles/github-dark.min.css'
import './index.css'
import App from './App.tsx'

bootstrapTheme()

// TipTap + React StrictMode double-mount can leave ProseMirror non-editable on WebKit.
createRoot(document.getElementById('root')!).render(
  <Provider store={store}>
    <HotkeysProvider
      defaultOptions={{
        hotkey: {
          preventDefault: true,
          platform: 'mac',
        },
      }}
    >
      <App />
    </HotkeysProvider>
  </Provider>,
)
