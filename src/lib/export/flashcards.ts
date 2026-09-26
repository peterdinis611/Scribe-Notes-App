import { save } from '@tauri-apps/plugin-dialog'
import { writeTextFile } from '@/lib/db/api'
import type { Flashcard } from '@/lib/db/nlp-api'

function sanitizeFileName(name: string, ext: string) {
  const cleaned = name
    .trim()
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 80)
    .trim()
  return `${cleaned || 'flashcards'}.${ext}`
}

function cardFront(card: Flashcard): string {
  return (card.front || card.question || '').trim()
}

function cardBack(card: Flashcard): string {
  return (card.answer || '').trim()
}

/** Anki “Text” import: tab-separated Front / Back (one card per line). */
export function flashcardsToAnkiTsv(cards: Flashcard[]): string {
  return cards
    .map((card) => {
      const front = cardFront(card).replace(/\t/g, ' ').replace(/\r?\n/g, '<br>')
      const back = cardBack(card).replace(/\t/g, ' ').replace(/\r?\n/g, '<br>')
      return `${front}\t${back}`
    })
    .filter((line) => line !== '\t')
    .join('\n')
}

export function flashcardsToMarkdown(cards: Flashcard[], title?: string): string {
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

export async function exportFlashcardsAnki(args: {
  cards: Flashcard[]
  baseName: string
  dialogTitle?: string
}): Promise<string | null> {
  const path = await save({
    title: args.dialogTitle ?? 'Export Anki TSV',
    defaultPath: sanitizeFileName(args.baseName, 'txt'),
    filters: [{ name: 'Anki text', extensions: ['txt', 'tsv'] }],
  })
  if (!path) return null
  await writeTextFile(path, flashcardsToAnkiTsv(args.cards))
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
    defaultPath: sanitizeFileName(args.baseName, 'md'),
    filters: [{ name: 'Markdown', extensions: ['md'] }],
  })
  if (!path) return null
  await writeTextFile(path, flashcardsToMarkdown(args.cards, args.title))
  return path
}
