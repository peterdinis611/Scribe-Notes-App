import { nlpIndexDocument, nlpStatus } from '@/lib/db/nlp-api'

const INDEX_DELAY_MS = 2500
const timers = new Map<string, ReturnType<typeof setTimeout>>()

async function indexDocument(documentId: string) {
  const status = await nlpStatus()
  if (!status.enabled || !status.sidecarOk) return
  await nlpIndexDocument(documentId)
}

/** Queue a debounced NLP reindex after the document is saved. */
export function scheduleNlpDocumentIndex(documentId: string) {
  const existing = timers.get(documentId)
  if (existing) clearTimeout(existing)

  timers.set(
    documentId,
    setTimeout(() => {
      timers.delete(documentId)
      void indexDocument(documentId)
    }, INDEX_DELAY_MS),
  )
}

export function flushNlpDocumentIndex(documentId: string) {
  const existing = timers.get(documentId)
  if (!existing) return
  clearTimeout(existing)
  timers.delete(documentId)
  void indexDocument(documentId)
}

export function cancelNlpDocumentIndex(documentId: string) {
  const existing = timers.get(documentId)
  if (existing) clearTimeout(existing)
  timers.delete(documentId)
}
