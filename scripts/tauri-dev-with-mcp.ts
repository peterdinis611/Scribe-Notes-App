#!/usr/bin/env node
/**
 * Start Tauri dev and keep the Scribe MCP release binary fresh.
 *
 * Cursor/Claude spawn `target/release/scribe-mcp` over stdio themselves —
 * this script does not hang a second stdio server (that would conflict).
 * It builds/rebuilds the binary alongside `tauri dev`.
 *
 * Debug:
 *   npm run tauri:dev:debug
 *   node --experimental-strip-types scripts/tauri-dev-with-mcp.ts --debug
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const binary = join(root, 'target', 'release', 'scribe-mcp')
const children: ChildProcess[] = []
let shuttingDown = false

const argv = process.argv.slice(2)
const debugRequested =
  argv.includes('--debug') ||
  process.env.SCRIBE_DEBUG === '1' ||
  process.env.SCRIBE_DEBUG === 'true'

const passthroughArgs = argv.filter((arg) => arg !== '--debug')

const debugEnv: NodeJS.ProcessEnv = debugRequested
  ? {
      ...process.env,
      SCRIBE_DEBUG: '1',
      SCRIBE_NLP_DEBUG: process.env.SCRIBE_NLP_DEBUG ?? '1',
      SCRIBE_RUST_LOG: process.env.SCRIBE_RUST_LOG ?? 'debug',
      RUST_LOG: process.env.RUST_LOG ?? 'debug',
      VITE_DEBUG: process.env.VITE_DEBUG ?? '1',
      TAURI_DEBUG: process.env.TAURI_DEBUG ?? '1',
    }
  : process.env

function log(prefix: string, chunk: Buffer | string): void {
  const text = chunk.toString()
  for (const line of text.split(/\r?\n/)) {
    if (line.length === 0) continue
    console.log(`${prefix}${line}`)
  }
}

function spawnLogged(
  command: string,
  args: string[],
  prefix: string,
  opts: { inherit?: boolean; env?: NodeJS.ProcessEnv } = {},
): ChildProcess {
  const child = spawn(command, args, {
    cwd: root,
    env: opts.env ?? process.env,
    stdio: opts.inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  })
  children.push(child)

  if (!opts.inherit) {
    child.stdout?.on('data', (chunk: Buffer) => log(prefix, chunk))
    child.stderr?.on('data', (chunk: Buffer) => log(prefix, chunk))
  }

  return child
}

function shutdown(code = 0): void {
  if (shuttingDown) return
  shuttingDown = true
  for (const child of children) {
    if (!child.killed && child.exitCode === null) {
      child.kill('SIGTERM')
    }
  }
  process.exit(code)
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

const hadBinary = existsSync(binary)
console.log(
  hadBinary
    ? `[dev] starting tauri + refreshing MCP release binary${debugRequested ? ' (debug)' : ''}…`
    : `[dev] MCP binary missing — building scribe-mcp (release) in parallel with tauri${debugRequested ? ' (debug)' : ''}…`,
)

if (debugRequested) {
  console.log(
    '[dev] debug flags: SCRIBE_DEBUG SCRIBE_NLP_DEBUG RUST_LOG=debug VITE_DEBUG TAURI_DEBUG',
  )
}

const mcp = spawnLogged('cargo', ['build', '--release', '-p', 'scribe-mcp'], '[mcp] ', {
  env: debugEnv,
})

mcp.on('exit', (code, signal) => {
  if (shuttingDown) return
  if (code === 0) {
    console.log(`[mcp] ready → ${binary}`)
    return
  }
  console.warn(
    `[mcp] build exited (${signal ?? code}). Tauri keeps running; fix MCP with: npm run mcp:install`,
  )
})

const tauri = spawnLogged('tauri', ['dev', ...passthroughArgs], '[tauri] ', {
  inherit: true,
  env: debugEnv,
})

tauri.on('exit', (code) => {
  shutdown(code ?? 0)
})
