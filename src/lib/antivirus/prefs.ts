import { kvGet, kvSet } from '@/lib/storage/kv'

const KEY = 'scribe.antivirus.policy.v1'

export type AntivirusPolicy = {
  enabled: boolean
  scanOnImport: boolean
  blockInfected: boolean
  quarantineInfected: boolean
  warnIfUnavailable: boolean
}

export const DEFAULT_ANTIVIRUS_POLICY: AntivirusPolicy = {
  enabled: true,
  scanOnImport: true,
  blockInfected: true,
  quarantineInfected: true,
  warnIfUnavailable: true,
}

export function readAntivirusPolicy(): AntivirusPolicy {
  const raw = kvGet(KEY)
  if (!raw) return { ...DEFAULT_ANTIVIRUS_POLICY }
  try {
    const parsed = JSON.parse(raw) as Partial<AntivirusPolicy>
    return {
      ...DEFAULT_ANTIVIRUS_POLICY,
      ...parsed,
    }
  } catch {
    return { ...DEFAULT_ANTIVIRUS_POLICY }
  }
}

export function writeAntivirusPolicy(policy: AntivirusPolicy) {
  kvSet(KEY, JSON.stringify(policy))
}

export function patchAntivirusPolicy(patch: Partial<AntivirusPolicy>): AntivirusPolicy {
  const next = { ...readAntivirusPolicy(), ...patch }
  writeAntivirusPolicy(next)
  return next
}
