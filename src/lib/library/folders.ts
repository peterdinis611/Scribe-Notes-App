import type { Folder } from '@/lib/db/api'

export type FolderPickerItem = {
  folder: Folder
  depth: number
}

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

export function folderPathLabel(folders: Folder[], folderId: string | null): string {
  if (!folderId) return 'Koreň'

  const byId = new Map(folders.map((folder) => [folder.id, folder]))
  const parts: string[] = []
  let current = byId.get(folderId)

  while (current) {
    parts.unshift(current.name)
    current = current.parentId ? byId.get(current.parentId) : undefined
  }

  return parts.join(' / ') || 'Koreň'
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

export function formatSlovakDocumentCount(count: number): string {
  if (count === 1) return '1 dokument'
  if (count >= 2 && count <= 4) return `${count} dokumenty`
  return `${count} dokumentov`
}

export function buildDeleteFolderConfirmMessage(folderName: string, documentCount: number): string {
  if (documentCount > 0) {
    return `Vymazaním priečinka „${folderName}" sa natrvalo vymažú aj ${formatSlovakDocumentCount(documentCount)} v ňom a v podpriečinkoch. Túto akciu nie je možné vrátiť späť.`
  }

  return `Vymazaním priečinka „${folderName}" sa vymažú aj všetky podpriečinky. Túto akciu nie je možné vrátiť späť.`
}
