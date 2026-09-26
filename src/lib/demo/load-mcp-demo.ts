import { flushSync } from 'react-dom'
import { cacheDocument } from '@/lib/cache/document-cache'
import {
  createDocument,
  flushPendingWrites,
  listDocuments,
  listFolders,
  setDocumentFavorite,
  updateDocument,
} from '@/lib/db/api'
import type { Document, DocumentSummary } from '@/lib/db/api'
import { fetchLibrarySnapshot, prependDocumentSummary } from '@/lib/db/library-sync'
import { applyDiskPersistResult } from '@/lib/disk-sync'
import { ROUTES } from '@/lib/routes'
import { buildMcpDemoContentJson } from '@/lib/templates/mcp-demo'
import type { AppDispatch } from '@/store/index'
import { setFolders } from '@/store/foldersSlice'
import {
  setActiveDocument,
  setActiveDocumentId,
  setDocuments,
  setSaveStatus,
  updateDocuments,
} from '@/store/documentsSlice'

const DEFAULT_DOCUMENTS_FOLDER_NAME = 'Moje dokumenty'

export type McpDemoGuideCopy = {
  title: string
  intro: string
  whatTitle: string
  whatBody: string
  setupTitle: string
  setupSteps: string[]
  toolsTitle: string
  tools: Array<{ name: string; hint: string }>
  tryTitle: string
  tryPrompts: string[]
  tipTitle: string
  tipBody: string
}

let openMcpDemoInFlight: Promise<OpenMcpDemoResult> | null = null

export function findMcpDemoDocument(
  documents: DocumentSummary[],
  title: string,
): DocumentSummary | undefined {
  return documents.find((doc) => doc.title === title && doc.deletedAt == null)
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

export type OpenMcpDemoResult = {
  document: Document
  created: boolean
}

export async function openMcpDemoDocument(
  documents: DocumentSummary[],
  dispatch: AppDispatch,
  copy: McpDemoGuideCopy,
): Promise<OpenMcpDemoResult> {
  if (openMcpDemoInFlight) return openMcpDemoInFlight

  openMcpDemoInFlight = (async () => {
    const library = await resolveLibraryDocuments(documents)
    const existing = findMcpDemoDocument(library, copy.title)

    if (existing) {
      const freshContent = buildMcpDemoContentJson(copy)
      const updated = cacheDocument(
        await updateDocument({
          id: existing.id,
          contentJson: freshContent,
        }),
      )
      activateDocument(dispatch, updated)
      await flushDisk(dispatch, updated.id)
      return { document: updated, created: false }
    }

    const folderId = await resolveDefaultDocumentsFolderId()
    const document = cacheDocument(
      await createDocument({
        title: copy.title,
        folderId,
        contentJson: buildMcpDemoContentJson(copy),
      }),
    )

    try {
      await setDocumentFavorite(document.id, true)
    } catch {
      // Favorite is optional.
    }

    activateDocument(dispatch, document)
    await syncLibrary(dispatch)
    await flushDisk(dispatch, document.id)
    return { document, created: true }
  })()

  try {
    return await openMcpDemoInFlight
  } finally {
    openMcpDemoInFlight = null
  }
}

export async function navigateToMcpDemo(
  documents: DocumentSummary[],
  dispatch: AppDispatch,
  navigate: (route: ReturnType<typeof ROUTES.document>) => void | Promise<void>,
  copy: McpDemoGuideCopy,
): Promise<OpenMcpDemoResult> {
  const result = await openMcpDemoDocument(documents, dispatch, copy)
  await navigate(ROUTES.document(result.document.id))
  return result
}
