import { driver, type DriveStep, type Driver } from 'driver.js'
import 'driver.js/dist/driver.css'
import { TOUR } from '@/lib/app-tour/selectors'
import { APP_SHORT_VERSION } from '@/lib/app-version'

export type AppTourTranslate = (key: string, options?: Record<string, unknown>) => string

export type RunAppTourOptions = {
  t: AppTourTranslate
  onDestroyed?: () => void
}

type PopoverSide = 'top' | 'right' | 'bottom' | 'left'

let activeDriver: Driver | null = null

function step(
  t: AppTourTranslate,
  id: string,
  element?: string,
  side: PopoverSide = 'left',
): DriveStep {
  return {
    ...(element ? { element } : {}),
    popover: {
      title: t(`appTour.steps.${id}.title`, { version: APP_SHORT_VERSION }),
      description: t(`appTour.steps.${id}.description`),
      side,
      align: 'start',
    },
  }
}

export function buildAppTourSteps(t: AppTourTranslate): DriveStep[] {
  const candidates: DriveStep[] = [
    step(t, 'welcome'),
    step(t, 'sidebarRail', TOUR.sidebarRail, 'right'),
    step(t, 'librarySwitcher', TOUR.librarySwitcher, 'right'),
    step(t, 'librarySearch', TOUR.librarySearch, 'right'),
    step(t, 'libraryViews', TOUR.libraryViews, 'right'),
    step(t, 'libraryChat', TOUR.libraryChat, 'right'),
    step(t, 'libraryFilters', TOUR.libraryFilters, 'right'),
    step(t, 'libraryTree', TOUR.libraryTree, 'right'),
    step(t, 'libraryCompile', TOUR.libraryCompile, 'right'),
    step(t, 'newDocument', TOUR.newDocument, 'bottom'),
    step(t, 'appHeader', TOUR.appHeader, 'bottom'),
    step(t, 'documentTabs', TOUR.documentTabs, 'bottom'),
    step(t, 'editorToolbar', TOUR.editorToolbar, 'bottom'),
    step(t, 'editorCanvas', TOUR.editorCanvas, 'left'),
    step(t, 'panelRail', TOUR.panelRail, 'left'),
    step(t, 'panelOutline', TOUR.panelOutline, 'left'),
    step(t, 'panelInsights', TOUR.panelInsights, 'left'),
    step(t, 'statusBar', TOUR.statusBar, 'top'),
    step(t, 'settingsNav', TOUR.settingsNav, 'right'),
    step(t, 'done'),
  ]

  return candidates.filter((entry) => {
    if (!entry.element) return true
    if (typeof entry.element !== 'string') return true
    return Boolean(document.querySelector(entry.element))
  })
}

export function isAppTourActive() {
  return Boolean(activeDriver?.isActive())
}

export function destroyAppTour() {
  if (activeDriver) {
    activeDriver.destroy()
    activeDriver = null
  }
}

export function runAppTour({ t, onDestroyed }: RunAppTourOptions) {
  destroyAppTour()

  const steps = buildAppTourSteps(t)
  if (steps.length === 0) {
    onDestroyed?.()
    return null
  }

  activeDriver = driver({
    showProgress: true,
    animate: true,
    allowClose: true,
    overlayOpacity: 0.52,
    stagePadding: 8,
    stageRadius: 10,
    popoverOffset: 12,
    smoothScroll: true,
    popoverClass: 'scribe-driver-popover',
    // Placeholders are substituted by driver.js, not i18next.
    progressText: '{{current}} / {{total}}',
    nextBtnText: t('common.next'),
    prevBtnText: t('common.back'),
    doneBtnText: t('common.done'),
    steps,
    onDestroyed: () => {
      activeDriver = null
      onDestroyed?.()
    },
  })

  activeDriver.drive()
  return activeDriver
}
