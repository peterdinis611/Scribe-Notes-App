import { describe, expect, it } from 'vitest'
import {
  analyzeGraphDensity,
  createForceSimulation,
  separateOverlappingNodes,
  suggestedLayoutSize,
} from '@/lib/link-graph/force-layout'

describe('force-layout sparse orphans', () => {
  it('marks orphan-heavy graphs as sparse', () => {
    const density = analyzeGraphDensity(35, 4, 30)
    expect(density.sparse).toBe(true)
    expect(density.orphanRatio).toBeGreaterThan(0.8)
  })

  it('keeps linked compact graphs non-sparse', () => {
    expect(analyzeGraphDensity(8, 12, 1).sparse).toBe(false)
  })

  it('spreads orphan seeds farther than a tight ring pile', () => {
    const seeds = Array.from({ length: 28 }, (_, index) => ({
      id: `n${index}`,
      title: index % 3 === 0 ? 'Bez názvu' : `Note ${index}`,
      orphan: true,
      degree: 0,
    }))
    const sim = createForceSimulation(seeds, [], { width: 1200, height: 1200, tight: false })
    let guard = 0
    while (sim.step() && guard < 700) guard += 1
    separateOverlappingNodes(sim.nodes, 70)

    let minDist = Infinity
    for (let i = 0; i < sim.nodes.length; i += 1) {
      for (let j = i + 1; j < sim.nodes.length; j += 1) {
        const a = sim.nodes[i]!
        const b = sim.nodes[j]!
        const dx = a.x - b.x
        const dy = a.y - b.y
        minDist = Math.min(minDist, Math.hypot(dx, dy))
      }
    }
    expect(minDist).toBeGreaterThan(48)
    expect(sim.density.sparse).toBe(true)
  })

  it('grows page canvas for sparse maps', () => {
    expect(suggestedLayoutSize({ isPage: true, nodeCount: 35, sparse: true })).toBeGreaterThan(1000)
    expect(suggestedLayoutSize({ isPage: false, nodeCount: 35, sparse: true })).toBeGreaterThan(360)
  })

  it('gives small linked graphs room so fit stays near 100%', () => {
    expect(suggestedLayoutSize({ isPage: true, nodeCount: 7, sparse: false })).toBeGreaterThan(900)
  })

  it('spreads small linked graphs farther apart than a label-width', () => {
    const seeds = Array.from({ length: 7 }, (_, index) => ({
      id: `n${index}`,
      title: `Note ${index}`,
      orphan: index > 3,
      degree: index <= 3 ? 2 : 0,
    }))
    const edges = [
      { sourceId: 'n0', targetId: 'n1' },
      { sourceId: 'n1', targetId: 'n2' },
      { sourceId: 'n2', targetId: 'n3' },
      { sourceId: 'n0', targetId: 'n3' },
    ]
    const sim = createForceSimulation(seeds, edges, { width: 1000, height: 1000, tight: false })
    let guard = 0
    while (sim.step() && guard < 600) guard += 1
    separateOverlappingNodes(sim.nodes, 96)

    let minDist = Infinity
    for (let i = 0; i < sim.nodes.length; i += 1) {
      for (let j = i + 1; j < sim.nodes.length; j += 1) {
        const a = sim.nodes[i]!
        const b = sim.nodes[j]!
        minDist = Math.min(minDist, Math.hypot(a.x - b.x, a.y - b.y))
      }
    }
    expect(minDist).toBeGreaterThan(80)
  })
})
