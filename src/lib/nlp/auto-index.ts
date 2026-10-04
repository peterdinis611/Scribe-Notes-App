import { Debouncer } from '@/lib/pacer'
import { nlpIndexDocument, nlpStatus } from '@/lib/db/nlp-api'

const INDEX_DELAY_MS = 2500
const debouncers = new Map<string, Debouncer<() => void>>()

async function indexDocument(documentId: string) {
  const status = await nlpStatus()
  if (!status.enabled || !status.sidecarOk) return
  await nlpIndexDocument(documentId)
}

function getDebouncer(documentId: string) {
  let debouncer = debouncers.get(documentId)
  if (!debouncer) {
    debouncer = new Debouncer(() => {
      void indexDocument(documentId)
    }, { wait: INDEX_DELAY_MS })
    debouncers.set(documentId, debouncer)
  }
  return debouncer
}

/** Queue a debounced NLP reindex after the document is saved. */
export function scheduleNlpDocumentIndex(documentId: string) {
  getDebouncer(documentId).maybeExecute()
}

export function flushNlpDocumentIndex(documentId: string) {
  const debouncer = debouncers.get(documentId)
  if (!debouncer) return
  debouncer.flush()
}

export function cancelNlpDocumentIndex(documentId: string) {
  const debouncer = debouncers.get(documentId)
  if (!debouncer) return
  debouncer.cancel()
  debouncers.delete(documentId)
}
