/** Hybrid search helpers. RRF fuse lives in scribe-core (`fuse_search_hits`). */

export function isHybridSearchScope(scope: string) {
  return scope === 'all' || scope === 'content'
}
