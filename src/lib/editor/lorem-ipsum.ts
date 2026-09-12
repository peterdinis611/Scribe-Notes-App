import { kvGet, kvSet } from '@/lib/storage/kv'

export type LoremUnit = 'paragraphs' | 'sentences' | 'words'

export type LoremOptions = {
  unit: LoremUnit
  count: number
  /** Start with the classic “Lorem ipsum dolor sit amet…” lead-in. */
  startWithLorem: boolean
}

const STORAGE_KEY = 'scribe-lorem-options'

export const DEFAULT_LOREM_OPTIONS: LoremOptions = {
  unit: 'paragraphs',
  count: 3,
  startWithLorem: true,
}

const LOREM_WORDS = [
  'lorem',
  'ipsum',
  'dolor',
  'sit',
  'amet',
  'consectetur',
  'adipiscing',
  'elit',
  'sed',
  'do',
  'eiusmod',
  'tempor',
  'incididunt',
  'ut',
  'labore',
  'et',
  'dolore',
  'magna',
  'aliqua',
  'enim',
  'ad',
  'minim',
  'veniam',
  'quis',
  'nostrud',
  'exercitation',
  'ullamco',
  'laboris',
  'nisi',
  'aliquip',
  'ex',
  'ea',
  'commodo',
  'consequat',
  'duis',
  'aute',
  'irure',
  'in',
  'reprehenderit',
  'voluptate',
  'velit',
  'esse',
  'cillum',
  'fugiat',
  'nulla',
  'pariatur',
  'excepteur',
  'sint',
  'occaecat',
  'cupidatat',
  'non',
  'proident',
  'sunt',
  'culpa',
  'qui',
  'officia',
  'deserunt',
  'mollit',
  'anim',
  'id',
  'est',
  'laborum',
] as const

const CLASSIC_LEAD = [
  'Lorem',
  'ipsum',
  'dolor',
  'sit',
  'amet',
  'consectetur',
  'adipiscing',
  'elit',
  'sed',
  'do',
  'eiusmod',
  'tempor',
  'incididunt',
  'ut',
  'labore',
  'et',
  'dolore',
  'magna',
  'aliqua',
]

function clampCount(unit: LoremUnit, count: number): number {
  const n = Math.floor(Number(count))
  if (!Number.isFinite(n) || n < 1) return 1
  if (unit === 'paragraphs') return Math.min(n, 20)
  if (unit === 'sentences') return Math.min(n, 60)
  return Math.min(n, 200)
}

export function normalizeLoremOptions(raw: Partial<LoremOptions> | null | undefined): LoremOptions {
  const unit: LoremUnit =
    raw?.unit === 'sentences' || raw?.unit === 'words' || raw?.unit === 'paragraphs'
      ? raw.unit
      : DEFAULT_LOREM_OPTIONS.unit
  return {
    unit,
    count: clampCount(unit, raw?.count ?? DEFAULT_LOREM_OPTIONS.count),
    startWithLorem: raw?.startWithLorem ?? DEFAULT_LOREM_OPTIONS.startWithLorem,
  }
}

export function loadLoremOptions(): LoremOptions {
  try {
    const raw = kvGet(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_LOREM_OPTIONS }
    return normalizeLoremOptions(JSON.parse(raw) as Partial<LoremOptions>)
  } catch {
    return { ...DEFAULT_LOREM_OPTIONS }
  }
}

export function saveLoremOptions(options: LoremOptions) {
  const normalized = normalizeLoremOptions(options)
  kvSet(STORAGE_KEY, JSON.stringify(normalized))
  return normalized
}

function capitalize(word: string): string {
  if (!word) return word
  return word.charAt(0).toUpperCase() + word.slice(1)
}

function nextWord(index: number, useClassicLead: boolean): string {
  if (useClassicLead && index < CLASSIC_LEAD.length) {
    return CLASSIC_LEAD[index]!.toLowerCase()
  }
  const offset = useClassicLead ? CLASSIC_LEAD.length : 0
  return LOREM_WORDS[(index - offset) % LOREM_WORDS.length]!
}

function buildWords(total: number, startWithLorem: boolean): string[] {
  const words: string[] = []
  for (let i = 0; i < total; i += 1) {
    const word = nextWord(i, startWithLorem)
    words.push(i === 0 ? capitalize(word) : word)
  }
  return words
}

function wordsToSentences(words: string[], sentenceCount: number): string[] {
  if (words.length === 0 || sentenceCount < 1) return []
  const sentences: string[] = []
  const base = Math.max(1, Math.floor(words.length / sentenceCount))
  let cursor = 0
  for (let s = 0; s < sentenceCount; s += 1) {
    const remainingSentences = sentenceCount - s
    const remainingWords = words.length - cursor
    const take =
      s === sentenceCount - 1
        ? remainingWords
        : Math.max(3, Math.min(base + (s % 3), remainingWords - remainingSentences + 1))
    const chunk = words.slice(cursor, cursor + take)
    cursor += take
    if (chunk.length === 0) break
    chunk[0] = capitalize(chunk[0]!)
    sentences.push(`${chunk.join(' ')}.`)
  }
  return sentences
}

function sentencesToParagraphs(sentences: string[], paragraphCount: number): string[] {
  if (sentences.length === 0 || paragraphCount < 1) return []
  const paragraphs: string[] = []
  const base = Math.max(1, Math.floor(sentences.length / paragraphCount))
  let cursor = 0
  for (let p = 0; p < paragraphCount; p += 1) {
    const remainingParagraphs = paragraphCount - p
    const remainingSentences = sentences.length - cursor
    const take =
      p === paragraphCount - 1
        ? remainingSentences
        : Math.max(1, Math.min(base + (p % 2), remainingSentences - remainingParagraphs + 1))
    const chunk = sentences.slice(cursor, cursor + take)
    cursor += take
    if (chunk.length === 0) break
    paragraphs.push(chunk.join(' '))
  }
  return paragraphs
}

/** Generate plain text (paragraphs separated by blank lines). */
export function generateLoremIpsum(options: Partial<LoremOptions> = {}): string {
  const opts = normalizeLoremOptions(options)

  if (opts.unit === 'words') {
    return buildWords(opts.count, opts.startWithLorem).join(' ')
  }

  if (opts.unit === 'sentences') {
    const approxWords = Math.max(opts.count * 8, opts.count)
    const words = buildWords(approxWords, opts.startWithLorem)
    return wordsToSentences(words, opts.count).join(' ')
  }

  const sentenceCount = Math.max(opts.count * 4, opts.count)
  const approxWords = Math.max(sentenceCount * 8, sentenceCount)
  const words = buildWords(approxWords, opts.startWithLorem)
  const sentences = wordsToSentences(words, sentenceCount)
  return sentencesToParagraphs(sentences, opts.count).join('\n\n')
}
