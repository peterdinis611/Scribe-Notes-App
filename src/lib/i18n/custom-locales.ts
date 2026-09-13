export type CustomLocalePack = {
  code: string
  name: string
  messages: Record<string, unknown>
}

const CODE_RE = /^[a-z][a-z0-9_-]{0,15}$/
const BUILT_IN = new Set(['sk', 'en'])
const MAX_JSON_CHARS = 2_500_000

export function normalizeLocaleCode(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 16)
}

export function isBuiltInLocaleCode(code: string): boolean {
  return BUILT_IN.has(code)
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function countLeaves(value: unknown, depth = 0): number {
  if (depth > 12) return 0
  if (!isPlainObject(value)) return typeof value === 'string' ? 1 : 0
  let total = 0
  for (const child of Object.values(value)) {
    total += countLeaves(child, depth + 1)
  }
  return total
}

/** Accepts wrapped pack or bare messages (+ optional code/name from file name). */
export function parseCustomLocalePack(
  raw: string,
  options?: { fallbackCode?: string; fallbackName?: string },
): CustomLocalePack {
  if (raw.length > MAX_JSON_CHARS) {
    throw new Error('Language file is too large (max ~2.5 MB)')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('Invalid JSON')
  }

  if (!isPlainObject(parsed)) {
    throw new Error('Language JSON must be an object')
  }

  let codeRaw = ''
  let nameRaw = ''
  let messages: Record<string, unknown>

  if (isPlainObject(parsed.messages) || isPlainObject(parsed.translation)) {
    messages = (parsed.messages ?? parsed.translation) as Record<string, unknown>
    codeRaw = String(parsed.code ?? parsed.locale ?? parsed.lang ?? '')
    nameRaw = String(parsed.name ?? parsed.label ?? parsed.title ?? '')
  } else {
    // Bare i18n tree (same shape as en.json / sk.json)
    messages = parsed
    codeRaw = String(parsed.code ?? '')
    nameRaw = String(parsed.name ?? '')
    // If someone put code/name keys inside a real catalog, keep them only if tiny.
    if (isPlainObject(messages.settings) || isPlainObject(messages.common) || isPlainObject(messages.toolbar)) {
      // likely a real catalog — ignore top-level code/name collision
      codeRaw = options?.fallbackCode ?? ''
      nameRaw = options?.fallbackName ?? ''
    }
  }

  const code = normalizeLocaleCode(codeRaw || options?.fallbackCode || '')
  if (!code || !CODE_RE.test(code)) {
    throw new Error('Missing or invalid language code (e.g. "de", "cs", "pl")')
  }
  if (isBuiltInLocaleCode(code)) {
    throw new Error(`Cannot replace built-in language "${code}". Use a different code.`)
  }

  const leafCount = countLeaves(messages)
  if (leafCount < 3) {
    throw new Error('Language file has too few translation strings')
  }

  const name =
    nameRaw.trim().slice(0, 64) ||
    options?.fallbackName?.trim().slice(0, 64) ||
    code.toUpperCase()

  return { code, name, messages }
}

export function serializeCustomLocalePack(pack: CustomLocalePack): string {
  return `${JSON.stringify(
    {
      code: pack.code,
      name: pack.name,
      messages: pack.messages,
    },
    null,
    2,
  )}\n`
}

export function guessCodeFromFileName(fileName: string): string | undefined {
  const base = fileName.replace(/\.[^.]+$/, '').trim()
  const match = base.match(/(?:^|[._-])([a-z]{2}(?:-[a-z]{2})?)$/i)
  if (match) return normalizeLocaleCode(match[1])
  const normalized = normalizeLocaleCode(base)
  return normalized && CODE_RE.test(normalized) ? normalized : undefined
}
