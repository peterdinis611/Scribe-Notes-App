import { describe, expect, it, beforeEach } from 'vitest'
import { isMcpEnabled, MCP_ENABLED_KEY, setMcpEnabled } from '@/lib/mcp/prefs'
import { kvRemove, resetKvStoreForTests, hydrateKvStore } from '@/lib/storage/kv'
import { buildMcpDemoContentJson } from '@/lib/templates/mcp-demo'

describe('mcp prefs', () => {
  beforeEach(async () => {
    await resetKvStoreForTests()
    await hydrateKvStore()
    kvRemove(MCP_ENABLED_KEY)
  })

  it('defaults to disabled and persists enable', () => {
    expect(isMcpEnabled()).toBe(false)
    setMcpEnabled(true)
    expect(isMcpEnabled()).toBe(true)
    setMcpEnabled(false)
    expect(isMcpEnabled()).toBe(false)
  })
})

describe('mcp demo template', () => {
  it('serializes tip tap json with prompts', () => {
    const json = buildMcpDemoContentJson({
      title: 'Scribe MCP — demo',
      intro: 'Intro',
      whatTitle: 'What',
      whatBody: 'Body',
      setupTitle: 'Setup',
      setupSteps: ['Step one', 'Step two'],
      toolsTitle: 'Tools',
      tools: [{ name: 'scribe_status', hint: 'Health' }],
      tryTitle: 'Try',
      tryPrompts: ['Call scribe_status'],
      tipTitle: 'Tip',
      tipBody: 'Locked DB tip',
    })
    const doc = JSON.parse(json) as { type: string; content: unknown[] }
    expect(doc.type).toBe('doc')
    expect(json).toContain('Call scribe_status')
    expect(json).toContain('scribe_status')
  })
})
