export type ToastVariant = 'default' | 'success' | 'error' | 'info'

export type ToastItem = {
  id: string
  title: string
  description?: string
  variant: ToastVariant
  actionLabel?: string
}

export type ToastInput = {
  title: string
  description?: string
  variant?: ToastVariant
  duration?: number
  action?: {
    label: string
    onClick: () => void
  }
}

export type ToastState = {
  items: ToastItem[]
}
