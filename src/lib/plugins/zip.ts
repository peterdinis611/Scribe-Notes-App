/**
 * Minimal ZIP reader for .scribe-ext packages (store + deflate).
 * Only extracts text files needed for plugin install.
 */

function u16(view: DataView, offset: number) {
  return view.getUint16(offset, true)
}

function u32(view: DataView, offset: number) {
  return view.getUint32(offset, true)
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Deflate decompression is not available in this runtime')
  }
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(
    new DecompressionStream('deflate-raw'),
  )
  const buffer = await new Response(stream).arrayBuffer()
  return new Uint8Array(buffer)
}

export type ZipTextFiles = Record<string, string>

export async function readZipTextFiles(bytes: Uint8Array): Promise<ZipTextFiles> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const files: ZipTextFiles = {}
  let offset = 0

  while (offset + 30 <= bytes.length) {
    const sig = u32(view, offset)
    if (sig !== 0x04034b50) break

    const compression = u16(view, offset + 8)
    const compSize = u32(view, offset + 18)
    const nameLen = u16(view, offset + 26)
    const extraLen = u16(view, offset + 28)
    const nameStart = offset + 30
    const nameEnd = nameStart + nameLen
    const dataStart = nameEnd + extraLen
    const dataEnd = dataStart + compSize
    if (dataEnd > bytes.length) break

    const name = new TextDecoder().decode(bytes.subarray(nameStart, nameEnd)).replace(/\\/g, '/')
    const payload = bytes.subarray(dataStart, dataEnd)

    if (!name.endsWith('/') && !name.includes('..')) {
      let raw: Uint8Array
      if (compression === 0) {
        raw = payload
      } else if (compression === 8) {
        raw = await inflateRaw(payload)
      } else {
        offset = dataEnd
        continue
      }
      files[name.replace(/^\.\//, '')] = new TextDecoder().decode(raw)
    }

    offset = dataEnd
  }

  if (Object.keys(files).length === 0) {
    throw new Error('No files found in zip archive')
  }
  return files
}
