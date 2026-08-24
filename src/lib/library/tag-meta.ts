/** Convention-based structured tags: status:draft, project:Acme, year:2026 */

export type TagKind = 'status' | 'project' | 'year' | 'plain'

export type ParsedTag = {
  raw: string
  kind: TagKind
  value: string
}

export const STATUS_TAG_VALUES = ['draft', 'review', 'done', 'archived'] as const

export function parseTag(raw: string): ParsedTag {
  const trimmed = raw.trim()
  const match = /^(status|project|year):(.+)$/i.exec(trimmed)
  if (!match) {
    return { raw: trimmed, kind: 'plain', value: trimmed }
  }
  const kind = match[1]!.toLowerCase() as TagKind
  const value = match[2]!.trim()
  return { raw: trimmed, kind, value }
}

export function makeMetaTag(kind: 'status' | 'project' | 'year', value: string): string {
  return `${kind}:${value.trim()}`
}

export function groupTags(tags: string[]): Record<TagKind, ParsedTag[]> {
  const groups: Record<TagKind, ParsedTag[]> = {
    status: [],
    project: [],
    year: [],
    plain: [],
  }
  for (const tag of tags) {
    const parsed = parseTag(tag)
    groups[parsed.kind].push(parsed)
  }
  for (const kind of Object.keys(groups) as TagKind[]) {
    groups[kind].sort((a, b) => a.value.localeCompare(b.value, 'sk'))
  }
  return groups
}

export type MetaFilters = {
  status: string | null
  project: string | null
  year: string | null
}

export const EMPTY_META_FILTERS: MetaFilters = {
  status: null,
  project: null,
  year: null,
}

export function documentMatchesMetaFilters(tags: string[], filters: MetaFilters): boolean {
  if (filters.status) {
    const needle = makeMetaTag('status', filters.status)
    if (!tags.some((tag) => tag.toLowerCase() === needle.toLowerCase())) return false
  }
  if (filters.project) {
    const needle = makeMetaTag('project', filters.project)
    if (!tags.some((tag) => tag.toLowerCase() === needle.toLowerCase())) return false
  }
  if (filters.year) {
    const needle = makeMetaTag('year', filters.year)
    if (!tags.some((tag) => tag.toLowerCase() === needle.toLowerCase())) return false
  }
  return true
}

export function collectMetaOptions(allTags: string[]): {
  statuses: string[]
  projects: string[]
  years: string[]
} {
  const statuses = new Set<string>(STATUS_TAG_VALUES)
  const projects = new Set<string>()
  const years = new Set<string>()
  for (const tag of allTags) {
    const parsed = parseTag(tag)
    if (parsed.kind === 'status' && parsed.value) statuses.add(parsed.value)
    if (parsed.kind === 'project' && parsed.value) projects.add(parsed.value)
    if (parsed.kind === 'year' && parsed.value) years.add(parsed.value)
  }
  return {
    statuses: [...statuses].sort((a, b) => a.localeCompare(b, 'sk')),
    projects: [...projects].sort((a, b) => a.localeCompare(b, 'sk')),
    years: [...years].sort((a, b) => b.localeCompare(a)),
  }
}
