import { describe, expect, it } from 'vitest'
import { TOUR } from '@/lib/app-tour/selectors'
import { buildAppTourSteps } from '@/lib/app-tour/run-app-tour'

describe('app tour selectors', () => {
  it('exposes stable data-tour hooks for key chrome', () => {
    expect(TOUR.sidebarRail).toBe('[data-tour="sidebar-rail"]')
    expect(TOUR.librarySwitcher).toBe('[data-tour="library-switcher"]')
    expect(TOUR.libraryChat).toBe('[data-tour="library-chat"]')
    expect(TOUR.libraryFilters).toBe('[data-tour="library-filters"]')
    expect(TOUR.libraryCompile).toBe('[data-tour="library-compile"]')
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

describe('buildAppTourSteps', () => {
  it('keeps intro and outro steps without a target', () => {
    const t = (key: string) => key
    const steps = buildAppTourSteps(t)
    expect(steps[0]?.popover?.title).toBe('appTour.steps.welcome.title')
    expect(steps.at(-1)?.popover?.title).toBe('appTour.steps.done.title')
  })

  it('includes a step when its hook is in the document', () => {
    const rail = document.createElement('div')
    rail.setAttribute('data-tour', 'sidebar-rail')
    document.body.append(rail)

    const steps = buildAppTourSteps((key) => key)
    expect(steps.some((step) => step.element === TOUR.sidebarRail)).toBe(true)
    rail.remove()
  })
})
