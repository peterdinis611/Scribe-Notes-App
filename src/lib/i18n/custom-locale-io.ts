import { open, save } from '@tauri-apps/plugin-dialog'
import { readTextFile, writeTextFile } from '@/lib/db/api'
import en from '@/i18n/locales/en.json'
import sampleLocalePack from '@/i18n/locales/locale-pack.example.json'
import {
  guessCodeFromFileName,
  parseCustomLocalePack,
  serializeCustomLocalePack,
  type CustomLocalePack,
} from '@/lib/i18n/custom-locales'

const FILTERS = [{ name: 'Language JSON', extensions: ['json'] }]

function pickJsonViaInput(): Promise<{ text: string; name: string } | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/json,.json'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) {
        resolve(null)
        return
      }
      const reader = new FileReader()
      reader.onload = () => resolve({ text: String(reader.result ?? ''), name: file.name })
      reader.onerror = () => resolve(null)
      reader.readAsText(file)
    }
    input.click()
  })
}

async function pickLanguageJson(): Promise<{ text: string; name: string } | null> {
  try {
    const selected = await open({
      multiple: false,
      title: 'Import language JSON',
      filters: FILTERS,
      fileAccessMode: 'scoped',
    })
    if (selected && !Array.isArray(selected)) {
      const text = await readTextFile(selected)
      const name = selected.split(/[/\\]/).pop() ?? 'language.json'
      return { text, name }
    }
  } catch {
    // Browser / non-Tauri fallback
  }
  return pickJsonViaInput()
}

export async function pickAndParseCustomLocale(): Promise<CustomLocalePack | null> {
  const picked = await pickLanguageJson()
  if (!picked) return null
  const fallbackCode = guessCodeFromFileName(picked.name)
  return parseCustomLocalePack(picked.text, {
    fallbackCode,
    fallbackName: fallbackCode?.toUpperCase(),
  })
}

async function saveLocaleJson(body: string, defaultPath: string, title: string): Promise<string | null> {
  try {
    const path = await save({
      title,
      defaultPath,
      filters: FILTERS,
    })
    if (path) {
      await writeTextFile(path, body)
      return path
    }
  } catch {
    // Browser download fallback
  }

  const blob = new Blob([body], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = defaultPath
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
  return defaultPath
}

export async function exportEnglishLanguageTemplate(): Promise<string | null> {
  const pack: CustomLocalePack = {
    code: 'xx',
    name: 'My language',
    messages: en as unknown as Record<string, unknown>,
  }
  return saveLocaleJson(
    serializeCustomLocalePack(pack),
    'scribe-locale-template.json',
    'Export English language template',
  )
}

/** Small Czech sample pack — partial overrides that import cleanly. */
export async function exportSampleLocalePack(): Promise<string | null> {
  const pack = parseCustomLocalePack(JSON.stringify(sampleLocalePack))
  return saveLocaleJson(
    serializeCustomLocalePack(pack),
    'scribe-locale-sample-cs.json',
    'Export sample language JSON',
  )
}
