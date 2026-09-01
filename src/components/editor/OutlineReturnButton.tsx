import { Undo2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { setOutlineReturnPoint } from '@/store/documentsSlice'

type OutlineReturnButtonProps = {
  scrollRef: React.RefObject<HTMLElement | null>
}

export function OutlineReturnButton({ scrollRef }: OutlineReturnButtonProps) {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const activeId = useAppSelector((state) => state.documents.activeDocumentId)
  const point = useAppSelector((state) => state.documents.outlineReturnPoint)

  if (!point || point.docId !== activeId) return null

  return (
    <div className="outline-return-button titlebar-no-drag">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 gap-1.5 shadow-md"
        onClick={() => {
          const scrollEl = scrollRef.current
          if (scrollEl) scrollEl.scrollTo({ top: point.scrollTop, behavior: 'smooth' })
          dispatch(setOutlineReturnPoint(null))
        }}
      >
        <Undo2 className="h-3.5 w-3.5" />
        {t('panels.outline.returnToPlace')}
      </Button>
    </div>
  )
}
