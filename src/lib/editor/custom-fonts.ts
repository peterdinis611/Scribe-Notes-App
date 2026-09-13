import { open } from '@tauri-apps/plugin-dialog'
import { formatCustomFontFamily, normalizeFontFamily } from '@/lib/editor/font-family'
import { readBinaryFile } from '@/lib/db/api'
import { fontBlobGet, fontBlobRemove, fontBlobSet } from '@/lib/storage/font-blobs'
import { kvGet, kvSet } from '@/lib/storage/kv'

const REGISTRY_KEY = 'scribe-custom-fonts-v1'
const STYLE_ATTR = 'data-scribe-custom-font'
const MAX_FONTS = 24
const MAX_BYTES = 4 * 1024 * 1024

export type CustomFontRecord = {
  id: string
  family: string
  fileName: string
  format: 'woff2' | 'woff' | 'truetype' | 'opentype'
  createdAt: number
  byteLength: number
}

const loadedFamilies = new Set<string>()
const objectUrls = new Map<string, string>()

function extensionOf(fileName: string) {
  const match = fileName.toLowerCase().match(/\.([a-z0-9]+)$/)
  return match?.[1] ?? ''
}

export function fontFormatFromFileName(fileName: string): CustomFontRecord['format'] | null {
  switch (extensionOf(fileName)) {
    case 'woff2':
      return 'woff2'
    case 'woff':
      return 'woff'
    case 'ttf':
      return 'truetype'
    case 'otf':
      return 'opentype'
    default:
      return null
  }
}

export function familyNameFromFileName(fileName: string) {
  const base = fileName.replace(/\.[^.]+$/, '').trim()
  return base
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (ch) => ch.toUpperCase())
    .trim()
}

function readRegistry(): CustomFontRecord[] {
  try {
    const raw = kvGet(REGISTRY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((item): item is CustomFontRecord => {
        return (
          Boolean(item) &&
          typeof item === 'object' &&
          typeof (item as CustomFontRecord).id === 'string' &&
          typeof (item as CustomFontRecord).family === 'string' &&
          typeof (item as CustomFontRecord).fileName === 'string' &&
          typeof (item as CustomFontRecord).format === 'string'
        )
      })
      .slice(0, MAX_FONTS)
  } catch {
    return []
  }
}

function writeRegistry(records: CustomFontRecord[]) {
  kvSet(REGISTRY_KEY, JSON.stringify(records.slice(0, MAX_FONTS)))
}

async function readFontData(id: string): Promise<string | null> {
  return fontBlobGet(id)
}

function bytesToBase64(bytes: Uint8Array) {
  const chunk = 0x8000
  const parts: string[] = []
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, i + chunk)
    let binary = ''
    for (let j = 0; j < slice.length; j += 1) {
      binary += String.fromCharCode(slice[j]!)
    }
    parts.push(binary)
  }
  return btoa(parts.join(''))
}

function base64ToBytes(base64: string) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

function mimeForFormat(format: CustomFontRecord['format']) {
  switch (format) {
    case 'woff2':
      return 'font/woff2'
    case 'woff':
      return 'font/woff'
    case 'truetype':
      return 'font/ttf'
    case 'opentype':
      return 'font/otf'
  }
}

function cssFormat(format: CustomFontRecord['format']) {
  return format
}

function injectFontFace(family: string, objectUrl: string, format: CustomFontRecord['format']) {
  if (typeof document === 'undefined') return
  const existing = document.head.querySelectorAll(`style[${STYLE_ATTR}]`)
  for (const node of existing) {
    if (node.getAttribute(STYLE_ATTR) === family) node.remove()
  }

  const style = document.createElement('style')
  style.setAttribute(STYLE_ATTR, family)
  style.textContent = `
@font-face {
  font-family: ${JSON.stringify(family)};
  src: url(${JSON.stringify(objectUrl)}) format(${JSON.stringify(cssFormat(format))});
  font-display: swap;
  font-weight: 100 900;
  font-style: normal;
}
`.trim()
  document.head.appendChild(style)
}

export function listCustomFonts(): CustomFontRecord[] {
  return readRegistry()
}

export function listCustomFontFamilies(): string[] {
  return readRegistry().map((item) => item.family)
}

export function applyCustomFontFamily(familyName: string) {
  const name = familyName.trim()
  if (!name) return ''
  return formatCustomFontFamily(name)
}

