/**
 * Smoke-check Dioxus SSR surfaces without launching the full app.
 * Run: bun run ui:surfaces
 */
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const result = spawnSync(
  'cargo',
  ['test', '-p', 'scribe-ui', '--features', 'dioxus', 'render::tests', '--', '--nocapture'],
  { stdio: 'inherit', cwd: root },
)

process.exit(result.status ?? 1)
