import { readFile } from '@tauri-apps/plugin-fs'
import { readBinaryFile } from '@/lib/db/api'

/** Read bytes from a user-picked path (scoped dialog) or fall back to the Rust command. */
export async function readScopedBinaryFile(path: string): Promise<Uint8Array> {
  try {
    return await readFile(path)
  } catch {
    const bytes = await readBinaryFile(path)
    return new Uint8Array(bytes)
  }
}

export function isZipArchive(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b
}

/** Legacy Microsoft Word `.doc` (OLE compound file), not `.docx`. */
export function isOleWordDoc(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0xd0 &&
    bytes[1] === 0xcf &&
    bytes[2] === 0x11 &&
    bytes[3] === 0xe0
  )
}
