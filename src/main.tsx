import { createRoot } from 'react-dom/client'
import { feDebug, isFrontendDebug } from '@/lib/debug'
import { hydrateKvStore } from '@/lib/storage/kv'
import './index.css'

async function bootstrap() {
  if (isFrontendDebug()) {
    feDebug('bootstrap:start', { mode: import.meta.env.MODE })
    ;(window as Window & { __SCRIBEDebug?: boolean }).__SCRIBEDebug = true
  }

  await hydrateKvStore()

  // Non-critical: vault auto-lock, custom fonts, syntax theme — never block first paint.
  void import('@/lib/vault/session').then(({ installVaultAutoLock }) => {
    installVaultAutoLock()
  })
  void import('@/lib/editor/custom-fonts').then(({ ensureAllCustomFontsLoaded }) => {
    void ensureAllCustomFontsLoaded()
  })
  void import('highlight.js/styles/github-dark.min.css')

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

  // Critical path: load shell deps in parallel, then paint.
  const [{ Provider }, { HotkeysProvider }, , { bootstrapTheme, hydrateAgentPrefs }, { store }, { default: App }] =
    await Promise.all([
      import('react-redux'),
      import('@tanstack/react-hotkeys'),
      import('@/i18n'),
      import('@/store/settingsSlice'),
      import('@/store/index'),
      import('./App.tsx'),
    ])

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

  feDebug('bootstrap:ready')

  // After first paint: plugins + agent prefs.
  void import('@/lib/schedule-idle').then(({ scheduleIdle }) => {
    scheduleIdle(() => {
      void import('@/lib/plugins').then(async ({ bootstrapPlugins }) => {
        await bootstrapPlugins()
      })
      void import('@/lib/library/agent-backend').then(async ({ loadAgentPrefsFromBackend }) => {
        const prefs = await loadAgentPrefsFromBackend()
        if (prefs) store.dispatch(hydrateAgentPrefs(prefs))
      })
    }, 2000)
  })
}

void bootstrap()
