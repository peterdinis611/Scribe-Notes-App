import { describe, expect, it } from 'vitest'
import {
  applyDocumentStylePreset,
  DOCUMENT_STYLE_PRESETS,
  resolveDocumentTypography,
} from '@/lib/editor/document-style-presets'
import { DEFAULT_PAGE_SETUP, normalizePageSetup } from '@/lib/editor/page-setup'

describe('document style presets', () => {
  it('exposes named presets', () => {
    expect(DOCUMENT_STYLE_PRESETS.map((preset) => preset.id)).toEqual([
      'default',
      'academic',
      'letter',
      'blog',
      'manuscript',
    ])
  })

  it('applies academic preset typography and margins', () => {
    const setup = applyDocumentStylePreset('academic')
    expect(setup.stylePresetId).toBe('academic')
    expect(setup.paperSize).toBe('a4')
    expect(setup.typography.fontFamily).toContain('Georgia')
    expect(setup.marginLeft).toBeGreaterThan(DEFAULT_PAGE_SETUP.marginLeft)
    expect(setup.headerFooter.enabled).toBe(true)
  })

  it('normalizes legacy page setup without typography', () => {
    const legacy = {
      paperSize: 'a4' as const,
      marginTop: 56,
      marginBottom: 72,
      marginLeft: 64,
      marginRight: 64,
      headerFooter: DEFAULT_PAGE_SETUP.headerFooter,
      watermark: DEFAULT_PAGE_SETUP.watermark,
      firstPage: DEFAULT_PAGE_SETUP.firstPage,
    }
    const normalized = normalizePageSetup(legacy as typeof DEFAULT_PAGE_SETUP)
    expect(resolveDocumentTypography(normalized).fontSize).toBe(16)
  })
})
