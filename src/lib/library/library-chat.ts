import type { SearchHit } from '@/lib/db/api'
import { nlpSearch, nlpStatus } from '@/lib/db/nlp-api'

export type LibraryChatCitation = {
  documentId: string
  title: string
  snippet: string
}

export type LibraryChatResult = {
  answer: string
  citations: LibraryChatCitation[]
}

const STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'of',
  'in',
  'on',
  'to',
  'for',
  'is',
  'are',
  'was',
  'were',
  'be',
  'what',
  'which',
  'who',
  'how',
  'when',
  'where',
  'why',
  'do',
  'does',
  'did',
  'can',
  'could',
  'should',
  'would',
  'with',
  'from',
  'about',
  'into',
  'that',
  'this',
  'these',
  'those',
  'it',
  'as',
  'at',
  'by',
  'my',
  'your',
  'our',
  'me',
  'you',
  'we',
  'aj',
  'ale',
  'ako',
  'ak',
  'či',
  'co',
  'čo',
  'je',
  'su',
  'sú',
  'na',
  'do',
  'od',
  'za',
  'po',
  'pre',
  'pri',
  'som',
  'si',
  'sa',
  'to',
  'tam',
  'tu',
  'kde',
  'kedy',
  'preco',
  'prečo',
  'ktory',
  'ktorý',
  'ktora',
  'ktorá',
  'moje',
  'moja',
  'tvoje',
])

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !STOPWORDS.has(token))
}

function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?…])\s+|(?<=;)\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 8)
}

function scoreSentence(sentence: string, queryTerms: Set<string>): number {
  if (queryTerms.size === 0) return 0
  const tokens = new Set(tokenize(sentence))
  let overlap = 0
  for (const term of queryTerms) {
    if (tokens.has(term)) {
      overlap += 1
      continue
    }
    for (const token of tokens) {
      if (token.includes(term) || term.includes(token)) {
        overlap += 0.45
        break
      }
    }
  }
  // Prefer mid-length informative sentences.
  const lengthBonus = sentence.length >= 40 && sentence.length <= 220 ? 0.08 : 0
  return overlap / queryTerms.size + lengthBonus
}

function pickExtractiveSentences(question: string, hits: SearchHit[]): string[] {
  const queryTerms = new Set(tokenize(question))
  const scored: Array<{ sentence: string; score: number }> = []

  hits.forEach((hit, hitIndex) => {
    const source = (hit.snippet || hit.title || '').trim()
    if (!source) return
    const sentences = splitSentences(source)
    const candidates = sentences.length > 0 ? sentences : [source]
    const rankBoost = 0.12 / (hitIndex + 1)

    for (const sentence of candidates) {
      const cleaned = sentence.replace(/\s+/g, ' ').trim()
      if (!cleaned) continue
      scored.push({
        sentence: cleaned,
        score: scoreSentence(cleaned, queryTerms) + rankBoost,
      })
    }
  })

  scored.sort((a, b) => b.score - a.score)

  const picked: string[] = []
  for (const item of scored) {
    if (picked.length >= 4) break
    const lower = item.sentence.toLowerCase()
    const duplicate = picked.some((existing) => {
      const existingLower = existing.toLowerCase()
      return (
        existingLower === lower ||
        existingLower.includes(lower.slice(0, Math.min(48, lower.length))) ||
        lower.includes(existingLower.slice(0, Math.min(48, existingLower.length)))
      )
    })
    if (duplicate) continue
    // Keep at least the best snippet even with weak overlap.
    if (picked.length > 0 && item.score < 0.12 && scored[0]?.score >= 0.2) continue
    picked.push(item.sentence)
  }

  if (picked.length >= 2) return picked.slice(0, 4)
  if (picked.length === 1) return picked
  return hits
    .map((hit) => (hit.snippet || hit.title || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 2)
}

function formatAnswer(sentences: string[]): string {
  if (sentences.length === 0) {
    return 'Based on your notes: No matching passages were found in your indexed library.'
  }
  if (sentences.length === 1) {
    return `Based on your notes: ${sentences[0]}`
  }
  return `Based on your notes:\n${sentences.map((sentence) => `• ${sentence}`).join('\n')}`
}

/** Extractive Q&A over local note embeddings (no cloud LLM). */
export async function askLibrary(question: string): Promise<LibraryChatResult> {
  const trimmed = question.trim()
  if (!trimmed) {
    throw new Error('libraryChat.emptyQuestion')
  }

  const status = await nlpStatus()
  if (!status.enabled) {
    throw new Error('libraryChat.nlpDisabled')
  }
  if (!status.sidecarOk) {
    throw new Error('libraryChat.sidecarUnavailable')
  }

  const hits = await nlpSearch(trimmed, { limit: 6, mode: 'hybrid' })
  const sentences = pickExtractiveSentences(trimmed, hits)
  const citations = hits.map((hit) => ({
    documentId: hit.documentId,
    title: hit.title,
    snippet: hit.snippet,
  }))

  return {
    answer: formatAnswer(sentences),
    citations,
  }
}
