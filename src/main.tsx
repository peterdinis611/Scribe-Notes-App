import { createRoot } from 'react-dom/client'
import { hydrateKvStore } from '@/lib/storage/kv'
import 'highlight.js/styles/github-dark.min.css'
import './index.css'

async function bootstrap() {
  await hydrateKvStore()

  const { Provider } = await import('react-redux')
  const { HotkeysProvider } = await import('@tanstack/react-hotkeys')
  await import('@/i18n')
  const { bootstrapTheme } = await import('@/store/settingsSlice')
  const { store } = await import('@/store/index')
  const { default: App } = await import('./App.tsx')

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
}

void bootstrap()
