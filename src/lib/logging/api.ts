import { invoke, isTauriRuntime } from '@/lib/tauri'
import type { LoggingLevel, LoggingSettings } from '@/lib/logging/settings'

export type LoggingStatus = {
  ready: boolean
  level: string
  runtimeLevel: string
  nlpDebug: boolean
  mirrorFrontend: boolean
  settings: LoggingSettings
  envKeys: string[]
  stats: LogStats
  filePath?: string | null
}

export type LogLine = {
  seq: number
  tsMs: number
  level: string
  target: string
  message: string
}

export type LogStats = {
  total: number
  error: number
  warn: number
  info: number
  debug: number
  trace: number
  capacity: number
  retained: number
}

export type LogScopeInfo = {
  id: string
  label: string
}

export const loggingStatus = () => invoke<LoggingStatus>('logging_status')

export const loggingSettings = () => invoke<LoggingSettings>('logging_settings')

export const normalizeLoggingSettingsNative = (settings: LoggingSettings) =>
  invoke<LoggingSettings>('normalize_logging_settings', { settings })

export const loggingSettingsFromJson = (raw: string) =>
  invoke<LoggingSettings>('logging_settings_from_json', { raw })

export const loggingWrite = (level: string, target: string, message: string) =>
  invoke<boolean>('logging_write', { level, target, message })

export const loggingPing = () => invoke<LoggingStatus>('logging_ping')

export const loggingRecent = (opts?: {
  limit?: number
  minLevel?: LoggingLevel | string
  targetPrefix?: string
}) =>
  invoke<LogLine[]>('logging_recent', {
    limit: opts?.limit ?? 100,
    minLevel: opts?.minLevel ?? null,
    targetPrefix: opts?.targetPrefix ?? null,
  })

export const loggingClear = () => invoke<LogStats>('logging_clear')

export const loggingStats = () => invoke<LogStats>('logging_stats')

export const loggingSetLevel = (level: LoggingLevel | string) =>
  invoke<LoggingStatus>('logging_set_level', { level })

export const loggingScopes = () => invoke<LogScopeInfo[]>('logging_scopes')

/** Fire-and-forget FE → cargo/Tauri terminal. No-op outside Tauri. */
export function mirrorLogToTerminal(
  level: string,
  target: string,
  message: string,
): void {
  if (!isTauriRuntime()) return
  void loggingWrite(level, target, message).catch(() => {
    /* terminal bridge optional */
  })
}
