import {
  arc,
  area,
  axisBottom,
  axisLeft,
  create,
  curveMonotoneX,
  interpolateRgb,
  line,
  max,
  pie,
  scaleBand,
  scaleLinear,
  scaleOrdinal,
  scalePoint,
} from 'd3'

export const D3_CHART_TYPES = ['bar', 'line', 'area', 'pie'] as const

export type D3ChartType = (typeof D3_CHART_TYPES)[number]

export type D3ChartDatum = Record<string, string | number>

export type D3ChartSpec = {
  type: D3ChartType
  title?: string
  x?: string
  y?: string | string[]
  data: D3ChartDatum[]
  color?: string
  colors?: string[]
  width?: number
  height?: number
}

export const D3_CHART_DEFAULT_SOURCE = `{
  "type": "bar",
  "title": "Q1",
  "x": "month",
  "y": "value",
  "data": [
    { "month": "Jan", "value": 12 },
    { "month": "Feb", "value": 19 },
    { "month": "Mar", "value": 15 }
  ]
}`

export type D3ChartRenderResult =
  | { ok: true; svg: string; spec: D3ChartSpec }
  | { ok: false; error: string }

export type RenderD3ChartOptions = {
  /** Neutral ink for print / PDF / DOCX. */
  print?: boolean
}

const CHART_TYPE_SET = new Set<string>(D3_CHART_TYPES)

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function cssVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

