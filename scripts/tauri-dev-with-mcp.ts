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

const c = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
}

function banner(): void {
  const mode = debugRequested ? `${c.yellow}DEBUG${c.reset}` : `${c.green}DEV${c.reset}`
  console.log('')
  console.log(`${c.bold}${c.cyan}┌─ Scribe tauri:dev${c.reset}  (${mode})`)
  console.log(
    `${c.cyan}│${c.reset}  ${c.dim}webview hot-reload · keep this process running${c.reset}`,
  )
  console.log(
    `${c.cyan}│${c.reset}  ${c.dim}force reload: npm run dev:reload${c.reset}`,
  )
  if (debugRequested) {
    console.log(`${c.cyan}│${c.reset}`)
    console.log(`${c.cyan}│${c.reset}  ${c.bold}Verbose flags${c.reset}`)
    for (const [key, value] of [
      ['SCRIBE_DEBUG', '1'],
      ['SCRIBE_NLP_DEBUG', process.env.SCRIBE_NLP_DEBUG ?? '1'],
      ['SCRIBE_RUST_LOG', process.env.SCRIBE_RUST_LOG ?? 'debug'],
      ['RUST_LOG', process.env.RUST_LOG ?? 'debug'],
      ['VITE_DEBUG', process.env.VITE_DEBUG ?? '1'],
      ['TAURI_DEBUG', process.env.TAURI_DEBUG ?? '1'],
    ] as const) {
      console.log(
        `${c.cyan}│${c.reset}    ${c.magenta}${key}${c.reset}=${c.yellow}${value}${c.reset}`,
      )
    }
    console.log(
      `${c.cyan}│${c.reset}  ${c.dim}FE console: [boot]/[ipc]/[save]  ·  Rust: colored [LEVEL][target]${c.reset}`,
    )
  } else {
    console.log(
      `${c.cyan}│${c.reset}  ${c.dim}soft FE logs on · verbose: npm run tauri:dev:debug${c.reset}`,
    )
  }
  console.log(`${c.cyan}└${c.reset}`)
  console.log('')
}

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

banner()

const hadBinary = existsSync(binary)
console.log(
  hadBinary
    ? `${c.blue}[dev]${c.reset} starting tauri + refreshing MCP release binary…`
    : `${c.blue}[dev]${c.reset} MCP binary missing — building scribe-mcp (release) in parallel with tauri…`,
)

const mcp = spawnLogged('cargo', ['build', '--release', '-p', 'scribe-mcp'], `${c.magenta}[mcp]${c.reset} `, {
  env: debugEnv,
})

mcp.on('exit', (code, signal) => {
  if (shuttingDown) return
  if (code === 0) {
    console.log(`${c.green}[mcp]${c.reset} ready → ${binary}`)
    return
  }
  console.warn(
    `${c.yellow}[mcp]${c.reset} build exited (${signal ?? code}). Tauri keeps running; fix MCP with: npm run mcp:install`,
  )
})

const tauri = spawnLogged('tauri', ['dev', ...passthroughArgs], '[tauri] ', {
  inherit: true,
  env: debugEnv,
})

tauri.on('exit', (code) => {
  shutdown(code ?? 0)
})
