import { createDocument } from '@/lib/db/api'
import { cacheDocument } from '@/lib/cache/document-cache'
import { prependDocumentSummary } from '@/lib/db/library-sync'
import { ROUTES } from '@/lib/routes'
import type { AppDispatch } from '@/store/index'
import {
  setActiveDocument,
  setActiveDocumentId,
  setSaveStatus,
  updateDocuments,
} from '@/store/documentsSlice'

/** Create a note seeded with a transcript (or placeholder) from voice capture. */
export async function openVoiceTranscriptNote(
  dispatch: AppDispatch,
  navigate: (route: ReturnType<typeof ROUTES.document>) => void | Promise<void>,
  args: { title: string; transcript: string },
) {
  const body = args.transcript.trim() || '…'
  const document = cacheDocument(
    await createDocument({
      title: args.title,
      contentJson: JSON.stringify({
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 1 },
            content: [{ type: 'text', text: args.title }],
          },
          {
            type: 'paragraph',
            content: [{ type: 'text', text: body }],
          },
        ],
      }),
    }),
  )
  dispatch(updateDocuments((prev) => prependDocumentSummary(prev, document)))
  dispatch(setActiveDocumentId(document.id))
  dispatch(setActiveDocument(document))
  dispatch(setSaveStatus('saved'))
  await navigate(ROUTES.document(document.id))
  return document
}

export async function recordMicrophoneWavBlob(maxMs = 60_000): Promise<Blob> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
    ? 'audio/webm;codecs=opus'
    : 'audio/webm'
  const recorder = new MediaRecorder(stream, { mimeType: mime })
  const chunks: BlobPart[] = []
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data)
  }

  const stopped = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop())
      resolve(new Blob(chunks, { type: mime }))
    }
    recorder.onerror = () => {
      stream.getTracks().forEach((track) => track.stop())
      reject(new Error('Recording failed'))
    }
  })

  recorder.start()
  window.setTimeout(() => {
    if (recorder.state === 'recording') recorder.stop()
  }, maxMs)

  return stopped
}

export function stopMediaRecorder(recorder: MediaRecorder | null) {
  if (recorder && recorder.state !== 'inactive') recorder.stop()
}
