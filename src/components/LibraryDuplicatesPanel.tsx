import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Copy, GitMerge, LoaderCircle } from 'lucide-react'
import { nlpFindDuplicates, nlpStatus, type DuplicatePair } from '@/lib/db/nlp-api'
import { mergeDuplicateNotes } from '@/lib/library/merge-duplicates'
import { ROUTES } from '@/lib/routes'
import { toast } from '@/lib/toast'
import { useAppDispatch } from '@/store/hooks'
import { setActiveDocumentId, updateDocuments } from '@/store/documentsSlice'
import { listDocuments } from '@/lib/db/api'

type LibraryDuplicatesPanelProps = {
  onNavigate?: () => void
}

export function LibraryDuplicatesPanel({ onNavigate }: LibraryDuplicatesPanelProps) {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const [pairs, setPairs] = useState<DuplicatePair[]>([])
  const [compared, setCompared] = useState(0)
  const [loading, setLoading] = useState(true)
  const [mergingId, setMergingId] = useState<string | null>(null)
  const [nlpOff, setNlpOff] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const status = await nlpStatus()
      if (!status.enabled || !status.sidecarOk) {
        setNlpOff(true)
        setPairs([])
        return
      }
      setNlpOff(false)
      const result = await nlpFindDuplicates(24)
      setPairs(result.pairs)
      setCompared(result.compared)
    } catch (error) {
      toast.error(t('library.duplicates.loadError'), String(error))
      setPairs([])
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void load()
  }, [load])

  function openDoc(id: string) {
    dispatch(setActiveDocumentId(id))
    void navigate(ROUTES.document(id))
    onNavigate?.()
  }

  async function merge(keepId: string, dropId: string) {
    const key = `${keepId}:${dropId}`
    setMergingId(key)
    try {
      await mergeDuplicateNotes(keepId, dropId)
      const docs = await listDocuments()
      dispatch(updateDocuments(() => docs))
      toast.success(t('library.duplicates.merged'))
      await load()
    } catch (error) {
      toast.error(t('library.duplicates.mergeError'), String(error))
    } finally {
      setMergingId(null)
    }
  }

  return (
    <div className="library-duplicates">
      <p className="library-duplicates__kicker">
        <Copy className="h-3.5 w-3.5" aria-hidden />
        {t('library.duplicates.title')}
      </p>
      <p className="library-duplicates__hint">{t('library.duplicates.hint')}</p>

      {loading ? (
        <p className="library-duplicates__status">
          <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden />
          {t('common.loading')}
        </p>
      ) : nlpOff ? (
        <p className="library-duplicates__status">{t('library.duplicates.nlpOff')}</p>
      ) : pairs.length === 0 ? (
        <p className="library-duplicates__status">
          {t('library.duplicates.empty', { count: compared })}
        </p>
      ) : (
        <ol className="library-duplicates__list">
          {pairs.map((pair, index) => {
            const key = `${pair.leftId}:${pair.rightId}`
            return (
              <li key={key} className="library-duplicates__item">
                <span className="library-duplicates__index">{String(index + 1).padStart(2, '0')}</span>
                <div className="library-duplicates__body">
                  <div className="library-duplicates__titles">
                    <button type="button" onClick={() => openDoc(pair.leftId)}>
                      {pair.leftTitle || t('libraryChat.untitled')}
                    </button>
                    <span aria-hidden>·</span>
                    <button type="button" onClick={() => openDoc(pair.rightId)}>
                      {pair.rightTitle || t('libraryChat.untitled')}
                    </button>
                  </div>
                  <p className="library-duplicates__score">
                    {t('library.duplicates.score', { percent: Math.round(pair.score * 100) })}
                    <span className="library-duplicates__score-parts">
                      {t('library.duplicates.scoreParts', {
                        lexical: Math.round(pair.jaccard * 100),
                        embed: Math.round(pair.embedScore * 100),
                      })}
                    </span>
                  </p>
                  <div className="library-duplicates__actions">
                    <button type="button" onClick={() => void merge(pair.leftId, pair.rightId)} disabled={mergingId === key}>
                      <GitMerge className="h-3 w-3" aria-hidden />
                      {t('library.duplicates.mergeIntoLeft')}
                    </button>
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
