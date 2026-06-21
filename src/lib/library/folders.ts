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
