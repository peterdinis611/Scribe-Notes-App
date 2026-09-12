/** Client-side AES-GCM vault crypto (Web Crypto). Password never leaves the device. */

const VAULT_MARKER = 'scribe-vault-v1'
const PBKDF2_ITERATIONS = 210_000

export type VaultCipherPayload = {
  type: typeof VAULT_MARKER
  iv: string
  salt: string
  ct: string
}

export function isVaultCipherJson(contentJson: string): boolean {
  try {
    const parsed = JSON.parse(contentJson) as { type?: string }
    return parsed?.type === VAULT_MARKER
  } catch {
    return false
  }
}

function bytesToBase64(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let binary = ''
  for (let i = 0; i < view.length; i += 1) binary += String.fromCharCode(view[i]!)
  return btoa(binary)
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i)
  return out
}

function asBufferSource(bytes: Uint8Array): BufferSource {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: asBufferSource(salt),
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

/** Create a verifier string stored on the folder (salt + hash of password material). */
export async function createVaultVerifier(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const key = await deriveKey(password, salt)
  const challenge = new TextEncoder().encode('scribe-vault-verify')
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const sealed = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, challenge)
  return JSON.stringify({
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    proof: bytesToBase64(sealed),
  })
}

export async function verifyVaultPassword(password: string, verifierJson: string): Promise<boolean> {
  try {
    const verifier = JSON.parse(verifierJson) as { salt: string; iv: string; proof: string }
    const salt = base64ToBytes(verifier.salt)
    const iv = base64ToBytes(verifier.iv)
    const key = await deriveKey(password, salt)
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: asBufferSource(iv) },
      key,
      asBufferSource(base64ToBytes(verifier.proof)),
    )
    return new TextDecoder().decode(plain) === 'scribe-vault-verify'
  } catch {
    return false
  }
}

export async function encryptContentJson(password: string, contentJson: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(password, salt)
  const sealed = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(contentJson),
  )
  const payload: VaultCipherPayload = {
    type: VAULT_MARKER,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ct: bytesToBase64(sealed),
  }
  return JSON.stringify(payload)
}

export async function decryptContentJson(password: string, cipherJson: string): Promise<string> {
  const payload = JSON.parse(cipherJson) as VaultCipherPayload
  if (payload.type !== VAULT_MARKER) {
    throw new Error('Not a vault payload')
  }
  const key = await deriveKey(password, base64ToBytes(payload.salt))
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: asBufferSource(base64ToBytes(payload.iv)) },
    key,
    asBufferSource(base64ToBytes(payload.ct)),
  )
  return new TextDecoder().decode(plain)
}

/** Locked placeholder TipTap doc shown until unlock. */
export function vaultLockedPlaceholderJson(): string {
  return JSON.stringify({
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: '🔒 This note is in an encrypted vault. Unlock the folder to read it.',
            marks: [{ type: 'italic' }],
          },
        ],
      },
    ],
  })
}
