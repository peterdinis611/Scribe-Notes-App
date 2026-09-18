type EditorViewportSession = {
  scrollTop: number
  from: number
  to: number
}

const sessions = new Map<string, EditorViewportSession>()

export function rememberEditorSession(
  documentId: string | null | undefined,
  session: EditorViewportSession,
) {
  if (!documentId) return
  sessions.set(documentId, session)
}

export function recallEditorSession(documentId: string | null | undefined): EditorViewportSession | null {
  if (!documentId) return null
  return sessions.get(documentId) ?? null
}

export function forgetEditorSession(documentId: string | null | undefined) {
  if (!documentId) return
  sessions.delete(documentId)
}
