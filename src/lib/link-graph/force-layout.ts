export type ForceNode = {
  id: string
  title: string
  orphan: boolean
  degree: number
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

/**
 * Lightweight force layout (Obsidian-like): charge + springs + centering.
 * Good enough for typical personal wiki graphs without pulling in d3-force.
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

  const nodes: ForceNode[] = seedNodes.map((node, index) => {
    const angle = (index / n) * Math.PI * 2 - Math.PI / 2
    const spread = Math.min(width, height) * (tight ? 0.18 : 0.28)
    return {
      ...node,
      x: node.x ?? cx + Math.cos(angle) * spread * (0.4 + Math.random() * 0.6),
      y: node.y ?? cy + Math.sin(angle) * spread * (0.4 + Math.random() * 0.6),
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
  const alphaDecay = 0.022
  const alphaMin = 0.0015
  const velocityDecay = 0.82
  const charge = tight ? -280 : -420
  const linkDistance = tight ? 72 : 110
  const linkStrength = tight ? 0.14 : 0.09
  const centerStrength = tight ? 0.05 : 0.035

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
          dx = (Math.random() - 0.5) * 0.1
          dy = (Math.random() - 0.5) * 0.1
          dist2 = dx * dx + dy * dy
        }
        const dist = Math.sqrt(dist2)
        const force = (charge * alpha) / dist2
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
      let dx = target.x - source.x
      let dy = target.y - source.y
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

    // Soft centering + mild bounds.
    for (const node of nodes) {
      if (node.fixed) {
        node.vx = 0
        node.vy = 0
        continue
      }
      node.vx += (cx - node.x) * centerStrength * alpha
      node.vy += (cy - node.y) * centerStrength * alpha
      node.vx *= velocityDecay
      node.vy *= velocityDecay
      node.x += node.vx
      node.y += node.vy

      const pad = 28
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
    get alpha() {
      return alpha
    },
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
