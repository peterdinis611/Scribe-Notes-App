import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp * 1000
  const minutes = Math.floor(diff / 60000)

  if (minutes < 1) return 'Práve teraz'
  if (minutes < 60) return `Pred ${minutes} min`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `Pred ${hours} h`

  const days = Math.floor(hours / 24)
  return `Pred ${days} d`
}

export type DebouncedFunction<T extends (...args: never[]) => void> = ((
  ...args: Parameters<T>
) => void) & {
  cancel: () => void
  flush: () => void
  pending: () => boolean
}

export function debounce<T extends (...args: never[]) => void>(
  fn: T,
  delay: number,
): DebouncedFunction<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  let lastArgs: Parameters<T> | undefined

  const debounced = ((...args: Parameters<T>) => {
    lastArgs = args
    if (timeoutId) clearTimeout(timeoutId)
    timeoutId = setTimeout(() => {
      timeoutId = undefined
      lastArgs = undefined
      fn(...args)
    }, delay)
  }) as DebouncedFunction<T>

  debounced.cancel = () => {
    if (timeoutId) clearTimeout(timeoutId)
    timeoutId = undefined
    lastArgs = undefined
  }

  debounced.flush = () => {
    if (!timeoutId || !lastArgs) return
    clearTimeout(timeoutId)
    timeoutId = undefined
    const args = lastArgs
    lastArgs = undefined
    fn(...args)
  }

  debounced.pending = () => timeoutId !== undefined

  return debounced
}

export function throttle<T extends (...args: Parameters<T>) => void>(
  fn: T,
  interval: number,
) {
  let lastRun = 0
  let timeoutId: ReturnType<typeof setTimeout> | undefined

  return (...args: Parameters<T>) => {
    const now = Date.now()
    const remaining = interval - (now - lastRun)

    if (remaining <= 0) {
      if (timeoutId) {
        clearTimeout(timeoutId)
        timeoutId = undefined
      }
      lastRun = now
      fn(...args)
      return
    }

    if (timeoutId) clearTimeout(timeoutId)
    timeoutId = setTimeout(() => {
      lastRun = Date.now()
      timeoutId = undefined
      fn(...args)
    }, remaining)
  }
}

export function extractTitleFromContent(contentJson: string): string {
  try {
    const doc = JSON.parse(contentJson) as {
      content?: Array<{
        type?: string
        attrs?: { level?: number }
        content?: Array<{ text?: string }>
      }>
    }

    for (const node of doc.content ?? []) {
      if (node.type === 'heading' && node.content?.[0]?.text) {
        return node.content[0].text.slice(0, 120)
      }
    }

    for (const node of doc.content ?? []) {
      if (node.type === 'paragraph' && node.content?.[0]?.text) {
        const text = node.content[0].text.trim()
        if (text) return text.slice(0, 120)
      }
    }
  } catch {
    // ignore parse errors
  }

  return 'Bez názvu'
}

export function countWords(contentJson: string): number {
  try {
    const doc = JSON.parse(contentJson) as {
      content?: Array<{ content?: Array<{ text?: string }> }>
    }

    const texts: string[] = []
    function walk(nodes: typeof doc.content) {
      for (const node of nodes ?? []) {
        if (node.content) {
          for (const child of node.content) {
            if (child.text) texts.push(child.text)
          }
          walk(node.content as typeof doc.content)
        }
      }
    }
    walk(doc.content)

    const text = texts.join(' ').trim()
    if (!text) return 0
    return text.split(/\s+/).filter(Boolean).length
  } catch {
    return 0
  }
}

export function basename(path: string): string {
  const parts = path.split(/[/\\]/)
  return parts[parts.length - 1] ?? path
}

