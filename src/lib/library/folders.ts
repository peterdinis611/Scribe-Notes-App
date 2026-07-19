import type { Folder } from '@/lib/db/api'

export type FolderPickerItem = {
  folder: Folder
  depth: number
}

type Translate = (key: string, options?: Record<string, unknown>) => string

export function flattenFoldersForPicker(folders: Folder[]): FolderPickerItem[] {
  const childrenByParent = new Map<string | null, Folder[]>()

  for (const folder of folders) {
    const parentId = folder.parentId
    const siblings = childrenByParent.get(parentId) ?? []
    siblings.push(folder)
    childrenByParent.set(parentId, siblings)
  }

  for (const siblings of childrenByParent.values()) {
    siblings.sort((a, b) => a.name.localeCompare(b.name, 'sk'))
  }

  const items: FolderPickerItem[] = []

  function walk(parentId: string | null, depth: number) {
    for (const folder of childrenByParent.get(parentId) ?? []) {
      items.push({ folder, depth })
      walk(folder.id, depth + 1)
    }
  }

  walk(null, 0)
  return items
}

export function folderPathLabel(
  folders: Folder[],
  folderId: string | null,
  rootLabel = 'Koreň',
): string {
  if (!folderId) return rootLabel

  const byId = new Map(folders.map((folder) => [folder.id, folder]))
  const parts: string[] = []
  let current = byId.get(folderId)

  while (current) {
    parts.unshift(current.name)
    current = current.parentId ? byId.get(current.parentId) : undefined
  }

  return parts.join(' / ') || rootLabel
}

export function collectFolderSubtreeIds(folders: Folder[], rootId: string): Set<string> {
  const childrenByParent = new Map<string, Folder[]>()

  for (const folder of folders) {
    if (!folder.parentId) continue
    const siblings = childrenByParent.get(folder.parentId) ?? []
    siblings.push(folder)
    childrenByParent.set(folder.parentId, siblings)
  }

  const ids = new Set<string>([rootId])
  const queue = [rootId]

  while (queue.length > 0) {
    const current = queue.pop()!
    for (const child of childrenByParent.get(current) ?? []) {
      if (ids.has(child.id)) continue
      ids.add(child.id)
      queue.push(child.id)
    }
  }

  return ids
}

export function countDocumentsInFolders(
  documents: Array<{ folderId: string | null }>,
  folderIds: ReadonlySet<string>,
): number {
  return documents.filter((doc) => doc.folderId != null && folderIds.has(doc.folderId)).length
}

/** @deprecated Prefer formatDocumentCount with i18n */
export function formatSlovakDocumentCount(count: number): string {
  if (count === 1) return '1 dokument'
  if (count >= 2 && count <= 4) return `${count} dokumenty`
  return `${count} dokumentov`
}

export function formatDocumentCount(count: number, t: Translate): string {
  return t('library.documentCount', { count })
}

export function buildDeleteFolderConfirmMessage(
  folderName: string,
  documentCount: number,
  t?: Translate,
): string {
  if (t) {
    if (documentCount > 0) {
      return t('library.deleteFolderWithDocs', {
        name: folderName,
        docs: formatDocumentCount(documentCount, t),
      })
    }
    return t('library.deleteFolderEmpty', { name: folderName })
  }

  if (documentCount > 0) {
    return `Vymazaním priečinka „${folderName}" sa presunú do koša aj ${formatSlovakDocumentCount(documentCount)} v ňom a v podpriečinkoch. Samotný priečinok sa odstráni.`
  }

  return `Vymazaním priečinka „${folderName}" sa odstránia aj všetky podpriečinky.`
}

export function buildTrashFolderConfirmMessage(
  folderName: string,
  documentCount: number,
  t?: Translate,
): string {
  if (t) {
    return t('library.trashFolderConfirm', {
      name: folderName,
      docs: formatDocumentCount(documentCount, t),
    })
  }

  return `Presunúť ${formatSlovakDocumentCount(documentCount)} z priečinka „${folderName}" (vrátane podpriečinkov) do koša? Priečinok ostane zachovaný.`
}
