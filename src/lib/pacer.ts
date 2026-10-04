/**
 * Single entry for TanStack Pacer in Scribe.
 *
 * Prefer React hooks in components/hooks; use Debouncer/Throttler classes in
 * non-React modules (NLP queue, plugin lifecycle, etc.).
 */
export {
  useDebouncedCallback,
  useDebouncedState,
  useDebouncedValue,
  useDebouncer,
  useThrottledCallback,
  useThrottledState,
  useThrottledValue,
  useThrottler,
} from '@tanstack/react-pacer'

export { Debouncer, debounce as createDebouncer } from '@tanstack/pacer/debouncer'
export { Throttler, throttle as createThrottler } from '@tanstack/pacer/throttler'

export type { DebouncerOptions, DebouncerState } from '@tanstack/pacer/debouncer'
export type { ThrottlerOptions, ThrottlerState } from '@tanstack/pacer/throttler'
