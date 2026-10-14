/**
 * The simulation engine.
 *
 * One class, one `tick()`, one fixed order of operations. Everything that makes
 * the world move happens inside `tick()` and nothing outside it is allowed to
 * mutate world state — which is what makes `seed + tick count` sufficient to
 * reproduce a run exactly, in the browser or on the server.
 *
 * The tick order below is load-bearing. Environment runs first because the
 * thermal model depends on last tick's door positions; alerts run last because
 * they observe the settled state. Reordering these changes the simulation, so
 * the order is pinned by a determinism test rather than by convention.
 */

import { TICK_RATE, createWorld, type SiteRuntime, type WorldState } from './state.ts'
import { advanceClock, updateThermal, updateWeather } from './systems/environment.ts'
import { dispatchTrucks, updateDoors, updateTrucks } from './systems/traffic.ts'
import { generateWork, transferAtDocks, updateForklifts, updatePallets } from './systems/fleet.ts'
import { updateInventory, updateShipments } from './systems/flow.ts'
import { evaluateAlerts, updateMetrics } from './systems/alerts.ts'
import { buildSnapshot, buildStatic } from './snapshot.ts'
import type { ClientCommand, DomainEvent, WorldSnapshot, WorldStatic } from './types.ts'

export interface EngineOptions {
  seed: number
  /** Start paused. The server runs unpaused; the browser waits for the UI. */
  paused?: boolean
}

export class Engine {
  private world: WorldState
  private events: DomainEvent[] = []

  constructor(options: EngineOptions) {
    this.world = createWorld(options.seed)
    if (options.paused) this.world.paused = true
  }

  get tick(): number {
    return this.world.tick
  }

  get seed(): number {
    return this.world.seed
  }

  get paused(): boolean {
    return this.world.paused
  }

  get speed(): number {
    return this.world.speed
  }

  get activeSiteId(): string {
    return this.world.activeSiteId
  }

  /** Direct access for tests and the server. Treat as read-only. */
  get state(): WorldState {
    return this.world
  }

  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Advance one fixed timestep. Ticking is unconditional — pausing is a decision
   * for whoever drives the engine, not for the engine, so that a paused client
   * and a running server can't disagree about what tick 5000 looks like.
   */
  step(): void {
    const world = this.world
    world.tick += 1

    advanceClock(world)

    for (const site of world.sites) {
      this.stepSite(site, world)
    }

    // Drain events raised by the systems into the engine's outbox.
    if (world.pendingEvents.length > 0) {
      for (const ev of world.pendingEvents) this.events.push(ev)
      world.pendingEvents.length = 0
    }
  }

  private stepSite(site: SiteRuntime, world: WorldState): void {
    // ── Environment: ambient conditions and the thermal envelope ──
    updateWeather(site, world)
    updateDoors(site)
    updateThermal(site, world)

    // ── Flow: what the site is being asked to do ──
    updateInventory(site, world)
    updateShipments(site, world)

    // ── Traffic: vehicles on the yard and at the dock ──
    dispatchTrucks(site, world)
    updateTrucks(site, world)
    transferAtDocks(site, world)

    // ── Floor: work generation and execution ──
    generateWork(site, world)
    updateForklifts(site, world)
    updatePallets(site, world)

    // ── Observation: derived state only, no mutation of the above ──
    updateMetrics(site, world)
    evaluateAlerts(site, world)
  }

  /** Run `n` ticks. Used by the drivers and by the perf tests. */
  run(n: number): void {
    for (let i = 0; i < n; i++) this.step()
  }

  // ───────────────────────────────────────────────────────────────────────────

  snapshot(): WorldSnapshot {
    return buildSnapshot(this.world)
  }

  staticData(): WorldStatic {
    return buildStatic(this.world)
  }

  /** Drain domain events raised since the last call. */
  drainEvents(): DomainEvent[] {
    if (this.events.length === 0) return []
    const out = this.events
    this.events = []
    return out
  }

  // ───────────────────────────────────────────────────────────────────────────

  apply(command: ClientCommand): void {
    const world = this.world
    switch (command.type) {
      case 'setPaused':
        world.paused = command.paused
        break

      case 'setSpeed':
        world.speed = command.speed
        break

      case 'setActiveSite':
        if (world.sites.some((s) => s.def.id === command.siteId)) {
          world.activeSiteId = command.siteId
        }
        break

      case 'acknowledgeAlert': {
        const alert = world.alerts.find((a) => a.id === command.alertId)
        if (alert) alert.acknowledged = true
        break
      }

      case 'reset': {
        const paused = world.paused
        const speed = world.speed
        const activeSiteId = world.activeSiteId
        this.world = createWorld(command.seed)
        this.world.paused = paused
        this.world.speed = speed
        this.world.activeSiteId = activeSiteId
        this.events.push({ type: 'reset', tick: 0, seed: command.seed })
        break
      }

      case 'injectEvent':
        this.inject(command.kind, command.siteId)
        break
    }
  }

  /**
   * Force a photogenic incident. Demo mode uses this so a recording doesn't have
   * to wait for the simulation to misbehave on its own — the mechanism is real,
   * only the timing is forced.
   */
  private inject(kind: 'excursion' | 'lateTruck' | 'stockout' | 'rush', siteId: string): void {
    const site = this.world.sites.find((s) => s.def.id === siteId)
    if (!site) return

    switch (kind) {
      case 'excursion': {
        // Hold open every door serving the coldest zone on site.
        const coldest = site.zoneStates
          .slice()
          .sort((a, b) => a.setpointC - b.setpointC)[0]
        if (!coldest) return
        for (let i = 0; i < site.doors.length; i++) {
          const bay = site.layout.bays[i]
          const door = site.doors[i]
          if (!bay || !door) continue
          if (bay.zone !== coldest.zone) continue
          door.state = 'open'
          door.openness = 1
          door.openTicks = 600
        }
        // And push the zone most of the way out of band so it bites immediately.
        coldest.tempC = coldest.setpointC + 9
        break
      }

      case 'lateTruck': {
        const candidate = site.trucks.find((t) => t.phase !== 'gone')
        if (candidate) candidate.delayMin = 52
        break
      }

      case 'stockout': {
        // Empty the smallest live SKU line by condemning its racked pallets.
        const counts = new Map<string, number>()
        for (const p of site.pallets.values()) {
          if (p.state !== 'racked') continue
          counts.set(p.skuId, (counts.get(p.skuId) ?? 0) + 1)
        }
        let target = ''
        let fewest = Infinity
        for (const [skuId, n] of counts) {
          if (n > 0 && n < fewest) {
            fewest = n
            target = skuId
          }
        }
        if (target === '') return
        for (const p of [...site.pallets.values()]) {
          if (p.skuId !== target || p.state !== 'racked') continue
          if (p.slot >= 0) {
            site.slots[p.slot] = -1
            site.slotPallet[p.slot] = ''
            site.freeSlots[p.zone].push(p.slot)
          }
          site.pallets.delete(p.id)
        }
        break
      }

      case 'rush': {
        // Pull the next several arrivals forward so the yard fills up.
        site.nextArrivalMin = 0
        break
      }
    }
  }
}

export { TICK_RATE }
export type { WorldState }
