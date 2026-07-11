import { flushSync } from 'react-dom'
import { cacheDocument } from '@/lib/cache/document-cache'
import {
  createDocument,
  flushPendingWrites,
  getDocument,
  listDocuments,
  listFolders,
  setDocumentFavorite,
} from '@/lib/db/api'
import type { Document, DocumentSummary } from '@/lib/db/api'
import { fetchLibrarySnapshot, prependDocumentSummary } from '@/lib/db/library-sync'
import { applyDiskPersistResult } from '@/lib/disk-sync'
import { ROUTES } from '@/lib/routes'
import { serializeScribeDemoContent } from '@/lib/templates/demo-guide'
import type { AppDispatch } from '@/store/index'
import { setFolders } from '@/store/foldersSlice'
import {
  setActiveDocument,
  setActiveDocumentId,
  setDocuments,
  setSaveStatus,
  updateDocuments,
} from '@/store/documentsSlice'

export const DEMO_GUIDE_TITLE = 'Sprievodca Scribe — demo'
export const DEMO_WIKI_TARGET_TITLE = 'Ukážkový cieľ wiki odkazu'
const DEFAULT_DOCUMENTS_FOLDER_NAME = 'Moje dokumenty'

const WIKI_TARGET_CONTENT_JSON = JSON.stringify({
  type: 'doc',
  content: [
    {
      type: 'heading',
      attrs: { level: 1 },
      content: [{ type: 'text', text: DEMO_WIKI_TARGET_TITLE }],
    },
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: 'Tento krátky dokument slúži ako cieľ wiki odkazu v sprievodcovi Scribe. Kliknite na odkaz v hlavnom demo dokumente a presuniete sa sem.',
        },
      ],
    },
  ],
})

let openDemoGuideInFlight: Promise<OpenDemoGuideResult> | null = null

export function findDemoGuideDocument(documents: DocumentSummary[]): DocumentSummary | undefined {
  return documents.find((doc) => doc.title === DEMO_GUIDE_TITLE && doc.deletedAt == null)
}

function findWikiTargetDocument(documents: DocumentSummary[]): DocumentSummary | undefined {
  return documents.find((doc) => doc.title === DEMO_WIKI_TARGET_TITLE && doc.deletedAt == null)
}

async function resolveLibraryDocuments(fallback: DocumentSummary[]): Promise<DocumentSummary[]> {
  try {
    return await listDocuments()
  } catch {
    return fallback
  }
}

async function resolveDefaultDocumentsFolderId(): Promise<string | null> {
  try {
    const folders = await listFolders()
    return folders.find((folder) => folder.name === DEFAULT_DOCUMENTS_FOLDER_NAME)?.id ?? null
  } catch {
    return null
  }
}

async function syncLibrary(dispatch: AppDispatch) {
  const { folders, documents } = await fetchLibrarySnapshot()
  dispatch(setFolders(folders))
  dispatch(setDocuments(documents))
}

async function ensureWikiTargetDocument(
  documents: DocumentSummary[],
  folderId: string | null,
): Promise<Document> {
  const existing = findWikiTargetDocument(documents)
  if (existing) {
    return cacheDocument(await getDocument(existing.id))
  }

  return cacheDocument(
    await createDocument({
      title: DEMO_WIKI_TARGET_TITLE,
      folderId,
      contentJson: WIKI_TARGET_CONTENT_JSON,
    }),
  )
}

async function createDemoGuideDocument(documents: DocumentSummary[]): Promise<Document> {
  const folderId = await resolveDefaultDocumentsFolderId()
  const wikiTarget = await ensureWikiTargetDocument(documents, folderId)
  const document = cacheDocument(
    await createDocument({
      title: DEMO_GUIDE_TITLE,
      folderId,
      contentJson: serializeScribeDemoContent(wikiTarget.id),
    }),
  )

  try {
    await setDocumentFavorite(document.id, true)
  } catch {
    // Favorite is optional; demo still works without it.
  }

  return document
}

function activateDocument(dispatch: AppDispatch, doc: Document) {
  flushSync(() => {
    dispatch(updateDocuments((prev) => prependDocumentSummary(prev, doc)))
    dispatch(setActiveDocumentId(doc.id))
    dispatch(setActiveDocument(doc))
    dispatch(setSaveStatus('saved'))
  })
}

async function flushDisk(dispatch: AppDispatch, documentId: string) {
  try {
    const result = await flushPendingWrites(documentId)
    applyDiskPersistResult(dispatch, result)
  } catch {
    // Ignore disk flush transport errors after create.
  }
}

export type OpenDemoGuideResult = {
  document: Document
  created: boolean
}

export async function openDemoGuideDocument(
  documents: DocumentSummary[],
  dispatch: AppDispatch,
): Promise<OpenDemoGuideResult> {
  if (openDemoGuideInFlight) return openDemoGuideInFlight

  openDemoGuideInFlight = (async () => {
    const library = await resolveLibraryDocuments(documents)
    const existing = findDemoGuideDocument(library)

    if (existing) {
      const document = cacheDocument(await getDocument(existing.id))
      activateDocument(dispatch, document)
      return { document, created: false }
    }

    const document = await createDemoGuideDocument(library)
    activateDocument(dispatch, document)
    await syncLibrary(dispatch)
    await flushDisk(dispatch, document.id)
    return { document, created: true }
  })()

  try {
    return await openDemoGuideInFlight
  } finally {
    openDemoGuideInFlight = null
  }
}

export async function navigateToDemoGuide(
  documents: DocumentSummary[],
  dispatch: AppDispatch,
  navigate: (route: ReturnType<typeof ROUTES.document>) => void | Promise<void>,
): Promise<OpenDemoGuideResult> {
  const result = await openDemoGuideDocument(documents, dispatch)
  await navigate(ROUTES.document(result.document.id))
  return result
}
