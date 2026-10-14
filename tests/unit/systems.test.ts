import { describe, expect, it } from 'vitest'
import { Engine } from '../../src/sim/engine.ts'
import { Rng, parseSeed } from '../../src/sim/rng.ts'
import { Navigator, pathLength } from '../../src/sim/path.ts'
import { buildSiteLayout, decodeSlot, slotAccessPoint, slotPosition, slotsForZone } from '../../src/sim/layout.ts'
import { SITE_DEFS, SKUS, ZONE_SPECS, zoneSpec } from '../../src/sim/catalogue.ts'
import { r0, r2, r3 } from '../../src/sim/num.ts'
import { MIN_PER_DAY, createWorld } from '../../src/sim/state.ts'
import { advanceClock, updateWeather } from '../../src/sim/systems/environment.ts'
import type { SiteDefinition } from '../../src/sim/catalogue.ts'
import type { SiteSnapshot, Truck, WorldSnapshot } from '../../src/sim/types.ts'

const kef = SITE_DEFS[0] as SiteDefinition

function activeSite(snapshot: WorldSnapshot): SiteSnapshot {
  return snapshot.sites.find((s) => s.id === snapshot.activeSiteId) as SiteSnapshot
}

// ─────────────────────────────────────────────────────────────────────────────

describe('Rng', () => {
  it('is reproducible from a seed', () => {
    const a = new Rng(99)
    const b = new Rng(99)
    const left = Array.from({ length: 200 }, () => a.next())
    const right = Array.from({ length: 200 }, () => b.next())
    expect(left).toEqual(right)
  })

  it('decorrelates adjacent low-entropy seeds', () => {
    // Without the discard in the constructor, seeds 0,1,2 produce visibly
    // related first outputs, which shows up as three sites sharing a layout.
    const firsts = [0, 1, 2, 3].map((seed) => new Rng(seed).float())
    const spread = Math.max(...firsts) - Math.min(...firsts)
    expect(spread).toBeGreaterThan(0.1)
  })

  it('produces floats inside [0, 1)', () => {
    const rng = new Rng(7)
    for (let i = 0; i < 5000; i++) {
      const value = rng.float()
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })

  it('distributes uniformly enough for layout work', () => {
    const rng = new Rng(11)
    const buckets = new Array<number>(10).fill(0)
    const draws = 100_000
    for (let i = 0; i < draws; i++) buckets[Math.floor(rng.float() * 10)]! += 1
    for (const count of buckets) {
      expect(Math.abs(count - draws / 10) / (draws / 10)).toBeLessThan(0.05)
    }
  })

  it('respects integer bounds inclusively', () => {
    const rng = new Rng(5)
    const seen = new Set<number>()
    for (let i = 0; i < 2000; i++) seen.add(rng.int(3, 6))
    expect([...seen].sort()).toEqual([3, 4, 5, 6])
  })

  it('weights choices', () => {
    const rng = new Rng(13)
    let heavy = 0
    for (let i = 0; i < 10_000; i++) {
      if (rng.weighted(['a', 'b'], [9, 1]) === 'a') heavy++
    }
    expect(heavy / 10_000).toBeGreaterThan(0.85)
    expect(heavy / 10_000).toBeLessThan(0.95)
  })

  it('save and restore reproduces the stream', () => {
    const rng = new Rng(21)
    rng.next()
    const state = rng.getState()
    const expected = Array.from({ length: 50 }, () => rng.next())
    rng.setState(state)
    expect(Array.from({ length: 50 }, () => rng.next())).toEqual(expected)
  })

  it('forking does not disturb the parent stream beyond one draw', () => {
    const a = new Rng(31)
    const b = new Rng(31)
    a.fork('trucks')
    b.next() // fork consumes exactly one value from the parent
    expect(a.next()).toBe(b.next())
  })

  it('parseSeed accepts digits and text alike', () => {
    expect(parseSeed('4242')).toBe(4242)
    expect(parseSeed(' 77 ')).toBe(77)
    expect(parseSeed('keflavik')).toBe(parseSeed('keflavik'))
    expect(parseSeed('keflavik')).not.toBe(parseSeed('trondheim'))
    expect(Number.isInteger(parseSeed('anything'))).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('numeric helpers', () => {
  it('normalise negative zero', () => {
    expect(Object.is(r0(-0.4), -0)).toBe(false)
    expect(Object.is(r2(-0.001), -0)).toBe(false)
    expect(Object.is(r3(-0.0001), -0)).toBe(false)
    expect(r0(-0.4)).toBe(0)
  })

  it('round to the stated precision', () => {
    expect(r2(1.005)).toBeCloseTo(1.0, 5)
    expect(r3(1.23456)).toBe(1.235)
    expect(r0(2.5)).toBe(3)
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('site layout', () => {
  it('is deterministic for a seed', () => {
    const a = buildSiteLayout(kef, 7)
    const b = buildSiteLayout(kef, 7)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('differs between seeds in its landscaping but not its structure', () => {
    const a = buildSiteLayout(kef, 1)
    const b = buildSiteLayout(kef, 2)
    expect(a.building).toEqual(b.building)
    expect(a.bays).toEqual(b.bays)
    expect(JSON.stringify(a.props)).not.toBe(JSON.stringify(b.props))
  })

  it('gives every site the door count its definition asks for', () => {
    for (const def of SITE_DEFS) {
      const layout = buildSiteLayout(def, 3)
      expect(layout.bays).toHaveLength(def.doorCount)
    }
  })

  it('spaces and centres the dock doors', () => {
    const layout = buildSiteLayout(kef, 3)
    const xs = layout.bays.map((b) => b.position.x)
    for (let i = 1; i < xs.length; i++) {
      expect((xs[i] as number) - (xs[i - 1] as number)).toBeCloseTo(7.5, 5)
    }
    const leftMargin = xs[0] as number
    const rightMargin = layout.building.width - (xs[xs.length - 1] as number)
    expect(leftMargin).toBeCloseTo(rightMargin, 5)
  })

  it('keeps every rack slot inside the building', () => {
    const layout = buildSiteLayout(kef, 3)
    expect(layout.slotCount).toBeGreaterThan(200)
    for (let i = 0; i < layout.slotCount; i += 17) {
      const p = slotPosition(layout, i)
      expect(p.x).toBeGreaterThan(0)
      expect(p.x).toBeLessThan(layout.building.width)
      expect(p.z).toBeGreaterThan(0)
      expect(p.z).toBeLessThan(layout.building.depth)
      expect(p.y).toBeGreaterThanOrEqual(0)
    }
  })

  it('decodes every slot index exactly once', () => {
    const layout = buildSiteLayout(kef, 3)
    const seen = new Set<string>()
    for (let i = 0; i < layout.slotCount; i++) {
      const address = decodeSlot(layout, i)
      expect(address).not.toBeNull()
      const key = `${address?.rowIndex}:${address?.side}:${address?.col}:${address?.level}`
      expect(seen.has(key)).toBe(false)
      seen.add(key)
    }
    expect(seen.size).toBe(layout.slotCount)
  })

  it('partitions slots across zones with no overlap or loss', () => {
    const layout = buildSiteLayout(kef, 3)
    const all = new Set<number>()
    let total = 0
    for (const spec of ZONE_SPECS) {
      const slots = slotsForZone(layout, spec.zone)
      total += slots.length
      for (const slot of slots) {
        expect(all.has(slot)).toBe(false)
        all.add(slot)
      }
    }
    expect(total).toBe(layout.slotCount)
  })

  it('puts every slot access point on walkable floor', () => {
    const layout = buildSiteLayout(kef, 3)
    const nav = new Navigator(layout)
    for (let i = 0; i < layout.slotCount; i += 23) {
      const point = slotAccessPoint(layout, i)
      const cell = nav.toCell(point)
      expect(nav.isBlocked(cell.cx, cell.cz)).toBe(false)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('pathfinding', () => {
  const layout = buildSiteLayout(kef, 3)

  it('finds a route between opposite corners of the floor', () => {
    const nav = new Navigator(layout)
    const path = nav.findPath({ x: 4, z: 3 }, { x: layout.building.width - 4, z: layout.building.depth - 4 })
    expect(path.length).toBeGreaterThan(1)
    const end = path[path.length - 1]
    expect(end?.x).toBeCloseTo(layout.building.width - 4, 1)
  })

  it('routes around racking rather than through it', () => {
    const nav = new Navigator(layout)
    const row = layout.rackRows[1]
    expect(row).toBeDefined()
    // Straight across a rack row: the route must be longer than the chord.
    const from = { x: row!.origin.x + 10, z: row!.origin.z - 2 }
    const to = { x: row!.origin.x + 10, z: row!.origin.z + row!.depth + 2 }
    const path = nav.findPath(from, to)
    expect(path.length).toBeGreaterThan(0)
    expect(pathLength(path)).toBeGreaterThan(Math.hypot(to.x - from.x, to.z - from.z))

    // And no waypoint-to-waypoint leg may cut through a blocked cell.
    for (let i = 1; i < path.length; i++) {
      expect(nav.lineOfSight(path[i - 1]!, path[i]!)).toBe(true)
    }
  })

  it('smooths a staircase into a handful of waypoints', () => {
    const nav = new Navigator(layout)
    const path = nav.findPath({ x: 4, z: 3 }, { x: layout.building.width - 4, z: 3 })
    // A straight clear run should need essentially no intermediate turns.
    expect(path.length).toBeLessThan(6)
  })

  it('reaches a rack slot from the aisle', () => {
    const nav = new Navigator(layout)
    const target = slotAccessPoint(layout, Math.floor(layout.slotCount / 2))
    const path = nav.findPath({ x: 6, z: 3 }, target)
    expect(path.length).toBeGreaterThan(0)
  })

  it('caches repeat routes', () => {
    const nav = new Navigator(layout)
    const from = { x: 5, z: 3 }
    const to = { x: layout.building.width - 6, z: layout.building.depth - 6 }
    nav.findPath(from, to)
    const sizeAfterFirst = nav.cacheSize
    nav.findPath(from, to)
    expect(nav.cacheSize).toBe(sizeAfterFirst)
    expect(sizeAfterFirst).toBeGreaterThan(0)
  })

  it('stays inside its time budget under repeated queries', () => {
    const nav = new Navigator(layout)
    const started = performance.now()
    for (let i = 0; i < 400; i++) {
      // Vary the goal so the cache is exercised but not trivially hit every time.
      nav.findPath({ x: 5 + (i % 30), z: 3 }, slotAccessPoint(layout, (i * 37) % layout.slotCount))
    }
    const perQuery = (performance.now() - started) / 400
    expect(perQuery).toBeLessThan(3)
  })

  it('returns an empty path when the goal is unreachable', () => {
    // A layout whose grid is entirely blocked except the start.
    const sealed = structuredClone(layout)
    sealed.grid.blocked = sealed.grid.blocked.map(() => 1)
    sealed.grid.blocked[0] = 0
    const nav = new Navigator(sealed)
    const path = nav.findPath({ x: 0.5, z: 0.5 }, { x: 40, z: 40 })
    expect(path).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('thermal model', () => {
  it('gives colder zones tighter budgets', () => {
    const ultra = zoneSpec('ULTRA')
    const chill = zoneSpec('CHILL')
    const ambient = zoneSpec('AMBIENT')
    expect(ultra.budgetMin).toBeLessThan(chill.budgetMin)
    expect(chill.budgetMin).toBeLessThan(ambient.budgetMin)
  })

  it('places every setpoint inside its own band', () => {
    for (const spec of ZONE_SPECS) {
      expect(spec.setpointC).toBeGreaterThanOrEqual(spec.minC)
      expect(spec.setpointC).toBeLessThanOrEqual(spec.maxC)
    }
  })

  it('holds every zone in band over a quiet day', () => {
    const engine = new Engine({ seed: 4242 })
    engine.run(20_000)
    for (const site of engine.snapshot().sites) {
      for (const zone of site.zoneStates) {
        expect(zone.integrity).toBeGreaterThan(0.5)
      }
    }
  })

  it('breaks the chain when doors are forced open, and recovers afterwards', () => {
    const engine = new Engine({ seed: 4242 })
    engine.run(6000)
    const siteId = engine.activeSiteId

    const coldestBefore = coldestZone(engine.snapshot(), siteId)
    expect(coldestBefore.inBand).toBe(true)

    engine.apply({ type: 'injectEvent', kind: 'excursion', siteId })
    engine.run(400)

    const during = coldestZone(engine.snapshot(), siteId)
    expect(during.inBand).toBe(false)
    expect(during.tempC).toBeGreaterThan(during.setpointC)

    // Once the doors close the plant must pull it back.
    engine.run(14_000)
    const after = coldestZone(engine.snapshot(), siteId)
    expect(after.tempC).toBeLessThan(during.tempC)
  })

  it('raises an alert when a zone leaves its band', () => {
    const engine = new Engine({ seed: 4242 })
    engine.run(6000)
    const siteId = engine.activeSiteId
    engine.apply({ type: 'injectEvent', kind: 'excursion', siteId })
    engine.run(600)

    const alerts = engine.snapshot().alerts.filter((a) => a.siteId === siteId)
    expect(alerts.some((a) => a.kind === 'excursion' || a.kind === 'thermalWarn')).toBe(true)
  })
})

function coldestZone(snapshot: WorldSnapshot, siteId: string) {
  const site = snapshot.sites.find((s) => s.id === siteId) as SiteSnapshot
  return site.zoneStates.slice().sort((a, b) => a.setpointC - b.setpointC)[0]!
}

// ─────────────────────────────────────────────────────────────────────────────

describe('traffic', () => {
  it('moves trucks through the full lifecycle', () => {
    const engine = new Engine({ seed: 4242 })
    const seen = new Set<string>()
    for (let i = 0; i < 20_000; i++) {
      engine.step()
      if (i % 20 !== 0) continue
      for (const site of engine.state.sites) {
        for (const truck of site.trucks) seen.add(truck.phase)
      }
    }
    for (const phase of ['inbound', 'approach', 'reversing', 'docked', 'departing']) {
      expect(seen.has(phase), `never observed phase ${phase}`).toBe(true)
    }
  })

  it('never double-books a bay', () => {
    const engine = new Engine({ seed: 777 })
    for (let i = 0; i < 20_000; i++) {
      engine.step()
      if (i % 50 !== 0) continue
      for (const site of engine.state.sites) {
        const claims = new Map<string, number>()
        for (const truck of site.trucks) {
          if (truck.bayId === '') continue
          if (truck.phase !== 'approach' && truck.phase !== 'reversing' && truck.phase !== 'docked') continue
          claims.set(truck.bayId, (claims.get(truck.bayId) ?? 0) + 1)
        }
        for (const [bayId, count] of claims) {
          expect(count, `bay ${bayId} claimed ${count} times at tick ${engine.tick}`).toBe(1)
        }
      }
    }
  })

  it('lands a docked trailer against its bay', () => {
    const engine = new Engine({ seed: 4242 })
    let checked = 0
    for (let i = 0; i < 12_000 && checked < 6; i++) {
      engine.step()
      for (const site of engine.state.sites) {
        for (const truck of site.trucks) {
          if (truck.phase !== 'docked') continue
          const bay = site.layout.bays.find((b) => b.id === truck.bayId)
          if (!bay) continue
          // The tractor sits a trailer-length out from the dock point, square on.
          expect(Math.abs(truck.x - bay.position.x)).toBeLessThan(1.2)
          expect(truck.z).toBeLessThan(bay.dockPoint.z)
          expect(Math.abs(truck.articulation)).toBeLessThan(0.05)
          checked++
        }
      }
    }
    expect(checked).toBeGreaterThan(0)
  })

  it('opens the door only while a truck is docked there', () => {
    const engine = new Engine({ seed: 31 })
    for (let i = 0; i < 9000; i++) {
      engine.step()
      if (i % 101 !== 0) continue
      const site = engine.state.sites[0]!
      for (const door of site.doors) {
        if (door.openness < 0.99) continue
        const occupant = site.trucks.find((t: Truck) => t.bayId === door.bayId)
        // A fully open door should have a truck docked or just departing.
        expect(occupant === undefined || occupant.phase === 'docked' || occupant.phase === 'departing').toBe(true)
      }
    }
  })

  it('keeps trucks on the site they were dispatched to', () => {
    const engine = new Engine({ seed: 8 })
    engine.run(8000)
    for (const site of engine.state.sites) {
      for (const truck of site.trucks) expect(truck.siteId).toBe(site.def.id)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('floor operations', () => {
  it('stores and picks pallets over a run', () => {
    const engine = new Engine({ seed: 4242 })
    let stored = 0
    let picked = 0
    for (let i = 0; i < 20_000; i++) {
      engine.step()
      for (const event of engine.drainEvents()) {
        if (event.type === 'palletStored') stored++
        if (event.type === 'palletPicked') picked++
      }
    }
    expect(stored).toBeGreaterThan(10)
    expect(picked).toBeGreaterThan(10)
  })

  it('never leaves two pallets in one slot', () => {
    const engine = new Engine({ seed: 4242 })
    for (let i = 0; i < 16_000; i++) {
      engine.step()
      if (i % 200 !== 0) continue
      for (const site of engine.state.sites) {
        const occupied = new Map<number, string>()
        for (const pallet of site.pallets.values()) {
          if (pallet.state !== 'racked') continue
          const existing = occupied.get(pallet.slot)
          expect(existing, `slot ${pallet.slot} holds ${existing} and ${pallet.id}`).toBeUndefined()
          occupied.set(pallet.slot, pallet.id)
        }
      }
    }
  })

  it('keeps the free-slot stack consistent with occupancy', () => {
    const engine = new Engine({ seed: 55 })
    engine.run(14_000)
    for (const site of engine.state.sites) {
      const free = site.freeSlots.AMBIENT.length + site.freeSlots.CHILL.length +
        site.freeSlots.FROZEN.length + site.freeSlots.ULTRA.length
      let racked = 0
      for (const pallet of site.pallets.values()) if (pallet.state === 'racked') racked++
      // Slots in flight (reserved for a task) account for any remainder.
      expect(free + racked).toBeLessThanOrEqual(site.layout.slotCount)
      expect(free + racked).toBeGreaterThan(site.layout.slotCount - 60)
    }
  })

  it('bounds the work queue structurally, not by tuning', () => {
    const engine = new Engine({ seed: 4242 })
    engine.run(26_000)
    for (const site of engine.state.sites) {
      // The dock applies back-pressure at three unassigned put-aways per
      // forklift, so this bound holds whatever the arrival rate is tuned to.
      // An unbounded queue is the signature of the throughput bug this
      // simulation had during construction.
      const waiting = site.tasks.filter((t) => t.kind === 'putaway' && t.assignedTo === '').length
      expect(waiting, `${site.def.id} unassigned put-aways`).toBeLessThanOrEqual(site.forklifts.length * 3)
      expect(site.tasks.length, `${site.def.id} total queue`).toBeLessThan(site.forklifts.length * 6 + 12)
    }
  })

  it('keeps staged stock from piling up on the apron', () => {
    const engine = new Engine({ seed: 4242 })
    engine.run(26_000)
    for (const site of engine.state.sites) {
      let staged = 0
      for (const pallet of site.pallets.values()) if (pallet.state === 'staged') staged++
      // Apron stock is stock burning thermal budget; it must clear, not accumulate.
      expect(staged, `${site.def.id} staged`).toBeLessThan(site.forklifts.length * 6)
    }
  })

  it('carries a pallet with the forklift holding it', () => {
    const engine = new Engine({ seed: 4242 })
    let checked = 0
    for (let i = 0; i < 12_000 && checked < 20; i++) {
      engine.step()
      for (const site of engine.state.sites) {
        for (const fl of site.forklifts) {
          if (fl.carryingPalletId === '') continue
          const pallet = site.pallets.get(fl.carryingPalletId)
          expect(pallet).toBeDefined()
          if (!pallet) continue
          expect(pallet.state).toBe('carried')
          expect(Math.hypot(pallet.x - fl.x, pallet.z - fl.z)).toBeLessThan(2.5)
          checked++
        }
      }
    }
    expect(checked).toBeGreaterThan(0)
  })

  it('recharges a forklift that runs its battery down', () => {
    const engine = new Engine({ seed: 4242 })
    let sawCharging = false
    for (let i = 0; i < 32_000 && !sawCharging; i++) {
      engine.step()
      for (const site of engine.state.sites) {
        if (site.forklifts.some((f) => f.state === 'charging')) sawCharging = true
      }
    }
    expect(sawCharging).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('inventory and shipments', () => {
  it('derives on-hand from pallets rather than a separate counter', () => {
    const engine = new Engine({ seed: 4242 })
    engine.run(9000)
    const site = engine.state.sites[0]!
    const snapshot = activeSite(engine.snapshot())

    for (const line of snapshot.inventory) {
      let units = 0
      for (const pallet of site.pallets.values()) {
        if (pallet.skuId !== line.skuId) continue
        if (pallet.state === 'condemned' || pallet.state === 'onTruck') continue
        units += pallet.units
      }
      expect(Math.abs(line.onHand - Math.round(units))).toBeLessThanOrEqual(1)
    }
  })

  it('classifies stock status against the SKU threshold', () => {
    const engine = new Engine({ seed: 4242 })
    engine.run(9000)
    for (const site of engine.snapshot().sites) {
      for (const line of site.inventory) {
        const sku = SKUS.find((s) => s.id === line.skuId)!
        if (line.onHand <= 0) expect(line.status).toBe('out')
        else if (line.onHand < line.target * sku.lowAt) expect(line.status).toBe('low')
        else expect(line.status).toBe('in')
      }
    }
  })

  it('sublimates dry ice over time', () => {
    const engine = new Engine({ seed: 4242 })
    const pallets = () =>
      [...engine.state.sites[0]!.pallets.values()].filter((p) => p.skuId === 'SKU-DRY-25' && p.state === 'racked')
    const before = pallets()
    if (before.length === 0) return // this seed stocked none; nothing to assert
    const id = before[0]!.id
    const unitsBefore = before[0]!.units
    engine.run(22_000)
    const after = engine.state.sites[0]!.pallets.get(id)
    if (after) expect(after.units).toBeLessThan(unitsBefore)
  })

  it('moves shipments forward through their stages in order', () => {
    const engine = new Engine({ seed: 4242 })
    const order = ['confirmed', 'picked', 'loading', 'inTransit', 'delivered']
    const lastStage = new Map<string, number>()

    for (let i = 0; i < 26_000; i++) {
      engine.step()
      for (const event of engine.drainEvents()) {
        if (event.type !== 'shipmentStage') continue
        if (event.stage === 'scrapped') {
          lastStage.delete(event.shipmentId)
          continue
        }
        const index = order.indexOf(event.stage)
        const previous = lastStage.get(event.shipmentId)
        if (previous !== undefined) {
          expect(index, `${event.shipmentId} went ${order[previous]} → ${event.stage}`).toBeGreaterThan(previous)
        }
        lastStage.set(event.shipmentId, index)
      }
    }
    expect(lastStage.size).toBeGreaterThan(0)
  })

  it('delivers shipments and records on-time against the promise', () => {
    const engine = new Engine({ seed: 4242 })
    let delivered = 0
    for (let i = 0; i < 38_000; i++) {
      engine.step()
      for (const event of engine.drainEvents()) {
        if (event.type === 'shipmentStage' && event.stage === 'delivered') delivered++
      }
    }
    expect(delivered).toBeGreaterThan(0)
    for (const site of engine.snapshot().sites) {
      expect(site.metrics.onTimePct).toBeGreaterThanOrEqual(0)
      expect(site.metrics.onTimePct).toBeLessThanOrEqual(100)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('alerts', () => {
  it('keeps one alert per condition rather than one per tick', () => {
    const engine = new Engine({ seed: 4242 })
    engine.run(6000)
    engine.apply({ type: 'injectEvent', kind: 'excursion', siteId: engine.activeSiteId })
    engine.run(1500)

    const alerts = engine.snapshot().alerts
    const ids = alerts.map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('clears an alert once its condition goes away', () => {
    const engine = new Engine({ seed: 4242 })
    engine.run(6000)
    const siteId = engine.activeSiteId

    engine.apply({ type: 'injectEvent', kind: 'excursion', siteId })
    engine.run(800)
    const during = engine.snapshot().alerts.filter((a) => a.siteId === siteId && a.id.includes('zone:'))
    expect(during.length, 'no zone alert raised by the injected excursion').toBeGreaterThan(0)

    // The injected fault lasts 180 clock-minutes (9,000 ticks). Well past that,
    // the plant has recovered and the alert must have cleared itself.
    engine.run(26_000)
    const after = engine.snapshot().alerts.filter((a) => a.siteId === siteId && a.id.includes('zone:'))
    expect(after.length, 'zone alert outlived its condition').toBe(0)
  })

  it('sustains an injected excursion long enough to be seen', () => {
    const engine = new Engine({ seed: 4242 })
    engine.run(6000)
    const siteId = engine.activeSiteId
    engine.apply({ type: 'injectEvent', kind: 'excursion', siteId })

    // A door held open alone recovers in a couple of simulated minutes. The
    // plant fault is what makes the incident last, which is what demo mode and
    // any realistic failure mode need.
    engine.run(4000)
    const zone = coldestZone(engine.snapshot(), siteId)
    expect(zone.inBand, 'excursion recovered too quickly to be visible').toBe(false)
    expect(zone.plantFaultMin).toBeGreaterThan(0)
  })

  it('gives every alert a focus target the UI can navigate to', () => {
    const engine = new Engine({ seed: 4242 })
    engine.run(6000)
    engine.apply({ type: 'injectEvent', kind: 'excursion', siteId: engine.activeSiteId })
    engine.apply({ type: 'injectEvent', kind: 'stockout', siteId: engine.activeSiteId })
    engine.run(1200)

    const valid = new Set(['site', 'bay', 'truck', 'forklift', 'pallet', 'shipment', 'sku'])
    for (const alert of engine.snapshot().alerts) {
      expect(valid.has(alert.focus.kind), `bad focus kind ${alert.focus.kind}`).toBe(true)
      expect(alert.focus.id.length).toBeGreaterThan(0)
      expect(alert.focus.siteId).toBe(alert.siteId)
      expect(alert.title.length).toBeGreaterThan(0)
      expect(alert.detail.length).toBeGreaterThan(0)
    }
  })

  it('raises a stockout when a line is emptied', () => {
    const engine = new Engine({ seed: 4242 })
    engine.run(6000)
    const siteId = engine.activeSiteId
    engine.apply({ type: 'injectEvent', kind: 'stockout', siteId })
    engine.run(400)
    const alerts = engine.snapshot().alerts.filter((a) => a.siteId === siteId)
    expect(alerts.some((a) => a.kind === 'stockout' || a.kind === 'lowStock')).toBe(true)
  })

  it('orders alerts by severity', () => {
    const engine = new Engine({ seed: 4242 })
    engine.run(6000)
    engine.apply({ type: 'injectEvent', kind: 'excursion', siteId: engine.activeSiteId })
    engine.apply({ type: 'injectEvent', kind: 'lateTruck', siteId: engine.activeSiteId })
    engine.run(900)

    const rank = { critical: 0, warn: 1, info: 2 }
    const severities = engine.snapshot().alerts.map((a) => rank[a.severity])
    for (let i = 1; i < severities.length; i++) {
      expect(severities[i]! >= severities[i - 1]!).toBe(true)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('metrics and clock', () => {
  it('keeps percentages inside their range', () => {
    const engine = new Engine({ seed: 4242 })
    engine.run(15_000)
    for (const site of engine.snapshot().sites) {
      const m = site.metrics
      for (const [name, value] of [
        ['capacity', m.capacityPct],
        ['onTime', m.onTimePct],
        ['integrity', m.chainIntegrityPct],
        ['forkliftUtil', m.forkliftUtilPct],
      ] as const) {
        expect(value, `${name} out of range`).toBeGreaterThanOrEqual(0)
        expect(value, `${name} out of range`).toBeLessThanOrEqual(100)
      }
      expect(m.baysOccupied).toBeLessThanOrEqual(m.baysTotal)
      expect(m.stockOnHand).toBeGreaterThanOrEqual(0)
    }
  })

  it('runs a full day: the date rolls over and daylight completes a cycle', () => {
    // Driven through `advanceClock` directly rather than the whole engine. A
    // simulated day is ~72,000 ticks; stepping every site system that many times
    // takes half a minute and tests nothing this assertion cares about.
    const world = createWorld(4242)
    const startDay = world.clock.day

    let minDaylight = 1
    let maxDaylight = 0
    let sawNight = false
    let sawDay = false

    for (let i = 0; i < 76_000; i++) {
      advanceClock(world)
      const clock = world.clock
      minDaylight = Math.min(minDaylight, clock.daylight)
      maxDaylight = Math.max(maxDaylight, clock.daylight)
      if (clock.isNight) sawNight = true
      else sawDay = true
      expect(clock.minuteOfDay).toBeGreaterThanOrEqual(0)
      expect(clock.minuteOfDay).toBeLessThan(MIN_PER_DAY)
      expect(clock.daylight).toBeGreaterThanOrEqual(0)
      expect(clock.daylight).toBeLessThanOrEqual(1)
    }

    expect(world.clock.day).toBeGreaterThan(startDay)
    expect(minDaylight).toBeLessThan(0.05)
    expect(maxDaylight).toBeGreaterThan(0.9)
    expect(sawNight).toBe(true)
    expect(sawDay).toBe(true)
  })

  it('gives these latitudes a short late-autumn day', () => {
    // Keflavík sits at 64°N. In late October that is around eight hours of
    // daylight — if this drifts far from that, the sun model is wrong and the
    // whole lighting rig is lying about the time of day.
    const world = createWorld(1)
    let lightTicks = 0
    const dayTicks = Math.round(MIN_PER_DAY / 0.02)
    for (let i = 0; i < dayTicks; i++) {
      advanceClock(world)
      if (world.clock.sunElevation > 0) lightTicks++
    }
    const daylightHours = (lightTicks / dayTicks) * 24
    expect(daylightHours).toBeGreaterThan(6)
    expect(daylightHours).toBeLessThan(11)
  })

  it('cycles weather and keeps every reading physically sensible', () => {
    const world = createWorld(4242)
    const site = world.sites[0]!
    const kinds = new Set<string>()

    for (let i = 0; i < 200_000; i++) {
      advanceClock(world)
      updateWeather(site, world)
      kinds.add(site.weather.kind)
      expect(site.weather.windKph).toBeGreaterThanOrEqual(0)
      expect(site.weather.visibility).toBeGreaterThan(0)
      expect(site.weather.visibility).toBeLessThanOrEqual(1)
      expect(Number.isFinite(site.weather.ambientC)).toBe(true)
    }

    expect(kinds.size).toBeGreaterThan(2)
    // Iceland in late autumn: mild and maritime, never continental extremes.
    expect(site.weather.ambientC).toBeGreaterThan(-25)
    expect(site.weather.ambientC).toBeLessThan(25)
  })
})
