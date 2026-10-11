import { kvGet, kvSet } from '@/lib/storage/kv'

export const MCP_ENABLED_KEY = 'scribe-mcp-enabled'
export const MCP_WRITE_KEY = 'scribe-mcp-write'
export const MCP_SCOPE_KEY = 'scribe-mcp-scope'

export type McpVaultScope = 'no-vault' | 'unlocked-vault' | 'all'

export function isMcpEnabled(): boolean {
  return kvGet(MCP_ENABLED_KEY) === '1'
}

export function setMcpEnabled(enabled: boolean) {
  kvSet(MCP_ENABLED_KEY, enabled ? '1' : '0')
}

export function isMcpWriteEnabled(): boolean {
  return kvGet(MCP_WRITE_KEY) === '1'
}

export function setMcpWriteEnabled(enabled: boolean) {
  kvSet(MCP_WRITE_KEY, enabled ? '1' : '0')
}

export function getMcpVaultScope(): McpVaultScope {
  const value = kvGet(MCP_SCOPE_KEY)
  if (value === 'unlocked-vault' || value === 'all') return value
  return 'no-vault'
}

export function setMcpVaultScope(scope: McpVaultScope) {
  kvSet(MCP_SCOPE_KEY, scope)
}

/** Env block for Cursor / Claude MCP JSON snippets. */
export function mcpEnvSnippet(write = isMcpWriteEnabled(), scope = getMcpVaultScope()): string {
  return JSON.stringify(
    {
      SCRIBE_MCP_WRITE: write ? '1' : '0',
      SCRIBE_MCP_SCOPE: scope,
    },
    null,
    2,
  )
}
