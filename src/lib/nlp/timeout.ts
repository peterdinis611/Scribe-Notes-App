/** Soft timeout for FE → NLP invokes so the UI never hangs on a stalled sidecar. */
export function withNlpTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

export const JOURNAL_NLP_TIMEOUT_MS = 8_000
export const JOURNAL_TASKS_TIMEOUT_MS = 5_000
