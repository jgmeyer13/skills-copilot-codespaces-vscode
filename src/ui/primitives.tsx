/**
 * Shared UI pieces.
 *
 * Deliberately small and unstyled-by-default: the identity lives in the tokens
 * and in `dashboard.css`, not in a component library. Every interactive element
 * here is a real button or a real input, so keyboard access and focus come for
 * free rather than being retrofitted.
 */

import { useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'

// ─────────────────────────────────────────────────────────────────────────────

export function Panel({
  title,
  subtitle,
  actions,
  children,
  className = '',
  scroll = false,
}: {
  title?: string
  subtitle?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  scroll?: boolean
}): React.ReactElement {
  return (
    <section className={`panel ${className}`}>
      {(title || actions) && (
        <header className="panel-head">
          {title && (
            <div className="panel-head-text">
              <h2 className="panel-title">{title}</h2>
              {subtitle && <div className="panel-sub">{subtitle}</div>}
            </div>
          )}
          {actions && <div className="panel-actions">{actions}</div>}
        </header>
      )}
      <div className={scroll ? 'panel-body panel-body-scroll' : 'panel-body'}>{children}</div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

export type Tone = 'ok' | 'warn' | 'critical' | 'idle' | 'accent'

export function Badge({
  tone = 'idle',
  children,
  dot = false,
}: {
  tone?: Tone
  children: ReactNode
  dot?: boolean
}): React.ReactElement {
  return (
    <span className={`badge badge-${tone}`}>
      {dot && <span className="badge-dot" aria-hidden="true" />}
      {children}
    </span>
  )
}

/** A zone chip. Colour is semantic here — it is the thermal class. */
export function ZoneChip({ zone, label }: { zone: string; label?: string }): React.ReactElement {
  return (
    <span className="zone-chip" style={{ ['--chip' as string]: `var(--zone-${zone.toLowerCase()})` }}>
      <span className="zone-chip-dot" aria-hidden="true" />
      {label ?? zone}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

export function Bar({
  value,
  tone = 'accent',
  height = 4,
  label,
}: {
  value: number
  tone?: Tone
  height?: number
  label?: string
}): React.ReactElement {
  const clamped = Math.max(0, Math.min(1, value))
  return (
    <div
      className={`bar bar-${tone}`}
      style={{ height }}
      role="progressbar"
      aria-valuenow={Math.round(clamped * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div className="bar-fill" style={{ width: `${clamped * 100}%` }} />
    </div>
  )
}

/**
 * A sparkline over recent values. Drawn as an SVG polyline with an area fill and
 * an emphasised endpoint, so a KPI tile shows direction as well as a number.
 */
export function Sparkline({
  values,
  tone = 'accent',
  width = 64,
  height = 20,
}: {
  values: number[]
  tone?: Tone
  width?: number
  height?: number
}): React.ReactElement | null {
  const id = useId()
  if (values.length < 2) return null

  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const step = width / (values.length - 1)
  const points = values.map((v, i) => [i * step, height - ((v - min) / span) * (height - 3) - 1.5] as const)
  const line = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area = `0,${height} ${line} ${width},${height}`
  const last = points[points.length - 1]

  return (
    <svg className={`spark spark-${tone}`} width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#g${id})`} />
      <polyline points={line} fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
      {last && <circle cx={last[0]} cy={last[1]} r="1.9" fill="currentColor" />}
    </svg>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

export interface TabDef<T extends string> {
  id: T
  label: string
  count?: number
}

/**
 * Tabs with full arrow-key support. The roving tabindex keeps one stop in the
 * tab order, which is what the WAI-ARIA tabs pattern expects.
 */
export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
  label,
}: {
  tabs: TabDef<T>[]
  active: T
  onChange: (id: T) => void
  label: string
}): React.ReactElement {
  const listRef = useRef<HTMLDivElement>(null)

  const move = (direction: 1 | -1): void => {
    const index = tabs.findIndex((t) => t.id === active)
    const next = tabs[(index + direction + tabs.length) % tabs.length]
    if (!next) return
    onChange(next.id)
    const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
    buttons?.[tabs.indexOf(next)]?.focus()
  }

  return (
    <div className="tabs" role="tablist" aria-label={label} ref={listRef}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          type="button"
          aria-selected={tab.id === active}
          tabIndex={tab.id === active ? 0 : -1}
          className={`tab ${tab.id === active ? 'tab-active' : ''}`}
          onClick={() => onChange(tab.id)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowRight') {
              event.preventDefault()
              move(1)
            }
            if (event.key === 'ArrowLeft') {
              event.preventDefault()
              move(-1)
            }
          }}
        >
          {tab.label}
          {tab.count !== undefined && <span className="tab-count">{tab.count}</span>}
        </button>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

/** Close on Escape and on a click outside. Used by every popover in the top bar. */
export function useDismiss(open: boolean, onClose: () => void): React.RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
    }
    const onPointer = (event: PointerEvent): void => {
      if (!ref.current) return
      if (!ref.current.contains(event.target as Node)) onClose()
    }
    document.addEventListener('keydown', onKey)
    // Capture phase, so a click on another trigger closes this one first.
    document.addEventListener('pointerdown', onPointer, true)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer, true)
    }
  }, [open, onClose])

  return ref
}

/** Trap focus inside a container while it is open — for the palette and dialogs. */
export function useFocusTrap(active: boolean): React.RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!active || !ref.current) return
    const container = ref.current
    const previous = document.activeElement as HTMLElement | null

    const selector =
      'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'

    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Tab') return
      const items = [...container.querySelectorAll<HTMLElement>(selector)].filter(
        (el) => el.offsetParent !== null,
      )
      if (items.length === 0) return
      const first = items[0] as HTMLElement
      const last = items[items.length - 1] as HTMLElement
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    container.addEventListener('keydown', onKey)
    return () => {
      container.removeEventListener('keydown', onKey)
      previous?.focus?.()
    }
  }, [active])

  return ref
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * A value that eases toward its target, so KPI figures roll rather than jump.
 *
 * When easing is off (reduced motion) the target is returned directly rather
 * than pushed through state — the same result with no render, and it keeps the
 * hook honest about having no effect to run.
 */
export function useEased(target: number, enabled = true): number {
  const [value, setValue] = useState(target)
  const frame = useRef(0)
  const current = useRef(target)

  useEffect(() => {
    if (!enabled) return
    const tick = (): void => {
      const diff = target - current.current
      if (Math.abs(diff) < 0.01) {
        current.current = target
        setValue(target)
        return
      }
      current.current += diff * 0.18
      setValue(current.current)
      frame.current = requestAnimationFrame(tick)
    }
    frame.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame.current)
  }, [target, enabled])

  return enabled ? value : target
}

export function Empty({ children }: { children: ReactNode }): React.ReactElement {
  return <div className="empty">{children}</div>
}
