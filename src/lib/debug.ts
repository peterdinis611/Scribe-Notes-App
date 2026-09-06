/** Frontend debug helpers. Enable with VITE_DEBUG=1 or SCRIBE_FE_DEBUG=1. */

const ENABLED =
  import.meta.env.VITE_DEBUG === '1' ||
  import.meta.env.VITE_DEBUG === 'true' ||
  import.meta.env.SCRIBE_FE_DEBUG === '1' ||
  import.meta.env.SCRIBE_FE_DEBUG === 'true'

export function isFrontendDebug(): boolean {
  return ENABLED
}

export function feDebug(message: string, data?: unknown): void {
  if (!ENABLED) return
  if (data === undefined) {
    console.debug(`[scribe-fe] ${message}`)
    return
  }
  console.debug(`[scribe-fe] ${message}`, data)
}

export function feDebugTime(label: string): () => void {
  if (!ENABLED) return () => undefined
  const started = performance.now()
  console.debug(`[scribe-fe] ${label}:start`)
  return () => {
    console.debug(`[scribe-fe] ${label}:ok`, `${(performance.now() - started).toFixed(1)}ms`)
  }
}
