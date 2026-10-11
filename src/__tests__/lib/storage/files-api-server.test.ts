import { describe, expect, it } from 'vitest'
import {
  absoluteEndpointUrl,
  formatEndpointsMarkdown,
  STORAGE_FS_ENDPOINT_CATALOG,
} from '@/lib/storage/files-api-server'

describe('files-api-server helpers', () => {
  it('builds absolute loopback URLs', () => {
    expect(absoluteEndpointUrl('http://127.0.0.1:8787/', '/v1/fs/list')).toBe(
      'http://127.0.0.1:8787/v1/fs/list',
    )
    expect(absoluteEndpointUrl(null, '/docs')).toBe('http://127.0.0.1:8787/docs')
  })

  it('includes bearer token in copied markdown', () => {
    const md = formatEndpointsMarkdown({
      url: 'http://127.0.0.1:8787',
      token: 'abc123token',
      endpoints: STORAGE_FS_ENDPOINT_CATALOG.slice(0, 2),
    })
    expect(md).toContain('Authorization: Bearer abc123token')
    expect(md).toContain('http://127.0.0.1:8787/v1/fs/health')
  })

  it('placeholders token when server is offline', () => {
    const md = formatEndpointsMarkdown({
      url: null,
      token: null,
      endpoints: [],
    })
    expect(md).toContain('Authorization: Bearer <token from Settings>')
  })
})
