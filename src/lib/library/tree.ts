import type { DocumentSummary, Folder } from '@/lib/db/api'

export type TreeNode =
  | { type: 'folder'; folder: Folder; children: TreeNode[] }
  | { type: 'document'; document: DocumentSummary }

export type FlatTreeItem =
  | { type: 'folder'; folder: Folder; depth: number; hasChildren: boolean }
  | { type: 'document'; document: DocumentSummary; depth: number }

export function buildTree(folders: Folder[], documents: DocumentSummary[]): TreeNode[] {
  const folderMap = new Map<string, TreeNode & { type: 'folder' }>()

  for (const folder of folders) {
    folderMap.set(folder.id, { type: 'folder', folder, children: [] })
  }

  const roots: TreeNode[] = []

  for (const folder of folders) {
    const node = folderMap.get(folder.id)!
    if (folder.parentId && folderMap.has(folder.parentId)) {
      folderMap.get(folder.parentId)!.children.push(node)
    } else {
      roots.push(node)
    }
  }

  for (const doc of documents) {
    const docNode: TreeNode = { type: 'document', document: doc }
    if (doc.folderId && folderMap.has(doc.folderId)) {
      folderMap.get(doc.folderId)!.children.push(docNode)
    } else {
      roots.push(docNode)
    }
  }

  return roots
}

export function flattenTree(nodes: TreeNode[], expandedIds: ReadonlySet<string>, depth = 0): FlatTreeItem[] {
  const items: FlatTreeItem[] = []

  for (const node of nodes) {
    if (node.type === 'folder') {
      const hasChildren = node.children.length > 0
      items.push({ type: 'folder', folder: node.folder, depth, hasChildren })
      if (hasChildren && expandedIds.has(node.folder.id)) {
        items.push(...flattenTree(node.children, expandedIds, depth + 1))
      }
      continue
    }

    items.push({ type: 'document', document: node.document, depth })
  }

  return items
}

export function estimateFlatItemSize(item: FlatTreeItem): number {
  return item.type === 'folder' ? 34 : 58
}
