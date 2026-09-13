type TourRequestListener = () => void

const listeners = new Set<TourRequestListener>()

/** Ask the mounted AppTourHost to start (or restart) the guided tour. */
export function requestAppTour() {
  for (const listener of listeners) listener()
}

export function subscribeAppTourRequest(listener: TourRequestListener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export { runAppTour, destroyAppTour, isAppTourActive } from '@/lib/app-tour/run-app-tour'
export { TOUR } from '@/lib/app-tour/selectors'
