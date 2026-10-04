type OwnedEntry<T> = T & { pluginId: string; entryId: string }

export function createOwnedRegistry<T extends { id: string }>(kind: string) {
  const byEntryId = new Map<string, OwnedEntry<T>>()

  function entryKey(pluginId: string, id: string) {
    return `${pluginId}:${id}`
  }

  return {
    kind,
    register(pluginId: string, item: T) {
      const id = item.id.trim()
      if (!id) throw new Error(`${kind} id is required`)
      const entryId = entryKey(pluginId, id)
      byEntryId.set(entryId, { ...item, id, pluginId, entryId })
      return entryId
    },
    unregister(pluginId: string, id: string) {
      return byEntryId.delete(entryKey(pluginId, id))
    },
    unregisterAll(pluginId: string) {
      let n = 0
      for (const [key, value] of [...byEntryId.entries()]) {
        if (value.pluginId === pluginId) {
          byEntryId.delete(key)
          n += 1
        }
      }
      return n
    },
    list(): OwnedEntry<T>[] {
      return [...byEntryId.values()]
    },
    clear() {
      byEntryId.clear()
    },
  }
}
