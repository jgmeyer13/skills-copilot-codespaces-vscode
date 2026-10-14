/**
 * Application shell.
 *
 * Layout is a full-bleed 3D canvas with the dashboard floating over it in a CSS
 * grid. The chrome never gets its own opaque background sheet — the glass panels
 * sit directly on the world, which is the whole visual premise.
 */

import { useEffect, useState } from 'react'
import { Scene } from '../three/Scene.tsx'
import { Logo } from './Logo.tsx'
import { TopBar } from './TopBar.tsx'
import { AlertsRail, Inspector, KpiRow, OpsTable, ShipmentTracker, SitePanel } from './Panels.tsx'
import { CameraControls, ShortcutSheet, SimControls, Toasts } from './Controls.tsx'
import { CommandPalette } from './CommandPalette.tsx'
import { DemoCaption, DemoTour } from './DemoTour.tsx'
import { useKeyboard } from './useKeyboard.ts'
import { installDebugBridge } from './debugBridge.ts'
import { connectStore, setActiveSource, useStore } from '../state/store.ts'
import { createDataSource, resolveConfig } from '../data/index.ts'
import '../styles/dashboard.css'

export function App(): React.ReactElement {
  const statics = useStore((s) => s.statics)
  const status = useStore((s) => s.status)
  const statusDetail = useStore((s) => s.statusDetail)
  const setReducedMotion = useStore((s) => s.setReducedMotion)
  const setDemoMode = useStore((s) => s.setDemoMode)
  const [error, setError] = useState<string | null>(null)

  useKeyboard()

  // Honour the OS preference on load and whenever it changes.
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const apply = (): void => {
      setReducedMotion(query.matches)
      document.documentElement.dataset.reducedMotion = String(query.matches)
    }
    apply()
    query.addEventListener('change', apply)
    return () => query.removeEventListener('change', apply)
  }, [setReducedMotion])

  useEffect(() => {
    installDebugBridge()
    const config = resolveConfig()
    const source = createDataSource(config)
    setActiveSource(source)
    const disconnect = connectStore(source)
    source.connect().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))

    // ?demo=1 starts the tour straight away, for unattended screen recording.
    if (new URLSearchParams(window.location.search).get('demo') === '1') {
      setTimeout(() => setDemoMode(true), 1200)
    }

    return () => {
      disconnect()
      source.disconnect()
      setActiveSource(null)
    }
  }, [setDemoMode])

  const booting = !statics

  return (
    <div className="app-shell">
      <Scene />

      <div className="dashboard" data-booting={booting ? 'true' : 'false'}>
        <TopBar />

        <div className="stage">
          <div className="col-left">
            <KpiRow />
            <AlertsRail />
          </div>

          <div className="col-right">
            <SitePanel />
          </div>
        </div>

        <div className="dock-row">
          <div className="dock-left">
            <ShipmentTracker />
            <SimControls />
          </div>
          <OpsTable />
        </div>

        <div className="floating-camera">
          <CameraControls />
        </div>
      </div>

      <Inspector />
      <CommandPalette />
      <ShortcutSheet />
      <Toasts />
      <DemoTour />
      <DemoCaption />

      {booting && <BootScreen error={error ?? (status === 'error' ? statusDetail : null)} />}
    </div>
  )
}

function BootScreen({ error }: { error: string | null }): React.ReactElement {
  return (
    <div className="boot" role="status" aria-live="polite">
      <div className="boot-inner">
        <span className="boot-mark" aria-hidden="true">
          <Logo size={40} />
        </span>
        <div className="boot-word">
          KELVIN<span className="brand-deg">°</span>
        </div>
        <div className="boot-tag">Cold chain command</div>
        <div className={`boot-sub ${error ? 'boot-error' : ''}`}>
          {error ?? 'Spinning up the North Atlantic network…'}
        </div>
        {!error && <div className="boot-bar"><span /></div>}
      </div>
    </div>
  )
}
