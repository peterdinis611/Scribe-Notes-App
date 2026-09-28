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

export const D3_CHART_TYPES = ['bar', 'line', 'area', 'pie', 'donut', 'hbar', 'scatter'] as const

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

export const D3_CHART_TEMPLATES: Record<
  D3ChartType,
  { labelKey: string; source: string }
> = {
  bar: {
    labelKey: 'd3Chart.types.bar',
    source: D3_CHART_DEFAULT_SOURCE,
  },
  line: {
    labelKey: 'd3Chart.types.line',
    source: `{
  "type": "line",
  "title": "Trend",
  "x": "month",
  "y": ["alpha", "beta"],
  "data": [
    { "month": "Jan", "alpha": 12, "beta": 8 },
    { "month": "Feb", "alpha": 18, "beta": 11 },
    { "month": "Mar", "alpha": 15, "beta": 14 }
  ]
}`,
  },
  area: {
    labelKey: 'd3Chart.types.area',
    source: `{
  "type": "area",
  "title": "Coverage",
  "x": "week",
  "y": "value",
  "data": [
    { "week": "W1", "value": 4 },
    { "week": "W2", "value": 9 },
    { "week": "W3", "value": 7 },
    { "week": "W4", "value": 12 }
  ]
}`,
  },
  pie: {
    labelKey: 'd3Chart.types.pie',
    source: `{
  "type": "pie",
  "title": "Share",
  "x": "name",
  "y": "value",
  "data": [
    { "name": "A", "value": 40 },
    { "name": "B", "value": 35 },
    { "name": "C", "value": 25 }
  ]
}`,
  },
  donut: {
    labelKey: 'd3Chart.types.donut',
    source: `{
  "type": "donut",
  "title": "Mix",
  "x": "name",
  "y": "value",
  "data": [
    { "name": "Core", "value": 50 },
    { "name": "Growth", "value": 30 },
    { "name": "Other", "value": 20 }
  ]
}`,
  },
  hbar: {
    labelKey: 'd3Chart.types.hbar',
    source: `{
  "type": "hbar",
  "title": "Ranking",
  "x": "name",
  "y": "value",
  "data": [
    { "name": "Alpha", "value": 42 },
    { "name": "Beta", "value": 31 },
    { "name": "Gamma", "value": 18 }
  ]
}`,
  },
  scatter: {
    labelKey: 'd3Chart.types.scatter',
    source: `{
  "type": "scatter",
  "title": "Correlation",
  "x": "x",
  "y": "y",
  "data": [
    { "x": 1, "y": 3 },
    { "x": 2, "y": 5 },
    { "x": 3, "y": 4 },
    { "x": 4, "y": 8 },
    { "x": 5, "y": 7 }
  ]
}`,
  },
}

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
    return {
      ok: false,
      error: 'Chart type must be bar, line, area, pie, donut, hbar, or scatter',
    }
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

export function stringifyD3ChartSpec(spec: D3ChartSpec): string {
  return `${JSON.stringify(spec, null, 2)}\n`
}

/** Convert a table matrix (first row = headers) into a chart spec. */
export function tableMatrixToChartSpec(
  matrix: string[][],
  type: D3ChartType = 'bar',
): { ok: true; spec: D3ChartSpec } | { ok: false; error: string } {
  if (matrix.length < 2) {
    return { ok: false, error: 'Table needs a header row and at least one data row' }
  }
  const headers = matrix[0]!.map((cell) => cell.trim()).filter(Boolean)
  if (headers.length < 2) {
    return { ok: false, error: 'Table needs at least two columns' }
  }
  const xField = headers[0]!
  const yFieldsList = headers.slice(1)
  const data: D3ChartDatum[] = []
  for (const row of matrix.slice(1)) {
    if (!row.some((cell) => cell.trim())) continue
    const datum: D3ChartDatum = {}
    datum[xField] = row[0]?.trim() || ''
    yFieldsList.forEach((field, index) => {
      const raw = row[index + 1]?.trim() ?? ''
      const num = asNumber(raw)
      datum[field] = num ?? raw
    })
    data.push(datum)
  }
  if (data.length === 0) {
    return { ok: false, error: 'Table has no data rows' }
  }
  const chartType =
    type === 'scatter'
      ? 'scatter'
      : type === 'pie' || type === 'donut'
        ? type
        : yFieldsList.length > 1 && (type === 'bar' || type === 'line' || type === 'area')
          ? type
          : type
  return {
    ok: true,
    spec: {
      type: chartType,
      title: undefined,
      x: xField,
      y: yFieldsList.length === 1 ? yFieldsList[0]! : yFieldsList,
      data,
    },
  }
}

/** Parse simple CSV / TSV / pipe tables from the builder textarea. */
export function parseChartDataGrid(
  text: string,
): { ok: true; matrix: string[][] } | { ok: false; error: string } {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  if (lines.length < 2) {
    return { ok: false, error: 'Need a header row and at least one data row' }
  }
  const delimiter = lines[0]!.includes('\t')
    ? '\t'
    : lines[0]!.includes('|')
      ? '|'
      : ','
  const matrix = lines.map((line) =>
    line.split(delimiter).map((cell) => cell.trim().replace(/^"|"$/g, '')),
  )
  return { ok: true, matrix }
}

