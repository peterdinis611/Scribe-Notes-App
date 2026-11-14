import { invoke } from '@/lib/tauri'
import type { WebsocketSettings } from '@/lib/websockets/settings'

export type WebsocketServerStatus = {
  running: boolean
  port: number | null
  url: string | null
  token: string | null
  tokenExpiresAt: number | null
  connectionCount: number
  settingsEnabled: boolean
}

export const defaultWebsocketSettings = () =>
  invoke<WebsocketSettings>('default_websocket_settings')

export const normalizeWebsocketSettingsNative = (settings: WebsocketSettings) =>
  invoke<WebsocketSettings>('normalize_websocket_settings', { settings })

export const websocketSettingsFromJson = (raw: string) =>
  invoke<WebsocketSettings>('websocket_settings_from_json', { raw })

export const websocketUrlNative = (settings: WebsocketSettings) =>
  invoke<string>('websocket_url', { settings })

export const websocketChannelIds = () => invoke<string[]>('websocket_channel_ids')

export const normalizeWebsocketChannelsNative = (channels: string[]) =>
  invoke<string[]>('normalize_websocket_channels', { channels })

export const websocketsStatus = () => invoke<WebsocketServerStatus>('websockets_status')

export const websocketsStart = (settings?: WebsocketSettings) =>
  invoke<WebsocketServerStatus>('websockets_start', { settings: settings ?? null })

export const websocketsStop = () => invoke<WebsocketServerStatus>('websockets_stop')
