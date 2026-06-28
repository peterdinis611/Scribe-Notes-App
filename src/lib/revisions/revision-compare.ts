import type { DocumentRevision } from '@/lib/db/api'
import { CURRENT_REVISION_ID } from '@/lib/revisions/diff-text'

export type RevisionCompareOption = {
  id: string
  label: string
  createdAt: number
  isCurrent?: boolean
}

export function buildRevisionCompareOptions(
  revisions: DocumentRevision[],
  currentUpdatedAt: number,
): RevisionCompareOption[] {
  const current: RevisionCompareOption = {
    id: CURRENT_REVISION_ID,
    label: 'Aktuálna verzia',
    createdAt: currentUpdatedAt,
    isCurrent: true,
  }

  const saved = revisions.map((revision) => ({
    id: revision.id,
    label: revision.title,
    createdAt: revision.createdAt,
  }))

  return [current, ...saved]
}

export function getRevisionTimestamp(
  revisionId: string,
  revisions: DocumentRevision[],
  currentUpdatedAt: number,
): number {
  if (revisionId === CURRENT_REVISION_ID) return currentUpdatedAt
  return revisions.find((revision) => revision.id === revisionId)?.createdAt ?? 0
}

export function normalizeComparePair(
  versionAId: string,
  versionBId: string,
  revisions: DocumentRevision[],
  currentUpdatedAt: number,
): { olderId: string; newerId: string } {
  const timeA = getRevisionTimestamp(versionAId, revisions, currentUpdatedAt)
  const timeB = getRevisionTimestamp(versionBId, revisions, currentUpdatedAt)

  if (timeA <= timeB) {
    return { olderId: versionAId, newerId: versionBId }
  }

  return { olderId: versionBId, newerId: versionAId }
}

export function findRevisionOption(
  revisionId: string,
  options: RevisionCompareOption[],
): RevisionCompareOption | undefined {
  return options.find((option) => option.id === revisionId)
}
