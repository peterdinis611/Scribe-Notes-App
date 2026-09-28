import { listen, type UnlistenFn } from '@tauri-apps/api/event'

export type NlpLlmChunkEvent = {
  requestId: string
  text: string
  done: boolean
}

/** Listen for streaming LLM token events while `run` executes. */
export async function withLlmChunkListener(
  onChunk: (text: string) => void,
  run: () => Promise<void>,
): Promise<void> {
  let unlisten: UnlistenFn | null = null
  try {
    unlisten = await listen<NlpLlmChunkEvent>('nlp-llm-chunk', (event) => {
      if (event.payload.done) return
      if (event.payload.text) onChunk(event.payload.text)
    })
    await run()
  } finally {
    if (unlisten) await unlisten()
  }
}
