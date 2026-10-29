/**
 * Frontend development logger.
 *
 * Soft logs (info+): on in Vite/Tauri `import.meta.env.DEV`, or when verbose is on.
 * Verbose (debug + IPC traces): when any of
 * - `VITE_DEBUG=1` / `SCRIBE_FE_DEBUG=1` / `SCRIBE_DEBUG=1`
 * - `localStorage.scribe-debug = '1'` (toggle without rebuild)
 *
 * Opt out of soft DEV logs: `localStorage.scribe-debug = '0'`.
 *
 * Console after boot: `scribeLog.info('hi')`, `scribeLog.setEnabled(true)`.
 */

export type DebugLevel = 'debug' | 'info' | 'warn' | 'error'

export type DebugScope =
  | 'fe'
  | 'ipc'
  | 'save'
  | 'sync'
  | 'router'
  | 'plugins'
  | 'toast'
  | 'boot'

const STORAGE_KEY = 'scribe-debug'

const LEVEL_STYLE: Record<DebugLevel, string> = {
  debug: 'color:#64748b;font-weight:600',
  info: 'color:#0f766e;font-weight:700',
  warn: 'color:#b45309;font-weight:700',
  error: 'color:#dc2626;font-weight:700',
}

const SCOPE_STYLE = 'color:#334155;font-weight:600'

function envFlagOn(): boolean {
  return (
    import.meta.env.VITE_DEBUG === '1' ||
    import.meta.env.VITE_DEBUG === 'true' ||
    import.meta.env.SCRIBE_FE_DEBUG === '1' ||
    import.meta.env.SCRIBE_FE_DEBUG === 'true' ||
    import.meta.env.SCRIBE_DEBUG === '1' ||
    import.meta.env.SCRIBE_DEBUG === 'true'
  )
}

function storageFlag(): boolean | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw === '1' || raw === 'true' || raw === 'on') return true
    if (raw === '0' || raw === 'false' || raw === 'off') return false
  } catch {
    /* private mode */
  }
  return null
}

/** Verbose FE logging (IPC traces, timed debug). */
export function isFrontendDebug(): boolean {
  const stored = storageFlag()
  if (stored != null) return stored
  return envFlagOn()
}

/** Soft development logs (boot/info). On in DEV unless explicitly disabled. */
export function isFrontendLogs(): boolean {
  const stored = storageFlag()
  if (stored === false) return false
  if (stored === true || envFlagOn()) return true
  return Boolean(import.meta.env.DEV)
}

export function setFrontendDebug(enabled: boolean): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0')
  } catch {
    /* ignore */
  }
  ;(window as Window & { __SCRIBEDebug?: boolean }).__SCRIBEDebug = enabled
  const logger = createLogger('fe')
  logger.info(enabled ? 'frontend verbose debug ON' : 'frontend verbose debug OFF')
}

function stamp(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(
    d.getSeconds(),
  ).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}`
}

function write(
  scope: DebugScope,
  level: DebugLevel,
  message: string,
  data?: unknown,
): void {
  if (level === 'debug' && !isFrontendDebug()) return
  if (level === 'info' && !isFrontendLogs()) return
  // warn / error always surface

  const prefix = `%c${stamp()}%c [${scope}]%c ${level.toUpperCase()}%c ${message}`
  const styles = [
    'color:#94a3b8',
    SCOPE_STYLE,
    LEVEL_STYLE[level],
    'color:inherit;font-weight:400',
  ]

  const fn =
    level === 'error'
      ? console.error
      : level === 'warn'
        ? console.warn
        : level === 'info'
          ? console.info
          : console.debug

  if (data === undefined) {
    fn(prefix, ...styles)
    return
  }
  if (data !== null && typeof data === 'object') {
    fn(prefix, ...styles)
    console.groupCollapsed(`  ↳ ${scope} payload`)
    console.dir(data)
    console.groupEnd()
    return
  }
  fn(prefix, ...styles, data)
}

export type ScopedLogger = {
  debug: (message: string, data?: unknown) => void
  info: (message: string, data?: unknown) => void
  warn: (message: string, data?: unknown) => void
  error: (message: string, data?: unknown) => void
  time: (label: string) => () => void
}

export function createLogger(scope: DebugScope): ScopedLogger {
  return {
    debug: (message, data) => write(scope, 'debug', message, data),
    info: (message, data) => write(scope, 'info', message, data),
    warn: (message, data) => write(scope, 'warn', message, data),
    error: (message, data) => write(scope, 'error', message, data),
    time: (label) => {
      if (!isFrontendDebug()) return () => undefined
      const started = performance.now()
      write(scope, 'debug', `${label}:start`)
      return () => {
        write(scope, 'debug', `${label}:ok`, `${(performance.now() - started).toFixed(1)}ms`)
      }
    },
  }
}

/** @deprecated Prefer `createLogger('fe').debug` — kept for existing call sites. */
export function feDebug(message: string, data?: unknown): void {
  createLogger('fe').debug(message, data)
}

/** @deprecated Prefer `createLogger(scope).time` */
export function feDebugTime(label: string): () => void {
  return createLogger('fe').time(label)
}

export function installDebugGlobals(): void {
  if (typeof window === 'undefined') return
  const api = {
    ...createLogger('fe'),
    isEnabled: isFrontendDebug,
    isSoftEnabled: isFrontendLogs,
    setEnabled: setFrontendDebug,
    scope: createLogger,
  }
  ;(window as Window & { scribeLog?: typeof api; __SCRIBEDebug?: boolean }).scribeLog = api
  ;(window as Window & { __SCRIBEDebug?: boolean }).__SCRIBEDebug = isFrontendDebug()

  if (isFrontendLogs()) {
    const boot = createLogger('boot')
    boot.info('Scribe FE logger ready', {
      mode: import.meta.env.MODE,
      soft: isFrontendLogs(),
      verbose: isFrontendDebug(),
      tip: "Verbose IPC: scribeLog.setEnabled(true)  ·  or npm run tauri:dev:debug",
    })
  }
}
