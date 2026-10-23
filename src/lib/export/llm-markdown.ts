import { nlpLlmComplete } from '@/lib/db/nlp-api'
import { tiptapJsonToMarkdown } from '@/lib/export/markdown'
import { tiptapToPlainText } from '@/lib/export/plain-text'

const MAX_SEED_CHARS = 14_000

export type LlmMarkdownResult = {
  markdown: string
  /** True when the LLM rewrote the seed; false = deterministic TipTap serializer. */
  enhanced: boolean
  model?: string
}

/** Strip optional ```markdown fences some models wrap around the answer. */
export function stripMarkdownFences(text: string): string {
  let out = text.trim()
  const fenced = /^```(?:markdown|md|gfm)?\s*\r?\n([\s\S]*?)\r?\n```\s*$/i.exec(out)
  if (fenced?.[1]) {
    out = fenced[1].trim()
  }
  return out.replace(/^\uFEFF/, '')
}

function detectSlovak(text: string): boolean {
  return /[áäčďéíĺľňóôŕšťúýžÁÄČĎÉÍĹĽŇÓÔŔŠŤÚÝŽ]/.test(text)
}

function buildPrompt(args: {
  title: string
  seedMarkdown: string
  plainText: string
  slovak: boolean
}): string {
  const title = args.title.trim() || (args.slovak ? 'Bez názvu' : 'Untitled')
  const seed =
    args.seedMarkdown.trim().slice(0, MAX_SEED_CHARS) ||
    args.plainText.trim().slice(0, MAX_SEED_CHARS)
  if (args.slovak) {
    return [
      `Preveď / vyčisti nasledujúci dokument na čistý GitHub-flavored Markdown.`,
      `Názov dokumentu: ${title}`,
      `Pravidlá:`,
      `- Výstup IBA Markdown (žiadny úvod, žiadny záver, žiadne code fence okolo celého dokumentu).`,
      `- Zachovaj význam a štruktúru; nevymýšľaj nový obsah.`,
      `- Použi # pre názov, ##/### pre sekcie, zoznamy, tabuľky GFM, odkazy, blokové citácie podľa potreby.`,
      `- Oprav zjavné chyby serializácie (zdvojené nadpisy, rozbité zoznamy), ale nič nepridávaj.`,
      ``,
      `Zdroj (Markdown / text):`,
      seed,
    ].join('\n')
  }
  return [
    `Convert / clean the following document into clean GitHub-flavored Markdown.`,
    `Document title: ${title}`,
    `Rules:`,
    `- Output Markdown ONLY (no preamble, no closing remarks, no wrapping code fence).`,
    `- Preserve meaning and structure; do not invent new content.`,
    `- Use # for the title, ##/### for sections, lists, GFM tables, links, and blockquotes as needed.`,
    `- Fix obvious serialization glitches (duplicate headings, broken lists) but do not add material.`,
    ``,
    `Source (Markdown / text):`,
    seed,
  ].join('\n')
}

/**
 * Generate polished Markdown via the configured local LLM.
 * Falls back to the deterministic TipTap → Markdown serializer when LLM is off or fails.
 */
export async function generateMarkdownWithLlm(args: {
  contentJson: string
  title: string
}): Promise<LlmMarkdownResult> {
  const seedMarkdown = tiptapJsonToMarkdown(args.contentJson, args.title)
  const plainText = tiptapToPlainText(args.contentJson)
  const slovak = detectSlovak(`${args.title}\n${plainText}`)

  try {
    const result = await nlpLlmComplete({
      prompt: buildPrompt({
        title: args.title,
        seedMarkdown,
        plainText,
        slovak,
      }),
      system: slovak
        ? 'Si editor Markdownu. Vraciaš len platný GFM Markdown. Bez preambule.'
        : 'You are a Markdown editor. Return only valid GFM Markdown. No preamble.',
      temperature: 0.15,
      maxTokens: 4096,
    })
    const cleaned = stripMarkdownFences(result.text || '')
    if (cleaned.length >= 8) {
      return {
        markdown: cleaned,
        enhanced: true,
        model: result.model,
      }
    }
  } catch {
    /* fall through */
  }

  return { markdown: seedMarkdown, enhanced: false }
}
