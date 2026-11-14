/**
 * Scribe terminal logging — mirrors `crates/scribe-logging`.
 * Host: fern via `init_from_env()`. FE: `logging_write` / ring via `logging_recent`.
 */

export {
  DEFAULT_LOGGING_SETTINGS,
  DEFAULT_QUIET_LOG_TARGETS,
  DEFAULT_RING_CAPACITY,
  LOGGING_ENV_KEYS,
  LOGGING_SCOPES,
  normalizeLoggingSettings,
  parseLoggingLevel,
  type LoggingLevel,
  type LoggingSettings,
  type ModuleLevel,
} from '@/lib/logging/settings'

export {
  loggingClear,
  loggingPing,
  loggingRecent,
  loggingScopes,
  loggingSetLevel,
  loggingSettings,
  loggingSettingsFromJson,
  loggingStats,
  loggingStatus,
  loggingWrite,
  mirrorLogToTerminal,
  normalizeLoggingSettingsNative,
  type LogLine,
  type LogScopeInfo,
  type LogStats,
  type LoggingStatus,
} from '@/lib/logging/api'
