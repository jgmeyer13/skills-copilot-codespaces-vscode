/**
 * The dashboard panels.
 *
 * Every figure on screen comes from the same snapshot that drives the 3D scene,
 * so the yard and the numbers can never disagree. Panels that list entities make
 * each row a button: clicking it selects the entity and flies the camera, which
 * is the whole premise — the dashboard and the world are two views of one thing.
 */

import { useEffect, useRef, useState } from 'react'
import { Badge, Bar, Empty, Panel, Sparkline, Tabs, ZoneChip, useEased } from './primitives.tsx'
import {
  FORKLIFT_STATE_LABEL,
  PHASE_LABEL,
  STAGE_LABEL,
  ZONE_LABEL,
  clock,
  compact,
  degrees,
  delta,
  duration,
  int,
  pct,
  relative,
  shortId,
} from './format.ts'
import { activeSite, siteAlerts, useStore } from '../state/store.ts'
import { CARRIER_BY_ID, CUSTOMER_BY_ID, SKU_BY_ID } from '../sim/catalogue.ts'
import { MIN_PER_DAY } from '../sim/state.ts'
import type { Alert, EntityRef, Forklift, InventoryLine, Shipment, SiteSnapshot, Truck } from '../sim/types.ts'

/**
 * Sample a live value into a ring buffer for sparklines.
 *
 * Sampling on a timer rather than on every snapshot keeps the series meaningful:
 * at 20× speed a per-snapshot buffer would span four seconds of simulated time
 * and show nothing but noise.
 */
function useHistory(value: number, points = 28, intervalMs = 1500): number[] {
  const [series, setSeries] = useState<number[]>([])
  const latest = useRef(value)

  // Mirror the live value into a ref from an effect rather than during render,
  // so the sampler always reads a committed value.
  useEffect(() => {
    latest.current = value
  }, [value])

  useEffect(() => {
    const id = setInterval(() => {
      setSeries((prev) => {
        const next = [...prev, latest.current]
        return next.length > points ? next.slice(next.length - points) : next
      })
    }, intervalMs)
    return () => clearInterval(id)
  }, [points, intervalMs])

  return series
}

