/**
 * Terminal logging prefs — keep in sync with `crates/scribe-logging`.
 */

export const LOGGING_ENV_KEYS = [
  'SCRIBE_RUST_LOG',
  'RUST_LOG',
  'SCRIBE_DEBUG',
  'SCRIBE_LOG_FILE',
  'SCRIBE_LOG_RING',
  'SCRIBE_LOG_COLORS',
  'SCRIBE_LOG_STDERR',
  'SCRIBE_LOG_TIMESTAMPS',
  'SCRIBE_LOG_MIRROR_FE',
] as const

export const DEFAULT_QUIET_LOG_TARGETS = [
  'tao',
  'wry',
  'hyper',
  'reqwest',
  'tracing',
] as const

export const DEFAULT_RING_CAPACITY = 500

export const LOGGING_SCOPES = [
  'scribe.logging',
  'scribe.boot',
  'scribe.db',
  'scribe.storage',
  'scribe.nlp',
  'scribe.agent',
  'scribe.ws',
  'scribe.capture',
  'scribe.audit',
  'scribe.fe',
  'scribe.fe.boot',
  'scribe.fe.ipc',
  'scribe.fe.save',
  'scribe.fe.sync',
  'scribe.fe.router',
  'scribe.fe.plugins',
  'scribe.fe.toast',
  'scribe.fe.diagnostics',
] as const

export type LoggingLevel = 'off' | 'error' | 'warn' | 'info' | 'debug' | 'trace'

export type ModuleLevel = {
  target: string
  level: LoggingLevel
}

export type LoggingSettings = {
  level: LoggingLevel
  colors: boolean
  stderr: boolean
  timestamps: boolean
  quietTargets: string[]
  ringCapacity: number
  filePath?: string | null
  moduleLevels: ModuleLevel[]
  mirrorFrontend: boolean
}

export const DEFAULT_LOGGING_SETTINGS: LoggingSettings = {
  level: 'info',
  colors: true,
  stderr: true,
  timestamps: true,
  quietTargets: [...DEFAULT_QUIET_LOG_TARGETS],
  ringCapacity: DEFAULT_RING_CAPACITY,
  filePath: null,
  moduleLevels: [],
  mirrorFrontend: true,
}

const LEVELS: LoggingLevel[] = ['off', 'error', 'warn', 'info', 'debug', 'trace']

export function parseLoggingLevel(raw: string): LoggingLevel {
  const value = raw.trim().toLowerCase()
  if (!value) return 'info'
  if (value === '0' || value === 'false' || value === 'no') return 'off'
  if (value === '1' || value === 'true' || value === 'yes' || value === 'on') return 'debug'
  if (value === 'warning') return 'warn'
  if ((LEVELS as string[]).includes(value)) return value as LoggingLevel
  if (value.includes('trace')) return 'trace'
  if (value.includes('debug')) return 'debug'
  if (value.includes('warn')) return 'warn'
  if (value.includes('error')) return 'error'
  return 'info'
}

export function normalizeLoggingSettings(
  input: Partial<LoggingSettings> | null | undefined,
): LoggingSettings {
  const base = { ...DEFAULT_LOGGING_SETTINGS, ...(input ?? {}) }
  const quietTargets = (base.quietTargets ?? [])
    .map((item) => String(item).trim())
    .filter(Boolean)
    .filter(
      (item, index, all) =>
        all.findIndex((other) => other.toLowerCase() === item.toLowerCase()) === index,
    )

  const moduleLevels = (base.moduleLevels ?? [])
    .map((item) => ({
      target: String(item.target ?? '').trim(),
      level: parseLoggingLevel(String(item.level ?? 'info')),
    }))
    .filter((item) => item.target.length > 0)

  const filePath =
    base.filePath == null || String(base.filePath).trim() === ''
      ? null
      : String(base.filePath).trim()

  const ringCapacity = Math.min(
    10_000,
    Math.max(32, Number(base.ringCapacity) || DEFAULT_RING_CAPACITY),
  )

  return {
    level: parseLoggingLevel(String(base.level ?? 'info')),
    colors: Boolean(base.colors),
    stderr: Boolean(base.stderr),
    timestamps: Boolean(base.timestamps),
    quietTargets: quietTargets.length ? quietTargets : [...DEFAULT_LOGGING_SETTINGS.quietTargets],
    ringCapacity,
    filePath,
    moduleLevels,
    mirrorFrontend: base.mirrorFrontend !== false,
  }
}
