import { getVersion } from '@tauri-apps/api/app'
import { confirm } from '@tauri-apps/plugin-dialog'
import { useAtom, useSetAtom } from 'jotai'
import { FolderOpen, FolderSearch, Shuffle, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { APP_SHORTCUTS } from '@/lib/shortcuts'
import { THEME_PRESETS } from '@/lib/themes/presets'
import { generateRandomTheme } from '@/lib/themes/generate-random-theme'
import type { ThemeColors, ThemePresetId } from '@/lib/themes/types'
import { THEME_COLOR_FIELDS } from '@/lib/themes/types'
import {
  clearAllDocuments,
  getStorageSettings,
  pickDocumentsDirectory,
  reconcileStorage,
  revealInFinder,
} from '@/lib/db/api'
import type { SettingsSection } from '@/lib/routes'
import {
  activeDocumentAtom,
  activeDocumentIdAtom,
  documentsAtom,
  saveStatusAtom,
} from '@/store/documents'
import { cn } from '@/lib/utils'
import {
  applyThemeSettingsAtom,
  createCustomThemeSelection,
  createResetCustomTheme,
  createThemeSelection,
  storageSettingsAtom,
  themeSettingsAtom,
} from '@/store/settings'

export function AppearanceSection() {
  const [themeSettings] = useAtom(themeSettingsAtom)
  const applyTheme = useSetAtom(applyThemeSettingsAtom)

  function chooseTheme(themeId: ThemePresetId) {
    applyTheme(createThemeSelection(themeSettings, themeId))
  }

  function patchCustomTheme(key: keyof ThemeColors, value: string) {
    const base = themeSettings.customTheme ?? THEME_PRESETS[0].colors
    applyTheme(createCustomThemeSelection(themeSettings, { ...base, [key]: value }))
  }

  function applyRandomTheme() {
    applyTheme(createCustomThemeSelection(themeSettings, generateRandomTheme()))
  }

  const customTheme = themeSettings.customTheme ?? THEME_PRESETS[0].colors
  const isCustomActive = themeSettings.themeId === 'custom'

  return (
    <>
      <section className="settings-section">
        <div className="settings-section-head">
          <div>
            <h3 className="settings-section-title">Téma</h3>
            <p className="settings-section-desc">Vyberte predvolenú tému, vygenerujte náhodnú alebo vytvorte vlastnú.</p>
          </div>
          <Button variant="outline" size="sm" className="theme-random-btn" onClick={applyRandomTheme}>
            <Shuffle className="h-3.5 w-3.5" />
            Náhodná téma
          </Button>
        </div>

        <div className="theme-grid">
          <ThemeCard
            active={themeSettings.themeId === 'system'}
            name="Systém"
            description="Podľa macOS"
            swatch={['#ffffff', '#1e1e1e']}
            onClick={() => chooseTheme('system')}
          />
          {THEME_PRESETS.map((preset) => (
            <ThemeCard
              key={preset.id}
              active={themeSettings.themeId === preset.id}
              name={preset.name}
              description={preset.description}
              swatch={[preset.colors.background, preset.colors.selectionStrong]}
              onClick={() => chooseTheme(preset.id)}
            />
          ))}
          <ThemeCard
            active={isCustomActive}
            name="Vlastná"
            description="Vlastné farby"
            swatch={[customTheme.background, customTheme.selectionStrong]}
            onClick={() => chooseTheme('custom')}
          />
          <button type="button" className="theme-card theme-card--random" onClick={applyRandomTheme}>
            <div className="theme-card-swatches theme-card-swatches--random" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <div className="theme-card-text">
              <p className="theme-card-name">Náhodná</p>
              <p className="theme-card-desc">Nová paleta jedným klikom</p>
            </div>
          </button>
        </div>
      </section>

      {isCustomActive && (
        <section className="settings-section">
          <div className="settings-section-head">
            <div>
              <h3 className="settings-section-title">Vlastná téma</h3>
              <p className="settings-section-desc">Upravte jednotlivé farby rozhrania.</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => applyTheme(createResetCustomTheme(themeSettings))}>
              Reset
            </Button>
            <Button variant="outline" size="sm" onClick={applyRandomTheme}>
              <Shuffle className="h-3.5 w-3.5" />
              Nová náhodná
            </Button>
          </div>

          <div className="settings-colors">
            {THEME_COLOR_FIELDS.map(({ key, label }) => (
              <label key={key} className="settings-color-row">
                <span className="settings-color-label">{label}</span>
                <input
                  type="color"
                  className="settings-color-input"
                  value={toColorInputValue(customTheme[key])}
                  onChange={(event) => patchCustomTheme(key, event.target.value)}
                />
                <input
                  type="text"
                  className="settings-text-input"
                  value={customTheme[key]}
                  onChange={(event) => patchCustomTheme(key, event.target.value)}
                />
              </label>
            ))}
          </div>
        </section>
      )}
    </>
  )
}

