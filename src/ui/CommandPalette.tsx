/**
 * Global search across the whole network.
 *
 * Searches every site, not just the active one — a duty manager looking for
 * TRK-2051 does not know or care which yard it is in, so finding it switches
 * site and flies the camera in one action.
 *
 * Scoring is a small hand-rolled matcher rather than a fuzzy-search dependency:
 * the corpus is a few hundred records with highly structured ids, and exact
 * prefix matches on an id should always beat a loose match in a description.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { sendCommand, useStore } from '../state/store.ts'
import { useFocusTrap } from './primitives.tsx'
import { CARRIER_BY_ID, CUSTOMER_BY_ID, SKU_BY_ID } from '../sim/catalogue.ts'
import { FORKLIFT_STATE_LABEL, PHASE_LABEL, STAGE_LABEL, ZONE_LABEL, shortId } from './format.ts'
import type { EntityRef, WorldSnapshot, WorldStatic } from '../sim/types.ts'

interface Result {
  ref: EntityRef
  group: string
  title: string
  subtitle: string
  zone?: string
  score: number
}

export function CommandPalette(): React.ReactElement | null {
  const open = useStore((s) => s.paletteOpen)
  const setOpen = useStore((s) => s.setPaletteOpen)
  const snapshot = useStore((s) => s.snapshot)
  const statics = useStore((s) => s.statics)
  const focusOn = useStore((s) => s.focusOn)

  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const trapRef = useFocusTrap(open)

  useEffect(() => {
    if (!open) return
    // Deferred to the next frame: the input needs to exist before it can take
    // focus, and resetting here rather than in the effect body avoids a
    // cascading render on open.
    const id = requestAnimationFrame(() => {
      setQuery('')
      setCursor(0)
      inputRef.current?.focus()
    })
    return () => cancelAnimationFrame(id)
  }, [open])

  const results = useMemo(() => search(query, snapshot, statics), [query, snapshot, statics])
  // Clamp during render rather than correcting it in an effect: the result list
  // shrinks as you type, and a stale cursor must never address past its end.
  const active = Math.min(cursor, Math.max(0, results.length - 1))

  // Keep the active row in view when navigating by keyboard.
  useEffect(() => {
    if (!open) return
    const node = listRef.current?.querySelectorAll('li')[active]
    node?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  if (!open) return null

  const choose = (result: Result | undefined): void => {
    if (!result) return
    if (snapshot && result.ref.siteId !== snapshot.activeSiteId) {
      sendCommand({ type: 'setActiveSite', siteId: result.ref.siteId })
    }
    focusOn(result.ref)
    setOpen(false)
  }

  const grouped: [string, Result[]][] = []
  for (const result of results) {
    const last = grouped[grouped.length - 1]
    if (last && last[0] === result.group) last[1].push(result)
    else grouped.push([result.group, [result]])
  }

  let flatIndex = -1

  return (
    <div className="overlay overlay-palette" onPointerDown={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Search" ref={trapRef}>
        <div className="palette-input-row">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
            <circle cx="7" cy="7" r="4.5" />
            <path d="M10.5 10.5 14 14" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            className="palette-input"
            placeholder="Search sites, trucks, forklifts, pallets, shipments, products…"
            value={query}
            spellCheck={false}
            autoComplete="off"
            role="combobox"
            aria-expanded
            aria-controls="palette-results"
            aria-activedescendant={results[active] ? `palette-opt-${active}` : undefined}
            onChange={(event) => {
              setQuery(event.target.value)
              setCursor(0)
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                setCursor((c) => Math.min(results.length - 1, c + 1))
              } else if (event.key === 'ArrowUp') {
                event.preventDefault()
                setCursor((c) => Math.max(0, c - 1))
              } else if (event.key === 'Enter') {
                event.preventDefault()
                choose(results[active])
              } else if (event.key === 'Escape') {
                event.preventDefault()
                setOpen(false)
              }
            }}
          />
          <kbd className="kbd">Esc</kbd>
        </div>

        <ul className="palette-results" id="palette-results" role="listbox" ref={listRef}>
          {results.length === 0 && (
            <li className="palette-empty">
              {query.trim() ? `Nothing matches “${query.trim()}”.` : 'Type to search across all three sites.'}
            </li>
          )}
          {grouped.map(([group, items]) => (
            <li key={group}>
              <div className="palette-group">{group}</div>
              <ul>
                {items.map((result) => {
                  flatIndex += 1
                  const index = flatIndex
                  return (
                    <li
                      key={`${result.ref.kind}-${result.ref.id}`}
                      id={`palette-opt-${index}`}
                      role="option"
                      aria-selected={index === active}
                      className={`palette-item ${index === active ? 'palette-item-active' : ''}`}
                      onPointerEnter={() => setCursor(index)}
                      onPointerDown={(event) => {
                        event.preventDefault()
                        choose(result)
                      }}
                    >
                      {result.zone && (
                        <span
                          className="palette-zone"
                          style={{ background: `var(--zone-${result.zone.toLowerCase()})` }}
                          aria-hidden="true"
                        />
                      )}
                      <span className="mono palette-title">{result.title}</span>
                      <span className="palette-sub">{result.subtitle}</span>
                      <span className="palette-site">{result.ref.siteId}</span>
                    </li>
                  )
                })}
              </ul>
            </li>
          ))}
        </ul>

        <footer className="palette-foot">
          <span><kbd className="kbd">↑</kbd><kbd className="kbd">↓</kbd> navigate</span>
          <span><kbd className="kbd">↵</kbd> fly to</span>
          <span><kbd className="kbd">Esc</kbd> close</span>
        </footer>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Score a candidate against the query.
 * Exact id match beats prefix, beats word-start, beats substring. Returns 0 for
 * no match so callers can filter on truthiness.
 */
