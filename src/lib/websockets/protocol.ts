/**
 * WebSocket JSON protocol — keep in sync with `crates/scribe-websockets`.
 */

export const WEBSOCKET_PROTOCOL_VERSION = 1

export const WEBSOCKET_CHANNELS = [
  'system',
  'documents',
  'audit',
  'nlp',
  'sync',
  'agent',
  'capture',
] as const

export type WebsocketChannel = (typeof WEBSOCKET_CHANNELS)[number]

export type ClientMessage =
  | { type: 'hello'; protocol?: number; token?: string; client?: string }
  | { type: 'subscribe'; channels: string[] }
  | { type: 'unsubscribe'; channels: string[] }
  | { type: 'ping'; id?: string }

export type ServerMessage =
  | { type: 'welcome'; protocol: number; channels: string[]; server?: string }
  | { type: 'event'; channel: string; name: string; payload?: unknown; at?: number }
  | { type: 'subscribed'; channels: string[] }
  | { type: 'unsubscribed'; channels: string[] }
  | { type: 'pong'; id?: string }
  | { type: 'error'; code: string; message: string }

const CHANNEL_ALIASES: Record<string, WebsocketChannel> = {
  system: 'system',
  documents: 'documents',
  docs: 'documents',
  document: 'documents',
  audit: 'audit',
  nlp: 'nlp',
  ai: 'nlp',
  'local-ai': 'nlp',
  sync: 'sync',
  'disk-sync': 'sync',
  agent: 'agent',
  capture: 'capture',
  inbox: 'capture',
}

export function parseWebsocketChannel(raw: string): WebsocketChannel | null {
  const key = raw.trim().toLowerCase()
  return CHANNEL_ALIASES[key] ?? null
}

export function normalizeWebsocketChannels(raw: string[]): WebsocketChannel[] {
  const out: WebsocketChannel[] = []
  for (const item of raw) {
    const channel = parseWebsocketChannel(item)
    if (channel && !out.includes(channel)) out.push(channel)
  }
  return out
}

export function encodeClientMessage(message: ClientMessage): string {
  return JSON.stringify(message)
}

export function encodeServerMessage(message: ServerMessage): string {
  return JSON.stringify(message)
}

export function decodeClientMessage(raw: string, maxMessageBytes = 65_536): ClientMessage {
  if (!raw) throw new Error('empty websocket frame')
  if (raw.length > maxMessageBytes) {
    throw new Error(`websocket frame too large (${raw.length} > ${maxMessageBytes})`)
  }
  const parsed = JSON.parse(raw) as ClientMessage
  if (!parsed || typeof parsed !== 'object' || !('type' in parsed)) {
    throw new Error('invalid websocket json')
  }
  return parsed
}

export function decodeServerMessage(raw: string, maxMessageBytes = 65_536): ServerMessage {
  if (!raw) throw new Error('empty websocket frame')
  if (raw.length > maxMessageBytes) {
    throw new Error(`websocket frame too large (${raw.length} > ${maxMessageBytes})`)
  }
  const parsed = JSON.parse(raw) as ServerMessage
  if (!parsed || typeof parsed !== 'object' || !('type' in parsed)) {
    throw new Error('invalid websocket json')
  }
  return parsed
}

export function welcomeMessage(server?: string): ServerMessage {
  return {
    type: 'welcome',
    protocol: WEBSOCKET_PROTOCOL_VERSION,
    channels: [...WEBSOCKET_CHANNELS],
    ...(server ? { server } : {}),
  }
}
