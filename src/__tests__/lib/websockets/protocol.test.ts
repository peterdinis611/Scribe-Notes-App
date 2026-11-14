import { describe, expect, it } from 'vitest'
import {
  decodeClientMessage,
  encodeClientMessage,
  normalizeWebsocketChannels,
  normalizeWebsocketSettings,
  welcomeMessage,
  websocketUrl,
  WEBSOCKET_PROTOCOL_VERSION,
} from '@/lib/websockets'

describe('websockets protocol', () => {
  it('normalizes channel aliases and drops unknown', () => {
    expect(normalizeWebsocketChannels([' Docs ', 'documents', 'nope', 'local-ai'])).toEqual([
      'documents',
      'nlp',
    ])
  })

  it('roundtrips a ping frame', () => {
    const raw = encodeClientMessage({ type: 'ping', id: '1' })
    expect(decodeClientMessage(raw)).toEqual({ type: 'ping', id: '1' })
  })

  it('builds a welcome message', () => {
    const msg = welcomeMessage('scribe')
    expect(msg.type).toBe('welcome')
    if (msg.type === 'welcome') {
      expect(msg.protocol).toBe(WEBSOCKET_PROTOCOL_VERSION)
      expect(msg.channels).toContain('audit')
      expect(msg.server).toBe('scribe')
    }
  })
})

describe('websockets settings', () => {
  it('forces loopback and clamps path/port', () => {
    const next = normalizeWebsocketSettings({
      enabled: true,
      bindHost: '0.0.0.0',
      path: 'events/',
      port: 80,
      heartbeatIntervalMs: 1,
    })
    expect(next.bindHost).toBe('127.0.0.1')
    expect(next.path).toBe('/events')
    expect(next.port).toBe(8789)
    expect(next.heartbeatIntervalMs).toBeGreaterThanOrEqual(5_000)
    expect(websocketUrl(next)).toBe('ws://127.0.0.1:8789/events')
  })
})

describe('websockets client helper', () => {
  it('encodes hello with protocol version', async () => {
    const { WEBSOCKET_PROTOCOL_VERSION, encodeClientMessage } = await import('@/lib/websockets')
    const raw = encodeClientMessage({
      type: 'hello',
      protocol: WEBSOCKET_PROTOCOL_VERSION,
      token: 'tok',
      client: 'test',
    })
    expect(JSON.parse(raw)).toMatchObject({
      type: 'hello',
      protocol: 1,
      token: 'tok',
      client: 'test',
    })
  })
})
