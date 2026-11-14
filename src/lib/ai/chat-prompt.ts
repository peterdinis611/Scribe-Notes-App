import { nlpBuildPrompt as buildPrompt } from '@/lib/db/nlp-api'

/**
 * Shared system+user prompts for FE LLM hosts (parity with Rust/Python `scribe-ai`).
 * Document/library Q&A in the sidecar already calls the same builders; use this when
 * the frontend itself completes via `nlpLlmComplete` (export, teach, custom hosts).
 */
export async function prepareChatPrompt(input: {
  scope: 'document' | 'library' | 'folder'
  question: string
  passages?: unknown
  language?: string
  charBudget?: number
}) {
  const kind = input.scope === 'document' ? 'document_chat' : 'library_chat'
  return buildPrompt({
    kind,
    questionOrText: input.question,
    passages: input.passages,
    language: input.language,
    charBudget: input.charBudget,
  })
}
