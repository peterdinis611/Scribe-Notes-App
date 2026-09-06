#!/usr/bin/env node
/**
 * TipTap depends on ProseMirror. Multiple nested copies of the same package
 * (esp. prosemirror-model) break TypeScript (`tsc -b`) because Node/Node types
 * become incompatible identities.
 *
 * Primary fix: package.json `overrides` + a single top-level pin.
 * This script is a safety net for npm/bun installs that still nest copies.
 *
 * Usage:
 *   node scripts/ensure-prosemirror-singleton.mjs        # remove nested copies
 *   node scripts/ensure-prosemirror-singleton.mjs --check # exit 1 if nested remain
 */
import { readdirSync, rmSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const checkOnly = process.argv.includes('--check')
const root = join(fileURLToPath(new URL('..', import.meta.url)), 'node_modules')

const PACKAGE_NAMES = new Set([
  'prosemirror-model',
  'prosemirror-state',
  'prosemirror-view',
  'prosemirror-transform',
  'prosemirror-commands',
  'prosemirror-keymap',
  'prosemirror-schema-list',
  'prosemirror-tables',
  'prosemirror-history',
  'prosemirror-gapcursor',
  'prosemirror-dropcursor',
  'prosemirror-inputrules',
  'prosemirror-changeset',
])

/** @type {string[]} */
const nested = []

/**
 * @param {string} dir
 * @param {number} depth
 */
function walk(dir, depth = 0) {
  if (depth > 8) return

  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }

  for (const name of entries) {
    if (name === '.bin' || name === '.cache' || name === '.vite') continue
    const full = join(dir, name)

    let isDir = false
    try {
      isDir = statSync(full).isDirectory()
    } catch {
      continue
    }
    if (!isDir) continue

    if (PACKAGE_NAMES.has(name) && dir !== root) {
      nested.push(full)
      continue
    }

    // Descend into nested node_modules and scoped packages.
    if (name === 'node_modules' || name.startsWith('@') || !name.startsWith('.')) {
      walk(full, depth + 1)
    }
  }
}

try {
  walk(root)
} catch (error) {
  console.warn('[prosemirror] skip: node_modules not ready', error instanceof Error ? error.message : error)
  process.exit(0)
}

if (nested.length === 0) {
  console.log('[prosemirror] ok — single copy of each package at node_modules/')
  process.exit(0)
}

const rel = nested.map((path) => relative(process.cwd(), path)).sort()

if (checkOnly) {
  console.error('[prosemirror] nested copies found (run postinstall / npm install):')
  for (const path of rel) console.error(`  - ${path}`)
  process.exit(1)
}

for (const path of nested) {
  rmSync(path, { recursive: true, force: true })
}

console.log(`[prosemirror] removed ${nested.length} nested cop${nested.length === 1 ? 'y' : 'ies'}:`)
for (const path of rel) console.log(`  - ${path}`)
