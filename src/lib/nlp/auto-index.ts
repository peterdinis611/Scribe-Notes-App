import { debounce } from '@/lib/utils'
import { nlpIndexDocument, nlpStatus } from '@/lib/db/nlp-api'

const INDEX_DELAY_MS = 2500
const schedulers = new Map<string, ReturnType<typeof debounce>>()

async function indexDocument(documentId: string) {
  const status = await nlpStatus()
  if (!status.enabled || !status.sidecarOk) return
  await nlpIndexDocument(documentId)
}

function getScheduler(documentId: string) {
  let scheduler = schedulers.get(documentId)
  if (!scheduler) {
    scheduler = debounce((id: string) => {
      void indexDocument(id).finally(() => {
        schedulers.delete(id)
      })
    }, INDEX_DELAY_MS)
    schedulers.set(documentId, scheduler)
  }
  return scheduler
}

/** Queue a debounced NLP reindex after the document is saved. */
export function scheduleNlpDocumentIndex(documentId: string) {
  getScheduler(documentId)(documentId)
}

export function flushNlpDocumentIndex(documentId: string) {
  const scheduler = schedulers.get(documentId)
  scheduler?.flush()
}

export function cancelNlpDocumentIndex(documentId: string) {
  const scheduler = schedulers.get(documentId)
  scheduler?.cancel()
  schedulers.delete(documentId)
}
