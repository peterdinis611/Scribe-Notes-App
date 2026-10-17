import { createContext } from 'react'

export type CanvasObjectActionsValue = {
  onTextChange: (id: string, text: string) => void
  onLabelChange: (id: string, label: string) => void
}

export const CanvasObjectActions = createContext<CanvasObjectActionsValue>({
  onTextChange: () => undefined,
  onLabelChange: () => undefined,
})
