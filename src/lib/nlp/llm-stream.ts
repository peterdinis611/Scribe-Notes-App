import { listen, type UnlistenFn } from '@tauri-apps/api/event'

export type NlpLlmChunkEvent = {
  requestId: string
  text: string
  done: boolean
}

/** Listen for streaming LLM token events while `run` executes. */
export async function withLlmChunkListener<T>(
  onChunk: (text: string) => void,
  run: () => Promise<T>,
): Promise<T> {
  let unlisten: UnlistenFn | null = null
  try {
    unlisten = await listen<NlpLlmChunkEvent>('nlp-llm-chunk', (event) => {
      if (event.payload.done) return
      if (event.payload.text) onChunk(event.payload.text)
    })
    return await run()
  } finally {
    if (unlisten) await unlisten()
  }
}
