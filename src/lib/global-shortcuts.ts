/** Register OS-wide shortcuts (works while Scribe is unfocused). */

import { isTauriRuntime } from '@/lib/tauri'
import { getResolvedHotkey } from '@/lib/shortcuts'
import type { ShortcutOverrides } from '@/store/persistence'

/** Shortcut IDs that should work system-wide (tray-style capture). */
export const GLOBAL_SHORTCUT_IDS = ['quickNote', 'todayNote'] as const

export type GlobalShortcutId = (typeof GLOBAL_SHORTCUT_IDS)[number]

/** Convert app hotkey (`Mod+Shift+N`) → Tauri global format (`CommandOrControl+Shift+N`). */
export function toGlobalShortcutAccelerator(hotkey: string): string {
  return hotkey
    .split('+')
    .map((part) => {
      const key = part.trim()
      if (key === 'Mod') return 'CommandOrControl'
      if (key === 'Meta') return 'Super'
      if (key === 'Ctrl') return 'Control'
      if (key === 'Alt') return 'Alt'
      if (key === 'Shift') return 'Shift'
      if (key.length === 1) return key.toUpperCase()
      return key
    })
    .join('+')
}

export type GlobalShortcutHandlers = Partial<Record<GlobalShortcutId, () => void | Promise<void>>>

/**
 * Register / refresh global shortcuts. Returns a cleanup that unregisters them.
 */
export async function syncGlobalShortcuts(
  overrides: ShortcutOverrides,
  handlers: GlobalShortcutHandlers,
): Promise<() => Promise<void>> {
  if (!isTauriRuntime()) {
    return async () => {}
  }

  const { register, unregister, isRegistered } = await import(
    '@tauri-apps/plugin-global-shortcut'
  )

  const registered: string[] = []

  for (const id of GLOBAL_SHORTCUT_IDS) {
    const handler = handlers[id]
    if (!handler) continue

    const accelerator = toGlobalShortcutAccelerator(getResolvedHotkey(id, overrides))
    try {
      if (await isRegistered(accelerator)) {
        await unregister(accelerator)
      }
      await register(accelerator, (event) => {
        if (event.state !== 'Pressed') return
        void handler()
      })
      registered.push(accelerator)
    } catch (error) {
      console.warn(`[scribe] global shortcut failed (${id} → ${accelerator})`, error)
    }
  }

  return async () => {
    for (const accelerator of registered) {
      try {
        await unregister(accelerator)
      } catch {
        /* ignore */
      }
    }
  }
}
