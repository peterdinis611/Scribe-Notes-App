/** Structure-preserving TipTap JSON merge for sync conflicts. */

type TipTapNode = {
  type?: string
  attrs?: Record<string, unknown>
  content?: TipTapNode[]
  text?: string
  marks?: unknown[]
  [key: string]: unknown
}

type TipTapDoc = {
  type: 'doc'
  content?: TipTapNode[]
}

function fingerprint(node: TipTapNode): string {
  return JSON.stringify(node)
}

function parseDoc(json: string): TipTapDoc | null {
  try {
    const parsed = JSON.parse(json) as TipTapDoc
    if (!parsed || parsed.type !== 'doc') return null
    return parsed
  } catch {
    return null
  }
}

/** LCS lengths for block fingerprints. */
function lcsTable(a: string[], b: string[]): number[][] {
  const rows = a.length + 1
  const cols = b.length + 1
  const table = Array.from({ length: rows }, () => Array<number>(cols).fill(0))
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      table[i]![j] =
        a[i - 1] === b[j - 1]
          ? table[i - 1]![j - 1]! + 1
          : Math.max(table[i - 1]![j]!, table[i]![j - 1]!)
    }
  }
  return table
}

/**
 * Merge two TipTap docs at block level.
 * - Shared LCS blocks kept once
 * - Divergent hunks: `app` | `disk` | `both` (app then disk)
 */
export function mergeTiptapJson(
  appJson: string,
  diskJson: string,
  divergentPick: 'app' | 'disk' | 'both' = 'both',
): string | null {
  const appDoc = parseDoc(appJson)
  const diskDoc = parseDoc(diskJson)
  if (!appDoc || !diskDoc) return null

  const appBlocks = appDoc.content ?? []
  const diskBlocks = diskDoc.content ?? []
  const aKeys = appBlocks.map(fingerprint)
  const bKeys = diskBlocks.map(fingerprint)
  const table = lcsTable(aKeys, bKeys)

  const out: TipTapNode[] = []
  let i = appBlocks.length
  let j = diskBlocks.length
  type Step = { kind: 'equal'; ai: number; bi: number } | { kind: 'app'; ai: number } | { kind: 'disk'; bi: number }
  const steps: Step[] = []

  while (i > 0 && j > 0) {
    if (aKeys[i - 1] === bKeys[j - 1]) {
      steps.push({ kind: 'equal', ai: i - 1, bi: j - 1 })
      i -= 1
      j -= 1
    } else if (table[i - 1]![j]! >= table[i]![j - 1]!) {
      steps.push({ kind: 'app', ai: i - 1 })
      i -= 1
    } else {
      steps.push({ kind: 'disk', bi: j - 1 })
      j -= 1
    }
  }
  while (i > 0) {
    steps.push({ kind: 'app', ai: i - 1 })
    i -= 1
  }
  while (j > 0) {
    steps.push({ kind: 'disk', bi: j - 1 })
    j -= 1
  }
  steps.reverse()

  let idx = 0
  while (idx < steps.length) {
    const step = steps[idx]!
    if (step.kind === 'equal') {
      out.push(appBlocks[step.ai]!)
      idx += 1
      continue
    }
    const appChunk: TipTapNode[] = []
    const diskChunk: TipTapNode[] = []
    while (idx < steps.length && steps[idx]!.kind !== 'equal') {
      const cur = steps[idx]!
      if (cur.kind === 'app') appChunk.push(appBlocks[cur.ai]!)
      if (cur.kind === 'disk') diskChunk.push(diskBlocks[cur.bi]!)
      idx += 1
    }
    if (divergentPick === 'app') out.push(...appChunk)
    else if (divergentPick === 'disk') out.push(...diskChunk)
    else {
      out.push(...appChunk)
      for (const node of diskChunk) {
        if (!appChunk.some((existing) => fingerprint(existing) === fingerprint(node))) {
          out.push(node)
        }
      }
    }
  }

  return JSON.stringify({ type: 'doc', content: out })
}
