import type { CSSProperties } from 'react'
import { FileSpreadsheet, FileText, FileUp, NotebookPen } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

type AppFileDropOverlayProps = {
  active: boolean
  busy?: boolean
  count?: number
}

const FLOATERS = [
  { Icon: FileText, delay: '0ms', x: '-118px', rot: '-12deg' },
  { Icon: NotebookPen, delay: '90ms', x: '0px', rot: '4deg' },
  { Icon: FileSpreadsheet, delay: '160ms', x: '118px', rot: '14deg' },
] as const

export function AppFileDropOverlay({ active, busy, count = 0 }: AppFileDropOverlayProps) {
  const { t } = useTranslation()
  if (!active && !busy) return null

  return (
    <div
      className={cn('app-file-drop-overlay', busy && 'is-busy')}
      aria-live="polite"
      aria-busy={busy || undefined}
    >
      <div className="app-file-drop-aurora" aria-hidden />
      <div className="app-file-drop-grid" aria-hidden />
      <div className="app-file-drop-ring" aria-hidden />

      <div className="app-file-drop-stage">
        <div className="app-file-drop-floaters" aria-hidden>
          {FLOATERS.map(({ Icon, delay, x, rot }, index) => (
            <span
              key={index}
              className="app-file-drop-floater"
              style={
                {
                  '--floater-delay': delay,
                  '--floater-x': x,
                  '--floater-rot': rot,
                } as CSSProperties
              }
            >
              <Icon className="h-5 w-5" strokeWidth={1.5} />
            </span>
          ))}
        </div>

        <div className="app-file-drop-card">
          <div className="app-file-drop-icon-wrap">
            <span className="app-file-drop-icon-pulse" aria-hidden />
            <FileUp className="app-file-drop-icon" aria-hidden />
          </div>
          <p className="app-file-drop-title">
            {busy
              ? t('fileDrop.importing')
              : count > 1
                ? t('fileDrop.dropMany', { count })
                : t('fileDrop.dropOne')}
          </p>
          <p className="app-file-drop-hint">{t('fileDrop.hint')}</p>
          {!busy && count > 0 ? (
            <span className="app-file-drop-count">{count}</span>
          ) : null}
          {busy ? <span className="app-file-drop-progress" aria-hidden /> : null}
        </div>
      </div>
    </div>
  )
}
