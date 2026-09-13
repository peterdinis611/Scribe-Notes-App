import { describe, expect, it } from 'vitest'
import { TOUR } from '@/lib/app-tour/selectors'

describe('app tour selectors', () => {
  it('exposes stable data-tour hooks for key chrome', () => {
    expect(TOUR.sidebarRail).toBe('[data-tour="sidebar-rail"]')
    expect(TOUR.librarySearch).toBe('[data-tour="library-search"]')
    expect(TOUR.editorCanvas).toBe('[data-tour="editor-canvas"]')
    expect(TOUR.panelInsights).toBe('[data-tour="panel-insights"]')
    expect(TOUR.statusBar).toBe('[data-tour="status-bar"]')
  })

  it('keeps unique selectors', () => {
    const values = Object.values(TOUR)
    expect(new Set(values).size).toBe(values.length)
  })
})
