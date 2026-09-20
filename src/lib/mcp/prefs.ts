import { kvGet, kvSet } from '@/lib/storage/kv'

export const MCP_ENABLED_KEY = 'scribe-mcp-enabled'

export function isMcpEnabled(): boolean {
  return kvGet(MCP_ENABLED_KEY) === '1'
}

export function setMcpEnabled(enabled: boolean) {
  kvSet(MCP_ENABLED_KEY, enabled ? '1' : '0')
}
