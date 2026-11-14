/**
 * WebSocket server preferences — keep in sync with `crates/scribe-websockets`.
 */

export const DEFAULT_WEBSOCKET_PORT = 8787
export const DEFAULT_WEBSOCKET_PATH = '/ws'
export const WEBSOCKET_BIND_LOOPBACK = '127.0.0.1'

export type WebsocketSettings = {
  enabled: boolean
  bindHost: string
  port: number
  path: string
  requireToken: boolean
  heartbeatIntervalMs: number
  maxConnections: number
  maxMessageBytes: number
  allowedOrigins: string[]
}

export const DEFAULT_WEBSOCKET_SETTINGS: WebsocketSettings = {
  enabled: false,
  bindHost: WEBSOCKET_BIND_LOOPBACK,
  port: DEFAULT_WEBSOCKET_PORT,
  path: DEFAULT_WEBSOCKET_PATH,
  requireToken: true,
  heartbeatIntervalMs: 30_000,
  maxConnections: 8,
  maxMessageBytes: 65_536,
  allowedOrigins: ['tauri://localhost', 'http://localhost'],
}

const PORT_MIN = 1024
const PORT_MAX = 65_535
const HEARTBEAT_MIN_MS = 5_000
const HEARTBEAT_MAX_MS = 120_000
const MAX_CONNECTIONS_MIN = 1
const MAX_CONNECTIONS_MAX = 64
const MAX_MESSAGE_BYTES_MIN = 1_024
const MAX_MESSAGE_BYTES_MAX = 1_048_576

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(n)))
}

function normalizePath(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return DEFAULT_WEBSOCKET_PATH
  const withSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  if (withSlash.length > 1 && withSlash.endsWith('/')) {
    return withSlash.replace(/\/+$/, '')
  }
  return withSlash
}

function normalizeHost(raw: string): string {
  const trimmed = raw.trim().toLowerCase()
  if (
    !trimmed ||
    trimmed === 'localhost' ||
    trimmed === '127.0.0.1' ||
    trimmed === '::1' ||
    trimmed === '[::1]'
  ) {
    return WEBSOCKET_BIND_LOOPBACK
  }
  if (trimmed === '0.0.0.0' || trimmed === '*' || trimmed === '::') {
    return WEBSOCKET_BIND_LOOPBACK
  }
  return trimmed
}

export function normalizeWebsocketSettings(
  input: Partial<WebsocketSettings> | null | undefined,
): WebsocketSettings {
  const base = { ...DEFAULT_WEBSOCKET_SETTINGS, ...(input ?? {}) }
  let port = Number(base.port)
  if (!Number.isFinite(port) || port < PORT_MIN) port = DEFAULT_WEBSOCKET_PORT
  if (port > PORT_MAX) port = PORT_MAX

  const allowedOrigins = (base.allowedOrigins ?? [])
    .map((item) => String(item).trim())
    .filter(Boolean)
    .filter((item, index, all) => all.findIndex((other) => other.toLowerCase() === item.toLowerCase()) === index)

  return {
    enabled: Boolean(base.enabled),
    bindHost: normalizeHost(String(base.bindHost ?? '')),
    port,
    path: normalizePath(String(base.path ?? '')),
    requireToken: Boolean(base.requireToken),
    heartbeatIntervalMs: clamp(Number(base.heartbeatIntervalMs), HEARTBEAT_MIN_MS, HEARTBEAT_MAX_MS),
    maxConnections: clamp(Number(base.maxConnections), MAX_CONNECTIONS_MIN, MAX_CONNECTIONS_MAX),
    maxMessageBytes: clamp(
      Number(base.maxMessageBytes),
      MAX_MESSAGE_BYTES_MIN,
      MAX_MESSAGE_BYTES_MAX,
    ),
    allowedOrigins: allowedOrigins.length
      ? allowedOrigins
      : [...DEFAULT_WEBSOCKET_SETTINGS.allowedOrigins],
  }
}

export function websocketUrl(settings: WebsocketSettings): string {
  const normalized = normalizeWebsocketSettings(settings)
  const path = normalized.path.startsWith('/') ? normalized.path : `/${normalized.path}`
  return `ws://${normalized.bindHost}:${normalized.port}${path}`
}
