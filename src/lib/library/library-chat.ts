import { invoke } from '@/lib/tauri'
import { nlpStatus } from '@/lib/db/nlp-api'

export type LibraryChatCitation = {
  documentId: string
  title: string
  snippet: string
}

export type LibraryChatResult = {
  answer: string
  citations: LibraryChatCitation[]
}

/** Extractive Q&A via NLP sidecar (no cloud LLM). */
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

  return invoke<LibraryChatResult>('nlp_library_answer', {
    question: trimmed,
    limit: 6,
  })
}
