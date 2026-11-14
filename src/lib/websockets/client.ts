/**
 * Browser / WebView client for the local Scribe WebSocket protocol.
 */

import {
  WEBSOCKET_PROTOCOL_VERSION,
  decodeServerMessage,
  encodeClientMessage,
  type ClientMessage,
  type ServerMessage,
  type WebsocketChannel,
} from '@/lib/websockets/protocol'

export type ScribeWebsocketClientOptions = {
  url: string
  token?: string
  client?: string
  channels?: WebsocketChannel[]
  heartbeatIntervalMs?: number
  onMessage?: (message: ServerMessage) => void
  onOpen?: () => void
  onClose?: (event: CloseEvent) => void
  onError?: (event: Event) => void
}

export class ScribeWebsocketClient {
  private socket: WebSocket | null = null
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private readonly options: ScribeWebsocketClientOptions
  private ready = false

  constructor(options: ScribeWebsocketClientOptions) {
    this.options = options
  }

  get connected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN && this.ready
  }

  connect(): void {
    this.disconnect()
    const socket = new WebSocket(this.options.url)
    this.socket = socket

    socket.addEventListener('open', () => {
      this.send({
        type: 'hello',
        protocol: WEBSOCKET_PROTOCOL_VERSION,
        ...(this.options.token ? { token: this.options.token } : {}),
        ...(this.options.client ? { client: this.options.client } : {}),
      })
      this.options.onOpen?.()
    })

    socket.addEventListener('message', (event) => {
      if (typeof event.data !== 'string') return
      let message: ServerMessage
      try {
        message = decodeServerMessage(event.data)
      } catch {
        return
      }
      if (message.type === 'welcome') {
        this.ready = true
        this.startHeartbeat()
        if (this.options.channels?.length) {
          this.subscribe(this.options.channels)
        }
      }
      this.options.onMessage?.(message)
    })

    socket.addEventListener('close', (event) => {
      this.ready = false
      this.stopHeartbeat()
      this.options.onClose?.(event)
    })

    socket.addEventListener('error', (event) => {
      this.options.onError?.(event)
    })
  }

  subscribe(channels: WebsocketChannel[]): void {
    this.send({ type: 'subscribe', channels: [...channels] })
  }

  unsubscribe(channels: WebsocketChannel[]): void {
    this.send({ type: 'unsubscribe', channels: [...channels] })
  }

  ping(id?: string): void {
    this.send({ type: 'ping', ...(id ? { id } : {}) })
  }

  disconnect(): void {
    this.stopHeartbeat()
    this.ready = false
    if (this.socket) {
      try {
        this.socket.close()
      } catch {
        /* ignore */
      }
      this.socket = null
    }
  }

  private send(message: ClientMessage): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return
    this.socket.send(encodeClientMessage(message))
  }

  private startHeartbeat(): void {
    this.stopHeartbeat()
    const interval = this.options.heartbeatIntervalMs ?? 30_000
    if (interval <= 0) return
    this.heartbeatTimer = setInterval(() => {
      this.ping(`hb-${Date.now()}`)
    }, interval)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }
}