export function isCustomFontFamily(value: string | null | undefined) {
  const primary = (value ?? '').split(',')[0]?.replaceAll(/["']/g, '').trim() ?? ''
  if (!primary) return false
  const normalized = normalizeFontFamily(primary)
  return readRegistry().some((item) => normalizeFontFamily(item.family) === normalized)
}

export async function ensureCustomFontLoaded(familyName: string) {
  const primary = familyName.split(',')[0]?.replaceAll(/["']/g, '').trim() ?? ''
  if (!primary) return
  if (loadedFamilies.has(primary)) return

  const record = readRegistry().find(
    (item) => normalizeFontFamily(item.family) === normalizeFontFamily(primary),
  )
  if (!record) return

  const stored = await readFontData(record.id)
  if (!stored) return

  const bytes = base64ToBytes(stored)
  const blob = new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)], {
    type: mimeForFormat(record.format),
  })
  const url = URL.createObjectURL(blob)
  const previous = objectUrls.get(record.id)
  if (previous) URL.revokeObjectURL(previous)
  objectUrls.set(record.id, url)

  injectFontFace(record.family, url, record.format)

  try {
    if (typeof FontFace !== 'undefined' && document?.fonts) {
      const face = new FontFace(record.family, `url(${url})`, {
        display: 'swap',
        weight: '100 900',
      })
      await face.load()
      document.fonts.add(face)
    }
  } catch {
    // Style tag still registers the face for CSS.
  }

  loadedFamilies.add(record.family)
}

export async function ensureAllCustomFontsLoaded() {
  for (const record of readRegistry()) {
    await ensureCustomFontLoaded(record.family)
  }
}

export function loadCustomFontsForDocument(contentJson: string, pageFontFamily?: string) {
  const needed = new Set<string>()
  if (pageFontFamily && isCustomFontFamily(pageFontFamily)) {
    needed.add(pageFontFamily.split(',')[0]?.replaceAll(/["']/g, '').trim() ?? '')
  }
  for (const record of readRegistry()) {
    if (contentJson.includes(record.family)) {
      needed.add(record.family)
    }
  }
  for (const family of needed) {
    if (family) void ensureCustomFontLoaded(family)
  }
}

function pickFontViaInput(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.woff2,.woff,.ttf,.otf,font/woff2,font/woff,font/ttf,font/otf'
    input.onchange = () => resolve(input.files?.[0] ?? null)
    input.click()
  })
}

async function pickFontFile(): Promise<{ fileName: string; bytes: Uint8Array } | null> {
  try {
    const selected = await open({
      multiple: false,
      title: 'Upload font',
      filters: [{ name: 'Fonts', extensions: ['woff2', 'woff', 'ttf', 'otf'] }],
      fileAccessMode: 'scoped',
    })
    if (selected && !Array.isArray(selected)) {
      const bytes = new Uint8Array(await readBinaryFile(selected))
      const fileName = selected.split(/[/\\]/).pop() ?? 'font.ttf'
      return { fileName, bytes }
    }
  } catch {
    // Browser / non-Tauri fallback
  }

  const file = await pickFontViaInput()
  if (!file) return null
  const buffer = await file.arrayBuffer()
  return { fileName: file.name, bytes: new Uint8Array(buffer) }
}

export type RegisterCustomFontResult =
  | { ok: true; record: CustomFontRecord; cssValue: string }
  | { ok: false; error: 'cancelled' | 'unsupported' | 'tooLarge' | 'limit' | 'failed' }

export async function registerCustomFontFromPicker(
  preferredFamily?: string,
): Promise<RegisterCustomFontResult> {
  const picked = await pickFontFile()
  if (!picked) return { ok: false, error: 'cancelled' }

  const format = fontFormatFromFileName(picked.fileName)
  if (!format) return { ok: false, error: 'unsupported' }
  if (picked.bytes.byteLength > MAX_BYTES) return { ok: false, error: 'tooLarge' }

  const registry = readRegistry()
  if (registry.length >= MAX_FONTS) return { ok: false, error: 'limit' }

  const family =
    preferredFamily?.trim() ||
    familyNameFromFileName(picked.fileName) ||
    `Custom Font ${registry.length + 1}`

  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `font-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  const record: CustomFontRecord = {
    id,
    family,
    fileName: picked.fileName,
    format,
    createdAt: Date.now(),
    byteLength: picked.bytes.byteLength,
  }

  try {
    await fontBlobSet(id, bytesToBase64(picked.bytes))
    writeRegistry([
      record,
      ...registry.filter((item) => normalizeFontFamily(item.family) !== normalizeFontFamily(family)),
    ])
    await ensureCustomFontLoaded(family)
    return { ok: true, record, cssValue: applyCustomFontFamily(family) }
  } catch {
    await fontBlobRemove(id)
    return { ok: false, error: 'failed' }
  }
}

export async function removeCustomFont(id: string) {
  const existing = readRegistry().find((item) => item.id === id)
  writeRegistry(readRegistry().filter((item) => item.id !== id))
  await fontBlobRemove(id)
  const url = objectUrls.get(id)
  if (url) {
    URL.revokeObjectURL(url)
    objectUrls.delete(id)
  }
  if (existing) loadedFamilies.delete(existing.family)
}
