/**
 * Alert rules and KPI aggregation.
 *
 * Every alert carries a `focus` reference, which is what lets the dashboard fly
 * the camera to the problem. An alert the operator can't navigate to is just a
 * log line, and the point of this product is that the 3D scene and the alert list
 * are two views of the same fact.
 *
 * Alerts are keyed by a stable id derived from the rule and its subject, so a
 * condition that persists for a thousand ticks produces one alert, not a thousand.
 */

import { MIN_PER_DAY, type SiteRuntime, type WorldState } from '../state.ts'
import { SKU_BY_ID, THERMAL_CRITICAL, THERMAL_WARN, zoneSpec } from '../catalogue.ts'
import type { Alert, AlertKind, AlertSeverity, EntityRef, Pallet, SiteMetrics, SiteStatus, Sku } from '../types.ts'
import { absoluteMinutes } from './traffic.ts'
import { clampNum, formatClock } from './environment.ts'
import { inventoryLines } from './flow.ts'

/** A forklift idle longer than this with work outstanding is a problem. */
const IDLE_TICKS_BEFORE_ALERT = 900 // 45 clock-minutes
/** A dock door open this long is bleeding refrigeration. */
const DOOR_OPEN_TICKS_BEFORE_ALERT = 700 // 35 clock-minutes
/** Minutes past schedule before a truck counts as late. */
const LATE_THRESHOLD_MIN = 18

interface AlertDraft {
  key: string
  kind: AlertKind
  severity: AlertSeverity
  title: string
  detail: string
  focus: EntityRef
}

