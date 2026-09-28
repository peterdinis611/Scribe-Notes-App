import type { LibraryChatResult } from '@/lib/library/library-chat'
import { listDocuments } from '@/lib/db/api'
import { nlpLibraryAnswer } from '@/lib/db/nlp-api'

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

/** What’s new in a folder over the last 7 days (hybrid answer + recent titles). */
export async function runFolderDigest(folderId: string): Promise<LibraryChatResult> {
  const since = Date.now() - WEEK_MS
  const docs = (await listDocuments())
    .filter((doc) => doc.folderId === folderId && doc.deletedAt == null)
    .filter((doc) => doc.updatedAt >= since)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 16)

  if (!docs.length) {
    return {
      answer: 'Nothing changed in this folder in the last 7 days.',
      citations: [],
      followups: ['What open tasks are in this folder?', 'Summarize the oldest notes here'],
    }
  }

  const titles = docs.map((doc) => `- **${doc.title || 'Untitled'}**`).join('\n')
  try {
    const hybrid = await nlpLibraryAnswer(
      'What changed or matters in these recent notes? Summarize themes and open loops.',
      8,
      folderId,
    )
    const answer =
      hybrid.answer?.trim() ||
      `**Folder digest (7 days)**\n\nRecently updated:\n\n${titles}`
    return {
      answer: `${answer}\n\n**Updated notes**\n\n${titles}`,
      citations:
        hybrid.citations?.length
          ? hybrid.citations
          : docs.slice(0, 8).map((doc) => ({
              documentId: doc.id,
              title: doc.title || 'Untitled',
              snippet: 'Updated in the last 7 days',
            })),
      followups: [
        'What deadlines appear in this folder?',
        'Which notes still look unfinished?',
      ],
    }
  } catch {
    return {
      answer: `**Folder digest (7 days)**\n\nRecently updated:\n\n${titles}`,
      citations: docs.slice(0, 8).map((doc) => ({
        documentId: doc.id,
        title: doc.title || 'Untitled',
        snippet: 'Updated in the last 7 days',
      })),
      followups: ['What themes show up across these notes?'],
    }
  }
}
