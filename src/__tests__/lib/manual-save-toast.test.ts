import { describe, expect, it, beforeEach } from 'vitest'
import { getToastState, resetToastStore, toast } from '@/lib/toast'
import { runManualSave } from '@/lib/manual-save'

describe('manual save toast integration', () => {
  beforeEach(() => {
    resetToastStore()
  })

  it('pushes a success toast into the toast store when save succeeds', async () => {
    const before = getToastState().items.length

    const ok = await runManualSave({
      flush: async () => true,
      onSaved: () => toast.success('Dokument uložený', 'Moja poznámka'),
      onError: () => undefined,
    })

    expect(ok).toBe(true)
    const toasts = getToastState().items
    expect(toasts.length).toBeGreaterThan(before)

    const latest = toasts[toasts.length - 1]
    expect(latest?.title).toBe('Dokument uložený')
    expect(latest?.description).toBe('Moja poznámka')
    expect(latest?.variant).toBe('success')
  })
})
