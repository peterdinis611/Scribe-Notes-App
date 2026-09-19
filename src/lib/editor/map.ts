export type MapMarker = {
  lat: number
  lng: number
  label?: string
}

export type MapSpec = {
  lat: number
  lng: number
  zoom: number
  title?: string
  markers: MapMarker[]
}

export const MAP_DEFAULT_SOURCE = `{
  "title": "Bratislava",
  "lat": 48.1486,
  "lng": 17.1077,
  "zoom": 13,
  "markers": [
    { "lat": 48.1486, "lng": 17.1077, "label": "Bratislava" }
  ]
}`

export type MapParseResult = { ok: true; spec: MapSpec } | { ok: false; error: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Number(value)
  }
  return null
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function parseLatLng(lat: unknown, lng: unknown): { lat: number; lng: number } | null {
  const nextLat = asNumber(lat)
  const nextLng = asNumber(lng)
  if (nextLat == null || nextLng == null) return null
  if (nextLat < -90 || nextLat > 90 || nextLng < -180 || nextLng > 180) return null
  return { lat: nextLat, lng: nextLng }
}

function parseCenter(value: unknown): { lat: number; lng: number } | null {
  if (Array.isArray(value) && value.length >= 2) {
    return parseLatLng(value[0], value[1])
  }
  if (isRecord(value)) {
    return parseLatLng(value.lat ?? value.latitude, value.lng ?? value.lon ?? value.longitude)
  }
  return null
}

function parseMarker(value: unknown): MapMarker | null {
  if (!isRecord(value)) return null
  const point = parseCenter(value.position) ?? parseLatLng(value.lat ?? value.latitude, value.lng ?? value.lon ?? value.longitude)
  if (!point) return null
  const label = typeof value.label === 'string' ? value.label.trim() : typeof value.title === 'string' ? value.title.trim() : ''
  return { ...point, ...(label ? { label } : {}) }
}

export function parseMapSpec(source: string): MapParseResult {
  const trimmed = source.trim()
  if (!trimmed) return { ok: false, error: 'Empty map spec' }

  const fromUrl = specFromMapUrl(trimmed)
  if (fromUrl) return { ok: true, spec: fromUrl }

  let raw: unknown
  try {
    raw = JSON.parse(trimmed)
  } catch {
    return { ok: false, error: 'Map spec must be valid JSON or an OpenStreetMap URL' }
  }

  if (!isRecord(raw)) return { ok: false, error: 'Map spec must be a JSON object' }

  const center =
    parseCenter(raw.center) ?? parseLatLng(raw.lat ?? raw.latitude, raw.lng ?? raw.lon ?? raw.longitude)
  if (!center) return { ok: false, error: 'Map needs lat/lng or center: [lat, lng]' }

  const markers = Array.isArray(raw.markers)
    ? raw.markers.map(parseMarker).filter((marker): marker is MapMarker => marker != null)
    : []

  return {
    ok: true,
    spec: {
      ...center,
      zoom: clamp(asNumber(raw.zoom) ?? 13, 1, 19),
      title: typeof raw.title === 'string' ? raw.title.trim() : undefined,
      markers,
    },
  }
}

export function specFromMapUrl(value: string): MapSpec | null {
  const trimmed = value.trim()
  const geo = trimmed.match(/^geo:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:\?z=(\d+))?/i)
  if (geo) {
    const point = parseLatLng(geo[1], geo[2])
    if (!point) return null
    return {
      ...point,
      zoom: clamp(asNumber(geo[3]) ?? 14, 1, 19),
      markers: [{ ...point }],
    }
  }

  try {
    const url = new URL(trimmed)
    const host = url.hostname.toLowerCase().replace(/^www\./, '')
    if (host !== 'openstreetmap.org' && host !== 'osm.org' && !host.endsWith('.openstreetmap.org')) {
      return null
    }

    const hash = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash
    const hashParams = new URLSearchParams(hash.includes('=') && !hash.startsWith('map=') ? hash : '')
    const mapMatch = hash.match(/map=(\d+)\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)/)
    const zoom = asNumber(mapMatch?.[1]) ?? asNumber(url.searchParams.get('zoom')) ?? 13
    const lat =
      asNumber(mapMatch?.[2]) ??
      asNumber(url.searchParams.get('mlat')) ??
      asNumber(hashParams.get('mlat'))
    const lng =
      asNumber(mapMatch?.[3]) ??
      asNumber(url.searchParams.get('mlon')) ??
      asNumber(hashParams.get('mlon'))
    const point = parseLatLng(lat, lng)
    if (!point) return null

    const markerLat = asNumber(url.searchParams.get('mlat')) ?? asNumber(hashParams.get('mlat'))
    const markerLng = asNumber(url.searchParams.get('mlon')) ?? asNumber(hashParams.get('mlon'))
    const marker = parseLatLng(markerLat, markerLng)

    return {
      ...point,
      zoom: clamp(zoom, 1, 19),
      markers: marker ? [{ ...marker }] : [{ ...point }],
    }
  } catch {
    return null
  }
}

export function isMapUrl(value: string): boolean {
  return specFromMapUrl(value) != null
}

export function mapPreviewLabel(source: string): string {
  const parsed = parseMapSpec(source)
  if (!parsed.ok) return 'Map'
  return parsed.spec.title || parsed.spec.markers[0]?.label || `${parsed.spec.lat.toFixed(3)}, ${parsed.spec.lng.toFixed(3)}`
}

export function mapOsmHref(spec: MapSpec): string {
  const marker = spec.markers[0]
  const hash = `#map=${spec.zoom}/${spec.lat}/${spec.lng}`
  if (!marker) return `https://www.openstreetmap.org/${hash}`
  return `https://www.openstreetmap.org/?mlat=${marker.lat}&mlon=${marker.lng}${hash}`
}

export function mapEmbedHref(spec: MapSpec): string {
  const span = 180 / 2 ** spec.zoom
  const south = clamp(spec.lat - span, -90, 90)
  const north = clamp(spec.lat + span, -90, 90)
  const west = clamp(spec.lng - span, -180, 180)
  const east = clamp(spec.lng + span, -180, 180)
  const marker = spec.markers[0]
  const params = new URLSearchParams({
    bbox: `${west},${south},${east},${north}`,
    layer: 'mapnik',
  })
  if (marker) params.set('marker', `${marker.lat},${marker.lng}`)
  return `https://www.openstreetmap.org/export/embed.html?${params.toString()}`
}
