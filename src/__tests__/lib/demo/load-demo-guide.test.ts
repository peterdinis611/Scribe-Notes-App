import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  DEMO_GUIDE_TITLE,
  DEMO_WIKI_TARGET_TITLE,
  findDemoGuideDocument,
  openDemoGuideDocument,
} from '@/lib/demo/load-demo-guide'
import type { Document, DocumentSummary } from '@/lib/db/api'

vi.mock('@/lib/db/api', () => ({
  createDocument: vi.fn(),
  getDocument: vi.fn(),
  listDocuments: vi.fn(),
  listFolders: vi.fn(),
  setDocumentFavorite: vi.fn().mockResolvedValue(undefined),
  flushPendingWrites: vi.fn().mockResolvedValue({ errors: [] }),
}))

vi.mock('@/lib/cache/document-cache', () => ({
  cacheDocument: (doc: Document) => doc,
}))

vi.mock('@/lib/disk-sync', () => ({
  applyDiskPersistResult: vi.fn(),
}))

vi.mock('@/lib/db/library-sync', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db/library-sync')>()
  return {
    ...actual,
    fetchLibrarySnapshot: vi.fn().mockResolvedValue({ folders: [], documents: [] }),
  }
})

import { createDocument, getDocument, listDocuments, listFolders } from '@/lib/db/api'

function summary(id: string, title: string): DocumentSummary {
  return {
    id,
    title,
    updatedAt: 1,
    createdAt: 1,
    deletedAt: null,
    folderId: null,
    filePath: null,
    isFavorite: false,
  }
}

function document(id: string, title: string): Document {
  return {
    ...summary(id, title),
    contentJson: '{"type":"doc","content":[]}',
  }
}

describe('load-demo-guide', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(listDocuments).mockResolvedValue([])
    vi.mocked(listFolders).mockResolvedValue([])
  })

  it('finds existing demo guide by title', () => {
    const docs = [summary('a', 'Iný'), summary('b', DEMO_GUIDE_TITLE)]
    expect(findDemoGuideDocument(docs)?.id).toBe('b')
  })

  it('opens existing demo guide from database even when redux is empty', async () => {
    const existing = document('demo-1', DEMO_GUIDE_TITLE)
    vi.mocked(listDocuments).mockResolvedValue([summary('demo-1', DEMO_GUIDE_TITLE)])
    vi.mocked(getDocument).mockResolvedValue(existing)

    const dispatch = vi.fn()
    const result = await openDemoGuideDocument([], dispatch)

    expect(result.created).toBe(false)
    expect(result.document.id).toBe('demo-1')
    expect(createDocument).not.toHaveBeenCalled()
    expect(dispatch).toHaveBeenCalled()
  })

  it('creates wiki target and demo guide when missing', async () => {
    const wikiTarget = document('wiki-1', DEMO_WIKI_TARGET_TITLE)
    const demo = document('demo-1', DEMO_GUIDE_TITLE)
    vi.mocked(createDocument)
      .mockResolvedValueOnce(wikiTarget)
      .mockResolvedValueOnce(demo)

    const dispatch = vi.fn()
    const result = await openDemoGuideDocument([], dispatch)

    expect(result.created).toBe(true)
    expect(createDocument).toHaveBeenCalledTimes(2)
    expect(createDocument).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ title: DEMO_WIKI_TARGET_TITLE }),
    )
    expect(createDocument).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ title: DEMO_GUIDE_TITLE }),
    )
  })

  it('deduplicates concurrent open calls', async () => {
    const existing = document('demo-1', DEMO_GUIDE_TITLE)
    vi.mocked(listDocuments).mockResolvedValue([summary('demo-1', DEMO_GUIDE_TITLE)])
    vi.mocked(getDocument).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(existing), 20)),
    )

    const dispatch = vi.fn()
    const [first, second] = await Promise.all([
      openDemoGuideDocument([], dispatch),
      openDemoGuideDocument([], dispatch),
    ])

    expect(first.document.id).toBe('demo-1')
    expect(second.document.id).toBe('demo-1')
    expect(getDocument).toHaveBeenCalledTimes(1)
  })
})
