import { kvGet, kvSet } from '@/lib/storage/kv'

export const CLIPBOARD_HISTORY_LIMIT = 10
export const CLIPBOARD_HISTORY_KEY = 'scribe-clipboard-history'

export type ClipboardHistoryItem = {
  id: string
  text: string
  html?: string
  copiedAt: number
}

type StoredClipboardHistoryItem = {
  id?: unknown
  text?: unknown
  html?: unknown
  copiedAt?: unknown
}

const listeners = new Set<() => void>()
let items: ClipboardHistoryItem[] = []
let loaded = false

function makeId() {
  return `clip-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function normalizeText(value: string) {
  return value.replace(/\u00a0/g, ' ').replace(/\r\n/g, '\n').trim()
}

function parseItem(value: StoredClipboardHistoryItem): ClipboardHistoryItem | null {
  if (typeof value.text !== 'string') return null
  const text = normalizeText(value.text)
  if (!text) return null
  const html = typeof value.html === 'string' && value.html.trim() ? value.html : undefined
  const copiedAt = typeof value.copiedAt === 'number' && Number.isFinite(value.copiedAt) ? value.copiedAt : Date.now()
  const id = typeof value.id === 'string' && value.id ? value.id : makeId()
  return { id, text, html, copiedAt }
}

function readStoredItems(): ClipboardHistoryItem[] {
  try {
    const raw = kvGet(CLIPBOARD_HISTORY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((entry) => parseItem(entry as StoredClipboardHistoryItem))
      .filter((entry): entry is ClipboardHistoryItem => entry !== null)
      .slice(0, CLIPBOARD_HISTORY_LIMIT)
  } catch {
    return []
  }
}

function ensureLoaded() {
  if (loaded) return
  items = readStoredItems()
  loaded = true
}

function persist() {
  kvSet(CLIPBOARD_HISTORY_KEY, JSON.stringify(items))
}

function emit() {
  for (const listener of listeners) listener()
}

export function previewClipboardText(text: string, max = 160) {
  const compact = text.replace(/\s+/g, ' ').trim()
  if (compact.length <= max) return compact
  return `${compact.slice(0, Math.max(1, max - 1))}…`
}

export function getClipboardHistory(): ClipboardHistoryItem[] {
  ensureLoaded()
  return items
}

export function subscribeClipboardHistory(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function rememberClipboardItem(input: { text?: string | null; html?: string | null }) {
  ensureLoaded()
  const text = normalizeText(input.text ?? '')
  if (!text) return getClipboardHistory()

  const html = input.html?.trim() ? input.html : undefined
  const existing = items.find((item) => item.text === text)
  const next: ClipboardHistoryItem = {
    id: existing?.id ?? makeId(),
    text,
    html: html ?? existing?.html,
    copiedAt: Date.now(),
  }

  items = [next, ...items.filter((item) => item.text !== text)].slice(0, CLIPBOARD_HISTORY_LIMIT)
  persist()
  emit()
  return items
}

export function rememberClipboardFromEvent(event: ClipboardEvent) {
  const data = event.clipboardData
  rememberClipboardItem({
    text: data?.getData('text/plain') ?? window.getSelection()?.toString() ?? '',
    html: data?.getData('text/html') ?? '',
  })
}

export function clearClipboardHistory() {
  loaded = true
  items = []
  persist()
  emit()
}

export function resetClipboardHistoryForTests() {
  items = []
  loaded = false
  listeners.clear()
}