export function StorageSection() {
  const [settings, setSettings] = useAtom(storageSettingsAtom)
  const setDocuments = useSetAtom(documentsAtom)
  const setActiveId = useSetAtom(activeDocumentIdAtom)
  const setActiveDocument = useSetAtom(activeDocumentAtom)
  const setSaveStatus = useSetAtom(saveStatusAtom)
  const [clearing, setClearing] = useState(false)
  const [reconciling, setReconciling] = useState(false)
  const [reconcileMessage, setReconcileMessage] = useState<string | null>(null)

  useEffect(() => {
    getStorageSettings()
      .then(setSettings)
      .catch(() => undefined)
  }, [setSettings])

  async function handlePickFolder() {
    const result = await pickDocumentsDirectory()
    if (result) setSettings(result)
  }

  async function handleRevealFolder() {
    if (settings?.documentsDir) {
      await revealInFinder(settings.documentsDir)
    }
  }

  async function handleReconcile() {
    setReconciling(true)
    setReconcileMessage(null)
    try {
      const result = await reconcileStorage()
      setReconcileMessage(
        `Synchronizované: ${result.syncedToDiskCount} na disk, ${result.updatedFromDiskCount} z disku, ${result.importedCount} nových.`,
      )
    } catch {
      setReconcileMessage('Synchronizácia zlyhala.')
    } finally {
      setReconciling(false)
    }
  }

  async function handleClearAll() {
    const confirmed = await confirm(
      'Natrvalo vymažete všetky dokumenty, .scribe súbory a obrázky v priečinku. Túto akciu nie je možné vrátiť späť.',
      { title: 'Vyčistiť všetko?', kind: 'warning', okLabel: 'Vymazať všetko', cancelLabel: 'Zrušiť' },
    )
    if (!confirmed) return

    setClearing(true)
    try {
      await clearAllDocuments()
      setDocuments([])
      setActiveId(null)
      setActiveDocument(null)
      setSaveStatus('saved')
    } finally {
      setClearing(false)
    }
  }

  const shortPath = settings?.documentsDir.replace(/^\/Users\/[^/]+/, '~') ?? '…'

  return (
    <>
      <section className="settings-section">
        <h3 className="settings-section-title">Priečinok dokumentov</h3>
        <p className="settings-section-desc">
          Všetky dokumenty sa ukladajú ako .scribe súbory v tomto priečinku.
        </p>

        <div className="settings-storage-card">
          <div className="settings-storage-path-wrap">
            <FolderOpen className="h-4 w-4 shrink-0 opacity-50" />
            <p className="settings-storage-path" title={settings?.documentsDir}>
              {shortPath}
            </p>
          </div>
          <div className="settings-storage-actions">
            <Button variant="outline" size="sm" onClick={() => void handlePickFolder()}>
              <FolderSearch className="h-3.5 w-3.5" />
              Zmeniť priečinok
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void handleRevealFolder()} disabled={!settings}>
              Otvoriť vo Finderi
            </Button>
            <Button variant="ghost" size="sm" disabled={reconciling} onClick={() => void handleReconcile()}>
              {reconciling ? 'Synchronizujem…' : 'Synchronizovať s diskom'}
            </Button>
          </div>
          {reconcileMessage && <p className="settings-storage-note">{reconcileMessage}</p>}
        </div>
      </section>

      <section className="settings-section">
        <h3 className="settings-section-title">Vyčistiť údaje</h3>
        <p className="settings-section-desc">
          Vymaže všetky dokumenty z aplikácie, príslušné .scribe súbory na disku a uložené obrázky.
        </p>

        <div className="settings-danger-card">
          <Button
            variant="outline"
            size="sm"
            className="settings-danger-btn"
            disabled={clearing}
            onClick={() => void handleClearAll()}
          >
            <Trash2 className="h-3.5 w-3.5" />
            {clearing ? 'Mažem…' : 'Vyčistiť všetko'}
          </Button>
        </div>
      </section>
    </>
  )
}

