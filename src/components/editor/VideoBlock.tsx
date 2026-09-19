import ReactPlayer from 'react-player'
import { NodeViewWrapper } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link2, Trash2, Video } from 'lucide-react'
import { cn } from '@/lib/utils'
import { isVideoUrl, videoProviderLabel } from '@/lib/editor/video'
import { promptInput } from '@/lib/input-dialog'

export function VideoBlock({ node, updateAttributes, selected, editor, deleteNode }: NodeViewProps) {
  const { t } = useTranslation()
  const rawSrc = String(node.attrs.src ?? '').trim()
  const editable = editor.isEditable
  const [failed, setFailed] = useState(false)
  const [draft, setDraft] = useState(rawSrc)
  const [captionDraft, setCaptionDraft] = useState(String(node.attrs.caption ?? ''))

  useEffect(() => {
    setDraft(rawSrc)
    setFailed(false)
  }, [rawSrc])

  useEffect(() => {
    setCaptionDraft(String(node.attrs.caption ?? ''))
  }, [node.attrs.caption])

  const canPlay = rawSrc.length > 0 && (ReactPlayer.canPlay?.(rawSrc) ?? isVideoUrl(rawSrc))
  const isEmpty = !rawSrc
  const showChrome = (selected || isEmpty) && editable

  function applySrc(next: string) {
    const trimmed = next.trim()
    if (!trimmed) {
      updateAttributes({ src: null })
      return
    }
    updateAttributes({ src: trimmed })
  }

  function onSubmitUrl(event: FormEvent) {
    event.preventDefault()
    event.stopPropagation()
    applySrc(draft)
  }

  async function replaceUrl() {
    const next = await promptInput({
      title: t('toolbar.videoDialog.title'),
      description: t('toolbar.videoDialog.description'),
      defaultValue: rawSrc || 'https://',
      placeholder: 'https://www.youtube.com/watch?v=',
      confirmLabel: t('toolbar.videoDialog.confirm'),
    })
    if (next == null) return
    applySrc(next)
  }

  function commitCaption() {
    const next = captionDraft.trim() || null
    if (next !== (node.attrs.caption ?? null)) {
      updateAttributes({ caption: next })
    }
  }

  return (
    <NodeViewWrapper
      className={cn('video-block', selected && 'is-selected', isEmpty && 'is-empty')}
      data-type={node.type.name === 'youtube' ? 'youtube' : 'video'}
      data-src={rawSrc}
    >
      {showChrome && !isEmpty ? (
        <div className="video-block__toolbar" contentEditable={false}>
          <span className="video-block__provider">{videoProviderLabel(rawSrc)}</span>
          <button type="button" className="video-block__btn" onClick={() => void replaceUrl()}>
            <Link2 className="h-3.5 w-3.5" />
            {t('video.replace')}
          </button>
          <button type="button" className="video-block__btn video-block__btn--danger" onClick={() => deleteNode()}>
            <Trash2 className="h-3.5 w-3.5" />
            {t('video.delete')}
          </button>
        </div>
      ) : null}

      <div className="video-block__stage" contentEditable={false}>
        {isEmpty ? (
          <form className="video-block__empty" onSubmit={onSubmitUrl}>
            <Video className="h-8 w-8" />
            <span>{t('video.emptyTitle')}</span>
            <span className="video-block__hint">{t('video.emptyHint')}</span>
            {editable ? (
              <input
                className="video-block__input"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="https://www.youtube.com/watch?v="
                spellCheck={false}
              />
            ) : null}
          </form>
        ) : failed || !canPlay ? (
          <div className="video-block__empty video-block__empty--error">
            <span>{t('video.error')}</span>
            <a href={rawSrc} target="_blank" rel="noreferrer">
              {rawSrc}
            </a>
          </div>
        ) : (
          <ReactPlayer
            src={rawSrc}
            controls
            playsInline
            width="100%"
            height="100%"
            style={{ width: '100%', height: '100%' }}
            onError={() => setFailed(true)}
          />
        )}
      </div>

      {node.type.name !== 'youtube' && (editable || captionDraft) ? (
        <textarea
          className="video-block__caption"
          value={captionDraft}
          rows={1}
          placeholder={t('video.captionPlaceholder')}
          disabled={!editable}
          onChange={(event) => setCaptionDraft(event.target.value)}
          onBlur={commitCaption}
        />
      ) : null}
    </NodeViewWrapper>
  )
}
