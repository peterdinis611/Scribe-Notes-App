import { getVersion } from '@tauri-apps/api/app'
import { confirm } from '@tauri-apps/plugin-dialog'
import { useAtom, useSetAtom } from 'jotai'
import { FolderOpen, FolderSearch, Shuffle, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  SettingsKbd,
  SettingsSection,
  SettingsSectionHeader,
} from '@/components/settings/SettingsPrimitives'
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
import { toast } from '@/lib/toast'
import type { SettingsSection as SettingsSectionId } from '@/lib/routes'
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
      <SettingsSection>
        <SettingsSectionHeader
          title="Téma"
          description="Vyberte predvolenú tému, vygenerujte náhodnú alebo vytvorte vlastnú."
          actions={
            <Button variant="outline" size="sm" className="shrink-0" onClick={applyRandomTheme}>
              <Shuffle className="h-3.5 w-3.5" />
              Náhodná téma
            </Button>
          }
        />

        <div className="grid w-full grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-2">
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
          <RandomThemeCard onClick={applyRandomTheme} />
        </div>
      </SettingsSection>

      {isCustomActive && (
        <SettingsSection>
          <SettingsSectionHeader
            title="Vlastná téma"
            description="Upravte jednotlivé farby rozhrania."
            actions={
              <div className="flex shrink-0 gap-2">
                <Button variant="ghost" size="sm" onClick={() => applyTheme(createResetCustomTheme(themeSettings))}>
                  Reset
                </Button>
                <Button variant="outline" size="sm" onClick={applyRandomTheme}>
                  <Shuffle className="h-3.5 w-3.5" />
                  Nová náhodná
                </Button>
              </div>
            }
          />

          <div className="flex max-w-[640px] flex-col gap-2">
            {THEME_COLOR_FIELDS.map(({ key, label }) => (
              <label key={key} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                <span className="text-[12px]">{label}</span>
                <input
                  type="color"
                  className="h-7 w-8 rounded-md border border-[var(--color-border)] bg-transparent p-0"
                  value={toColorInputValue(customTheme[key])}
                  onChange={(event) => patchCustomTheme(key, event.target.value)}
                />
                <Input
                  className="h-8 font-mono text-[11px]"
                  value={customTheme[key]}
                  onChange={(event) => patchCustomTheme(key, event.target.value)}
                />
              </label>
            ))}
          </div>
        </SettingsSection>
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
    if (result) {
      setSettings(result)
      const shortPath = result.documentsDir.replace(/^\/Users\/[^/]+/, '~')
      toast.success('Priečinok dokumentov zmenený', shortPath)
    }
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
      toast.success('Synchronizácia dokončená')
    } catch {
      setReconcileMessage('Synchronizácia zlyhala.')
      toast.error('Synchronizácia zlyhala')
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
      toast.success('Všetky dokumenty vymazané')
    } finally {
      setClearing(false)
    }
  }

  const shortPath = settings?.documentsDir.replace(/^\/Users\/[^/]+/, '~') ?? '…'

  return (
    <>
      <SettingsSection>
        <SettingsSectionHeader
          title="Priečinok dokumentov"
          description="Všetky dokumenty sa ukladajú ako .scribe súbory v tomto priečinku."
        />

        <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <div className="mb-3 flex items-center gap-2.5">
            <FolderOpen className="h-4 w-4 shrink-0 opacity-50" />
            <p className="m-0 truncate font-mono text-[12px] text-[var(--color-foreground)]" title={settings?.documentsDir}>
              {shortPath}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
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
          {reconcileMessage && (
            <p className="mt-2.5 text-[12px] leading-relaxed text-[var(--color-muted-foreground)]">
              {reconcileMessage}
            </p>
          )}
        </div>
      </SettingsSection>

      <SettingsSection>
        <SettingsSectionHeader
          title="Vyčistiť údaje"
          description="Vymaže všetky dokumenty z aplikácie, príslušné .scribe súbory na disku a uložené obrázky."
        />

        <div className="rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--color-destructive)_25%,var(--color-border))] bg-[color-mix(in_srgb,var(--color-destructive)_4%,var(--color-surface))] p-4">
          <Button
            variant="outline"
            size="sm"
            className="hover:border-[color-mix(in_srgb,var(--color-destructive)_40%,var(--color-border))] hover:bg-[color-mix(in_srgb,var(--color-destructive)_10%,var(--color-hover))] hover:text-[var(--color-destructive)]"
            disabled={clearing}
            onClick={() => void handleClearAll()}
          >
            <Trash2 className="h-3.5 w-3.5" />
            {clearing ? 'Mažem…' : 'Vyčistiť všetko'}
          </Button>
        </div>
      </SettingsSection>
    </>
  )
}

