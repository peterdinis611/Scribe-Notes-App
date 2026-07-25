import { readdirSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * TipTap pulls slightly different prosemirror-model versions into nested
 * node_modules. Duplicate type identities then break `tsc -b`. Keep a single
 * top-level copy (pinned via package.json overrides / dependency).
 */
const root = join(process.cwd(), 'node_modules')

function walk(dir, depth = 0) {
  if (depth > 6) return
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }

  for (const name of entries) {
    if (name === '.bin' || name === '.cache') continue
    const full = join(dir, name)
    let isDir = false
    try {
      isDir = statSync(full).isDirectory()
    } catch {
      continue
    }
    if (!isDir) continue

    if (name === 'prosemirror-model' && dir !== root) {
      rmSync(full, { recursive: true, force: true })
      continue
    }

    if (name === 'node_modules' || !name.startsWith('.')) {
      walk(full, depth + 1)
    }
  }
}

walk(root)