export function evaluateAlerts(site: SiteRuntime, world: WorldState): void {
  const drafts: AlertDraft[] = []
  const nowMin = absoluteMinutes(world)
  const siteId = site.def.id

  // ── Thermal: the headline rule ────────────────────────────────────────────
  // Grouped by SKU. Three pallets of the same product cooking on the apron is
  // one incident for the operator, not three rows to dismiss separately.
  const thermalBySku = new Map<string, { count: number; worst: Pallet }>()
  for (const pallet of site.pallets.values()) {
    if (pallet.state === 'racked' || pallet.state === 'condemned') continue
    if (pallet.thermal > THERMAL_WARN) continue
    const group = thermalBySku.get(pallet.skuId)
    if (!group) {
      thermalBySku.set(pallet.skuId, { count: 1, worst: pallet })
    } else {
      group.count += 1
      if (pallet.thermal < group.worst.thermal) group.worst = pallet
    }
  }
  for (const [skuId, group] of thermalBySku) {
    const sku = SKU_BY_ID[skuId] as Sku | undefined
    const spec = zoneSpec(group.worst.zone)
    const minutesLeft = group.worst.thermal * spec.budgetMin
    const critical = group.worst.thermal <= THERMAL_CRITICAL
    drafts.push({
      key: `thermal:${skuId}`,
      kind: critical ? 'excursion' : 'thermalWarn',
      severity: critical ? 'critical' : 'warn',
      title:
        group.count === 1
          ? `${sku?.name ?? skuId} out of zone`
          : `${group.count} pallets of ${sku?.name ?? skuId} out of zone`,
      detail: `${group.worst.id} at ${group.worst.tempC.toFixed(1)} °C against a ${spec.minC} to ${spec.maxC} °C band. ${formatMinutes(minutesLeft)} of thermal budget left.`,
      focus: { kind: 'pallet', id: group.worst.id, siteId },
    })
  }

  // ── Zone out of band ─────────────────────────────────────────────────────
  for (const zs of site.zoneStates) {
    if (zs.inBand) continue
    const spec = zoneSpec(zs.zone)
    drafts.push({
      key: `zone:${zs.zone}`,
      kind: 'excursion',
      severity: zs.integrity < 0.5 ? 'critical' : 'warn',
      title: `${spec.label} zone out of band`,
      detail: `Holding ${zs.tempC.toFixed(1)} °C for ${formatMinutes(zs.outOfBandMin)}. Stock integrity ${(zs.integrity * 100).toFixed(0)} %.`,
      focus: { kind: 'site', id: siteId, siteId },
    })
  }

  // ── Doors held open ──────────────────────────────────────────────────────
  for (const door of site.doors) {
    if (door.openTicks < DOOR_OPEN_TICKS_BEFORE_ALERT) continue
    // A trailer in the bay seals the opening — that is normal working, not a fault.
    if (site.trucks.some((t) => t.bayId === door.bayId && t.phase === 'docked')) continue
    const bay = site.layout.bays.find((b) => b.id === door.bayId)
    drafts.push({
      key: `door:${door.bayId}`,
      kind: 'doorOpen',
      severity: 'warn',
      title: `${bay?.label ?? door.bayId} held open`,
      detail: `Open ${formatMinutes(door.openTicks * 0.05)} with the apron at ${site.apronC.toFixed(1)} °C.`,
      focus: { kind: 'bay', id: door.bayId, siteId },
    })
  }

  // ── Stock ────────────────────────────────────────────────────────────────
  for (const line of inventoryLines(site)) {
    if (line.status === 'in') continue
    drafts.push({
      key: `stock:${line.skuId}`,
      kind: line.status === 'out' ? 'stockout' : 'lowStock',
      severity: line.status === 'out' ? 'critical' : 'warn',
      title: line.status === 'out' ? `${line.name} out of stock` : `${line.name} running low`,
      detail:
        line.status === 'out'
          ? `No sellable stock at ${site.def.shortName}. ${line.allocated.toLocaleString('en-GB')} ${line.unit} already promised.`
          : `${line.onHand.toLocaleString('en-GB')} ${line.unit} on hand against a target of ${line.target.toLocaleString('en-GB')}.`,
      focus: { kind: 'sku', id: line.skuId, siteId },
    })
  }

  // ── Late trucks ──────────────────────────────────────────────────────────
  for (const truck of site.trucks) {
    if (truck.phase === 'gone') continue
    if (truck.delayMin < LATE_THRESHOLD_MIN) continue
    drafts.push({
      key: `late:${truck.id}`,
      kind: 'lateTruck',
      severity: truck.delayMin > 45 ? 'critical' : 'warn',
      title: `${truck.id} running ${Math.round(truck.delayMin)} min late`,
      detail: `${truck.plate} · scheduled ${formatClock(truck.scheduledMin % MIN_PER_DAY)}${truck.bayId ? ` · ${truck.bayId.split(':')[1]}` : ' · unassigned'}.`,
      focus: { kind: 'truck', id: truck.id, siteId },
    })
  }

  // ── Idle fleet while work is waiting ─────────────────────────────────────
  const waitingWork = site.tasks.filter((t) => t.assignedTo === '').length
  if (waitingWork > 0) {
    for (const fl of site.forklifts) {
      if (fl.state !== 'idle') continue
      site.idleTicks.set(fl.id, (site.idleTicks.get(fl.id) ?? 0) + 1)
      if ((site.idleTicks.get(fl.id) ?? 0) < IDLE_TICKS_BEFORE_ALERT) continue
      drafts.push({
        key: `idle:${fl.id}`,
        kind: 'idleForklift',
        severity: 'info',
        title: `${shortId(fl.id)} idle with work queued`,
        detail: `${fl.operator} · ${waitingWork} task${waitingWork === 1 ? '' : 's'} unassigned · battery ${(fl.battery * 100).toFixed(0)} %.`,
        focus: { kind: 'forklift', id: fl.id, siteId },
      })
    }
  }
  for (const fl of site.forklifts) {
    if (fl.state !== 'idle') site.idleTicks.set(fl.id, 0)
    if (fl.battery < 0.15 && fl.state !== 'charging') {
      drafts.push({
        key: `battery:${fl.id}`,
        kind: 'batteryLow',
        severity: 'info',
        title: `${shortId(fl.id)} battery at ${(fl.battery * 100).toFixed(0)} %`,
        detail: `${fl.operator} · will need the charger within the hour.`,
        focus: { kind: 'forklift', id: fl.id, siteId },
      })
    }
  }

  // ── Bay conflict ─────────────────────────────────────────────────────────
  const bayClaims = new Map<string, string[]>()
  for (const truck of site.trucks) {
    if (truck.bayId === '') continue
    if (truck.phase !== 'approach' && truck.phase !== 'reversing' && truck.phase !== 'docked') continue
    const list = bayClaims.get(truck.bayId) ?? []
    list.push(truck.id)
    bayClaims.set(truck.bayId, list)
  }
  for (const [bayId, claimants] of bayClaims) {
    if (claimants.length < 2) continue
    drafts.push({
      key: `conflict:${bayId}`,
      kind: 'bayConflict',
      severity: 'critical',
      title: `${bayId.split(':')[1]} double-booked`,
      detail: `${claimants.join(' and ')} both assigned. One must be re-routed.`,
      focus: { kind: 'bay', id: bayId, siteId },
    })
  }

  reconcile(site, world, drafts, nowMin)
}

function reconcile(site: SiteRuntime, world: WorldState, drafts: AlertDraft[], nowMin: number): void {
  const siteId = site.def.id
  const wanted = new Set(drafts.map((d) => `${siteId}|${d.key}`))

  // Clear alerts for this site whose condition has gone away.
  for (let i = world.alerts.length - 1; i >= 0; i--) {
    const alert = world.alerts[i] as Alert
    if (alert.siteId !== siteId) continue
    if (wanted.has(alert.id)) continue
    world.alerts.splice(i, 1)
    world.pendingEvents.push({ type: 'alertCleared', tick: world.tick, alertId: alert.id })
  }

  for (const draft of drafts) {
    const id = `${siteId}|${draft.key}`
    const existing = world.alerts.find((a) => a.id === id)
    if (existing) {
      // Keep the text live but don't re-announce or reset the acknowledgement.
      existing.detail = draft.detail
      existing.title = draft.title
      existing.severity = draft.severity
      continue
    }
    const alert: Alert = {
      id,
      kind: draft.kind,
      severity: draft.severity,
      siteId,
      title: draft.title,
      detail: draft.detail,
      focus: draft.focus,
      raisedTick: world.tick,
      raisedMin: nowMin,
      acknowledged: false,
      seq: ++world.alertSeq,
    }
    world.alerts.push(alert)
    world.pendingEvents.push({ type: 'alertRaised', tick: world.tick, alert })
  }

  // Most severe first, then newest. Cap so a pathological run can't unbound the UI.
  const rank: Record<AlertSeverity, number> = { critical: 0, warn: 1, info: 2 }
  world.alerts.sort((a, b) => rank[a.severity] - rank[b.severity] || b.seq - a.seq)
  if (world.alerts.length > 80) world.alerts.length = 80
}

