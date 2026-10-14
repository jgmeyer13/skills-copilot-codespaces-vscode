/**
 * Inventory accounting and the shipment lifecycle.
 *
 * On-hand is *derived* from pallets rather than kept as a separate counter. That
 * costs a pass over the pallet table each tick but removes a whole class of bug
 * where the number on the dashboard and the boxes in the racking disagree — the
 * exact bug that makes people stop trusting a WMS.
 */

import { MINUTES_PER_TICK, type SiteRuntime, type WorldState } from '../state.ts'
import { SKU_BY_ID, SUBLIMATING_SKUS } from '../catalogue.ts'
import { r0 } from '../num.ts'
import type { InventoryLine, Shipment, Sku } from '../types.ts'
import { absoluteMinutes, setStage } from './traffic.ts'

/** Dry ice loses roughly 1 % of mass a day even in a good box. */
const SUBLIMATION_PER_DAY = 0.01

// ─────────────────────────────────────────────────────────────────────────────
// Inventory
// ─────────────────────────────────────────────────────────────────────────────

export function updateInventory(site: SiteRuntime, world: WorldState): void {
  const nowMin = absoluteMinutes(world)

  // Tally on-hand and allocated in one pass over the pallets.
  const onHand = new Map<string, number>()
  const allocated = new Map<string, number>()
  for (const pallet of site.pallets.values()) {
    if (pallet.state === 'condemned') continue
    if (pallet.state === 'racked' || pallet.state === 'staged' || pallet.state === 'carried') {
      onHand.set(pallet.skuId, (onHand.get(pallet.skuId) ?? 0) + pallet.units)
    }
    if (pallet.shipmentId !== '') {
      allocated.set(pallet.skuId, (allocated.get(pallet.skuId) ?? 0) + pallet.units)
    }
  }

  for (const inv of site.inventory) {
    inv.allocated = allocated.get(inv.skuId) ?? 0
    // Refresh the hourly baseline the delta readout is measured against.
    if (nowMin - inv.historyAtMin >= 60) {
      inv.historyUnits = onHand.get(inv.skuId) ?? 0
      inv.historyAtMin = nowMin
    }
  }

  // Sublimation: shave units off dry ice pallets as they sit.
  const lossPerTick = (SUBLIMATION_PER_DAY / 1440) * MINUTES_PER_TICK
  for (const pallet of site.pallets.values()) {
    if (!SUBLIMATING_SKUS.includes(pallet.skuId)) continue
    const sku = SKU_BY_ID[pallet.skuId] as Sku | undefined
    if (!sku) continue
    pallet.units = Math.max(0, pallet.units - sku.unitsPerPallet * lossPerTick)
  }
}

/** Build the wire view of inventory. Called once per snapshot, not per tick. */
export function inventoryLines(site: SiteRuntime): InventoryLine[] {
  const onHand = new Map<string, number>()
  for (const pallet of site.pallets.values()) {
    if (pallet.state === 'condemned' || pallet.state === 'onTruck') continue
    onHand.set(pallet.skuId, (onHand.get(pallet.skuId) ?? 0) + pallet.units)
  }

  const lines: InventoryLine[] = []
  for (const inv of site.inventory) {
    const sku = SKU_BY_ID[inv.skuId] as Sku | undefined
    if (!sku) continue
    const units = r0(onHand.get(inv.skuId) ?? 0)
    const status: InventoryLine['status'] = units <= 0 ? 'out' : units < inv.target * sku.lowAt ? 'low' : 'in'
    lines.push({
      skuId: inv.skuId,
      name: sku.name,
      zone: sku.zone,
      unit: sku.unit,
      onHand: units,
      target: r0(inv.target),
      allocated: r0(inv.allocated),
      status,
      delta: r0(units - inv.historyUnits),
    })
  }

  // Trouble first: out of stock, then low, then everything else by zone.
  const rank = { out: 0, low: 1, in: 2 }
  lines.sort((a, b) => rank[a.status] - rank[b.status] || a.name.localeCompare(b.name))
  return lines
}

// ─────────────────────────────────────────────────────────────────────────────
// Shipments
// ─────────────────────────────────────────────────────────────────────────────

export function updateShipments(site: SiteRuntime, world: WorldState): void {
  const nowMin = absoluteMinutes(world)

  for (const shipment of site.shipments) {
    if (shipment.stage === 'inTransit') {
      // Re-estimate against the promise. Weather on the road slows everything.
      const drag = site.weather.kind === 'gale' ? 1.12 : site.weather.kind === 'snow' ? 1.08 : 1
      const departed = shipment.stageAtMin[3] ?? nowMin
      const plannedTransit = Math.max(45, shipment.dueMin - (shipment.stageAtMin[0] ?? 0))
      shipment.etaMin = departed + plannedTransit * drag * 0.45

      if (nowMin >= shipment.etaMin) {
        shipment.onTime = nowMin <= shipment.dueMin
        setStage(site, world, shipment, 'delivered')
        site.today.deliveries += 1
        if (shipment.onTime) site.today.onTimeDeliveries += 1
      }
    }
  }

  // Retire old records so the arrays don't grow without bound over a long run.
  if (site.shipments.length > 60) {
    const keep = site.shipments.filter(
      (s) => s.stage !== 'delivered' && s.stage !== 'scrapped',
    )
    const recent = site.shipments
      .filter((s) => s.stage === 'delivered' || s.stage === 'scrapped')
      .slice(-24)
    site.shipments = [...keep, ...recent]
  }
}

/** Shipments worth putting on the tracker, most urgent first. */
export function trackedShipments(site: SiteRuntime, limit = 14): Shipment[] {
  const live = site.shipments.filter((s) => s.stage !== 'delivered' && s.stage !== 'scrapped')
  const done = site.shipments.filter((s) => s.stage === 'delivered' || s.stage === 'scrapped')
  const priorityRank = { critical: 0, express: 1, standard: 2 }
  live.sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority] || a.dueMin - b.dueMin)
  return [...live, ...done.slice(-4).reverse()].slice(0, limit)
}
