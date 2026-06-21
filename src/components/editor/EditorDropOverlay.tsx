import { useRef, useState, type ReactNode } from 'react'
import { ImagePlus } from 'lucide-react'
import { cn } from '@/lib/utils'

type EditorDropZoneProps = {
  children: ReactNode
  className?: string
}

function dragEventHasFiles(event: React.DragEvent) {
  return Array.from(event.dataTransfer.types).includes('Files')
}

export function EditorDropZone({ children, className }: EditorDropZoneProps) {
  const [visible, setVisible] = useState(false)
  const depthRef = useRef(0)

  function handleDragEnter(event: React.DragEvent) {
    if (!dragEventHasFiles(event)) return
    event.preventDefault()
    depthRef.current += 1
    setVisible(true)
  }

  function handleDragOver(event: React.DragEvent) {
    if (!dragEventHasFiles(event)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    setVisible(true)
  }

  function handleDragLeave(event: React.DragEvent) {
    if (!dragEventHasFiles(event)) return
    depthRef.current = Math.max(0, depthRef.current - 1)
    if (depthRef.current === 0) {
      setVisible(false)
    }
  }

  function handleDrop(event: React.DragEvent) {
    if (!dragEventHasFiles(event)) return
    depthRef.current = 0
    setVisible(false)
    event.preventDefault()
  }

  return (
    <div
      className={cn('editor-drop-zone', className)}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {visible && (
        <div className="editor-drop-overlay titlebar-no-drag" aria-hidden="true">
          <div className="editor-drop-overlay-card">
            <ImagePlus className="h-8 w-8 stroke-[1.5]" />
            <p className="editor-drop-overlay-title">Pustite obrázok sem</p>
            <p className="editor-drop-overlay-hint">PNG, JPEG, GIF, WebP alebo SVG</p>
          </div>
        </div>
      )}
      {children}
    </div>
  )
}