// ─────────────────────────────────────────────────────────────────────────────
// Metrics
// ─────────────────────────────────────────────────────────────────────────────

export function updateMetrics(site: SiteRuntime, world: WorldState): void {
  const m: SiteMetrics = site.metrics

  // Roll the day over at midnight.
  if (world.clock.day !== site.today.dayIndex) {
    if (site.today.deliveries > 0) {
      site.onTimeHistory.push(site.today.onTimeDeliveries / site.today.deliveries)
      if (site.onTimeHistory.length > 30) site.onTimeHistory.shift()
    }
    site.today = {
      outbound: 0,
      putaways: 0,
      excursions: 0,
      deliveries: 0,
      onTimeDeliveries: 0,
      dayIndex: world.clock.day,
    }
  }

  let stock = 0
  let live = 0
  let healthy = 0
  for (const pallet of site.pallets.values()) {
    if (pallet.state === 'condemned') continue
    stock += 1
    live += 1
    if (pallet.thermal > THERMAL_WARN) healthy += 1
  }

  const prevStock = m.stockOnHand
  m.stockOnHand = stock
  // Smooth the delta so the tile doesn't flicker between ±1 every tick.
  m.stockDelta = Math.round(m.stockDelta * 0.98 + (stock - prevStock) * 40)

  const onSite = site.trucks.filter((t) => t.phase !== 'inbound' && t.phase !== 'gone').length
  m.trucksDelta = onSite - m.trucksOnSite
  m.trucksOnSite = onSite

  const occupied = site.layout.bays.filter((b) =>
    site.trucks.some((t) => t.bayId === b.id && (t.phase === 'docked' || t.phase === 'reversing')),
  ).length
  m.baysOccupied = occupied
  m.baysTotal = site.layout.bays.length

  const used = site.layout.slotCount - totalFreeSlots(site)
  m.capacityPct = site.layout.slotCount > 0 ? (used / site.layout.slotCount) * 100 : 0

  m.outboundToday = site.today.outbound
  m.putawaysToday = site.today.putaways
  m.excursionsToday = site.today.excursions
  m.chainIntegrityPct = live > 0 ? (healthy / live) * 100 : 100

  const histAvg =
    site.onTimeHistory.length > 0
      ? site.onTimeHistory.reduce((a, b) => a + b, 0) / site.onTimeHistory.length
      : 0.96
  const todayRate = site.today.deliveries > 0 ? site.today.onTimeDeliveries / site.today.deliveries : histAvg
  const blended = site.today.deliveries >= 4 ? todayRate * 0.6 + histAvg * 0.4 : histAvg
  const prevOnTime = m.onTimePct
  m.onTimePct = clampNum(blended * 100, 0, 100)
  m.onTimeDelta = m.onTimePct - prevOnTime === 0 ? m.onTimeDelta * 0.99 : (m.onTimePct - prevOnTime) * 30

  const utilSum = site.forklifts.reduce((a, f) => a + f.utilisation, 0)
  m.forkliftUtilPct = site.forklifts.length > 0 ? (utilSum / site.forklifts.length) * 100 : 0

  site.status = deriveStatus(site, world)
}

function totalFreeSlots(site: SiteRuntime): number {
  return (
    site.freeSlots.AMBIENT.length +
    site.freeSlots.CHILL.length +
    site.freeSlots.FROZEN.length +
    site.freeSlots.ULTRA.length
  )
}

function deriveStatus(site: SiteRuntime, world: WorldState): SiteStatus {
  const mine = world.alerts.filter((a) => a.siteId === site.def.id)
  if (mine.some((a) => a.severity === 'critical')) return 'critical'
  if (mine.filter((a) => a.severity === 'warn').length >= 2) return 'degraded'
  return 'operational'
}

// ─────────────────────────────────────────────────────────────────────────────

function formatMinutes(min: number): string {
  if (min >= 60) {
    const h = Math.floor(min / 60)
    const m = Math.round(min % 60)
    return `${h} h ${String(m).padStart(2, '0')} min`
  }
  if (min >= 1) return `${Math.round(min)} min`
  return `${Math.round(min * 60)} s`
}

function shortId(id: string): string {
  const parts = id.split(':')
  return parts[parts.length - 1] ?? id
}
