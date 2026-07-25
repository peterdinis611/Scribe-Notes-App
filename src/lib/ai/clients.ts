import type { AiConfig, CompleteRequest } from '@/lib/ai/types'

function trimBaseUrl(url: string): string {
  return url.replace(/\/+$/, '')
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } | string; message?: string }
    if (typeof body.error === 'string') return body.error
    if (body.error && typeof body.error === 'object' && body.error.message) return body.error.message
    if (body.message) return body.message
  } catch {
    // ignore
  }
  return `${response.status} ${response.statusText}`.trim()
}

async function completeOllama(config: AiConfig, request: CompleteRequest): Promise<string> {
  const response = await fetch(`${trimBaseUrl(config.baseUrl)}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: request.system },
        { role: 'user', content: request.user },
      ],
      stream: false,
    }),
    signal: request.signal,
  })

  if (!response.ok) {
    throw new Error(await readErrorMessage(response))
  }

  const data = (await response.json()) as { message?: { content?: string } }
  const content = data.message?.content?.trim()
  if (!content) throw new Error('Empty response from Ollama')
  return content
}

async function completeOpenAi(config: AiConfig, request: CompleteRequest): Promise<string> {
  if (!config.apiKey) throw new Error('Missing API key')

  const response = await fetch(`${trimBaseUrl(config.baseUrl)}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: request.system },
        { role: 'user', content: request.user },
      ],
    }),
    signal: request.signal,
  })

  if (!response.ok) {
    throw new Error(await readErrorMessage(response))
  }

  const data = (await response.json()) as { choices?: { message?: { content?: string } }[] }
  const content = data.choices?.[0]?.message?.content?.trim()
  if (!content) throw new Error('Empty response from OpenAI')
  return content
}

async function completeAnthropic(config: AiConfig, request: CompleteRequest): Promise<string> {
  if (!config.apiKey) throw new Error('Missing API key')

  const response = await fetch(`${trimBaseUrl(config.baseUrl)}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 4096,
      system: request.system,
      messages: [{ role: 'user', content: request.user }],
    }),
    signal: request.signal,
  })

  if (!response.ok) {
    throw new Error(await readErrorMessage(response))
  }

  const data = (await response.json()) as {
    content?: { type?: string; text?: string }[]
  }
  const content = data.content
    ?.map((block) => (block.type === 'text' ? block.text ?? '' : ''))
    .join('')
    .trim()
  if (!content) throw new Error('Empty response from Anthropic')
  return content
}

export async function complete(config: AiConfig, request: CompleteRequest): Promise<string> {
  switch (config.provider) {
    case 'ollama':
      return completeOllama(config, request)
    case 'openai':
      return completeOpenAi(config, request)
    case 'anthropic':
      return completeAnthropic(config, request)
  }
}
