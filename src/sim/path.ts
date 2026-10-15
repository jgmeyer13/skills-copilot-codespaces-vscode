/**
 * Forklift pathfinding.
 *
 * A* over the site's 1 m nav grid with 8-way movement, then a string-pulling pass
 * that collapses the cell-by-cell route into the handful of waypoints a forklift
 * actually drives. Routes are cached by (start cell, goal cell) because at 20×
 * speed the engine ticks 400 times a second and the same shelf-to-dock runs
 * repeat constantly.
 */

import type { SiteLayout, Vec2 } from './types.ts'

const SQRT2 = Math.SQRT2

/** Max cells A* will expand before giving up. Guards against a sealed-off goal. */
const MAX_EXPANSIONS = 20000

// ─────────────────────────────────────────────────────────────────────────────
// Binary min-heap keyed on f-score
// ─────────────────────────────────────────────────────────────────────────────

class MinHeap {
  private nodes: number[] = []
  private costs: number[] = []

  get size(): number {
    return this.nodes.length
  }

  clear(): void {
    this.nodes.length = 0
    this.costs.length = 0
  }

  push(node: number, cost: number): void {
    this.nodes.push(node)
    this.costs.push(cost)
    let i = this.nodes.length - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      if ((this.costs[parent] as number) <= (this.costs[i] as number)) break
      this.swap(i, parent)
      i = parent
    }
  }

  pop(): number {
    const top = this.nodes[0] as number
    const lastNode = this.nodes.pop() as number
    const lastCost = this.costs.pop() as number
    if (this.nodes.length > 0) {
      this.nodes[0] = lastNode
      this.costs[0] = lastCost
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = l + 1
        let smallest = i
        if (l < this.nodes.length && (this.costs[l] as number) < (this.costs[smallest] as number)) smallest = l
        if (r < this.nodes.length && (this.costs[r] as number) < (this.costs[smallest] as number)) smallest = r
        if (smallest === i) break
        this.swap(i, smallest)
        i = smallest
      }
    }
    return top
  }

  private swap(a: number, b: number): void {
    const n = this.nodes[a] as number
    this.nodes[a] = this.nodes[b] as number
    this.nodes[b] = n
    const c = this.costs[a] as number
    this.costs[a] = this.costs[b] as number
    this.costs[b] = c
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Navigator — one per site, owns the scratch buffers and the route cache
// ─────────────────────────────────────────────────────────────────────────────

export class Navigator {
  readonly w: number
  readonly h: number
  readonly cell: number
  private readonly blocked: Uint8Array
  private readonly gScore: Float64Array
  private readonly fScore: Float64Array
  private readonly cameFrom: Int32Array
  private readonly visited: Uint32Array
  private readonly open = new MinHeap()
  /** Bumped per search so the scratch arrays don't need clearing. */
  private stamp = 0
  private readonly cache = new Map<number, Vec2[]>()
  private cacheOrder: number[] = []
  private readonly cacheLimit = 4096

  constructor(private readonly layout: SiteLayout) {
    const g = layout.grid
    this.w = g.w
    this.h = g.h
    this.cell = g.cell
    this.blocked = Uint8Array.from(g.blocked)
    const n = g.w * g.h
    this.gScore = new Float64Array(n)
    this.fScore = new Float64Array(n)
    this.cameFrom = new Int32Array(n)
    this.visited = new Uint32Array(n)
  }

  isBlocked(cx: number, cz: number): boolean {
    if (cx < 0 || cz < 0 || cx >= this.w || cz >= this.h) return true
    return this.blocked[cz * this.w + cx] === 1
  }

  toCell(p: Vec2): { cx: number; cz: number } {
    return {
      cx: clamp(Math.floor((p.x - this.layout.grid.originX) / this.cell), 0, this.w - 1),
      cz: clamp(Math.floor((p.z - this.layout.grid.originZ) / this.cell), 0, this.h - 1),
    }
  }

  toWorld(cx: number, cz: number): Vec2 {
    return {
      x: this.layout.grid.originX + (cx + 0.5) * this.cell,
      z: this.layout.grid.originZ + (cz + 0.5) * this.cell,
    }
  }

  /** Nearest walkable cell to `p`, searching outward in rings. Used when a goal
   *  lands inside racking (which is where pallets live, by definition). */
  nearestFree(p: Vec2): { cx: number; cz: number } {
    const { cx, cz } = this.toCell(p)
    if (!this.isBlocked(cx, cz)) return { cx, cz }
    for (let r = 1; r < 24; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue
          const nx = cx + dx
          const nz = cz + dz
          if (!this.isBlocked(nx, nz)) return { cx: nx, cz: nz }
        }
      }
    }
    return { cx, cz }
  }

  /**
   * Route between two world points. Returns smoothed waypoints ending at `to`,
   * or an empty array when no route exists.
   */
  findPath(from: Vec2, to: Vec2): Vec2[] {
    const a = this.nearestFree(from)
    const b = this.nearestFree(to)
    const startIdx = a.cz * this.w + a.cx
    const goalIdx = b.cz * this.w + b.cx

    if (startIdx === goalIdx) return [{ x: to.x, z: to.z }]

    const key = startIdx * (this.w * this.h) + goalIdx
    const hit = this.cache.get(key)
    if (hit) {
      // The cached route is cell-accurate; re-point the last leg at the true goal.
      const out = hit.map((p) => ({ x: p.x, z: p.z }))
      const last = out[out.length - 1]
      if (last) {
        last.x = to.x
        last.z = to.z
      }
      return out
    }

    const cells = this.search(startIdx, goalIdx)
    if (cells.length === 0) return []

    const smoothed = this.smooth(cells)
    this.remember(key, smoothed)

    const out = smoothed.map((p) => ({ x: p.x, z: p.z }))
    const last = out[out.length - 1]
    if (last) {
      last.x = to.x
      last.z = to.z
    }
    return out
  }

  private remember(key: number, path: Vec2[]): void {
    this.cache.set(key, path)
    this.cacheOrder.push(key)
    if (this.cacheOrder.length > this.cacheLimit) {
      // Drop the oldest quarter in one pass rather than one at a time.
      const drop = this.cacheOrder.splice(0, this.cacheLimit >> 2)
      for (const k of drop) this.cache.delete(k)
    }
  }

  private search(startIdx: number, goalIdx: number): number[] {
    const { w, h, blocked, gScore, fScore, cameFrom, visited, open } = this
    this.stamp++
    const stamp = this.stamp
    open.clear()

    const gx = goalIdx % w
    const gz = (goalIdx / w) | 0

    gScore[startIdx] = 0
    fScore[startIdx] = heuristic(startIdx % w, (startIdx / w) | 0, gx, gz)
    cameFrom[startIdx] = -1
    visited[startIdx] = stamp
    open.push(startIdx, fScore[startIdx] as number)

    let expansions = 0

    while (open.size > 0) {
      const current = open.pop()
      if (current === goalIdx) return reconstruct(cameFrom, current, w)
      if (++expansions > MAX_EXPANSIONS) return []

      const cx = current % w
      const cz = (current / w) | 0
      const gCur = gScore[current] as number

      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dz === 0) continue
          const nx = cx + dx
          const nz = cz + dz
          if (nx < 0 || nz < 0 || nx >= w || nz >= h) continue
          const nIdx = nz * w + nx
          if (blocked[nIdx] === 1) continue

          const diagonal = dx !== 0 && dz !== 0
          if (diagonal) {
            // No cutting corners through racking.
            if (blocked[cz * w + nx] === 1 || blocked[nz * w + cx] === 1) continue
          }

          const tentative = gCur + (diagonal ? SQRT2 : 1)
          if (visited[nIdx] === stamp && tentative >= (gScore[nIdx] as number)) continue

          visited[nIdx] = stamp
          gScore[nIdx] = tentative
          cameFrom[nIdx] = current
          fScore[nIdx] = tentative + heuristic(nx, nz, gx, gz)
          open.push(nIdx, fScore[nIdx] as number)
        }
      }
    }
    return []
  }

  /**
   * String-pulling: keep a waypoint only where the route can't see past it.
   * Turns a 40-cell staircase into three or four real turns.
   */
  private smooth(cells: number[]): Vec2[] {
    const pts: Vec2[] = cells.map((idx) => this.toWorld(idx % this.w, (idx / this.w) | 0))
    if (pts.length <= 2) return pts

    const out: Vec2[] = [pts[0] as Vec2]
    let anchor = 0
    for (let i = 2; i < pts.length; i++) {
      if (!this.lineOfSight(pts[anchor] as Vec2, pts[i] as Vec2)) {
        out.push(pts[i - 1] as Vec2)
        anchor = i - 1
      }
    }
    out.push(pts[pts.length - 1] as Vec2)
    return out
  }

  /** Supercover walk — samples at half-cell steps, which is enough at 1 m cells. */
  lineOfSight(a: Vec2, b: Vec2): boolean {
    const dx = b.x - a.x
    const dz = b.z - a.z
    const steps = Math.ceil(Math.hypot(dx, dz) / (this.cell * 0.5))
    if (steps === 0) return true
    for (let i = 1; i < steps; i++) {
      const t = i / steps
      const { cx, cz } = this.toCell({ x: a.x + dx * t, z: a.z + dz * t })
      if (this.isBlocked(cx, cz)) return false
    }
    return true
  }

  /** Diagnostics for the perf panel and the unit tests. */
  get cacheSize(): number {
    return this.cache.size
  }

  clearCache(): void {
    this.cache.clear()
    this.cacheOrder = []
  }
}

// ─────────────────────────────────────────────────────────────────────────────

/** Octile distance — admissible and tight for 8-way movement. */
function heuristic(ax: number, az: number, bx: number, bz: number): number {
  const dx = Math.abs(ax - bx)
  const dz = Math.abs(az - bz)
  return dx + dz + (SQRT2 - 2) * Math.min(dx, dz)
}

function reconstruct(cameFrom: Int32Array, goal: number, _w: number): number[] {
  const out: number[] = []
  let cur = goal
  let guard = 0
  while (cur !== -1 && guard++ < 100000) {
    out.push(cur)
    cur = cameFrom[cur] as number
  }
  out.reverse()
  return out
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

/** Total length of a waypoint list, metres. */
export function pathLength(path: readonly Vec2[]): number {
  let total = 0
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1] as Vec2
    const b = path[i] as Vec2
    total += Math.hypot(b.x - a.x, b.z - a.z)
  }
  return total
}
