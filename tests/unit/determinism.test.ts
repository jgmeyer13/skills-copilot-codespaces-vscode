import { describe, expect, it } from 'vitest'
import { Engine } from '../../src/sim/engine.ts'
import { hashSnapshot } from '../../src/sim/snapshot.ts'

/**
 * Determinism is the load-bearing property of this simulation: it is what lets
 * the browser and the server run the same world, and what makes a seed a
 * shareable bug report. These tests run two engines in the same process on
 * purpose — that is how shared module state (the bug class this codebase had
 * twice during construction) gets caught.
 */

describe('determinism', () => {
  it('two engines with the same seed agree at every checkpoint', () => {
    const a = new Engine({ seed: 4242 })
    const b = new Engine({ seed: 4242 })

    for (let checkpoint = 0; checkpoint < 10; checkpoint++) {
      a.run(500)
      b.run(500)
      expect(hashSnapshot(a.snapshot()), `diverged at tick ${a.tick}`).toBe(hashSnapshot(b.snapshot()))
    }
    expect(a.tick).toBe(5000)
  })

  it('interleaved stepping does not change the outcome', () => {
    // Engine A runs in one burst; engine B alternates with a third engine that
    // shares its seed. If any module-level state leaked, B would drift.
    const a = new Engine({ seed: 99 })
    const b = new Engine({ seed: 99 })
    const noise = new Engine({ seed: 99 })

    a.run(2000)
    for (let i = 0; i < 2000; i++) {
      b.step()
      noise.step()
    }

    expect(hashSnapshot(b.snapshot())).toBe(hashSnapshot(a.snapshot()))
  })

  it('different seeds produce different worlds', () => {
    const a = new Engine({ seed: 1 })
    const b = new Engine({ seed: 2 })
    a.run(800)
    b.run(800)
    expect(hashSnapshot(a.snapshot())).not.toBe(hashSnapshot(b.snapshot()))
  })

  it('reset with a seed reproduces that seed exactly', () => {
    const a = new Engine({ seed: 7 })
    a.run(1200)
    const fresh = new Engine({ seed: 31337 })
    fresh.run(1200)

    a.apply({ type: 'reset', seed: 31337 })
    a.run(1200)

    expect(hashSnapshot(a.snapshot())).toBe(hashSnapshot(fresh.snapshot()))
  })

  it('a command log replays identically', () => {
    const commands: Array<[number, Parameters<Engine['apply']>[0]]> = [
      [120, { type: 'setActiveSite', siteId: 'TRD-03' }],
      [300, { type: 'injectEvent', kind: 'excursion', siteId: 'TRD-03' }],
      [900, { type: 'injectEvent', kind: 'rush', siteId: 'KEF-01' }],
      [1500, { type: 'injectEvent', kind: 'stockout', siteId: 'OSL-02' }],
    ]

    const run = (): string => {
      const e = new Engine({ seed: 2024 })
      for (let t = 0; t < 2500; t++) {
        for (const [at, cmd] of commands) if (at === t) e.apply(cmd)
        e.step()
      }
      return hashSnapshot(e.snapshot())
    }

    expect(run()).toBe(run())
  })
})

describe('snapshot wire format', () => {
  it('survives a JSON round trip unchanged', () => {
    const e = new Engine({ seed: 11 })
    e.run(1500)
    const snap = e.snapshot()
    const round = JSON.parse(JSON.stringify(snap))
    expect(round).toEqual(snap)
  })

  it('contains no undefined, NaN, Infinity or class instances', () => {
    const e = new Engine({ seed: 12 })
    e.run(1500)
    const problems: string[] = []

    const walk = (value: unknown, path: string, depth: number): void => {
      if (depth > 12) return
      if (value === undefined) {
        problems.push(`${path} is undefined`)
        return
      }
      if (typeof value === 'number') {
        if (Number.isNaN(value)) problems.push(`${path} is NaN`)
        if (!Number.isFinite(value)) problems.push(`${path} is not finite`)
        return
      }
      if (value === null || typeof value !== 'object') return
      if (Array.isArray(value)) {
        value.forEach((v, i) => walk(v, `${path}[${i}]`, depth + 1))
        return
      }
      const proto = Object.getPrototypeOf(value)
      if (proto !== Object.prototype && proto !== null) {
        problems.push(`${path} is a class instance (${proto?.constructor?.name})`)
        return
      }
      for (const [k, v] of Object.entries(value)) walk(v, `${path}.${k}`, depth + 1)
    }

    walk(e.snapshot(), 'snapshot', 0)
    expect(problems).toEqual([])
  })

  it('static layout data is also plain JSON', () => {
    const e = new Engine({ seed: 13 })
    const stat = e.staticData()
    expect(JSON.parse(JSON.stringify(stat))).toEqual(stat)
    expect(stat.layouts).toHaveLength(3)
    expect(stat.layouts[0]?.bays.length).toBeGreaterThan(0)
  })
})

describe('performance', () => {
  it('ticks fast enough to sustain 20x speed', () => {
    const e = new Engine({ seed: 5 })
    e.run(500) // warm up: let the yard fill and the caches populate

    const start = performance.now()
    e.run(2000)
    const elapsed = performance.now() - start
    const perTick = elapsed / 2000

    // 20x speed needs 400 ticks/second across all three sites, i.e. 2.5 ms/tick.
    // Assert comfortably inside that so CI noise doesn't make this flaky.
    expect(perTick).toBeLessThan(1.5)
  })
})
