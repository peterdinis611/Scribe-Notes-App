/**
 * Run the same checks as GitHub Actions CI (+ optional Tauri build) on this machine.
 *
 * Usage:
 *   bun run ci:local              # frontend + NLP + Rust (CI workflow)
 *   bun run ci:local:tauri        # + tauri build for this OS (Build workflow)
 *   bun scripts/ci-local.ts --tag v2.6.0   # also assert tag ↔ package.json
 *
 * Flags:
 *   --tauri          run `tauri build` (current OS only; CI builds 3 platforms)
 *   --tag [vX.Y.Z]   set GITHUB_REF_* like a tag push (defaults to latest v* tag)
 *   --frontend-only  skip NLP + Rust
 *   --skip-frontend / --skip-nlp / --skip-rust
 */
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

type Step = { name: string; cmd: string; args: string[]; env?: Record<string, string> }

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag)
}

function flagValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag)
  if (idx === -1) return undefined
  const next = process.argv[idx + 1]
  if (!next || next.startsWith('-')) return undefined
  return next
}

function latestVersionTag(): string | undefined {
  const result = spawnSync('git', ['tag', '-l', 'v*', '--sort=-v:refname'], {
    cwd: root,
    encoding: 'utf8',
  })
  if (result.status !== 0) return undefined
  return result.stdout.trim().split('\n').find(Boolean)
}

function run(step: Step): void {
  console.log(`\n━━━ ${step.name} ━━━`)
  const env = { ...process.env, ...step.env }
  const result = spawnSync(step.cmd, step.args, {
    cwd: root,
    env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  if (result.status !== 0) {
    console.error(`\n✖ Failed: ${step.name}`)
    process.exit(result.status ?? 1)
  }
  console.log(`✔ ${step.name}`)
}

const skipFrontend = hasFlag('--skip-frontend') || hasFlag('--nlp-only') || hasFlag('--rust-only')
const skipNlp = hasFlag('--skip-nlp') || hasFlag('--frontend-only') || hasFlag('--rust-only')
const skipRust = hasFlag('--skip-rust') || hasFlag('--frontend-only') || hasFlag('--nlp-only')
const withTauri = hasFlag('--tauri')
const wantTag = hasFlag('--tag')

const tagEnv: Record<string, string> = {}
if (wantTag) {
  const tag = flagValue('--tag') ?? latestVersionTag()
  if (!tag) {
    console.error('No tag supplied and no v* git tags found. Use: --tag v2.6.0')
    process.exit(1)
  }
  tagEnv.GITHUB_REF_TYPE = 'tag'
  tagEnv.GITHUB_REF_NAME = tag
  console.log(`Simulating tag push: ${tag}`)
}

console.log('Local CI — mirrors .github/workflows/ci.yml' + (withTauri ? ' + build.yml (this OS)' : ''))

if (!skipFrontend) {
  run({ name: 'CI / Version sync', cmd: 'bun', args: ['run', 'version:check'], env: tagEnv })
  run({ name: 'CI / Frontend lint', cmd: 'bun', args: ['run', 'lint'] })
  run({ name: 'CI / Frontend unit tests', cmd: 'bun', args: ['run', 'test'] })
  run({ name: 'CI / Frontend build', cmd: 'bun', args: ['run', 'build'] })
}

if (!skipNlp) {
  run({
    name: 'CI / NLP (Python)',
    cmd: 'python3',
    args: ['-m', 'unittest', 'discover', '-s', 'nlp/tests', '-p', 'test_*.py'],
    env: { PYTHONPATH: 'nlp' },
  })
}

if (!skipRust) {
  run({ name: 'CI / Rust cargo test', cmd: 'cargo', args: ['test', '--workspace'] })
}

if (withTauri) {
  // Build workflow uses --no-bundle on Linux/Windows; on macOS it bundles.
  // Locally we always use --no-bundle for a faster compile check.
  run({
    name: `Build / Tauri (${process.platform})`,
    cmd: 'bun',
    args: ['run', 'tauri', 'build', '--', '--no-bundle'],
    env: tagEnv,
  })
}

console.log('\nAll local CI checks passed.')
