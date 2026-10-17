import ReactPlayer from 'react-player'
import { NodeViewWrapper } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Film, Link2, Trash2, Video } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  isLocalVideoPath,
  isVideoUrl,
  normalizeVideoSrc,
  resolveVideoSrc,
  videoProviderLabel,
} from '@/lib/editor/video'
import { promptInput } from '@/lib/input-dialog'
import { toast } from '@/lib/toast'
import { useNavigate } from '@tanstack/react-router'
import { ROUTES } from '@/lib/routes'
import { useAppDispatch } from '@/store/hooks'
import { setActiveDocumentId } from '@/store/documentsSlice'
import {
  VideoTranscribeDialog,
  type VideoTranscribeOptions,
} from '@/components/editor/VideoTranscribeDialog'

export function VideoBlock({ node, updateAttributes, selected, editor, deleteNode }: NodeViewProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const rawSrc = String(node.attrs.src ?? '').trim()
  const libraryVideoId = String(node.attrs.libraryVideoId ?? '').trim() || null
  const playSrc = resolveVideoSrc(rawSrc)
  const editable = editor.isEditable
  const [failed, setFailed] = useState(false)
  const [draft, setDraft] = useState(rawSrc)
  const [captionDraft, setCaptionDraft] = useState(String(node.attrs.caption ?? ''))
  const [busy, setBusy] = useState(false)
  const [transcribeOpen, setTranscribeOpen] = useState(false)

  useEffect(() => {
    setDraft(rawSrc)
    setFailed(false)
  }, [rawSrc])

  useEffect(() => {
    setCaptionDraft(String(node.attrs.caption ?? ''))
  }, [node.attrs.caption])

  const canPlay =
    playSrc.length > 0 &&
    ((ReactPlayer.canPlay?.(playSrc) ?? isVideoUrl(playSrc)) || isLocalVideoPath(rawSrc))
  const isEmpty = !rawSrc
  const showChrome = (selected || isEmpty) && editable

  function applySrc(next: string) {
    const trimmed = next.trim()
    if (!trimmed) {
      updateAttributes({ src: null, libraryVideoId: null })
      return
    }
    updateAttributes({ src: normalizeVideoSrc(trimmed), libraryVideoId: null })
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

  async function importLocal() {
    if (busy || editor.isDestroyed) return
    setBusy(true)
    try {
      // Insert at this empty block by updating attrs instead of inserting a second node.
      const { store } = await import('@/store/index')
      const documentId = store.getState().documents.activeDocumentId
      const {
        pickLocalVideoNative,
        importLocalVideoNative,
        libraryVideoPlaybackPathNative,
        probeLibraryVideoNative,
      } = await import('@/lib/db/api')
      const sourcePath = await pickLocalVideoNative()
      if (!sourcePath || editor.isDestroyed) return
      const { video } = await importLocalVideoNative({
        sourcePath,
        documentId: documentId ?? null,
        importMode: 'copy',
      })
      void probeLibraryVideoNative(video.id).catch(() => null)
      const playbackPath = await libraryVideoPlaybackPathNative(video.id)
      updateAttributes({
        src: playbackPath,
        caption: video.title || node.attrs.caption || null,
        libraryVideoId: video.id,
      })
      toast.success(t('toasts.localVideoInserted'))
    } catch (error) {
      toast.error(t('toasts.localVideoError'), String(error))
    } finally {
      setBusy(false)
    }
  }

  async function runTranscribe(options: VideoTranscribeOptions) {
    if (!libraryVideoId || busy) return
    setBusy(true)
    try {
      const { transcribeLibraryVideoNative } = await import('@/lib/db/api')
      const result = await transcribeLibraryVideoNative({
        videoId: libraryVideoId,
        model: options.model,
        language: options.language,
        createDocument: true,
      })
      setTranscribeOpen(false)
      toast.success(t('video.transcribeDone'))
      if (result.transcriptDocumentId) {
        dispatch(setActiveDocumentId(result.transcriptDocumentId))
        void navigate(ROUTES.document(result.transcriptDocumentId))
      }
    } catch (error) {
      toast.error(t('video.transcribeFailed'), String(error))
    } finally {
      setBusy(false)
    }
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
      data-library-video-id={libraryVideoId ?? ''}
    >
      {showChrome && !isEmpty ? (
        <div className="video-block__toolbar" contentEditable={false}>
          <span className="video-block__provider">
            {libraryVideoId ? t('video.localLibrary') : videoProviderLabel(rawSrc)}
          </span>
          {libraryVideoId ? (
            <button
              type="button"
              className="video-block__btn"
              disabled={busy}
              onClick={() => setTranscribeOpen(true)}
            >
              {t('video.transcribe')}
            </button>
          ) : null}
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
              <>
                <input
                  className="video-block__input"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="https://www.youtube.com/watch?v="
                  spellCheck={false}
                />
                <button
                  type="button"
                  className="video-block__btn"
                  disabled={busy}
                  onClick={() => void importLocal()}
                >
                  <Film className="h-3.5 w-3.5" />
                  {t('video.importLocal')}
                </button>
              </>
            ) : null}
          </form>
        ) : failed || !canPlay ? (
          <div className="video-block__empty video-block__empty--error">
            <span>{t('video.error')}</span>
            <a href={playSrc || rawSrc} target="_blank" rel="noreferrer">
              {rawSrc}
            </a>
          </div>
        ) : (
          <ReactPlayer
            src={playSrc}
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

      <VideoTranscribeDialog
        open={transcribeOpen}
        busy={busy}
        onOpenChange={setTranscribeOpen}
        onConfirm={(options) => void runTranscribe(options)}
      />
    </NodeViewWrapper>
  )
}
