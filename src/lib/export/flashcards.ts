import { save } from '@tauri-apps/plugin-dialog'
import {
  flashcardsToAnkiTsvNative,
  flashcardsToMarkdownNative,
  writeTextFile,
} from '@/lib/db/api'
import type { Flashcard } from '@/lib/db/nlp-api'
import { sanitizeFileName } from '@/lib/filenames'
import { isTauriRuntime } from '@/lib/tauri'

function flashcardsFileName(name: string, ext: string) {
  return sanitizeFileName(name.trim() || 'flashcards', ext)
}

function cardFront(card: Flashcard): string {
  return (card.front || card.question || '').trim()
}

function cardBack(card: Flashcard): string {
  return (card.answer || '').trim()
}

/** Sync JS fallback — used by vitest and when Tauri IPC is unavailable. */
export function flashcardsToAnkiTsvLocal(cards: Flashcard[]): string {
  return cards
    .map((card) => {
      const front = cardFront(card).replace(/\t/g, ' ').replace(/\r?\n/g, '<br>')
      const back = cardBack(card).replace(/\t/g, ' ').replace(/\r?\n/g, '<br>')
      return `${front}\t${back}`
    })
    .filter((line) => line !== '\t')
    .join('\n')
}

/** Sync JS fallback — used by vitest and when Tauri IPC is unavailable. */
export function flashcardsToMarkdownLocal(cards: Flashcard[], title?: string): string {
  const lines: string[] = []
  if (title?.trim()) lines.push(`# ${title.trim()}`, '')
  cards.forEach((card, index) => {
    const front = cardFront(card)
    const back = cardBack(card)
    if (!front && !back) return
    lines.push(`## ${index + 1}. ${front || '—'}`)
    if (card.kind) lines.push(`*${card.kind}*`)
    lines.push('', back || '—', '')
  })
  return lines.join('\n').trimEnd() + '\n'
}

/** Prefer Rust `scribe-ui` when running under Tauri; otherwise JS fallback. */
export async function flashcardsToAnkiTsv(cards: Flashcard[]): Promise<string> {
  if (isTauriRuntime()) {
    try {
      return await flashcardsToAnkiTsvNative(cards)
    } catch {
      // Fall through.
    }
  }
  return flashcardsToAnkiTsvLocal(cards)
}

/** Prefer Rust `scribe-ui` when running under Tauri; otherwise JS fallback. */
export async function flashcardsToMarkdown(cards: Flashcard[], title?: string): Promise<string> {
  if (isTauriRuntime()) {
    try {
      return await flashcardsToMarkdownNative(cards, title ?? null)
    } catch {
      // Fall through.
    }
  }
  return flashcardsToMarkdownLocal(cards, title)
}

export async function exportFlashcardsAnki(args: {
  cards: Flashcard[]
  baseName: string
  dialogTitle?: string
}): Promise<string | null> {
  const path = await save({
    title: args.dialogTitle ?? 'Export Anki TSV',
    defaultPath: flashcardsFileName(args.baseName, 'txt'),
    filters: [{ name: 'Anki text', extensions: ['txt', 'tsv'] }],
  })
  if (!path) return null
  await writeTextFile(path, await flashcardsToAnkiTsv(args.cards))
  return path
}

export async function exportFlashcardsMarkdown(args: {
  cards: Flashcard[]
  baseName: string
  title?: string
  dialogTitle?: string
}): Promise<string | null> {
  const path = await save({
    title: args.dialogTitle ?? 'Export Markdown',
    defaultPath: flashcardsFileName(args.baseName, 'md'),
    filters: [{ name: 'Markdown', extensions: ['md'] }],
  })
  if (!path) return null
  await writeTextFile(path, await flashcardsToMarkdown(args.cards, args.title))
  return path
}