function safeColor(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  if (/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(trimmed)) return trimmed
  if (/^rgba?\(/i.test(trimmed) || /^hsla?\(/i.test(trimmed)) return trimmed
  if (/^var\(--[a-z0-9-]+\)$/i.test(trimmed)) return trimmed
  if (/^[a-z]{3,20}$/i.test(trimmed)) return trimmed
  return fallback
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Number(value)
  }
  return null
}

function asLabel(value: unknown, fallback: string): string {
  if (value == null) return fallback
  return String(value)
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function yFields(spec: D3ChartSpec): string[] {
  if (Array.isArray(spec.y) && spec.y.length > 0) {
    return spec.y.map((field) => String(field)).filter(Boolean)
  }
  return [String(spec.y || 'value')]
}

export function parseD3ChartSpec(source: string): { ok: true; spec: D3ChartSpec } | { ok: false; error: string } {
  const trimmed = source.trim()
  if (!trimmed) {
    return { ok: false, error: 'Empty chart spec' }
  }

  let raw: unknown
  try {
    raw = JSON.parse(trimmed)
  } catch {
    return { ok: false, error: 'Chart spec must be valid JSON' }
  }

  if (!isRecord(raw)) {
    return { ok: false, error: 'Chart spec must be a JSON object' }
  }

  const type = String(raw.type ?? '').toLowerCase().trim()
  if (!CHART_TYPE_SET.has(type)) {
    return { ok: false, error: 'Chart type must be bar, line, area, or pie' }
  }

  if (!Array.isArray(raw.data) || raw.data.length === 0) {
    return { ok: false, error: 'Chart data must be a non-empty array' }
  }

  const data: D3ChartDatum[] = []
  for (const row of raw.data) {
    if (!isRecord(row)) {
      return { ok: false, error: 'Each data row must be an object' }
    }
    const datum: D3ChartDatum = {}
    for (const [key, value] of Object.entries(row)) {
      if (typeof value === 'string' || typeof value === 'number') {
        datum[key] = value
      }
    }
    data.push(datum)
  }

  const y =
    Array.isArray(raw.y) && raw.y.length > 0
      ? raw.y.map((field) => String(field)).filter(Boolean)
      : typeof raw.y === 'string' && raw.y.trim()
        ? raw.y.trim()
        : 'value'

  const colors = Array.isArray(raw.colors)
    ? raw.colors.map((color) => safeColor(color, '')).filter(Boolean)
    : undefined

  return {
    ok: true,
    spec: {
      type: type as D3ChartType,
      title: typeof raw.title === 'string' ? raw.title.trim() : undefined,
      x: typeof raw.x === 'string' && raw.x.trim() ? raw.x.trim() : 'label',
      y,
      data,
      color: typeof raw.color === 'string' ? raw.color : undefined,
      colors: colors?.length ? colors : undefined,
      width: asNumber(raw.width) ?? undefined,
      height: asNumber(raw.height) ?? undefined,
    },
  }
}

export function chartPreviewLabel(source: string): string {
  const parsed = parseD3ChartSpec(source)
  if (!parsed.ok) return 'Chart'
  return parsed.spec.title || parsed.spec.type
}

function palette(options?: RenderD3ChartOptions) {
  if (options?.print) {
    return {
      ink: '#1d1d1f',
      muted: '#86868b',
      accent: '#007aff',
      grid: '#e8e8ed',
      font: 'ui-sans-serif, system-ui, sans-serif',
    }
  }

  return {
    ink: cssVar('--color-foreground', '#1d1d1f'),
    muted: cssVar('--color-muted-foreground', '#86868b'),
    accent: cssVar('--color-accent', '#007aff'),
    grid: cssVar('--color-border', '#e8e8ed'),
    font: cssVar('--font-sans', 'ui-sans-serif, system-ui, sans-serif'),
  }
}

function seriesColors(count: number, accent: string, ink: string, explicit?: string[]): string[] {
  if (explicit && explicit.length > 0) {
    return Array.from({ length: count }, (_, index) => explicit[index % explicit.length]!)
  }
  if (count <= 1) return [accent]
  const interp = interpolateRgb(accent, ink)
  return Array.from({ length: count }, (_, index) => interp(index / Math.max(count - 1, 1)))
}

function drawCartesian(spec: D3ChartSpec, options?: RenderD3ChartOptions): string {
  const colors = palette(options)
  const fields = yFields(spec)
  const xField = spec.x || 'label'
  const width = clamp(spec.width ?? 640, 240, 1200)
  const height = clamp(spec.height ?? 320, 160, 800)
  const margin = { top: spec.title ? 40 : 20, right: 20, bottom: 44, left: 48 }
  const innerWidth = width - margin.left - margin.right
  const innerHeight = height - margin.top - margin.bottom

  const categories = spec.data.map((row, index) => asLabel(row[xField], String(index + 1)))
  const series = fields.map((field) =>
    spec.data.map((row) => asNumber(row[field]) ?? 0),
  )
  const yMax = Math.max(max(series.flat()) ?? 0, 1)
  const accent = safeColor(spec.color, colors.accent)
  const fills = seriesColors(fields.length, accent, colors.ink, spec.colors)

  const svg = create('svg')
    .attr('xmlns', 'http://www.w3.org/2000/svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('width', '100%')
    .attr('role', 'img')
    .attr('aria-label', spec.title || spec.type)

  svg
    .append('rect')
    .attr('width', width)
    .attr('height', height)
    .attr('fill', 'transparent')

  if (spec.title) {
    svg
      .append('text')
      .attr('x', margin.left)
      .attr('y', 22)
      .attr('fill', colors.ink)
      .attr('font-family', colors.font)
      .attr('font-size', 13)
      .attr('font-weight', 600)
      .attr('letter-spacing', '0.04em')
      .text(spec.title)
  }

  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)

  const yScale = scaleLinear().domain([0, yMax * 1.08]).range([innerHeight, 0]).nice()

  g.append('g')
    .attr('class', 'd3-chart__grid')
    .call(
      axisLeft(yScale)
        .ticks(4)
        .tickSize(-innerWidth)
        .tickFormat(() => ''),
    )
    .call((axis) => {
      axis.select('.domain').remove()
      axis.selectAll('line').attr('stroke', colors.grid).attr('stroke-width', 1)
    })

  g.append('g')
    .attr('class', 'd3-chart__y-axis')
    .call(axisLeft(yScale).ticks(4).tickSize(0).tickPadding(8))
    .call((axis) => {
      axis.select('.domain').remove()
      axis
        .selectAll('text')
        .attr('fill', colors.muted)
        .attr('font-family', colors.font)
        .attr('font-size', 11)
    })

  if (spec.type === 'bar' && fields.length === 1) {
    const xScale = scaleBand().domain(categories).range([0, innerWidth]).padding(0.28)
    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(axisBottom(xScale).tickSize(0).tickPadding(10))
      .call((axis) => {
        axis.select('.domain').attr('stroke', colors.grid)
        axis
          .selectAll('text')
          .attr('fill', colors.muted)
          .attr('font-family', colors.font)
          .attr('font-size', 11)
      })

    g.selectAll('rect.d3-chart__bar')
      .data(spec.data)
      .join('rect')
      .attr('class', 'd3-chart__bar')
      .attr('x', (_, index) => xScale(categories[index]!) ?? 0)
      .attr('width', xScale.bandwidth())
      .attr('y', (row) => yScale(asNumber(row[fields[0]!]) ?? 0))
      .attr('height', (row) => innerHeight - yScale(asNumber(row[fields[0]!]) ?? 0))
      .attr('rx', 3)
      .attr('fill', fills[0]!)
  } else if (spec.type === 'bar') {
    const xScale = scaleBand().domain(categories).range([0, innerWidth]).padding(0.2)
    const group = scaleBand().domain(fields).range([0, xScale.bandwidth()]).padding(0.08)

    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(axisBottom(xScale).tickSize(0).tickPadding(10))
      .call((axis) => {
        axis.select('.domain').attr('stroke', colors.grid)
        axis
          .selectAll('text')
          .attr('fill', colors.muted)
          .attr('font-family', colors.font)
          .attr('font-size', 11)
      })

    const groups = g
      .selectAll('g.d3-chart__group')
      .data(spec.data)
      .join('g')
      .attr('class', 'd3-chart__group')
      .attr('transform', (_, index) => `translate(${xScale(categories[index]!) ?? 0},0)`)

    groups
      .selectAll('rect')
      .data((row) => fields.map((field, seriesIndex) => ({ field, seriesIndex, value: asNumber(row[field]) ?? 0 })))
      .join('rect')
      .attr('x', (item) => group(item.field) ?? 0)
      .attr('width', group.bandwidth())
      .attr('y', (item) => yScale(item.value))
      .attr('height', (item) => innerHeight - yScale(item.value))
      .attr('rx', 2)
      .attr('fill', (item) => fills[item.seriesIndex]!)
  } else {
    const xScale = scalePoint().domain(categories).range([0, innerWidth]).padding(0.15)

    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(axisBottom(xScale).tickSize(0).tickPadding(10))
      .call((axis) => {
        axis.select('.domain').attr('stroke', colors.grid)
        axis
          .selectAll('text')
          .attr('fill', colors.muted)
          .attr('font-family', colors.font)
          .attr('font-size', 11)
      })

    fields.forEach((field, seriesIndex) => {
      const points = spec.data.map((row, index) => ({
        x: xScale(categories[index]!) ?? 0,
        y: yScale(asNumber(row[field]) ?? 0),
      }))

      if (spec.type === 'area') {
        const areaGen = area<(typeof points)[number]>()
          .x((point) => point.x)
          .y0(innerHeight)
          .y1((point) => point.y)
          .curve(curveMonotoneX)

        g.append('path')
          .attr('d', areaGen(points) ?? '')
          .attr('fill', fills[seriesIndex]!)
          .attr('opacity', 0.18)
      }

      const lineGen = line<(typeof points)[number]>()
        .x((point) => point.x)
        .y((point) => point.y)
        .curve(curveMonotoneX)

      g.append('path')
        .attr('d', lineGen(points) ?? '')
        .attr('fill', 'none')
        .attr('stroke', fills[seriesIndex]!)
        .attr('stroke-width', 2.25)
        .attr('stroke-linejoin', 'round')
        .attr('stroke-linecap', 'round')

      g.selectAll(`circle.d3-chart__dot-${seriesIndex}`)
        .data(points)
        .join('circle')
        .attr('class', `d3-chart__dot-${seriesIndex}`)
        .attr('cx', (point) => point.x)
        .attr('cy', (point) => point.y)
        .attr('r', 3.25)
        .attr('fill', fills[seriesIndex]!)
        .attr('stroke', colors.ink)
        .attr('stroke-width', 0)
    })
  }

  const node = svg.node()
  if (!node) throw new Error('Could not create chart SVG')
  return node.outerHTML
}

function drawPie(spec: D3ChartSpec, options?: RenderD3ChartOptions): string {
  const colors = palette(options)
  const xField = spec.x || 'label'
  const valueField = yFields(spec)[0] || 'value'
  const width = clamp(spec.width ?? 420, 240, 900)
  const height = clamp(spec.height ?? 320, 200, 720)
  const radius = Math.min(width, height) / 2 - 36
  const accent = safeColor(spec.color, colors.accent)
  const slices = spec.data.map((row, index) => ({
    label: asLabel(row[xField], String(index + 1)),
    value: Math.max(asNumber(row[valueField]) ?? 0, 0),
  }))
  const fills = seriesColors(slices.length, accent, colors.muted, spec.colors)

  const svg = create('svg')
    .attr('xmlns', 'http://www.w3.org/2000/svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('width', '100%')
    .attr('role', 'img')
    .attr('aria-label', spec.title || 'pie')

  if (spec.title) {
    svg
      .append('text')
      .attr('x', width / 2)
      .attr('y', 22)
      .attr('text-anchor', 'middle')
      .attr('fill', colors.ink)
      .attr('font-family', colors.font)
      .attr('font-size', 13)
      .attr('font-weight', 600)
      .attr('letter-spacing', '0.04em')
      .text(spec.title)
  }

  const pieGen = pie<(typeof slices)[number]>()
    .value((slice) => slice.value)
    .sort(null)

  const arcGen = arc<(typeof slices)[number] & { startAngle: number; endAngle: number }>()
    .innerRadius(0)
    .outerRadius(radius)

  const g = svg.append('g').attr('transform', `translate(${width / 2},${height / 2 + (spec.title ? 8 : 0)})`)
  const color = scaleOrdinal<string>().domain(slices.map((slice) => slice.label)).range(fills)

  const arcs = g
    .selectAll('path')
    .data(pieGen(slices))
    .join('path')
    .attr('d', (datum) => arcGen(datum as never) ?? '')
    .attr('fill', (datum) => color(datum.data.label))
    .attr('stroke', 'transparent')

  void arcs

  if (slices.length <= 8) {
    const labelArc = arc<(typeof slices)[number] & { startAngle: number; endAngle: number }>()
      .innerRadius(radius * 0.62)
      .outerRadius(radius * 0.62)

    g.selectAll('text')
      .data(pieGen(slices))
      .join('text')
      .attr('transform', (datum) => `translate(${labelArc.centroid(datum as never)})`)
      .attr('text-anchor', 'middle')
      .attr('fill', colors.ink)
      .attr('font-family', colors.font)
      .attr('font-size', 11)
      .text((datum) => datum.data.label)
  }

  const node = svg.node()
  if (!node) throw new Error('Could not create chart SVG')
  return node.outerHTML
}

export function renderD3ChartSource(
  source: string,
  options?: RenderD3ChartOptions,
): D3ChartRenderResult {
  const parsed = parseD3ChartSpec(source)
  if (!parsed.ok) return parsed

  try {
    const svg = parsed.spec.type === 'pie' ? drawPie(parsed.spec, options) : drawCartesian(parsed.spec, options)
    return { ok: true, svg, spec: parsed.spec }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Could not render chart',
    }
  }
}