function useFocus(): (ref: EntityRef) => void {
  return useStore((s) => s.focusOn)
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI tiles
// ─────────────────────────────────────────────────────────────────────────────

export function KpiRow(): React.ReactElement | null {
  const snapshot = useStore((s) => s.snapshot)
  const reducedMotion = useStore((s) => s.reducedMotion)
  const site = activeSite(snapshot)
  if (!site) return null

  const m = site.metrics
  return (
    <div className="kpi-row">
      <Kpi
        label="Stock on hand"
        value={m.stockOnHand}
        unit="pallets"
        deltaValue={m.stockDelta}
        deltaUnit=""
        format={compact}
        tone="accent"
        reducedMotion={reducedMotion}
      />
      <Kpi
        label="Trucks on site"
        value={m.trucksOnSite}
        unit={`of ${m.baysTotal} bays`}
        deltaValue={m.trucksDelta}
        deltaUnit=""
        format={(v) => String(Math.round(v))}
        tone="accent"
        reducedMotion={reducedMotion}
      />
      <Kpi
        label="On-time delivery"
        value={m.onTimePct}
        unit="last 30 days"
        deltaValue={m.onTimeDelta}
        deltaUnit="%"
        format={(v) => `${v.toFixed(1)}%`}
        tone={m.onTimePct >= 95 ? 'ok' : m.onTimePct >= 88 ? 'warn' : 'critical'}
        reducedMotion={reducedMotion}
      />
      {/* The one the reference has no equivalent of: whether the cold chain held. */}
      <Kpi
        label="Chain integrity"
        value={m.chainIntegrityPct}
        unit={m.excursionsToday === 0 ? 'no excursions today' : `${m.excursionsToday} excursions today`}
        deltaValue={0}
        deltaUnit=""
        format={(v) => `${v.toFixed(1)}%`}
        tone={m.chainIntegrityPct >= 99 ? 'ok' : m.chainIntegrityPct >= 94 ? 'warn' : 'critical'}
        reducedMotion={reducedMotion}
      />
    </div>
  )
}

function Kpi({
  label,
  value,
  unit,
  deltaValue,
  deltaUnit,
  format,
  tone,
  reducedMotion,
}: {
  label: string
  value: number
  unit: string
  deltaValue: number
  deltaUnit: string
  format: (v: number) => string
  tone: 'accent' | 'ok' | 'warn' | 'critical'
  reducedMotion: boolean
}): React.ReactElement {
  const eased = useEased(value, !reducedMotion)
  const history = useHistory(value)
  const direction = deltaValue > 0.05 ? 'up' : deltaValue < -0.05 ? 'down' : 'flat'

  return (
    <div className={`kpi kpi-${tone}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-figure">
        <span className="mono kpi-value">{format(eased)}</span>
        <Sparkline values={history} tone={tone} />
      </div>
      <div className="kpi-foot">
        {direction !== 'flat' && (
          <span className={`kpi-delta kpi-delta-${direction}`}>
            <span aria-hidden="true">{direction === 'up' ? '▲' : '▼'}</span>
            <span className="mono">
              {delta(deltaValue, deltaUnit === '%' ? 1 : 0)}
              {deltaUnit}
            </span>
          </span>
        )}
        <span className="kpi-unit">{unit}</span>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Site panel
// ─────────────────────────────────────────────────────────────────────────────

export function SitePanel(): React.ReactElement | null {
  const snapshot = useStore((s) => s.snapshot)
  const statics = useStore((s) => s.statics)
  const site = activeSite(snapshot)
  const layout = statics?.layouts.find((l) => l.id === site?.id)
  const focusOn = useFocus()
  if (!site || !layout || !snapshot) return null

  const m = site.metrics
  const statusTone = site.status === 'critical' ? 'critical' : site.status === 'degraded' ? 'warn' : 'ok'

  return (
    <Panel
      className="panel-site"
      title={layout.name}
      subtitle={
        <>
          {layout.region}, {layout.country} · {layout.lat.toFixed(2)}°N {Math.abs(layout.lon).toFixed(2)}°
          {layout.lon < 0 ? 'W' : 'E'}
        </>
      }
      actions={
        <button
          type="button"
          className="ghost-button"
          onClick={() => focusOn({ kind: 'site', id: site.id, siteId: site.id })}
        >
          Frame site
        </button>
      }
      scroll
    >
      <div className="site-status">
        <Badge tone={statusTone} dot>
          {site.status === 'operational' ? 'Operational' : site.status === 'degraded' ? 'Degraded' : 'Critical'}
        </Badge>
        <span className="site-status-note">{layout.description}</span>
      </div>

      <dl className="metric-grid">
        <Metric label="Capacity used" value={pct(m.capacityPct, 0)} bar={m.capacityPct / 100} />
        <Metric
          label="Bay occupancy"
          value={`${m.baysOccupied} / ${m.baysTotal}`}
          bar={m.baysTotal ? m.baysOccupied / m.baysTotal : 0}
        />
        <Metric label="Outbound today" value={int(m.outboundToday)} />
        <Metric label="Put-aways today" value={int(m.putawaysToday)} />
      </dl>

      <SectionHead>Thermal zones</SectionHead>
      <ul className="zone-list">
        {site.zoneStates.map((zone) => {
          const drift = zone.tempC - zone.setpointC
          return (
            <li key={zone.zone} className={`zone-row ${zone.inBand ? '' : 'zone-row-breach'}`}>
              <ZoneChip zone={zone.zone} label={ZONE_LABEL[zone.zone] ?? zone.zone} />
              <span className="mono zone-temp">{degrees(zone.tempC, 1)}</span>
              <span className="mono zone-drift">
                {zone.inBand ? `${delta(drift, 1)} drift` : `out ${duration(zone.outOfBandMin)}`}
              </span>
              <span className="zone-int">
                <Bar
                  value={zone.integrity}
                  tone={zone.integrity > 0.95 ? 'ok' : zone.integrity > 0.8 ? 'warn' : 'critical'}
                  label={`${ZONE_LABEL[zone.zone]} stock integrity`}
                />
              </span>
            </li>
          )
        })}
      </ul>

      <SectionHead
        action={
          <span className="mono section-count">
            {site.inventory.filter((i) => i.status !== 'in').length} need attention
          </span>
        }
      >
        Inventory
      </SectionHead>
      <ul className="inv-list">
        {site.inventory.map((line) => (
          <InventoryRow key={line.skuId} line={line} siteId={site.id} />
        ))}
      </ul>

      <SectionHead
        action={<span className="mono section-count">{pct(m.forkliftUtilPct, 0)} utilised</span>}
      >
        Forklift fleet
      </SectionHead>
      <ul className="fleet-list">
        {site.forklifts.map((fl) => (
          <FleetRow key={fl.id} forklift={fl} />
        ))}
      </ul>
    </Panel>
  )
}

function SectionHead({ children, action }: { children: React.ReactNode; action?: React.ReactNode }): React.ReactElement {
  return (
    <div className="section-head">
      <h3>{children}</h3>
      {action}
    </div>
  )
}

function Metric({ label, value, bar }: { label: string; value: string; bar?: number }): React.ReactElement {
  return (
    <div className="metric">
      <dt>{label}</dt>
      <dd className="mono">{value}</dd>
      {bar !== undefined && <Bar value={bar} tone={bar > 0.9 ? 'warn' : 'accent'} label={label} />}
    </div>
  )
}

function InventoryRow({ line, siteId }: { line: InventoryLine; siteId: string }): React.ReactElement {
  const focusOn = useFocus()
  const tone = line.status === 'out' ? 'critical' : line.status === 'low' ? 'warn' : 'ok'
  const label = line.status === 'out' ? 'Out' : line.status === 'low' ? 'Low' : 'In stock'

  return (
    <li>
      <button
        type="button"
        className="inv-row"
        onClick={() => focusOn({ kind: 'sku', id: line.skuId, siteId })}
      >
        <span className="inv-zone" style={{ background: `var(--zone-${line.zone.toLowerCase()})` }} aria-hidden="true" />
        <span className="inv-name" title={line.name}>
          {line.name}
        </span>
        <span className="mono inv-qty">
          {compact(line.onHand)}
          <span className="inv-unit"> {line.unit}</span>
        </span>
        {line.delta !== 0 && (
          <span className={`mono inv-delta ${line.delta > 0 ? 'up' : 'down'}`}>{delta(line.delta)}</span>
        )}
        <Badge tone={tone}>{label}</Badge>
      </button>
    </li>
  )
}

function FleetRow({ forklift }: { forklift: Forklift }): React.ReactElement {
  const focusOn = useFocus()
  const working = forklift.state !== 'idle' && forklift.state !== 'charging'
  const tone = forklift.state === 'charging' ? 'warn' : working ? 'accent' : 'idle'

  return (
    <li>
      <button
        type="button"
        className="fleet-row"
        onClick={() => focusOn({ kind: 'forklift', id: forklift.id, siteId: forklift.siteId })}
      >
        <span className="fleet-head">
          <span className="mono fleet-id">{shortId(forklift.id)}</span>
          <Badge tone={tone} dot={working}>
            {FORKLIFT_STATE_LABEL[forklift.state] ?? forklift.state}
          </Badge>
          <span className="mono fleet-batt" title="Battery">
            {Math.round(forklift.battery * 100)}%
          </span>
        </span>
        <span className="fleet-task">{forklift.taskLabel}</span>
        <Bar value={forklift.taskProgress} tone={tone === 'idle' ? 'idle' : 'accent'} label="Task progress" />
        <span className="fleet-operator">{forklift.operator}</span>
      </button>
    </li>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Shipment tracker
// ─────────────────────────────────────────────────────────────────────────────

const STAGES = ['confirmed', 'picked', 'loading', 'inTransit', 'delivered'] as const

export function ShipmentTracker(): React.ReactElement | null {
  const snapshot = useStore((s) => s.snapshot)
  const site = activeSite(snapshot)
  const [index, setIndex] = useState(0)
  if (!site || !snapshot) return null

  const live = site.shipments.filter((s) => s.stage !== 'delivered' && s.stage !== 'scrapped')
  const shipments = live.length > 0 ? live : site.shipments
  if (shipments.length === 0) return null

  const safeIndex = Math.min(index, shipments.length - 1)
  const shipment = shipments[safeIndex] as Shipment
  const nowMin = snapshot.clock.day * MIN_PER_DAY + snapshot.clock.minuteOfDay

  return (
    <Panel
      className="panel-shipment"
      title="Shipment tracker"
      subtitle={`${live.length} in flight`}
      actions={
        <div className="stepper">
          <button
            type="button"
            className="ghost-button"
            aria-label="Previous shipment"
            onClick={() => setIndex((i) => (i - 1 + shipments.length) % shipments.length)}
          >
            ‹
          </button>
          <span className="mono stepper-count">
            {safeIndex + 1}/{shipments.length}
          </span>
          <button
            type="button"
            className="ghost-button"
            aria-label="Next shipment"
            onClick={() => setIndex((i) => (i + 1) % shipments.length)}
          >
            ›
          </button>
        </div>
      }
    >
      <ShipmentDetail shipment={shipment} nowMin={nowMin} />
    </Panel>
  )
}

function ShipmentDetail({ shipment, nowMin }: { shipment: Shipment; nowMin: number }): React.ReactElement {
  const focusOn = useFocus()
  const customer = CUSTOMER_BY_ID[shipment.customerId]
  const carrier = CARRIER_BY_ID[shipment.carrierId]
  const currentIndex = STAGES.indexOf(shipment.stage as (typeof STAGES)[number])
  const scrapped = shipment.stage === 'scrapped'
  const late = shipment.etaMin > shipment.dueMin

  return (
    <div className="shipment">
      <div className="shipment-head">
        <button
          type="button"
          className="shipment-id mono"
          onClick={() =>
            shipment.truckId
              ? focusOn({ kind: 'truck', id: shipment.truckId, siteId: shipment.siteId })
              : focusOn({ kind: 'site', id: shipment.siteId, siteId: shipment.siteId })
          }
        >
          {shipment.id}
        </button>
        <ZoneChip zone={shipment.zone} label={ZONE_LABEL[shipment.zone] ?? shipment.zone} />
        {shipment.priority !== 'standard' && (
          <Badge tone={shipment.priority === 'critical' ? 'critical' : 'warn'}>
            {shipment.priority === 'critical' ? 'Critical' : 'Express'}
          </Badge>
        )}
        {scrapped && <Badge tone="critical">Scrapped</Badge>}
        <span className="shipment-dest">
          {customer?.name ?? shipment.customerId} · {shipment.destination}
        </span>
      </div>

      <ol className={`track ${scrapped ? 'track-scrapped' : ''}`}>
        {STAGES.map((stage, i) => {
          const reached = !scrapped && i <= currentIndex
          const current = !scrapped && i === currentIndex
          const at = shipment.stageAtMin[i] ?? -1
          return (
            <li key={stage} className={`track-step ${reached ? 'reached' : ''} ${current ? 'current' : ''}`}>
              <span className="track-node" aria-hidden="true">
                {reached && !current && <CheckIcon />}
              </span>
              <span className="track-label">{STAGE_LABEL[stage]}</span>
              <span className="mono track-time">
                {at >= 0 ? clock(at) : i === currentIndex + 1 && !scrapped ? relative(shipment.etaMin, nowMin) : '—'}
              </span>
            </li>
          )
        })}
      </ol>

      <div className="shipment-foot">
        <span>
          <span className="shipment-foot-label">Carrier</span> {carrier?.name ?? shipment.carrierId}
        </span>
        <span>
          <span className="shipment-foot-label">Pallets</span>{' '}
          <span className="mono">
            {shipment.palletsReady}/{shipment.palletsTotal}
          </span>
        </span>
        <span>
          <span className="shipment-foot-label">ETA</span>{' '}
          <span className={`mono ${late ? 'text-warn' : ''}`}>{clock(shipment.etaMin)}</span>
          {late && <span className="text-warn"> · {duration(shipment.etaMin - shipment.dueMin)} late</span>}
        </span>
      </div>
    </div>
  )
}

function CheckIcon(): React.ReactElement {
  return (
    <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
      <path d="m2.5 6.2 2.4 2.4L9.5 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Operations table
// ─────────────────────────────────────────────────────────────────────────────

export function OpsTable(): React.ReactElement | null {
  const snapshot = useStore((s) => s.snapshot)
  const statics = useStore((s) => s.statics)
  const tab = useStore((s) => s.opsTab)
  const setTab = useStore((s) => s.setOpsTab)
  const site = activeSite(snapshot)
  const layout = statics?.layouts.find((l) => l.id === site?.id)
  if (!site || !layout || !snapshot) return null

  const nowMin = snapshot.clock.day * MIN_PER_DAY + snapshot.clock.minuteOfDay
  const activeTrucks = site.trucks.filter((t) => t.phase !== 'gone')

  return (
    <Panel
      className="panel-ops"
      title="Operations"
      subtitle={`${layout.name} · live`}
      actions={
        <Tabs
          label="Operations"
          active={tab}
          onChange={setTab}
          tabs={[
            { id: 'docks', label: 'Docks', count: site.metrics.baysTotal },
            { id: 'forklifts', label: 'Forklifts', count: site.forklifts.length },
            { id: 'trucks', label: 'Trucks', count: activeTrucks.length },
            { id: 'shipments', label: 'Shipments', count: site.shipments.filter((sh) => sh.stage !== 'delivered' && sh.stage !== 'scrapped').length },
          ]}
        />
      }
      scroll
    >
      {tab === 'docks' && <DocksTable site={site} layout={layout} />}
      {tab === 'forklifts' && <ForkliftsTable site={site} />}
      {tab === 'trucks' && <TrucksTable site={site} />}
      {tab === 'shipments' && <ShipmentsTable site={site} nowMin={nowMin} />}
    </Panel>
  )
}

function DocksTable({ site, layout }: { site: SiteSnapshot; layout: { bays: { id: string; label: string; zone: string }[] } }): React.ReactElement {
  const focusOn = useFocus()
  return (
    <table className="table">
      <thead>
        <tr>
          <th scope="col">Bay</th>
          <th scope="col">Zone</th>
          <th scope="col">Vehicle</th>
          <th scope="col">Status</th>
          <th scope="col">Door</th>
        </tr>
      </thead>
      <tbody>
        {layout.bays.map((bay) => {
          const truck = site.trucks.find(
            (t) => t.bayId === bay.id && (t.phase === 'docked' || t.phase === 'reversing' || t.phase === 'approach'),
          )
          const door = site.doors.find((d) => d.bayId === bay.id)
          return (
            <tr key={bay.id} onClick={() => focusOn({ kind: 'bay', id: bay.id, siteId: site.id })} tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter') focusOn({ kind: 'bay', id: bay.id, siteId: site.id }) }}>
              <th scope="row" className="mono">{bay.label}</th>
              <td><ZoneChip zone={bay.zone} label={ZONE_LABEL[bay.zone] ?? bay.zone} /></td>
              <td className="mono">{truck ? truck.id : <span className="dim">—</span>}</td>
              <td>
                {truck ? (
                  <Badge tone={truck.phase === 'docked' ? 'accent' : 'warn'} dot>
                    {PHASE_LABEL[truck.phase]}
                  </Badge>
                ) : (
                  <Badge tone="idle">Available</Badge>
                )}
              </td>
              <td>
                <span className="door-cell">
                  <Bar value={door?.openness ?? 0} tone={(door?.openness ?? 0) > 0.05 ? 'warn' : 'idle'} label="Door" />
                  <span className="mono dim">{Math.round((door?.openness ?? 0) * 100)}%</span>
                </span>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function ForkliftsTable({ site }: { site: SiteSnapshot }): React.ReactElement {
  const focusOn = useFocus()
  return (
    <table className="table">
      <thead>
        <tr>
          <th scope="col">Unit</th>
          <th scope="col">Operator</th>
          <th scope="col">State</th>
          <th scope="col">Task</th>
          <th scope="col">Progress</th>
          <th scope="col">Battery</th>
        </tr>
      </thead>
      <tbody>
        {site.forklifts.map((fl) => (
          <tr key={fl.id} tabIndex={0}
              onClick={() => focusOn({ kind: 'forklift', id: fl.id, siteId: site.id })}
              onKeyDown={(e) => { if (e.key === 'Enter') focusOn({ kind: 'forklift', id: fl.id, siteId: site.id }) }}>
            <th scope="row" className="mono">{shortId(fl.id)}</th>
            <td>{fl.operator}</td>
            <td>
              <Badge tone={fl.state === 'charging' ? 'warn' : fl.state === 'idle' ? 'idle' : 'accent'} dot={fl.state !== 'idle'}>
                {FORKLIFT_STATE_LABEL[fl.state]}
              </Badge>
            </td>
            <td className="truncate">{fl.taskLabel}</td>
            <td><Bar value={fl.taskProgress} tone="accent" label="Task progress" /></td>
            <td className="mono">{Math.round(fl.battery * 100)}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function TrucksTable({ site }: { site: SiteSnapshot }): React.ReactElement {
  const focusOn = useFocus()
  const trucks = site.trucks.filter((t) => t.phase !== 'gone')
  if (trucks.length === 0) return <Empty>No vehicles on site.</Empty>
  return (
    <table className="table">
      <thead>
        <tr>
          <th scope="col">Vehicle</th>
          <th scope="col">Carrier</th>
          <th scope="col">Flow</th>
          <th scope="col">Zone</th>
          <th scope="col">Status</th>
          <th scope="col">Box</th>
          <th scope="col">Schedule</th>
        </tr>
      </thead>
      <tbody>
        {trucks.map((truck: Truck) => {
          const late = truck.delayMin > 18
          return (
            <tr key={truck.id} tabIndex={0}
                onClick={() => focusOn({ kind: 'truck', id: truck.id, siteId: site.id })}
                onKeyDown={(e) => { if (e.key === 'Enter') focusOn({ kind: 'truck', id: truck.id, siteId: site.id }) }}>
              <th scope="row" className="mono">{truck.id}</th>
              <td>{CARRIER_BY_ID[truck.carrierId]?.name ?? truck.carrierId}</td>
              <td className="dim">{truck.direction === 'inbound' ? 'Inbound' : 'Outbound'}</td>
              <td><ZoneChip zone={truck.zone} label={ZONE_LABEL[truck.zone] ?? truck.zone} /></td>
              <td>
                <Badge tone={truck.phase === 'docked' ? 'accent' : 'idle'} dot={truck.phase === 'docked'}>
                  {PHASE_LABEL[truck.phase]}
                </Badge>
              </td>
              <td className="mono">{degrees(truck.boxC, 1)}</td>
              <td className={`mono ${late ? 'text-warn' : ''}`}>
                {late ? `${Math.round(truck.delayMin)} min late` : clock(truck.scheduledMin)}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

/**
 * Shipments as a table.
 *
 * The big tracker panel is the hero view at desktop width, but it needs about
 * 430px to lay out five stages legibly. This is the same information in a form
 * that survives a narrow column — and it is the better view when you want to
 * scan twelve shipments rather than study one.
 */
function ShipmentsTable({ site, nowMin }: { site: SiteSnapshot; nowMin: number }): React.ReactElement {
  const focusOn = useFocus()
  if (site.shipments.length === 0) return <Empty>No shipments on the book.</Empty>

  return (
    <table className="table">
      <thead>
        <tr>
          <th scope="col">Shipment</th>
          <th scope="col">Customer</th>
          <th scope="col">Zone</th>
          <th scope="col">Stage</th>
          <th scope="col">Pallets</th>
          <th scope="col">ETA</th>
        </tr>
      </thead>
      <tbody>
        {site.shipments.map((shipment: Shipment) => {
          const late = shipment.etaMin > shipment.dueMin
          const scrapped = shipment.stage === 'scrapped'
          const target: EntityRef = shipment.truckId
            ? { kind: 'truck', id: shipment.truckId, siteId: site.id }
            : { kind: 'site', id: site.id, siteId: site.id }
          return (
            <tr
              key={shipment.id}
              tabIndex={0}
              onClick={() => focusOn(target)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') focusOn(target)
              }}
            >
              <th scope="row" className="mono">{shipment.id}</th>
              <td className="truncate">{CUSTOMER_BY_ID[shipment.customerId]?.name ?? shipment.customerId}</td>
              <td><ZoneChip zone={shipment.zone} label={ZONE_LABEL[shipment.zone] ?? shipment.zone} /></td>
              <td>
                <Badge
                  tone={scrapped ? 'critical' : shipment.stage === 'delivered' ? 'ok' : 'accent'}
                  dot={!scrapped && shipment.stage !== 'delivered'}
                >
                  {STAGE_LABEL[shipment.stage] ?? shipment.stage}
                </Badge>
              </td>
              <td className="mono">{shipment.palletsReady}/{shipment.palletsTotal}</td>
              <td className={`mono ${late && !scrapped ? 'text-warn' : ''}`}>
                {scrapped ? '—' : relative(shipment.etaMin, nowMin)}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Alerts
// ─────────────────────────────────────────────────────────────────────────────

export function AlertsRail(): React.ReactElement | null {
  const snapshot = useStore((s) => s.snapshot)
  const site = activeSite(snapshot)
  const focusOn = useFocus()
  if (!site || !snapshot) return null

  const alerts = siteAlerts(snapshot, site.id)
  const nowMin = snapshot.clock.day * MIN_PER_DAY + snapshot.clock.minuteOfDay
  const critical = alerts.filter((a) => a.severity === 'critical').length

  return (
    <Panel
      className="panel-alerts"
      title="Alerts"
      subtitle={
        alerts.length === 0 ? 'All clear' : `${alerts.length} open${critical ? ` · ${critical} critical` : ''}`
      }
      scroll
    >
      {alerts.length === 0 && <Empty>Nothing needs attention at {site.id}.</Empty>}
      <ul className="alert-list">
        {alerts.slice(0, 14).map((alert: Alert) => (
          <li key={alert.id}>
            <button type="button" className={`alert alert-${alert.severity}`} onClick={() => focusOn(alert.focus)}>
              <span className="alert-rail" aria-hidden="true" />
              <span className="alert-body">
                <span className="alert-title">{alert.title}</span>
                <span className="alert-detail">{alert.detail}</span>
                <span className="alert-foot">
                  <span className="mono">{clock(alert.raisedMin)}</span>
                  <span className="alert-age">{relative(alert.raisedMin, nowMin)}</span>
                  <span className="alert-go">Fly to →</span>
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Inspector
// ─────────────────────────────────────────────────────────────────────────────

export function Inspector(): React.ReactElement | null {
  const snapshot = useStore((s) => s.snapshot)
  const statics = useStore((s) => s.statics)
  const selection = useStore((s) => s.selection)
  const open = useStore((s) => s.inspectorOpen)
  const select = useStore((s) => s.select)
  const focusOn = useFocus()

  if (!open || !selection || !snapshot) return null
  const site = snapshot.sites.find((s) => s.id === selection.siteId)
  const layout = statics?.layouts.find((l) => l.id === selection.siteId)
  if (!site || !layout) return null

  const nowMin = snapshot.clock.day * MIN_PER_DAY + snapshot.clock.minuteOfDay
  const rows = describeSelection(site, layout, selection, nowMin)
  if (!rows) return null

  return (
    <aside className="inspector" aria-label={`${rows.kind} details`}>
      <header className="inspector-head">
        <div>
          <div className="inspector-kind">{rows.kind}</div>
          <div className="mono inspector-id">{rows.title}</div>
        </div>
        <div className="inspector-head-actions">
          <button type="button" className="ghost-button" onClick={() => focusOn(selection)}>
            Fly to
          </button>
          <button type="button" className="icon-button" aria-label="Close details" onClick={() => select(null)}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path d="m3 3 6 6M9 3l-6 6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </header>
      {rows.badges && <div className="inspector-badges">{rows.badges}</div>}
      <dl className="inspector-rows">
        {rows.fields.map(([label, value]) => (
          <div key={label} className="inspector-row">
            <dt>{label}</dt>
            <dd className="mono">{value}</dd>
          </div>
        ))}
      </dl>
      {rows.footer}
    </aside>
  )
}

interface Described {
  kind: string
  title: string
  badges?: React.ReactNode
  fields: [string, React.ReactNode][]
  footer?: React.ReactNode
}

function describeSelection(
  site: SiteSnapshot,
  layout: { bays: { id: string; label: string; zone: string }[]; name: string },
  ref: EntityRef,
  nowMin: number,
): Described | null {
  switch (ref.kind) {
    case 'truck': {
      const truck = site.trucks.find((t) => t.id === ref.id)
      if (!truck) return null
      return {
        kind: 'Vehicle',
        title: truck.id,
        badges: (
          <>
            <Badge tone={truck.phase === 'docked' ? 'accent' : 'idle'} dot>{PHASE_LABEL[truck.phase]}</Badge>
            <ZoneChip zone={truck.zone} label={ZONE_LABEL[truck.zone] ?? truck.zone} />
            {truck.delayMin > 18 && <Badge tone="warn">{Math.round(truck.delayMin)} min late</Badge>}
          </>
        ),
        fields: [
          ['Carrier', CARRIER_BY_ID[truck.carrierId]?.name ?? truck.carrierId],
          ['Plate', truck.plate],
          ['Flow', truck.direction === 'inbound' ? 'Inbound' : 'Outbound'],
          ['Bay', truck.bayId ? shortId(truck.bayId) : 'Unassigned'],
          ['Pallets', `${truck.palletsOnBoard} / ${truck.palletCapacity}`],
          ['Reefer setpoint', degrees(truck.setpointC, 0)],
          ['Box temperature', degrees(truck.boxC, 1)],
          ['Scheduled', clock(truck.scheduledMin)],
          ['Arrived', truck.arrivedMin >= 0 ? clock(truck.arrivedMin) : '—'],
          ['Speed', `${truck.speed.toFixed(1)} m/s`],
        ],
      }
    }
    case 'forklift': {
      const fl = site.forklifts.find((f) => f.id === ref.id)
      if (!fl) return null
      return {
        kind: 'Forklift',
        title: shortId(fl.id),
        badges: (
          <>
            <Badge tone={fl.state === 'charging' ? 'warn' : fl.state === 'idle' ? 'idle' : 'accent'} dot>
              {FORKLIFT_STATE_LABEL[fl.state]}
            </Badge>
            {fl.carryingPalletId && <Badge tone="accent">Carrying {fl.carryingPalletId}</Badge>}
          </>
        ),
        fields: [
          ['Operator', fl.operator],
          ['Current task', fl.taskLabel],
          ['Leg', fl.leg === 'toPickup' ? 'Collecting' : fl.leg === 'toDrop' ? 'Delivering' : '—'],
          ['Progress', pct(fl.taskProgress * 100, 0)],
          ['Battery', pct(fl.battery * 100, 0)],
          ['Mast height', `${fl.mast.toFixed(2)} m`],
          ['Utilisation', pct(fl.utilisation * 100, 0)],
        ],
        footer: <Bar value={fl.taskProgress} tone="accent" height={5} label="Task progress" />,
      }
    }
    case 'pallet': {
      const pallet = site.activePallets.find((p) => p.id === ref.id)
      if (!pallet) return null
      const sku = SKU_BY_ID[pallet.skuId]
      const minutes = pallet.thermal * 45
      return {
        kind: 'Pallet',
        title: pallet.id,
        badges: (
          <>
            <ZoneChip zone={pallet.zone} label={ZONE_LABEL[pallet.zone] ?? pallet.zone} />
            <Badge tone={pallet.thermal > 0.6 ? 'ok' : pallet.thermal > 0.25 ? 'warn' : 'critical'} dot>
              {pallet.thermal > 0.6 ? 'In band' : pallet.thermal > 0.25 ? 'At risk' : 'Critical'}
            </Badge>
          </>
        ),
        fields: [
          ['Product', sku?.name ?? pallet.skuId],
          ['Units', `${int(pallet.units)} ${sku?.unit ?? ''}`],
          ['State', pallet.state],
          ['Exposure', degrees(pallet.tempC, 1)],
          ['Thermal budget', `${pct(pallet.thermal * 100, 0)} · ${duration(minutes)} left`],
          ['Shipment', pallet.shipmentId || '—'],
        ],
        footer: (
          <Bar
            value={pallet.thermal}
            tone={pallet.thermal > 0.6 ? 'ok' : pallet.thermal > 0.25 ? 'warn' : 'critical'}
            height={5}
            label="Thermal budget"
          />
        ),
      }
    }
    case 'bay': {
      const bay = layout.bays.find((b) => b.id === ref.id)
      if (!bay) return null
      const door = site.doors.find((d) => d.bayId === bay.id)
      const truck = site.trucks.find((t) => t.bayId === bay.id && t.phase !== 'gone')
      return {
        kind: 'Dock bay',
        title: bay.label,
        badges: (
          <>
            <ZoneChip zone={bay.zone} label={ZONE_LABEL[bay.zone] ?? bay.zone} />
            <Badge tone={truck ? 'accent' : 'idle'} dot={!!truck}>
              {truck ? PHASE_LABEL[truck.phase] : 'Available'}
            </Badge>
          </>
        ),
        fields: [
          ['Vehicle', truck ? truck.id : '—'],
          ['Carrier', truck ? CARRIER_BY_ID[truck.carrierId]?.name ?? '—' : '—'],
          ['Door position', pct((door?.openness ?? 0) * 100, 0)],
          ['Apron temperature', degrees(site.apronC, 1)],
        ],
      }
    }
    case 'sku': {
      const line = site.inventory.find((i) => i.skuId === ref.id)
      if (!line) return null
      return {
        kind: 'Product',
        title: line.skuId,
        badges: (
          <>
            <ZoneChip zone={line.zone} label={ZONE_LABEL[line.zone] ?? line.zone} />
            <Badge tone={line.status === 'out' ? 'critical' : line.status === 'low' ? 'warn' : 'ok'}>
              {line.status === 'out' ? 'Out of stock' : line.status === 'low' ? 'Low' : 'In stock'}
            </Badge>
          </>
        ),
        fields: [
          ['Name', line.name],
          ['On hand', `${int(line.onHand)} ${line.unit}`],
          ['Target', `${int(line.target)} ${line.unit}`],
          ['Allocated', `${int(line.allocated)} ${line.unit}`],
          ['Change (1 h)', delta(line.delta)],
        ],
        footer: (
          <Bar
            value={line.target ? line.onHand / line.target : 0}
            tone={line.status === 'out' ? 'critical' : line.status === 'low' ? 'warn' : 'ok'}
            height={5}
            label="Stock against target"
          />
        ),
      }
    }
    case 'site':
    default: {
      return {
        kind: 'Site',
        title: site.id,
        fields: [
          ['Name', layout.name],
          ['Status', site.status],
          ['Stock on hand', `${int(site.metrics.stockOnHand)} pallets`],
          ['Capacity', pct(site.metrics.capacityPct, 1)],
          ['Apron', degrees(site.apronC, 1)],
          ['Local time', clock(nowMin)],
        ],
      }
    }
  }
}

export { useHistory }
