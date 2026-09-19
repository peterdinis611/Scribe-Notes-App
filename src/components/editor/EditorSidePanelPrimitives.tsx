import type { ReactNode } from 'react'
import { ChevronsLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useResizableEditorPanel } from '@/hooks/useResizableEditorPanel'

export function EditorSidePanel({
  children,
  className,
  minWidth,
  ...props
}: React.ComponentProps<'aside'> & { minWidth?: number }) {
  const { t } = useTranslation()
  const { resizing, onResizePointerDown, resetWidth } = useResizableEditorPanel(minWidth)

  return (
    <aside
      className={cn(
        'editor-side-panel',
        resizing && 'is-resizing',
        className,
      )}
      {...props}
    >
      <button
        type="button"
        className="editor-panel-resize-handle titlebar-no-drag"
        aria-label={t('editorPanels.resize')}
        title={t('editorPanels.resizeHint')}
        onPointerDown={onResizePointerDown}
        onDoubleClick={resetWidth}
      />
      <button
        type="button"
        className="editor-panel-autofit titlebar-no-drag"
        aria-label={t('editorPanels.autoExpand')}
        title={t('editorPanels.resizeHint')}
        onClick={resetWidth}
      >
        <ChevronsLeft className="h-3.5 w-3.5" />
      </button>
      {children}
    </aside>
  )
}

export function EditorSidePanelHeader({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-[var(--color-border)] px-3.5 pb-2.5 pt-3.5">
      <div>
        <h2 className="m-0 text-[13px] font-bold">{title}</h2>
        {subtitle ? (
          <p className="mt-0.5 text-[11px] text-[var(--color-muted-foreground)]">{subtitle}</p>
        ) : null}
      </div>
      {actions}
    </div>
  )
}

export function EditorSidePanelIconButton({
  className,
  ...props
}: React.ComponentProps<'button'>) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex h-7 w-7 items-center justify-center rounded-[7px] border-none bg-transparent text-[var(--color-muted-foreground)] hover:bg-[var(--color-hover)] hover:text-[var(--color-foreground)]',
        className,
      )}
      {...props}
    />
  )
}

export function EditorSidePanelList({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-3 py-2.5',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function EditorSidePanelEmpty({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-2 px-3 py-6 text-center text-[12px] leading-relaxed text-[var(--color-muted-foreground)]',
        className,
      )}
    >
      {children}
    </div>
  )
}