export function ShortcutsSection() {
  return (
    <SettingsSection>
      <SettingsSectionHeader
        title="Klávesové skratky"
        description="Rýchle akcie dostupné kdekoľvek v aplikácii."
      />

      <div className="flex flex-col gap-0.5">
        {APP_SHORTCUTS.map((shortcut) => (
          <div
            key={shortcut.label}
            className="flex items-center justify-between gap-4 rounded-[var(--radius-md)] px-3 py-2.5 transition-colors hover:bg-[var(--color-hover)]"
          >
            <div>
              <p className="m-0 text-[13px] font-medium text-[var(--color-foreground)]">{shortcut.label}</p>
              {shortcut.description && (
                <p className="mt-0.5 text-[11px] text-[var(--color-muted-foreground)]">{shortcut.description}</p>
              )}
            </div>
            <span className="flex gap-1">
              {shortcut.keys.map((key) => (
                <SettingsKbd key={key}>{key}</SettingsKbd>
              ))}
            </span>
          </div>
        ))}
      </div>
    </SettingsSection>
  )
}

export function AboutSection() {
  const [version, setVersion] = useState('0.2.0')

  useEffect(() => {
    getVersion()
      .then(setVersion)
      .catch(() => undefined)
  }, [])

  return (
    <SettingsSection>
      <div className="mb-6 flex flex-col items-center rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-8 text-center">
        <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-[18px] border border-[var(--color-border)] bg-[var(--color-surface-elevated)] text-[var(--color-accent)]">
          <FileTextIcon />
        </div>
        <h3 className="m-0 text-[20px] font-bold tracking-[-0.02em]">Scribe</h3>
        <p className="mt-1 text-[13px] text-[var(--color-muted-foreground)]">Textový editor pre macOS</p>
        <p className="mt-2 text-[12px] text-[var(--color-muted-foreground)]">Verzia {version}</p>
      </div>

      <div className="space-y-2">
        <AboutRow label="Platforma" value="macOS" />
        <AboutRow label="Formát súborov" value=".scribe" />
        <AboutRow label="Export" value="PDF, DOCX, TXT, Pages" />
      </div>
    </SettingsSection>
  )
}

export function SettingsSectionContent({ section }: { section: SettingsSectionId }) {
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
    <div className="flex items-center justify-between gap-4 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
      <span className="text-[12px] text-[var(--color-muted-foreground)]">{label}</span>
      <span className="text-[13px] font-medium text-[var(--color-foreground)]">{value}</span>
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

function RandomThemeCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="flex w-full items-center gap-2.5 rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-2.5 text-left transition-colors hover:border-[var(--color-accent)] hover:bg-[color-mix(in_srgb,var(--color-selection)_45%,var(--color-surface))]"
      onClick={onClick}
    >
      <div className="flex shrink-0 flex-col gap-0.5" aria-hidden="true">
        <span className="block h-3 w-7 rounded-[3px] border border-[var(--color-border)] bg-[linear-gradient(90deg,#ff6b6b_0%,#ffd93d_50%,#6bcb77_100%)]" />
        <span className="block h-3 w-7 rounded-[3px] border border-[var(--color-border)] bg-[linear-gradient(90deg,#4d96ff_0%,#b983ff_100%)]" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="m-0 text-[13px] font-semibold text-[var(--color-foreground)]">Náhodná</p>
        <p className="mt-0.5 text-[11px] text-[var(--color-muted-foreground)]">Nová paleta jedným klikom</p>
      </div>
    </button>
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
    <button
      type="button"
      className={cn(
        'flex w-full items-center gap-2.5 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-2.5 text-left transition-[border-color,box-shadow]',
        active && 'border-[var(--color-accent)] shadow-[0_0_0_1px_var(--color-selection)]',
        !active && 'hover:border-[color-mix(in_srgb,var(--color-accent)_40%,var(--color-border))]',
      )}
      onClick={onClick}
    >
      <div className="flex shrink-0 flex-col gap-0.5">
        <span className="block h-3 w-7 rounded-[3px] border border-[var(--color-border)]" style={{ background: swatch[0] }} />
        <span className="block h-3 w-7 rounded-[3px] border border-[var(--color-border)]" style={{ background: swatch[1] }} />
      </div>
      <div className="min-w-0 flex-1 text-left">
        <p className="m-0 text-[13px] font-semibold text-[var(--color-foreground)]">{name}</p>
        <p className="mt-0.5 text-[11px] text-[var(--color-muted-foreground)]">{description}</p>
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
