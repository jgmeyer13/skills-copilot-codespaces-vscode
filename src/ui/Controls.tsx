/**
 * Simulation transport, camera controls, toasts and the shortcuts sheet.
 *
 * The transport is deliberately explicit about determinism: the seed is shown,
 * editable, and resetting with the same seed reproduces the run exactly. That is
 * a real property of the engine rather than a label, and it is the thing that
 * makes a bug in this system reportable.
 */

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { TICK_RATE } from '../sim/state.ts'
import { parseSeed } from '../sim/rng.ts'
import { sendCommand, useStore } from '../state/store.ts'
import { useDismiss, useFocusTrap } from './primitives.tsx'
import { compact, int } from './format.ts'
import { ignorePerf, perfGrade, perfSnapshot, subscribePerf } from './perf.ts'

const SPEEDS = [
  { label: '1×', value: TICK_RATE },
  { label: '5×', value: TICK_RATE * 5 },
  { label: '20×', value: TICK_RATE * 20 },
] as const

export function SimControls(): React.ReactElement | null {
  const snapshot = useStore((s) => s.snapshot)
  const demoMode = useStore((s) => s.demoMode)
  const setDemoMode = useStore((s) => s.setDemoMode)
  // `null` means "not edited yet", so the field shows the live seed until the
  // user types. Deriving it this way avoids syncing state from props in an effect.
  const [seedEdit, setSeedEdit] = useState<string | null>(null)
  const [seedOpen, setSeedOpen] = useState(false)
  const seedRef = useDismiss(seedOpen, () => setSeedOpen(false))

  if (!snapshot) return null
  const seedText = seedEdit ?? String(snapshot.seed)
  const paused = snapshot.paused

  return (
    <div className="transport" role="group" aria-label="Simulation controls">
      <button
        type="button"
        className={`transport-play ${paused ? 'is-paused' : ''}`}
        aria-pressed={paused}
        aria-label={paused ? 'Resume simulation' : 'Pause simulation'}
        onClick={() => sendCommand({ type: 'setPaused', paused: !paused })}
      >
        {paused ? <PlayIcon /> : <PauseIcon />}
      </button>

      <div className="speed-group" role="radiogroup" aria-label="Simulation speed">
        {SPEEDS.map((speed) => (
          <button
            key={speed.label}
            type="button"
            role="radio"
            aria-checked={snapshot.speed === speed.value && !paused}
            className={`speed ${snapshot.speed === speed.value ? 'speed-active' : ''}`}
            onClick={() => {
              sendCommand({ type: 'setSpeed', speed: speed.value })
              if (paused) sendCommand({ type: 'setPaused', paused: false })
            }}
          >
            {speed.label}
          </button>
        ))}
      </div>

      <span className="transport-sep" aria-hidden="true" />

      <div className="popover-host" ref={seedRef}>
        <button
          type="button"
          className="transport-seed"
          aria-expanded={seedOpen}
          onClick={() => setSeedOpen(!seedOpen)}
          title="This run is reproducible from its seed"
        >
          <span className="transport-seed-label">seed</span>
          <span className="mono">{snapshot.seed}</span>
        </button>
        {seedOpen && (
          <div className="popover popover-seed" role="dialog" aria-label="Reset with a seed">
            <p className="seed-note">
              The engine is deterministic: the same seed replays this world exactly, tick for tick.
            </p>
            <form
              className="seed-form"
              onSubmit={(event) => {
                event.preventDefault()
                sendCommand({ type: 'reset', seed: parseSeed(seedText) })
                setSeedEdit(null)
                setSeedOpen(false)
              }}
            >
              <label className="seed-label" htmlFor="seed-input">
                Seed
              </label>
              <input
                id="seed-input"
                className="mono seed-input"
                value={seedText}
                onChange={(event) => setSeedEdit(event.target.value)}
                spellCheck={false}
                autoComplete="off"
              />
              <div className="seed-actions">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => setSeedEdit(String(Math.floor(Math.random() * 1e9)))}
                >
                  Randomise
                </button>
                <button type="submit" className="primary-button">
                  Reset world
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      <span className="transport-sep" aria-hidden="true" />

      <button
        type="button"
        className={`demo-button ${demoMode ? 'demo-active' : ''}`}
        aria-pressed={demoMode}
        onClick={() => setDemoMode(!demoMode)}
      >
        <span className="demo-dot" aria-hidden="true" />
        {demoMode ? 'Stop tour' : 'Demo tour'}
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

const VIEWS: { id: 'site' | 'dock' | 'floor'; label: string; hint: string }[] = [
  { id: 'site', label: 'Site', hint: 'The whole operation' },
  { id: 'dock', label: 'Dock', hint: 'Across the dock face' },
  { id: 'floor', label: 'Floor', hint: 'Inside, down an aisle' },
]

export function CameraControls(): React.ReactElement {
  const [view, setView] = useState<'site' | 'dock' | 'floor'>('site')

  const go = (preset: 'site' | 'dock' | 'floor'): void => {
    setView(preset)
    window.dispatchEvent(new CustomEvent('kelvin:camera-preset', { detail: preset }))
  }

  return (
    <div className="camera-controls" role="group" aria-label="Camera">
      <div className="view-group" role="radiogroup" aria-label="Camera view">
        {VIEWS.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={view === option.id}
            title={option.hint}
            className={`view-button ${view === option.id ? 'view-active' : ''}`}
            onClick={() => go(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
      <div className="camera-hint">
        <span>Drag to orbit</span>
        <span>Scroll to zoom</span>
        <span>Click anything</span>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

export function Toasts(): React.ReactElement {
  const toasts = useStore((s) => s.toasts)
  const dismiss = useStore((s) => s.dismissToast)

  useEffect(() => {
    if (toasts.length === 0) return
    const timers = toasts.map((toast) => setTimeout(() => dismiss(toast.id), 7000))
    return () => timers.forEach(clearTimeout)
  }, [toasts, dismiss])

  return (
    <div className="toasts" role="status" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.severity}`}>
          <span className="toast-rail" aria-hidden="true" />
          <div className="toast-body">
            <div className="toast-title">{toast.title}</div>
            <div className="toast-detail">{toast.detail}</div>
          </div>
          <button type="button" className="icon-button toast-close" aria-label="Dismiss" onClick={() => dismiss(toast.id)}>
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path d="m3 3 6 6M9 3l-6 6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

const SHORTCUTS: [string, string][] = [
  ['⌘K / Ctrl K', 'Open the command palette'],
  ['/', 'Jump straight to search'],
  ['Space', 'Pause or resume the simulation'],
  ['1 · 2 · 3', 'Set speed to 1×, 5× or 20×'],
  ['R', 'Reset the camera to the site view'],
  ['D', 'Start or stop the demo tour'],
  ['P', 'Show the frame-rate readout'],
  ['[  ·  ]', 'Previous or next site'],
  ['A', 'Focus the most severe open alert'],
  ['Click Site/Dock/Floor', 'Switch camera view'],
  ['Esc', 'Close panels and clear selection'],
  ['?', 'Show this sheet'],
]

export function ShortcutSheet(): React.ReactElement | null {
  const open = useStore((s) => s.helpOpen)
  const setOpen = useStore((s) => s.setHelpOpen)
  const trapRef = useFocusTrap(open)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (open) closeRef.current?.focus()
  }, [open])

  if (!open) return null
  return (
    <div className="overlay" onPointerDown={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" ref={trapRef}>
        <header className="sheet-head">
          <h2>Keyboard shortcuts</h2>
          <button ref={closeRef} type="button" className="icon-button" aria-label="Close" onClick={() => setOpen(false)}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path d="m3 3 6 6M9 3l-6 6" strokeLinecap="round" />
            </svg>
          </button>
        </header>
        <dl className="shortcut-list">
          {SHORTCUTS.map(([keys, description]) => (
            <div key={keys} className="shortcut">
              <dt><kbd className="kbd">{keys}</kbd></dt>
              <dd>{description}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * The frame-rate readout. Off by default, because a number that only matters
 * while you are tuning something does not belong in the composition the rest of
 * the time. P toggles it; `?perf=1` starts with it open.
 *
 * The render loop publishes a sample twice a second and this subscribes to it
 * through `useSyncExternalStore`, so the readout costs two renders a second
 * while open and nothing at all while closed.
 */
export function PerfBadge(): React.ReactElement | null {
  const open = useStore((s) => s.perfOpen)
  // Closed means subscribe to nothing, so a hidden readout cannot cause a
  // render twice a second for the rest of the session.
  const sample = useSyncExternalStore(open ? subscribePerf : ignorePerf, perfSnapshot)

  if (!open) return null

  return (
    <div className="perf" role="status" aria-label="Render performance">
      <span className={`perf-fps is-${perfGrade(sample.fps)}`}>
        <b className="mono">{sample.fps || '—'}</b> fps
      </span>
      <dl className="perf-stats">
        <div>
          <dt>frame</dt>
          <dd className="mono">{sample.frameMs ? `${sample.frameMs} ms` : '—'}</dd>
        </div>
        <div>
          <dt>calls</dt>
          <dd className="mono">{int(sample.calls)}</dd>
        </div>
        <div>
          <dt>tris</dt>
          <dd className="mono">{compact(sample.triangles)}</dd>
        </div>
        <div>
          <dt>dpr</dt>
          <dd className="mono">{sample.dpr.toFixed(2)}</dd>
        </div>
      </dl>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

function PlayIcon(): React.ReactElement {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M4.5 3.2v9.6l8-4.8z" />
    </svg>
  )
}

function PauseIcon(): React.ReactElement {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <rect x="4.2" y="3.4" width="2.7" height="9.2" rx="0.8" />
      <rect x="9.1" y="3.4" width="2.7" height="9.2" rx="0.8" />
    </svg>
  )
}
