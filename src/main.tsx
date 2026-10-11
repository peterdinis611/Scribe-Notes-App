import { createRoot } from 'react-dom/client'
import { feDebug, isFrontendDebug } from '@/lib/debug'
import { hydrateKvStore } from '@/lib/storage/kv'
import 'highlight.js/styles/github-dark.min.css'
import './index.css'

async function bootstrap() {
  if (isFrontendDebug()) {
    feDebug('bootstrap:start', { mode: import.meta.env.MODE })
    ;(window as Window & { __SCRIBEDebug?: boolean }).__SCRIBEDebug = true
  }

  await hydrateKvStore()
  void import('@/lib/vault/session').then(({ installVaultAutoLock }) => {
    installVaultAutoLock()
  })
  // CSP regression signal (debug builds / DevTools).
  window.addEventListener('securitypolicyviolation', (event) => {
    const detail = {
      violatedDirective: event.violatedDirective,
      blockedURI: event.blockedURI,
      effectiveDirective: event.effectiveDirective,
      disposition: event.disposition,
    }
    if (isFrontendDebug()) {
      feDebug('csp:violation', detail)
    }
    void import('@/lib/tauri').then(({ invoke, isTauriRuntime }) => {
      if (!isTauriRuntime()) return
      void invoke('audit_security_event', {
        action: 'csp_violation',
        summary: `CSP blocked ${event.violatedDirective}`,
        detail,
        outcome: 'denied',
      }).catch(() => {})
    })
  })
  const { ensureAllCustomFontsLoaded } = await import('@/lib/editor/custom-fonts')
  void ensureAllCustomFontsLoaded()

  const { Provider } = await import('react-redux')
  const { HotkeysProvider } = await import('@tanstack/react-hotkeys')
  await import('@/i18n')
  const { bootstrapTheme, hydrateAgentPrefs } = await import('@/store/settingsSlice')
  const { store } = await import('@/store/index')
  const { bootstrapPlugins } = await import('@/lib/plugins')
  const { default: App } = await import('./App.tsx')

  bootstrapTheme()
  await bootstrapPlugins()
  void import('@/lib/library/agent-backend').then(async ({ loadAgentPrefsFromBackend }) => {
    const prefs = await loadAgentPrefsFromBackend()
    if (prefs) store.dispatch(hydrateAgentPrefs(prefs))
  })

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

  feDebug('bootstrap:ready')
}

void bootstrap()
