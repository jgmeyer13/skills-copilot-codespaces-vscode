/**
 * The top bar: identity, site switcher, search, live clock, alerts and account.
 *
 * Everything here reads from the throttled store rather than the live bus — a
 * clock that updates sixty times a second is no more useful than one updating
 * six times, and it would re-render the whole bar on every frame.
 */

import { useMemo } from 'react'
import { Logo } from './Logo.tsx'
import { useDismiss } from './primitives.tsx'
import { clock, degrees, pct, WEATHER_LABEL } from './format.ts'
import { activeSite, sendCommand, useStore } from '../state/store.ts'
import type { Alert, SiteSnapshot } from '../sim/types.ts'

export function TopBar(): React.ReactElement {
  const snapshot = useStore((s) => s.snapshot)
  const statics = useStore((s) => s.statics)
  const status = useStore((s) => s.status)
  const sourceKind = useStore((s) => s.sourceKind)
  const setPaletteOpen = useStore((s) => s.setPaletteOpen)

  const site = activeSite(snapshot)
  const layout = statics?.layouts.find((l) => l.id === site?.id)

  return (
    <header className="topbar" role="banner">
      <div className="topbar-left">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <Logo size={19} />
          </span>
          <span className="brand-word">
            KELVIN<span className="brand-deg">°</span>
          </span>
        </div>
        <span className="brand-rule" aria-hidden="true" />
        <SiteSwitcher />
      </div>

      <button type="button" className="search-trigger" onClick={() => setPaletteOpen(true)}>
        <SearchIcon />
        <span className="search-trigger-text">
          Search sites, trucks, forklifts, pallets, shipments…
        </span>
        <kbd className="kbd">
          <span aria-hidden="true">⌘</span>K
        </kbd>
      </button>

      <div className="topbar-right">
        {layout && site && <WeatherReadout site={site} region={layout.region} />}
        <LiveClock />
        <ConnectionPip status={status} kind={sourceKind} />
        <Notifications />
        <UserMenu />
      </div>
    </header>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

function SiteSwitcher(): React.ReactElement {
  const snapshot = useStore((s) => s.snapshot)
  const statics = useStore((s) => s.statics)
  const open = useStore((s) => s.siteMenuOpen)
  const setOpen = useStore((s) => s.setSiteMenuOpen)
  const ref = useDismiss(open, () => setOpen(false))

  const active = activeSite(snapshot)
  const layout = statics?.layouts.find((l) => l.id === active?.id)

  const capacity = active?.metrics.capacityPct ?? 0
  const bays = active ? `${active.metrics.baysOccupied}/${active.metrics.baysTotal}` : '—'

  return (
    <div className="popover-host" ref={ref}>
      <button
        type="button"
        className="site-trigger"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen(!open)}
      >
        <span className="site-code">{active?.id ?? '—'}</span>
        <span className="site-trigger-text">
          <span className="site-name">{layout?.shortName ?? 'Loading'}</span>
          <span className="site-meta">
            {pct(capacity, 0)} full · {bays} docked
          </span>
        </span>
        <ChevronIcon />
      </button>

      {open && (
        <div className="popover popover-site" role="menu" aria-label="Switch site">
          {statics?.layouts.map((candidate) => {
            const data = snapshot?.sites.find((s) => s.id === candidate.id)
            const isActive = candidate.id === active?.id
            return (
              <button
                key={candidate.id}
                type="button"
                role="menuitemradio"
                aria-checked={isActive}
                className={`site-option ${isActive ? 'site-option-active' : ''}`}
                onClick={() => {
                  sendCommand({ type: 'setActiveSite', siteId: candidate.id })
                  setOpen(false)
                }}
              >
                <span className="site-option-code">{candidate.id}</span>
                <span className="site-option-body">
                  <span className="site-option-name">{candidate.name}</span>
                  <span className="site-option-sub">
                    {candidate.region}, {candidate.country}
                  </span>
                </span>
                <span className="site-option-stats">
                  <StatusDot status={data?.status ?? 'operational'} />
                  <span className="mono site-option-cap">{data ? pct(data.metrics.capacityPct, 0) : '—'}</span>
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function StatusDot({ status }: { status: string }): React.ReactElement {
  const tone = status === 'critical' ? 'critical' : status === 'degraded' ? 'warn' : 'ok'
  return <span className={`status-dot status-dot-${tone}`} title={status} aria-label={status} role="img" />
}

// ─────────────────────────────────────────────────────────────────────────────

function WeatherReadout({ site, region }: { site: SiteSnapshot; region: string }): React.ReactElement {
  return (
    <div className="weather" title={`${region} — ${WEATHER_LABEL[site.weather.kind]}`}>
      <WeatherIcon kind={site.weather.kind} />
      <span className="weather-text">
        <span className="mono weather-temp">{degrees(site.weather.ambientC, 1)}</span>
        <span className="weather-sub">
          {WEATHER_LABEL[site.weather.kind]} · {Math.round(site.weather.windKph)} km/h
        </span>
      </span>
    </div>
  )
}

function LiveClock(): React.ReactElement {
  const snapshot = useStore((s) => s.snapshot)
  const statics = useStore((s) => s.statics)
  const layout = statics?.layouts.find((l) => l.id === snapshot?.activeSiteId)

  // Site-local time, which is the only time an operations desk cares about.
  const label = snapshot ? clock(snapshot.clock.minuteOfDay) : '--:--'
  const day = snapshot ? `Day ${snapshot.clock.day + 1}` : ''
  const zone = layout?.timezone.split('/')[1]?.replace('_', ' ') ?? ''

  return (
    <div className="clock" title={layout?.timezone}>
      <span className="mono clock-time">{label}</span>
      <span className="clock-sub">
        {day} · {zone}
      </span>
    </div>
  )
}

function ConnectionPip({ status, kind }: { status: string; kind: string }): React.ReactElement {
  const tone = status === 'live' ? 'ok' : status === 'error' ? 'critical' : 'warn'
  const label =
    status === 'live' ? (kind === 'remote' ? 'Live · server' : 'Live · in-browser') : status
  return (
    <div className={`pip pip-${tone}`} title={`Data source: ${kind} (${status})`}>
      <span className="pip-dot" aria-hidden="true" />
      <span className="pip-text">{label}</span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

function Notifications(): React.ReactElement {
  const snapshot = useStore((s) => s.snapshot)
  const open = useStore((s) => s.notificationsOpen)
  const setOpen = useStore((s) => s.setNotificationsOpen)
  const focusOn = useStore((s) => s.focusOn)
  const ref = useDismiss(open, () => setOpen(false))

  const alerts = useMemo(() => snapshot?.alerts ?? [], [snapshot])
  const unread = alerts.filter((a) => !a.acknowledged && a.severity !== 'info').length
  const bySite = useMemo(() => {
    const groups = new Map<string, Alert[]>()
    for (const alert of alerts) {
      const list = groups.get(alert.siteId) ?? []
      list.push(alert)
      groups.set(alert.siteId, list)
    }
    return [...groups.entries()]
  }, [alerts])

  return (
    <div className="popover-host" ref={ref}>
      <button
        type="button"
        className="icon-button"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`Notifications, ${unread} needing attention`}
        onClick={() => setOpen(!open)}
      >
        <BellIcon />
        {unread > 0 && <span className="icon-badge">{unread > 9 ? '9+' : unread}</span>}
      </button>

      {open && (
        <div className="popover popover-notifications" role="dialog" aria-label="Notifications">
          <header className="popover-head">
            <span>Network alerts</span>
            <span className="mono popover-count">{alerts.length}</span>
          </header>
          <div className="popover-scroll">
            {alerts.length === 0 && <div className="empty">Every site is inside its thermal band.</div>}
            {bySite.map(([siteId, list]) => (
              <div key={siteId} className="notif-group">
                <div className="notif-group-head">{siteId}</div>
                {list.slice(0, 6).map((alert) => (
                  <button
                    key={alert.id}
                    type="button"
                    className="notif"
                    onClick={() => {
                      if (alert.siteId !== snapshot?.activeSiteId) {
                        sendCommand({ type: 'setActiveSite', siteId: alert.siteId })
                      }
                      focusOn(alert.focus)
                      setOpen(false)
                    }}
                  >
                    <span className={`notif-rail notif-rail-${alert.severity}`} aria-hidden="true" />
                    <span className="notif-body">
                      <span className="notif-title">{alert.title}</span>
                      <span className="notif-detail">{alert.detail}</span>
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

function UserMenu(): React.ReactElement {
  const open = useStore((s) => s.userMenuOpen)
  const setOpen = useStore((s) => s.setUserMenuOpen)
  const reducedMotion = useStore((s) => s.reducedMotion)
  const setReducedMotion = useStore((s) => s.setReducedMotion)
  const perfOpen = useStore((s) => s.perfOpen)
  const setPerfOpen = useStore((s) => s.setPerfOpen)
  const setHelpOpen = useStore((s) => s.setHelpOpen)
  const ref = useDismiss(open, () => setOpen(false))

  return (
    <div className="popover-host" ref={ref}>
      <button
        type="button"
        className="user-trigger"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen(!open)}
      >
        <span className="avatar" aria-hidden="true">
          AS
        </span>
        <span className="user-text">
          <span className="user-name">A. Sigurðardóttir</span>
          <span className="user-role">Network duty manager</span>
        </span>
        <ChevronIcon />
      </button>

      {open && (
        <div className="popover popover-user" role="menu" aria-label="Account">
          <div className="user-card">
            <span className="avatar avatar-lg" aria-hidden="true">
              AS
            </span>
            <div>
              <div className="user-name">A. Sigurðardóttir</div>
              <div className="user-role">Network duty manager · Keflavík</div>
            </div>
          </div>
          <div className="popover-sep" />
          <label className="menu-toggle">
            <input
              type="checkbox"
              checked={reducedMotion}
              onChange={(event) => {
                setReducedMotion(event.target.checked)
                document.documentElement.dataset.reducedMotion = String(event.target.checked)
              }}
            />
            <span>Reduce motion</span>
            <span className="menu-hint">Stops camera flights and weather</span>
          </label>
          {/* Every shortcut in this app is also reachable by clicking something,
              and P was the only one that wasn't. */}
          <label className="menu-toggle">
            <input
              type="checkbox"
              checked={perfOpen}
              onChange={(event) => setPerfOpen(event.target.checked)}
            />
            <span>Frame-rate readout</span>
            <span className="menu-hint">fps, draw calls and triangles · P</span>
          </label>
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            onClick={() => {
              setHelpOpen(true)
              setOpen(false)
            }}
          >
            Keyboard shortcuts
            <kbd className="kbd">?</kbd>
          </button>
          <div className="popover-sep" />
          <div className="menu-foot">
            Kelvin network · 3 sites · build {__BUILD_ID__}
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Icons — inline so nothing is fetched
// ─────────────────────────────────────────────────────────────────────────────

function SearchIcon(): React.ReactElement {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5 14 14" strokeLinecap="round" />
    </svg>
  )
}

function ChevronIcon(): React.ReactElement {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="m4 6 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function BellIcon(): React.ReactElement {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M4 6.5a4 4 0 0 1 8 0c0 3 1 4 1 4H3s1-1 1-4Z" strokeLinejoin="round" />
      <path d="M6.5 13a1.6 1.6 0 0 0 3 0" strokeLinecap="round" />
    </svg>
  )
}

function WeatherIcon({ kind }: { kind: string }): React.ReactElement {
  const common = { width: 15, height: 15, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4 }
  if (kind === 'clear') {
    return (
      <svg {...common} aria-hidden="true">
        <circle cx="8" cy="8" r="3" />
        <path d="M8 1.5v1.2M8 13.3v1.2M1.5 8h1.2M13.3 8h1.2M3.4 3.4l.85.85M11.75 11.75l.85.85M12.6 3.4l-.85.85M4.25 11.75l-.85.85" strokeLinecap="round" />
      </svg>
    )
  }
  if (kind === 'snow' || kind === 'sleet') {
    return (
      <svg {...common} aria-hidden="true">
        <path d="M4.5 9.5a2.6 2.6 0 0 1 .3-5.18 3.4 3.4 0 0 1 6.56.68A2.3 2.3 0 0 1 11 9.5Z" strokeLinejoin="round" />
        <path d="M5.5 12v1M8 12.5v1.4M10.5 12v1" strokeLinecap="round" />
      </svg>
    )
  }
  if (kind === 'gale') {
    return (
      <svg {...common} aria-hidden="true">
        <path d="M1.8 5.5h7.4a2 2 0 1 0-2-2M1.8 8.6h9.6a2 2 0 1 1-2 2M1.8 11.6h5.4" strokeLinecap="round" />
      </svg>
    )
  }
  if (kind === 'fog') {
    return (
      <svg {...common} aria-hidden="true">
        <path d="M2.5 6.5h11M1.8 9h12.4M3.2 11.5h9.6" strokeLinecap="round" />
      </svg>
    )
  }
  return (
    <svg {...common} aria-hidden="true">
      <path d="M4.5 11.5a2.8 2.8 0 0 1 .3-5.58 3.6 3.6 0 0 1 6.94.72A2.45 2.45 0 0 1 11.2 11.5Z" strokeLinejoin="round" />
    </svg>
  )
}

export { StatusDot }
