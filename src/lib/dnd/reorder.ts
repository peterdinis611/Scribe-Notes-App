export function moveIdBefore(ids: string[], fromId: string, toId: string): string[] {
  if (fromId === toId) return ids
  const from = ids.indexOf(fromId)
  const to = ids.indexOf(toId)
  if (from < 0 || to < 0) return ids

  const next = [...ids]
  const [item] = next.splice(from, 1)
  if (!item) return ids
  const target = next.indexOf(toId)
  if (target < 0) return ids
  next.splice(target, 0, item)
  if (next.every((id, index) => id === ids[index])) return ids
  return next
}

export function canNestFolder(
  dragId: string,
  targetId: string | null,
  folders: Array<{ id: string; parentId: string | null }>,
): boolean {
  if (dragId === targetId) return false
  if (targetId == null) return true

  const childrenByParent = new Map<string, string[]>()
  for (const folder of folders) {
    if (!folder.parentId) continue
    const siblings = childrenByParent.get(folder.parentId) ?? []
    siblings.push(folder.id)
    childrenByParent.set(folder.parentId, siblings)
  }

  const seen = new Set<string>([dragId])
  const queue = [dragId]
  while (queue.length > 0) {
    const current = queue.pop()!
    if (current === targetId) return false
    for (const child of childrenByParent.get(current) ?? []) {
      if (seen.has(child)) continue
      seen.add(child)
      queue.push(child)
    }
  }

  return true
}
