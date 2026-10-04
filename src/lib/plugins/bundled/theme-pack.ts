import { createElement } from 'react'
import type { PluginModule } from '@/lib/plugins/types'
import type { ThemeColors } from '@/lib/themes/types'
import { store } from '@/store/index'
import { setThemeSettings } from '@/store/settingsSlice'
import { createCustomThemeSelection } from '@/store/settings-helpers'
import { toast } from '@/lib/toast'

const PACKS: Record<string, ThemeColors> = {
  pine: {
    background: '#0f1a14',
    foreground: '#e7f0e8',
    mutedForeground: '#9bb0a0',
    border: '#2a3d31',
    sidebar: '#142019',
    sidebarSolid: '#101a14',
    toolbar: '#18261d',
    selection: '#2f5d44',
    selectionStrong: '#3f7a58',
    hover: '#1d3226',
    separator: '#2a3d31',
    formatBar: '#1a2b21',
    destructive: '#e35d5d',
  },
  parchment: {
    background: '#f6f0e4',
    foreground: '#2a241c',
    mutedForeground: '#6e6356',
    border: '#d9cbb6',
    sidebar: '#efe6d6',
    sidebarSolid: '#e8dcc8',
    toolbar: '#f0e7d8',
    selection: '#c9b48f',
    selectionStrong: '#b79a6d',
    hover: '#ebe1d0',
    separator: '#d9cbb6',
    formatBar: '#f2eadc',
    destructive: '#b42318',
  },
}

export const themePackPlugin: PluginModule = {
  manifest: {
    id: 'scribe.theme-pack',
    name: 'Theme pack',
    version: '1.0.0',
    description: 'Apply curated custom theme palettes from the command palette.',
    author: 'Scribe',
    scribeApi: 2,
    permissions: ['commands', 'storage', 'ui.settings', 'import'],
    defaultEnabled: false,
    category: 'workspace',
    i18n: {
      en: {
        'manifest.name': 'Theme pack',
        'cmd.pine': 'Apply theme: Pine night',
        'cmd.parchment': 'Apply theme: Parchment',
        'settings.title': 'Theme packs',
      },
      sk: {
        'manifest.name': 'Balík tém',
        'cmd.pine': 'Použiť tému: Borovicová noc',
        'cmd.parchment': 'Použiť tému: Pergamen',
        'settings.title': 'Balíky tém',
      },
    },
  },
  activate(api) {
    function applyPack(id: keyof typeof PACKS) {
      const colors = PACKS[id]
      const current = store.getState().settings.themeSettings
      store.dispatch(setThemeSettings(createCustomThemeSelection(current, colors)))
      api.storage.set('last-pack', id)
      toast.success(api.i18n.t('manifest.name'), id)
      api.log(`Applied theme pack ${id}`)
    }

    api.commands.register({
      id: 'apply-pine',
      title: api.i18n.t('cmd.pine', 'Apply theme: Pine night'),
      keywords: ['theme', 'pine', 'dark'],
      run: () => applyPack('pine'),
    })
    api.commands.register({
      id: 'apply-parchment',
      title: api.i18n.t('cmd.parchment', 'Apply theme: Parchment'),
      keywords: ['theme', 'parchment', 'light'],
      run: () => applyPack('parchment'),
    })

    api.ui.registerSettingsPanel({
      id: 'packs',
      title: api.i18n.t('settings.title', 'Theme packs'),
      render: () => {
        const last = api.storage.get('last-pack') ?? '—'
        return createElement(
          'div',
          { className: 'flex flex-col gap-2 text-[12px]' },
          createElement(
            'div',
            { className: 'text-[var(--color-muted-foreground)]' },
            `Last: ${last}`,
          ),
          createElement(
            'div',
            { className: 'flex gap-1.5' },
            createElement(
              'button',
              {
                type: 'button',
                className: 'rounded border border-[var(--color-border)] px-2 py-1',
                onClick: () => applyPack('pine'),
              },
              'Pine',
            ),
            createElement(
              'button',
              {
                type: 'button',
                className: 'rounded border border-[var(--color-border)] px-2 py-1',
                onClick: () => applyPack('parchment'),
              },
              'Parchment',
            ),
          ),
        )
      },
    })

    api.import.register({
      id: 'theme-json',
      label: 'Custom theme (.json)',
      extensions: ['json'],
      import: async ({ text, fileName }) => {
        if (!text) throw new Error('Empty theme file')
        const parsed = JSON.parse(text) as ThemeColors
        if (!parsed?.background || !parsed?.foreground) {
          throw new Error('Theme JSON needs background and foreground')
        }
        const current = store.getState().settings.themeSettings
        store.dispatch(setThemeSettings(createCustomThemeSelection(current, parsed)))
        toast.success('Theme imported', fileName)
      },
    })
  },
}
