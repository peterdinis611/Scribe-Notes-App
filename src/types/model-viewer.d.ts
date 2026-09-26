import type { CSSProperties, DetailedHTMLProps, HTMLAttributes } from 'react'

type ModelViewerProps = DetailedHTMLProps<
  HTMLAttributes<HTMLElement> & {
    src?: string
    poster?: string
    alt?: string
    'camera-controls'?: boolean | string
    'auto-rotate'?: boolean | string
    'shadow-intensity'?: string
    exposure?: string
    'touch-action'?: string
    style?: CSSProperties
  },
  HTMLElement
>

declare module 'react' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'model-viewer': ModelViewerProps
    }
  }
}

export {}
