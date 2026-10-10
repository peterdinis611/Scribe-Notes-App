/** Density helpers mirrored in `scribe_ui::graph`; force sim stays FE. */

export type ForceNodeKind = 'document' | 'tag' | 'entity'

export type ForceNode = {
  id: string
  title: string
  orphan: boolean
  degree: number
  /** CSS fill color (tag/folder tint). */
  color?: string
  /** Document wiki node vs synthetic tag/NLP entity overlay. */
  kind?: ForceNodeKind
  x: number
  y: number
  vx: number
  vy: number
  /** Pinned while user drags (Obsidian-style). */
  fixed?: boolean
}

export type ForceEdge = {
  sourceId: string
  targetId: string
}

type SimulationOptions = {
  width: number
  height: number
  /** Stronger pull for “local / around” graphs. */
  tight?: boolean
}

export type GraphDensity = {
  /** Many edgeless / orphan nodes — prefer lattice + sparse labels. */
  sparse: boolean
  orphanRatio: number
  edgeRatio: number
}

export function analyzeGraphDensity(
  seedCount: number,
  edgeCount: number,
  orphanCount: number,
): GraphDensity {
  const n = Math.max(seedCount, 1)
  const orphanRatio = orphanCount / n
  const edgeRatio = edgeCount / n
  const sparse = n >= 12 && (orphanRatio >= 0.45 || edgeRatio < 0.2)
  return { sparse, orphanRatio, edgeRatio }
}

/** Even lattice so orphans don’t start piled on one ring. */
function latticePosition(
  index: number,
  count: number,
  cx: number,
  cy: number,
  width: number,
  height: number,
): { x: number; y: number } {
  const cols = Math.max(2, Math.ceil(Math.sqrt(count * 1.15)))
  const rows = Math.max(1, Math.ceil(count / cols))
  const col = index % cols
  const row = Math.floor(index / cols)
  const padX = Math.min(width, height) * 0.08
  const padY = Math.min(width, height) * 0.08
  const usableW = Math.max(width - padX * 2, 80)
  const usableH = Math.max(height - padY * 2, 80)
  const cellW = usableW / Math.max(cols - 1, 1)
  const cellH = usableH / Math.max(rows - 1, 1)
  // Hex-ish stagger odd rows for better label clearance.
  const stagger = row % 2 === 1 ? cellW * 0.35 : 0
  const x =
    cols === 1
      ? cx
      : padX + col * cellW + stagger
  const y = rows === 1 ? cy : padY + row * cellH
  // Slight deterministic jitter (stable across runs).
  const jitter = ((index * 37) % 11) - 5
  return { x: x + jitter * 0.4, y: y + jitter * 0.35 }
}

/**
 * Lightweight force layout (Obsidian-like): charge + springs + centering.
 * Orphan-heavy / sparse graphs use a lattice seed + stronger repulsion so
 * labels don’t pile into one blob.
 */
