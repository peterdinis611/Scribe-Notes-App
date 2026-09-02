import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { nlpIndexAll, type NlpIndexProgress } from '@/lib/db/nlp-api'

export async function runNlpIndexAllWithProgress(
  onProgress: (progress: NlpIndexProgress) => void,
): Promise<Awaited<ReturnType<typeof nlpIndexAll>>> {
  let unlisten: UnlistenFn | null = null
  try {
    unlisten = await listen<NlpIndexProgress>('nlp-index-progress', (event) => {
      onProgress(event.payload)
    })
    return await nlpIndexAll()
  } finally {
    if (unlisten) await unlisten()
  }
}