function score(haystack: string, needle: string): number {
  if (!needle) return 1
  const h = haystack.toLowerCase()
  const n = needle.toLowerCase()
  if (h === n) return 1000
  if (h.startsWith(n)) return 600 - h.length
  const wordStart = new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
  if (wordStart.test(h)) return 400 - h.length
  if (h.includes(n)) return 200 - h.length
  return 0
}

function best(needle: string, ...fields: string[]): number {
  let top = 0
  for (const field of fields) top = Math.max(top, score(field, needle))
  return top
}

function search(query: string, snapshot: WorldSnapshot | null, statics: WorldStatic | null): Result[] {
  if (!snapshot || !statics) return []
  const q = query.trim()
  const results: Result[] = []

  for (const layout of statics.layouts) {
    const site = snapshot.sites.find((s) => s.id === layout.id)
    if (!site) continue

    const siteScore = best(q, layout.id, layout.name, layout.shortName, layout.region, layout.country)
    if (siteScore > 0) {
      results.push({
        ref: { kind: 'site', id: layout.id, siteId: layout.id },
        group: 'Sites',
        title: layout.id,
        subtitle: `${layout.name} · ${layout.region}, ${layout.country}`,
        score: siteScore + 50,
      })
    }

    for (const truck of site.trucks) {
      if (truck.phase === 'gone') continue
      const carrier = CARRIER_BY_ID[truck.carrierId]?.name ?? ''
      const s = best(q, truck.id, truck.plate, carrier, truck.zone)
      if (s > 0) {
        results.push({
          ref: { kind: 'truck', id: truck.id, siteId: site.id },
          group: 'Vehicles',
          title: truck.id,
          subtitle: `${carrier} · ${truck.plate} · ${PHASE_LABEL[truck.phase] ?? truck.phase}`,
          zone: truck.zone,
          score: s,
        })
      }
    }

    for (const fl of site.forklifts) {
      const s = best(q, shortId(fl.id), fl.id, fl.operator, fl.taskLabel)
      if (s > 0) {
        results.push({
          ref: { kind: 'forklift', id: fl.id, siteId: site.id },
          group: 'Forklifts',
          title: shortId(fl.id),
          subtitle: `${fl.operator} · ${FORKLIFT_STATE_LABEL[fl.state] ?? fl.state} · ${fl.taskLabel}`,
          score: s,
        })
      }
    }

    for (const pallet of site.activePallets) {
      const sku = SKU_BY_ID[pallet.skuId]
      const s = best(q, pallet.id, sku?.name ?? '', pallet.skuId)
      if (s > 0) {
        results.push({
          ref: { kind: 'pallet', id: pallet.id, siteId: site.id },
          group: 'Pallets in motion',
          title: pallet.id,
          subtitle: `${sku?.name ?? pallet.skuId} · ${Math.round(pallet.thermal * 100)}% budget`,
          zone: pallet.zone,
          score: s,
        })
      }
    }

    for (const shipment of site.shipments) {
      const customer = CUSTOMER_BY_ID[shipment.customerId]?.name ?? ''
      const s = best(q, shipment.id, customer, shipment.destination, shipment.stage)
      if (s > 0) {
        results.push({
          ref: shipment.truckId
            ? { kind: 'truck', id: shipment.truckId, siteId: site.id }
            : { kind: 'site', id: site.id, siteId: site.id },
          group: 'Shipments',
          title: shipment.id,
          subtitle: `${customer} · ${shipment.destination} · ${STAGE_LABEL[shipment.stage] ?? shipment.stage}`,
          zone: shipment.zone,
          score: s,
        })
      }
    }

    for (const line of site.inventory) {
      const s = best(q, line.skuId, line.name, ZONE_LABEL[line.zone] ?? line.zone)
      if (s > 0) {
        results.push({
          ref: { kind: 'sku', id: line.skuId, siteId: site.id },
          group: 'Products',
          title: line.skuId,
          subtitle: `${line.name} · ${line.onHand.toLocaleString('en-GB')} ${line.unit}`,
          zone: line.zone,
          score: s - (line.status === 'in' ? 20 : 0),
        })
      }
    }
  }

  results.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))

  // Keep groups contiguous once sorted, so the list reads as sections.
  const order = ['Sites', 'Vehicles', 'Shipments', 'Forklifts', 'Products', 'Pallets in motion']
  results.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group))

  return results.slice(0, 40)
}