export function ShortcutsSection() {
  return (
    <section className="settings-section">
      <h3 className="settings-section-title">Klávesové skratky</h3>
      <p className="settings-section-desc">Rýchle akcie dostupné kdekoľvek v aplikácii.</p>

      <div className="settings-shortcuts">
        {APP_SHORTCUTS.map((shortcut) => (
          <div key={shortcut.label} className="settings-shortcut-row">
            <div>
              <p className="settings-shortcut-label">{shortcut.label}</p>
              {shortcut.description && (
                <p className="settings-shortcut-desc">{shortcut.description}</p>
              )}
            </div>
            <span className="settings-shortcut-keys">
              {shortcut.keys.map((key) => (
                <kbd key={key}>{key}</kbd>
              ))}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}

export function AboutSection() {
  const [version, setVersion] = useState('0.1.0')

  useEffect(() => {
    getVersion()
      .then(setVersion)
      .catch(() => undefined)
  }, [])

  return (
    <section className="settings-section">
      <div className="settings-about">
        <div className="settings-about-icon">
          <FileTextIcon />
        </div>
        <h3 className="settings-about-name">Scribe</h3>
        <p className="settings-about-tagline">Textový editor pre macOS</p>
        <p className="settings-about-version">Verzia {version}</p>
      </div>

      <div className="settings-about-details">
        <AboutRow label="Platforma" value="macOS" />
        <AboutRow label="Formát súborov" value=".scribe" />
        <AboutRow label="Export" value="PDF, DOCX, TXT, Pages" />
      </div>
    </section>
  )
}

export function SettingsSectionContent({ section }: { section: SettingsSection }) {
  switch (section) {
    case 'appearance':
      return <AppearanceSection />
    case 'storage':
      return <StorageSection />
    case 'shortcuts':
      return <ShortcutsSection />
    case 'about':
      return <AboutSection />
  }
}

function AboutRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="settings-about-row">
      <span className="settings-about-row-label">{label}</span>
      <span className="settings-about-row-value">{value}</span>
    </div>
  )
}

function FileTextIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-7 w-7" stroke="currentColor" strokeWidth="1.5">
      <path
        d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ThemeCard({
  active,
  name,
  description,
  swatch,
  onClick,
}: {
  active: boolean
  name: string
  description: string
  swatch: [string, string]
  onClick: () => void
}) {
  return (
    <button type="button" className={cn('theme-card', active && 'is-active')} onClick={onClick}>
      <div className="theme-card-swatches">
        <span style={{ background: swatch[0] }} />
        <span style={{ background: swatch[1] }} />
      </div>
      <div className="theme-card-text">
        <p className="theme-card-name">{name}</p>
        <p className="theme-card-desc">{description}</p>
      </div>
    </button>
  )
}

function toColorInputValue(value: string): string {
  if (value.startsWith('#') && (value.length === 7 || value.length === 4)) {
    if (value.length === 4) {
      return (
        '#' +
        value
          .slice(1)
          .split('')
          .map((c) => c + c)
          .join('')
      )
    }
    return value.slice(0, 7)
  }

  const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
  if (!match) return '#ffffff'
  const [, r, g, b] = match.map(Number)
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`
}
