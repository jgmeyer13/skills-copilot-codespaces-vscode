/**
 * Demo mode: a scripted camera tour with real events fired on cue.
 *
 * The incidents are not faked for the recording — `injectEvent` reaches into the
 * running engine and genuinely holds dock doors open or empties a product line,
 * and the thermal model, the alert rules and the rescue dispatch all respond as
 * they normally would. Only the *timing* is scripted, so a screen recording
 * doesn't have to wait for the simulation to misbehave on its own.
 */

import { useEffect, useRef } from 'react'
import { TICK_RATE } from '../sim/state.ts'
import { sendCommand, useStore } from '../state/store.ts'
import type { ClientCommand, EntityRef } from '../sim/types.ts'

interface Step {
  /** Wall-clock milliseconds this step runs for. */
  hold: number
  caption: string
  /** Where to point the camera, resolved against the current snapshot. */
  focus?: (siteIds: string[], pick: Picker) => EntityRef | null
  command?: (siteIds: string[]) => ClientCommand | null
  speed?: number
}

interface Picker {
  truck: (siteId: string) => string | null
  forklift: (siteId: string) => string | null
  bay: (siteId: string) => string | null
  worstAlert: () => EntityRef | null
}

const STEPS: Step[] = [
  {
    hold: 7000,
    caption: 'Keflavík Cold Port — fresh catch inbound, pharma on the North Atlantic rotation.',
    // The tour narrates Keflavík first, so it starts by going there rather than
    // describing it over whichever site the viewer happened to be looking at.
    command: (sites) => ({ type: 'setActiveSite', siteId: sites[0] ?? '' }),
    focus: (sites) => ({ kind: 'site', id: sites[0] ?? '', siteId: sites[0] ?? '' }),
    speed: TICK_RATE,
  },
  {
    hold: 9000,
    caption: 'Every dock door is allocated to a thermal zone. The colour tells you what a bay is for.',
    focus: (sites, pick) => {
      const site = sites[0] ?? ''
      const bay = pick.bay(site)
      return bay ? { kind: 'bay', id: bay, siteId: site } : null
    },
  },
  {
    hold: 9000,
    caption: 'A reefer reverses onto the dock. The trailer seals the opening — that is what keeps the zone in band.',
    focus: (sites, pick) => {
      const site = sites[0] ?? ''
      const truck = pick.truck(site)
      return truck ? { kind: 'truck', id: truck, siteId: site } : null
    },
    speed: TICK_RATE,
  },
  {
    hold: 9000,
    caption: 'Inside, forklifts run put-aways and picks. Stock rotates first-expired-first-out.',
    focus: (sites, pick) => {
      const site = sites[0] ?? ''
      const fl = pick.forklift(site)
      return fl ? { kind: 'forklift', id: fl, siteId: site } : null
    },
  },
  {
    hold: 3000,
    caption: 'Now hold the ultra-cold doors open, and watch what the model does.',
    command: (sites) => ({ type: 'injectEvent', kind: 'excursion', siteId: sites[0] ?? '' }),
    speed: TICK_RATE * 5,
  },
  {
    hold: 11000,
    caption: 'The zone leaves its band, stock starts burning thermal budget, and rescues jump the queue.',
    focus: (_, pick) => pick.worstAlert(),
  },
  {
    hold: 8000,
    caption: 'Every alert is a place. Clicking one flies the camera to the problem.',
    focus: (_, pick) => pick.worstAlert(),
  },
  {
    hold: 7000,
    caption: 'Trondheim Fjord Depot — ten doors, the busiest yard on the network.',
    command: (sites) => ({ type: 'setActiveSite', siteId: sites[2] ?? sites[0] ?? '' }),
    speed: TICK_RATE * 5,
  },
  {
    hold: 9000,
    caption: 'Same engine, same contract, different site. Run it at twenty times and the day turns over.',
    focus: (sites) => ({ kind: 'site', id: sites[2] ?? '', siteId: sites[2] ?? '' }),
    speed: TICK_RATE * 20,
  },
  {
    hold: 14000,
    caption: 'Dusk, then the aurora. Cold weather is free refrigeration — the thermal model knows it.',
    speed: TICK_RATE * 20,
  },
  {
    hold: 6000,
    caption: 'Kelvin° — cold chain command.',
    speed: TICK_RATE * 5,
    focus: (sites) => ({ kind: 'site', id: sites[2] ?? '', siteId: sites[2] ?? '' }),
  },
]

export function DemoTour(): null {
  const demoMode = useStore((s) => s.demoMode)
  const setDemoCaption = useStore((s) => s.setDemoCaption)
  const setDemoMode = useStore((s) => s.setDemoMode)
  const focusOn = useStore((s) => s.focusOn)
  const stepRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!demoMode) {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = null
      stepRef.current = 0
      setDemoCaption('')
      return
    }

    let cancelled = false

    const run = (): void => {
      if (cancelled) return
      const step = STEPS[stepRef.current]
      if (!step) {
        setDemoMode(false)
        return
      }

      const snapshot = useStore.getState().snapshot
      const siteIds = snapshot?.sites.map((s) => s.id) ?? []

      const pick: Picker = {
        truck: (siteId) => {
          const site = snapshot?.sites.find((s) => s.id === siteId)
          const docking = site?.trucks.find((t) => t.phase === 'reversing' || t.phase === 'approach')
          return (docking ?? site?.trucks.find((t) => t.phase !== 'gone'))?.id ?? null
        },
        forklift: (siteId) => {
          const site = snapshot?.sites.find((s) => s.id === siteId)
          const busy = site?.forklifts.find((f) => f.carryingPalletId !== '')
          return (busy ?? site?.forklifts[0])?.id ?? null
        },
        bay: (siteId) => {
          const site = snapshot?.sites.find((s) => s.id === siteId)
          const occupied = site?.doors.find((d) => d.openness > 0.4)
          return occupied?.bayId ?? site?.doors[0]?.bayId ?? null
        },
        worstAlert: () => {
          const alerts = snapshot?.alerts ?? []
          const critical = alerts.find((a) => a.severity === 'critical') ?? alerts[0]
          return critical?.focus ?? null
        },
      }

      setDemoCaption(step.caption)
      if (step.speed !== undefined) {
        sendCommand({ type: 'setPaused', paused: false })
        sendCommand({ type: 'setSpeed', speed: step.speed })
      }
      const command = step.command?.(siteIds)
      if (command) sendCommand(command)

      // Let a site switch land before pointing the camera at something in it.
      const target = step.focus?.(siteIds, pick) ?? null
      if (target) {
        setTimeout(() => {
          if (!cancelled) focusOn(target)
        }, command ? 420 : 0)
      }

      stepRef.current += 1
      timerRef.current = setTimeout(run, step.hold)
    }

    run()

    return () => {
      cancelled = true
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [demoMode, focusOn, setDemoCaption, setDemoMode])

  return null
}

/** The caption strip. Separate component so the tour itself renders nothing. */
export function DemoCaption(): React.ReactElement | null {
  const demoMode = useStore((s) => s.demoMode)
  const caption = useStore((s) => s.demoCaption)
  if (!demoMode || !caption) return null
  return (
    <div className="demo-caption" role="status" aria-live="polite">
      <span className="demo-caption-bar" aria-hidden="true" />
      <p>{caption}</p>
    </div>
  )
}
