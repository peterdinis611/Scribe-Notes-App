import { kvGet, kvSet } from '@/lib/storage/kv'

export const MCP_ENABLED_KEY = 'scribe-mcp-enabled'
export const MCP_WRITE_KEY = 'scribe-mcp-write'
export const MCP_WRITE_EXPIRES_AT_KEY = 'scribe-mcp-write-expires-at'
export const MCP_SCOPE_KEY = 'scribe-mcp-scope'

/** Default intentional write window (30 minutes). */
export const MCP_WRITE_TTL_SECS = 30 * 60

export type McpVaultScope = 'no-vault' | 'unlocked-vault' | 'all'

export function isMcpEnabled(): boolean {
  return kvGet(MCP_ENABLED_KEY) === '1'
}

export function setMcpEnabled(enabled: boolean) {
  kvSet(MCP_ENABLED_KEY, enabled ? '1' : '0')
}

export function getMcpWriteExpiresAt(): number | null {
  const raw = kvGet(MCP_WRITE_EXPIRES_AT_KEY)
  if (!raw) return null
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? value : null
}

function clearMcpWriteExpiry() {
  kvSet(MCP_WRITE_EXPIRES_AT_KEY, '')
}

export function isMcpWriteEnabled(): boolean {
  if (kvGet(MCP_WRITE_KEY) !== '1') return false
  const expiresAt = getMcpWriteExpiresAt()
  if (expiresAt != null && expiresAt * 1000 <= Date.now()) {
    kvSet(MCP_WRITE_KEY, '0')
    clearMcpWriteExpiry()
    return false
  }
  return true
}

export function setMcpWriteEnabled(enabled: boolean, ttlSecs = MCP_WRITE_TTL_SECS) {
  if (!enabled) {
    kvSet(MCP_WRITE_KEY, '0')
    clearMcpWriteExpiry()
    return
  }
  kvSet(MCP_WRITE_KEY, '1')
  const expiresAt = Math.floor(Date.now() / 1000) + Math.max(60, ttlSecs)
  kvSet(MCP_WRITE_EXPIRES_AT_KEY, String(expiresAt))
}

/** Extend the current write window (or enable with default TTL). */
export function extendMcpWrite(ttlSecs = MCP_WRITE_TTL_SECS) {
  setMcpWriteEnabled(true, ttlSecs)
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
