import {
  convertFileSrc as tauriConvertFileSrc,
  invoke as tauriInvoke,
  isTauri,
} from '@tauri-apps/api/core'

type TauriInternals = {
  invoke: typeof tauriInvoke
  convertFileSrc: typeof tauriConvertFileSrc
}

function getTauriInternals(): TauriInternals | undefined {
  if (typeof window === 'undefined') return undefined
  return (window as Window & { __TAURI_INTERNALS__?: TauriInternals }).__TAURI_INTERNALS__
}

/** True when the page is hosted inside the Scribe / Tauri webview. */
export function isTauriRuntime(): boolean {
  return isTauri() && Boolean(getTauriInternals()?.invoke)
}

/**
 * Wait until Tauri IPC is injected. Vite can paint before the webview bridge
 * is ready; opening http://localhost:5174 in a normal browser never gets it.
 */
export async function waitForTauri(timeoutMs = 8000): Promise<void> {
  if (isTauriRuntime()) return

  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, 50)
    })
    if (isTauriRuntime()) return
  }

  throw new Error(
    'Tauri IPC nie je dostupné. Spusti aplikáciu cez `bun run tauri:dev` (nie samotný Vite v prehliadači).',
  )
}

export async function invoke<T>(
  cmd: string,
  args?: Record<string, unknown>,
  options?: Parameters<typeof tauriInvoke>[2],
): Promise<T> {
  await waitForTauri()
  return tauriInvoke<T>(cmd, args, options)
}

export function convertFileSrc(filePath: string, protocol?: string): string {
  if (!isTauriRuntime()) {
    throw new Error(
      'Tauri IPC nie je dostupné. Spusti aplikáciu cez `bun run tauri:dev` (nie samotný Vite v prehliadači).',
    )
  }
  return tauriConvertFileSrc(filePath, protocol)
}
