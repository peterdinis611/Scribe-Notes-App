import { useEffect, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { LoaderCircle, Mic, Square } from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { openVoiceTranscriptNote } from '@/lib/capture/voice-note'
import { toast } from '@/lib/toast'
import { useAppDispatch } from '@/store/hooks'

type VoiceQuickNoteDialogProps = {
  open: boolean
  onClose: () => void
}

type SpeechRecognitionLike = {
  continuous: boolean
  interimResults: boolean
  lang: string
  start: () => void
  stop: () => void
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onerror: ((event: { error?: string }) => void) | null
  onend: (() => void) | null
}

function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  const w = window as Window & {
    SpeechRecognition?: new () => SpeechRecognitionLike
    webkitSpeechRecognition?: new () => SpeechRecognitionLike
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function VoiceQuickNoteDialog({ open, onClose }: VoiceQuickNoteDialogProps) {
  const { t, i18n } = useTranslation()
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const [listening, setListening] = useState(false)
  const [busy, setBusy] = useState(false)
  const [transcript, setTranscript] = useState('')
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)

  useEffect(() => {
    if (!open) {
      recognitionRef.current?.stop()
      recognitionRef.current = null
      setListening(false)
      setBusy(false)
      setTranscript('')
    }
  }, [open])

  function startListening() {
    const Ctor = getSpeechRecognition()
    if (!Ctor) {
      toast.info(t('voiceNote.unsupported'))
      return
    }
    const recognition = new Ctor()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = i18n.language?.startsWith('sk') ? 'sk-SK' : 'en-US'
    recognition.onresult = (event) => {
      let text = ''
      for (let i = 0; i < event.results.length; i += 1) {
        text += event.results[i]?.[0]?.transcript ?? ''
      }
      setTranscript(text.trim())
    }
    recognition.onerror = (event) => {
      toast.error(t('voiceNote.recordError'), event.error ?? 'speech')
      setListening(false)
    }
    recognition.onend = () => setListening(false)
    recognitionRef.current = recognition
    recognition.start()
    setListening(true)
  }

  function stopListening() {
    recognitionRef.current?.stop()
    setListening(false)
  }

  async function saveNote() {
    setBusy(true)
    try {
      stopListening()
      await openVoiceTranscriptNote(dispatch, navigate, {
        title: t('voiceNote.defaultTitle'),
        transcript: transcript || t('voiceNote.emptyBody'),
      })
      onClose()
    } catch (error) {
      toast.error(t('voiceNote.saveError'), String(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="voice-note-dialog max-w-md">
        <h2 className="m-0 text-[17px] font-semibold tracking-[-0.02em]">{t('voiceNote.title')}</h2>
        <p className="mt-1 text-[13px] text-[var(--color-muted-foreground)]">{t('voiceNote.hint')}</p>
        <div className="mt-4 flex gap-2">
          {!listening ? (
            <Button type="button" disabled={busy} onClick={startListening}>
              <Mic className="h-4 w-4" />
              {t('voiceNote.record')}
            </Button>
          ) : (
            <Button type="button" variant="destructive" onClick={stopListening}>
              <Square className="h-4 w-4" />
              {t('voiceNote.stop')}
            </Button>
          )}
          {busy ? <LoaderCircle className="h-4 w-4 animate-spin opacity-70" aria-hidden /> : null}
        </div>
        <textarea
          className="mt-4 min-h-[140px] w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-background)] p-3 text-[14px] leading-relaxed"
          value={transcript}
          onChange={(event) => setTranscript(event.target.value)}
          placeholder={t('voiceNote.placeholder')}
        />
        <div className="mt-3 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="button" disabled={busy || listening} onClick={() => void saveNote()}>
            {t('voiceNote.save')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
