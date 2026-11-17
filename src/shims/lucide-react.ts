/**
 * Drop-in Lucide → PulsoIcon bridge.
 * Existing `lucide-react` imports resolve here (Vite + TS paths) so icons
 * keep the same names/props while gaining per-icon hover/focus motion.
 */
export * from 'pulsoicon-react'
export type {
  PulsoIcon as LucideIcon,
  IconProps as LucideProps,
  IconHandle,
  IconProps,
  PulsoIcon,
} from 'pulsoicon-react'
