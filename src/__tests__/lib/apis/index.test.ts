import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/lib/tauri', () => ({
  isTauriRuntime: () => true,
  invoke: vi.fn(async (cmd: string, args: { input: Record<string, unknown> }) => {
    if (cmd === 'apis_geocode') {
      return [
        {
          displayName: String(args.input.query),
          lat: 48.15,
          lng: 17.11,
        },
      ]
    }
    if (cmd === 'apis_fx_convert') {
      return { amount: args.input.amount, from: args.input.from, to: args.input.to, result: 1.1 }
    }
    return {}
  }),
}))

describe('scribe apis FE wrappers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('geocodes via Tauri command', async () => {
    const { apisGeocode } = await import('@/lib/apis')
    const hits = await apisGeocode('Bratislava', 3)
    expect(hits[0]?.lat).toBe(48.15)
  })

  it('converts FX via Tauri command', async () => {
    const { apisFxConvert } = await import('@/lib/apis')
    const out = await apisFxConvert(10, 'EUR', 'USD')
    expect(out.result).toBe(1.1)
  })
})
