/** Window placement via @tauri-apps/plugin-positioner (desktop). */

import { Position } from '@tauri-apps/plugin-positioner'
import { isTauriRuntime } from '@/lib/tauri'

export { Position }

export async function moveAppWindow(to: Position): Promise<void> {
  if (!isTauriRuntime()) return
  const { moveWindow } = await import('@tauri-apps/plugin-positioner')
  await moveWindow(to)
}

export async function moveAppWindowConstrained(to: Position): Promise<void> {
  if (!isTauriRuntime()) return
  const { moveWindowConstrained } = await import('@tauri-apps/plugin-positioner')
  await moveWindowConstrained(to)
}

export async function centerAppWindow(): Promise<void> {
  await moveAppWindow(Position.Center)
}
