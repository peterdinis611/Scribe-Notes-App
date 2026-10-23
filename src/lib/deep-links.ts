/** Parse and apply `scribe://` deep links (docs / artifacts / revisions / clip). */

export type ScribeDeepLink =
  | { kind: 'doc'; documentId: string }
  | { kind: 'artifact'; artifactId: string }
  | { kind: 'revision'; documentId: string; revisionId: string }
  | { kind: 'clip'; url?: string; title?: string; text?: string }

export function parseScribeDeepLink(raw: string): ScribeDeepLink | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return null
  }
  if (url.protocol !== 'scribe:') return null
  const host = url.hostname || url.pathname.replace(/^\//, '').split('/')[0] || ''
  const rest = url.hostname
    ? url.pathname.replace(/^\//, '')
    : url.pathname.replace(/^\//, '').split('/').slice(1).join('/')

  // scribe://clip?url=&title=&text=
  if (host === 'clip' || rest === 'clip' || rest.startsWith('clip?')) {
    return {
      kind: 'clip',
      url: url.searchParams.get('url')?.trim() || undefined,
      title: url.searchParams.get('title')?.trim() || undefined,
      text: url.searchParams.get('text')?.trim() || undefined,
    }
  }

  // scribe://doc/{id}
  if (host === 'doc') {
    const documentId = rest.split('/')[0]?.trim()
    return documentId ? { kind: 'doc', documentId } : null
  }
  if (host === 'artifact') {
    const artifactId = rest.split('/')[0]?.trim()
    return artifactId ? { kind: 'artifact', artifactId } : null
  }
  if (host === 'revision') {
    const [documentId, revisionId] = rest.split('/')
    if (documentId?.trim() && revisionId?.trim()) {
      return {
        kind: 'revision',
        documentId: documentId.trim(),
        revisionId: revisionId.trim(),
      }
    }
  }

  // scribe:///doc/{id} (empty host)
  const parts = trimmed.replace(/^scribe:\/\//i, '').split('/').filter(Boolean)
  if (parts[0] === 'clip') {
    return {
      kind: 'clip',
      url: url.searchParams.get('url')?.trim() || undefined,
      title: url.searchParams.get('title')?.trim() || undefined,
      text: url.searchParams.get('text')?.trim() || undefined,
    }
  }
  if (parts[0] === 'doc' && parts[1]) return { kind: 'doc', documentId: parts[1] }
  if (parts[0] === 'artifact' && parts[1]) return { kind: 'artifact', artifactId: parts[1] }
  if (parts[0] === 'revision' && parts[1] && parts[2]) {
    return { kind: 'revision', documentId: parts[1], revisionId: parts[2] }
  }
  return null
}

export const OPEN_DEEP_LINK_EVENT = 'open-deep-link'
