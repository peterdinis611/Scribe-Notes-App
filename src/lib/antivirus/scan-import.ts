import {
  antivirusQuarantineExternalPath,
  antivirusQuarantineStorageFile,
  antivirusScanPath,
  type AntivirusScanReport,
} from '@/lib/db/api'
import { readAntivirusPolicy } from '@/lib/antivirus/prefs'

export type ImportScanOutcome =
  | { ok: true; report: AntivirusScanReport }
  | {
      ok: false
      reason: 'blocked' | 'quarantined' | 'unavailable'
      report: AntivirusScanReport
      message: string
    }

export class AntivirusImportError extends Error {
  readonly reason: 'blocked' | 'quarantined' | 'unavailable'
  readonly report: AntivirusScanReport

  constructor(outcome: Extract<ImportScanOutcome, { ok: false }>) {
    super(
      outcome.reason === 'unavailable'
        ? `AntivirusUnavailable:${outcome.message}`
        : outcome.reason === 'quarantined'
          ? `AntivirusQuarantined:${outcome.message}`
          : `AntivirusBlocked:${outcome.message}`,
    )
    this.name = 'AntivirusImportError'
    this.reason = outcome.reason
    this.report = outcome.report
  }
}

/**
 * Apply local antivirus policy to a file about to enter the library.
 * - disabled / clean / skipped → allow
 * - infected + quarantine → move/copy into files/.quarantine
 * - infected + block → reject
 * - unavailable + warn → reject with unavailable
 */
export async function gateImportWithAntivirus(options: {
  absolutePath: string
  /** Relative path under files/ if the file already lives in the sandbox. */
  storageRelative?: string | null
}): Promise<ImportScanOutcome> {
  const policy = readAntivirusPolicy()
  if (!policy.enabled || !policy.scanOnImport) {
    return {
      ok: true,
      report: {
        engine: 'none',
        verdict: 'skipped',
        path: options.absolutePath,
        threats: [],
        rawSummary: 'policy disabled or scan-on-import off',
        durationMs: 0,
      },
    }
  }

  const report = await antivirusScanPath(options.absolutePath)
  if (report.verdict === 'clean' || report.verdict === 'skipped') {
    return { ok: true, report }
  }

  if (report.verdict === 'infected') {
    const threat = report.threats[0]?.name ?? 'malware'
    if (policy.quarantineInfected) {
      if (options.storageRelative) {
        await antivirusQuarantineStorageFile(
          options.storageRelative,
          `import blocked: ${threat}`,
          threat,
        )
      } else {
        await antivirusQuarantineExternalPath(
          options.absolutePath,
          `import blocked: ${threat}`,
          threat,
        )
      }
      return {
        ok: false,
        reason: 'quarantined',
        report,
        message: threat,
      }
    }
    if (policy.blockInfected) {
      return { ok: false, reason: 'blocked', report, message: threat }
    }
    return { ok: true, report }
  }

  if (policy.warnIfUnavailable) {
    return {
      ok: false,
      reason: 'unavailable',
      report,
      message: report.rawSummary || 'antivirus unavailable',
    }
  }
  return { ok: true, report }
}

/** Gate and throw {@link AntivirusImportError} when the file must not enter the library. */
export async function assertImportAllowedByAntivirus(absolutePath: string): Promise<void> {
  const outcome = await gateImportWithAntivirus({ absolutePath })
  if (!outcome.ok) throw new AntivirusImportError(outcome)
}
