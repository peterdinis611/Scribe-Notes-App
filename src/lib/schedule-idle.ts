/** Run after first paint / when the browser is idle. Always cancellable. */
export function scheduleIdle(callback: () => void, timeoutMs = 2000): () => void {
  if (typeof window === 'undefined') {
    callback()
    return () => undefined
  }

  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(callback, { timeout: timeoutMs })
    return () => window.cancelIdleCallback(id)
  }

  const id = window.setTimeout(callback, Math.min(timeoutMs, 800))
  return () => window.clearTimeout(id)
}
