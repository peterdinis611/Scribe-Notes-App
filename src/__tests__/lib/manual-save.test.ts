import { describe, expect, it, vi } from 'vitest'
import { runManualSave } from '@/lib/manual-save'

describe('runManualSave', () => {
  it('calls onSaved when flush succeeds', async () => {
    const onSaved = vi.fn()
    const onError = vi.fn()
    const flush = vi.fn().mockResolvedValue(true)

    const ok = await runManualSave({ flush, onSaved, onError })

    expect(ok).toBe(true)
    expect(flush).toHaveBeenCalledOnce()
    expect(onSaved).toHaveBeenCalledOnce()
    expect(onError).not.toHaveBeenCalled()
  })

  it('does not toast when flush returns false', async () => {
    const onSaved = vi.fn()
    const onError = vi.fn()
    const flush = vi.fn().mockResolvedValue(false)

    const ok = await runManualSave({ flush, onSaved, onError })

    expect(ok).toBe(false)
    expect(onSaved).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
  })

  it('calls onError when flush throws', async () => {
    const onSaved = vi.fn()
    const onError = vi.fn()
    const flush = vi.fn().mockRejectedValue(new Error('disk full'))

    const ok = await runManualSave({ flush, onSaved, onError })

    expect(ok).toBe(false)
    expect(onSaved).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledOnce()
  })

  it('returns false when flush handler is missing', async () => {
    const onSaved = vi.fn()
    const onError = vi.fn()

    const ok = await runManualSave({ flush: null, onSaved, onError })

    expect(ok).toBe(false)
    expect(onSaved).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
  })
})
