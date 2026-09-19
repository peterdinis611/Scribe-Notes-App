/**
 * Ensure app version strings stay aligned across npm / Tauri / frontend / crates.
 * Run: bun run version:check
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function read(path: string): string {
  return readFileSync(join(root, path), 'utf8').replace(/\r\n/g, '\n')
}

function pkgVersion(): string {
  return JSON.parse(read('package.json')).version as string
}

function tauriVersion(): string {
  return JSON.parse(read('src-tauri/tauri.conf.json')).version as string
}

function cargoVersion(path: string): string {
  const match = read(path).match(/^version\s*=\s*"([^"]+)"/m)
  if (!match) throw new Error(`No version in ${path}`)
  return match[1]
}

function appTsVersion(): string {
  const match = read('src/lib/app-version.ts').match(/APP_VERSION\s*=\s*['"]([^'"]+)['"]/)
  if (!match) throw new Error('APP_VERSION not found in src/lib/app-version.ts')
  return match[1]
}

export function parseCargoLockAppVersion(text: string): string {
  const normalized = text.replace(/\r\n/g, '\n')
  const match = normalized.match(/^name = "app"\nversion = "([^"]+)"/m)
  if (!match) throw new Error('app crate version not found in src-tauri/Cargo.lock')
  return match[1]
}

function cargoLockAppVersion(): string {
  return parseCargoLockAppVersion(read('src-tauri/Cargo.lock'))
}

export function checkVersionSync() {
  const expected = pkgVersion()
  const sources: Array<[string, string]> = [
    ['package.json', expected],
    ['src-tauri/tauri.conf.json', tauriVersion()],
    ['src-tauri/Cargo.toml', cargoVersion('src-tauri/Cargo.toml')],
    ['crates/scribe-core/Cargo.toml', cargoVersion('crates/scribe-core/Cargo.toml')],
    ['crates/scribe-mcp/Cargo.toml', cargoVersion('crates/scribe-mcp/Cargo.toml')],
    ['src/lib/app-version.ts', appTsVersion()],
    ['src-tauri/Cargo.lock (app)', cargoLockAppVersion()],
  ]

  const mismatches = sources.filter(([, version]) => version !== expected)
  if (mismatches.length > 0) {
    console.error(`Version sync failed (expected ${expected}):`)
    for (const [path, version] of mismatches) {
      console.error(`  ${path}: ${version}`)
    }
    process.exit(1)
  }

  const tag = process.env.GITHUB_REF_TYPE === 'tag' ? process.env.GITHUB_REF_NAME : undefined
  if (tag) {
    const normalized = tag.replace(/^v/, '')
    if (normalized !== expected) {
      console.error(`Git tag ${tag} does not match package.json version ${expected}`)
      process.exit(1)
    }
    console.log(`OK: versions synced at ${expected} (tag ${tag})`)
  } else {
    console.log(`OK: versions synced at ${expected}`)
  }
}

if (!process.env.VITEST) {
  checkVersionSync()
}
