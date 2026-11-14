/**
 * Scribe local WebSocket protocol + settings.
 * Mirrors `crates/scribe-websockets` — hosts own the accept loop / browser client.
 */

export {
  DEFAULT_WEBSOCKET_PATH,
  DEFAULT_WEBSOCKET_PORT,
  DEFAULT_WEBSOCKET_SETTINGS,
  WEBSOCKET_BIND_LOOPBACK,
  normalizeWebsocketSettings,
  websocketUrl,
  type WebsocketSettings,
} from '@/lib/websockets/settings'

export {
  WEBSOCKET_CHANNELS,
  WEBSOCKET_PROTOCOL_VERSION,
  decodeClientMessage,
  decodeServerMessage,
  encodeClientMessage,
  encodeServerMessage,
  normalizeWebsocketChannels,
  parseWebsocketChannel,
  welcomeMessage,
  type ClientMessage,
  type ServerMessage,
  type WebsocketChannel,
} from '@/lib/websockets/protocol'

export {
  defaultWebsocketSettings,
  normalizeWebsocketChannelsNative,
  normalizeWebsocketSettingsNative,
  websocketChannelIds,
  websocketSettingsFromJson,
  websocketUrlNative,
} from '@/lib/db/websockets-api'