export function createForceSimulation(
  seedNodes: Array<Omit<ForceNode, 'vx' | 'vy' | 'x' | 'y'> & { x?: number; y?: number }>,
  edges: ForceEdge[],
  options: SimulationOptions,
) {
  const { width, height, tight = false } = options
  const cx = width / 2
  const cy = height / 2
  const n = Math.max(seedNodes.length, 1)
  // Few nodes need *more* room for labels — not a tighter pile.
  const small = n <= 14
  const orphanCount = seedNodes.filter((node) => node.orphan).length
  const density = analyzeGraphDensity(n, edges.length, orphanCount)
  const sparse = density.sparse && !tight

  const nodes: ForceNode[] = seedNodes.map((node, index) => {
    const ringAngle = (index / n) * Math.PI * 2 - Math.PI / 2
    const spread = Math.min(width, height) * (tight ? 0.22 : sparse ? 0.42 : small ? 0.4 : 0.32)
    const lattice = latticePosition(index, n, cx, cy, width, height)
    const ring = {
      x: cx + Math.cos(ringAngle) * spread * (0.7 + ((index * 17) % 10) / 25),
      y: cy + Math.sin(ringAngle) * spread * (0.7 + ((index * 13) % 10) / 25),
    }
    const seed = sparse ? lattice : ring
    return {
      ...node,
      x: node.x ?? seed.x,
      y: node.y ?? seed.y,
      vx: 0,
      vy: 0,
    }
  })

  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const links = edges
    .map((edge) => ({
      source: nodeById.get(edge.sourceId),
      target: nodeById.get(edge.targetId),
    }))
    .filter(
      (link): link is { source: ForceNode; target: ForceNode } =>
        Boolean(link.source && link.target),
    )

  let alpha = 1
  const alphaDecay = sparse ? 0.018 : 0.022
  const alphaMin = 0.0015
  const velocityDecay = sparse ? 0.78 : 0.82
  // Sparse/orphan maps need much stronger repulsion + weaker centering.
  const charge = tight
    ? -320
    : sparse
      ? -Math.min(1400, 520 + n * 18)
      : small
        ? -Math.min(1100, 560 + n * 28)
        : -480
  const linkDistance = tight ? 88 : sparse ? 140 : small ? 175 : 125
  const linkStrength = tight ? 0.12 : sparse ? 0.05 : small ? 0.06 : 0.085
  const centerStrength = tight ? 0.04 : sparse ? 0.008 : small ? 0.012 : 0.028
  // Soft collision radius — larger when labels are always visible (small maps).
  const minSep = sparse
    ? Math.max(56, Math.min(110, 48 + Math.sqrt(n) * 6))
    : small
      ? Math.max(88, 100 - n * 1.2)
      : 48

  function step(): boolean {
    if (alpha < alphaMin) return false
    alpha += (alphaMin - alpha) * alphaDecay

    // Repulsion (O(n²) — fine for personal note graphs).
    for (let i = 0; i < nodes.length; i += 1) {
      const a = nodes[i]!
      for (let j = i + 1; j < nodes.length; j += 1) {
        const b = nodes[j]!
        let dx = b.x - a.x
        let dy = b.y - a.y
        let dist2 = dx * dx + dy * dy
        if (dist2 < 0.01) {
          dx = (((i + 1) * 12.9898) % 1) - 0.5 || 0.1
          dy = (((j + 1) * 78.233) % 1) - 0.5 || 0.1
          dist2 = dx * dx + dy * dy
        }
        const dist = Math.sqrt(dist2)
        let force = (charge * alpha) / dist2
        // Extra push when closer than label-aware separation.
        if (dist < minSep) {
          force -= ((minSep - dist) / minSep) * 28 * alpha
        }
        const fx = (dx / dist) * force
        const fy = (dy / dist) * force
        if (!a.fixed) {
          a.vx += fx
          a.vy += fy
        }
        if (!b.fixed) {
          b.vx -= fx
          b.vy -= fy
        }
      }
    }

    // Springs along edges.
    for (const link of links) {
      const { source, target } = link
      const dx = target.x - source.x
      const dy = target.y - source.y
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 0.01)
      const delta = ((dist - linkDistance) / dist) * linkStrength * alpha
      const fx = dx * delta
      const fy = dy * delta
      if (!source.fixed) {
        source.vx += fx
        source.vy += fy
      }
      if (!target.fixed) {
        target.vx -= fx
        target.vy -= fy
      }
    }

    // Soft centering + mild bounds. Orphans get weaker centering so they fan out.
    for (const node of nodes) {
      if (node.fixed) {
        node.vx = 0
        node.vy = 0
        continue
      }
      const pull = node.orphan && sparse ? centerStrength * 0.35 : centerStrength
      node.vx += (cx - node.x) * pull * alpha
      node.vy += (cy - node.y) * pull * alpha
      node.vx *= velocityDecay
      node.vy *= velocityDecay
      node.x += node.vx
      node.y += node.vy

      const pad = sparse ? 64 : small ? 72 : 36
      node.x = Math.min(width - pad, Math.max(pad, node.x))
      node.y = Math.min(height - pad, Math.max(pad, node.y))
    }

    return alpha >= alphaMin
  }

  function reheat(amount = 0.35) {
    alpha = Math.min(1, Math.max(alpha, amount))
  }

  return {
    nodes,
    nodeById,
    step,
    reheat,
    density,
    get alpha() {
      return alpha
    },
  }
}

/** Final pairwise push so leftover overlaps from early cooling get cleared. */
export function separateOverlappingNodes(
  nodes: ForceNode[],
  minDistance: number,
  rounds = 8,
): void {
  const min2 = minDistance * minDistance
  for (let round = 0; round < rounds; round += 1) {
    let moved = false
    for (let i = 0; i < nodes.length; i += 1) {
      const a = nodes[i]!
      if (a.fixed) continue
      for (let j = i + 1; j < nodes.length; j += 1) {
        const b = nodes[j]!
        if (b.fixed) continue
        const dx = b.x - a.x
        const dy = b.y - a.y
        const dist2 = dx * dx + dy * dy
        if (dist2 >= min2 || dist2 < 1e-6) continue
        const dist = Math.sqrt(dist2)
        const push = (minDistance - dist) / 2
        const ux = dx / dist
        const uy = dy / dist
        a.x -= ux * push
        a.y -= uy * push
        b.x += ux * push
        b.y += uy * push
        moved = true
      }
    }
    if (!moved) break
  }
}

export function degreeById(edges: ForceEdge[]): Map<string, number> {
  const degrees = new Map<string, number>()
  for (const edge of edges) {
    degrees.set(edge.sourceId, (degrees.get(edge.sourceId) ?? 0) + 1)
    degrees.set(edge.targetId, (degrees.get(edge.targetId) ?? 0) + 1)
  }
  return degrees
}

export function suggestedLayoutSize(options: {
  isPage: boolean
  nodeCount: number
  sparse: boolean
}): number {
  const { isPage, nodeCount, sparse } = options
  if (!isPage) {
    if (sparse) return Math.min(560, 400 + nodeCount * 5)
    if (nodeCount <= 14) return Math.min(520, 400 + nodeCount * 8)
    return 360
  }
  if (sparse) {
    // Grow canvas with orphan count so lattice + fitView have room.
    return Math.min(1600, Math.max(1000, 720 + Math.sqrt(nodeCount) * 110))
  }
  // Small linked graphs: give force layout absolute room so fitView stays ≤100%.
  if (nodeCount <= 14) return Math.min(1200, 780 + nodeCount * 28)
  return 960
}

/** Default fit — never auto-zoom past ~100% (small clusters used to hit 400%). */
export const LINK_GRAPH_FIT = {
  padding: 0.32,
  maxZoom: 1.0,
  minZoom: 0.05,
} as const

export const LINK_GRAPH_FIT_PAGE = {
  padding: 0.28,
  maxZoom: 1.0,
  minZoom: 0.05,
} as const