export function chartSpecFromGrid(
  text: string,
  type: D3ChartType,
  title?: string,
): { ok: true; spec: D3ChartSpec; source: string } | { ok: false; error: string } {
  const grid = parseChartDataGrid(text)
  if (!grid.ok) return grid
  const parsed = tableMatrixToChartSpec(grid.matrix, type)
  if (!parsed.ok) return parsed
  const spec = {
    ...parsed.spec,
    title: title?.trim() || undefined,
  }
  return { ok: true, spec, source: stringifyD3ChartSpec(spec) }
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
  const isHbar = spec.type === 'hbar'
  const isScatter = spec.type === 'scatter'
  const showLegend = fields.length > 1 && !isScatter
  const width = clamp(spec.width ?? 640, 240, 1200)
  const height = clamp(spec.height ?? (isHbar ? 280 : 320), 160, 800)
  const margin = {
    top: (spec.title ? 40 : 20) + (showLegend ? 18 : 0),
    right: 20,
    bottom: isScatter ? 48 : 44,
    left: isHbar ? 88 : 48,
  }
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

  if (showLegend) {
    const legendY = spec.title ? 38 : 16
    let offsetX = margin.left
    fields.forEach((field, index) => {
      const gLegend = svg.append('g').attr('transform', `translate(${offsetX},${legendY})`)
      gLegend
        .append('rect')
        .attr('width', 10)
        .attr('height', 10)
        .attr('rx', 2)
        .attr('fill', fills[index]!)
      gLegend
        .append('text')
        .attr('x', 14)
        .attr('y', 9)
        .attr('fill', colors.muted)
        .attr('font-family', colors.font)
        .attr('font-size', 11)
        .text(field)
      offsetX += Math.min(140, 28 + field.length * 7)
    })
  }

  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)

  if (isScatter) {
    const xs = spec.data.map((row) => asNumber(row[xField]) ?? 0)
    const ys = spec.data.map((row) => asNumber(row[fields[0]!]) ?? 0)
    const xScale = scaleLinear()
      .domain([Math.min(0, ...(xs.length ? xs : [0])), Math.max(1, ...xs) * 1.08])
      .range([0, innerWidth])
      .nice()
    const yScale = scaleLinear()
      .domain([0, Math.max(1, ...ys) * 1.08])
      .range([innerHeight, 0])
      .nice()

    g.append('g')
      .attr('class', 'd3-chart__grid')
      .call(axisLeft(yScale).ticks(4).tickSize(-innerWidth).tickFormat(() => ''))
      .call((axis) => {
        axis.select('.domain').remove()
        axis.selectAll('line').attr('stroke', colors.grid).attr('stroke-width', 1)
      })
    g.append('g')
      .call(axisLeft(yScale).ticks(4).tickSize(0).tickPadding(8))
      .call((axis) => {
        axis.select('.domain').remove()
        axis.selectAll('text').attr('fill', colors.muted).attr('font-family', colors.font).attr('font-size', 11)
      })
    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(axisBottom(xScale).ticks(5).tickSize(0).tickPadding(10))
      .call((axis) => {
        axis.select('.domain').attr('stroke', colors.grid)
        axis.selectAll('text').attr('fill', colors.muted).attr('font-family', colors.font).attr('font-size', 11)
      })
    g.selectAll('circle.d3-chart__scatter')
      .data(spec.data)
      .join('circle')
      .attr('class', 'd3-chart__scatter')
      .attr('cx', (row) => xScale(asNumber(row[xField]) ?? 0))
      .attr('cy', (row) => yScale(asNumber(row[fields[0]!]) ?? 0))
      .attr('r', 4.5)
      .attr('fill', fills[0]!)
      .attr('opacity', 0.9)

    const node = svg.node()
    if (!node) throw new Error('Could not create chart SVG')
    return node.outerHTML
  }

  if (isHbar) {
    const yScale = scaleBand().domain(categories).range([0, innerHeight]).padding(0.28)
    const xScale = scaleLinear().domain([0, yMax * 1.08]).range([0, innerWidth]).nice()

    g.append('g')
      .attr('class', 'd3-chart__grid')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(axisBottom(xScale).ticks(4).tickSize(-innerHeight).tickFormat(() => ''))
      .call((axis) => {
        axis.select('.domain').remove()
        axis.selectAll('line').attr('stroke', colors.grid).attr('stroke-width', 1)
      })
    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(axisBottom(xScale).ticks(4).tickSize(0).tickPadding(8))
      .call((axis) => {
        axis.select('.domain').attr('stroke', colors.grid)
        axis.selectAll('text').attr('fill', colors.muted).attr('font-family', colors.font).attr('font-size', 11)
      })
    g.append('g')
      .call(axisLeft(yScale).tickSize(0).tickPadding(8))
      .call((axis) => {
        axis.select('.domain').remove()
        axis.selectAll('text').attr('fill', colors.muted).attr('font-family', colors.font).attr('font-size', 11)
      })
    g.selectAll('rect.d3-chart__hbar')
      .data(spec.data)
      .join('rect')
      .attr('class', 'd3-chart__hbar')
      .attr('y', (_, index) => yScale(categories[index]!) ?? 0)
      .attr('height', yScale.bandwidth())
      .attr('x', 0)
      .attr('width', (row) => xScale(asNumber(row[fields[0]!]) ?? 0))
      .attr('rx', 3)
      .attr('fill', fills[0]!)

    const node = svg.node()
    if (!node) throw new Error('Could not create chart SVG')
    return node.outerHTML
  }

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
    .attr('aria-label', spec.title || spec.type)

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
    .innerRadius(spec.type === 'donut' ? radius * 0.55 : 0)
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
    const svg =
      parsed.spec.type === 'pie' || parsed.spec.type === 'donut'
        ? drawPie(parsed.spec, options)
        : drawCartesian(parsed.spec, options)
    return { ok: true, svg, spec: parsed.spec }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Could not render chart',
    }
  }
}
