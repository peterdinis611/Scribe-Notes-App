export type DocumentQuestionTurn = {
  id: string
  question: string
  answer?: string
  action?: string | null
  createdAt: number
}

/** User turns from a document chat thread, oldest first. */
export function documentQuestionHistory(
  messages: Array<{
    id: string
    role: string
    text: string
    action?: string | null
    createdAt?: number
  }>,
): DocumentQuestionTurn[] {
  const turns: DocumentQuestionTurn[] = []
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index]
    const question = message.text.trim()
    if (message.role !== 'user' || !question) continue
    const next = messages[index + 1]
    turns.push({
      id: message.id,
      question,
      answer: next?.role === 'assistant' ? next.text : undefined,
      action: message.action ?? null,
      createdAt: message.createdAt ?? 0,
    })
  }
  return turns
}
