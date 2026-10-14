/**
 * Global keyboard shortcuts.
 *
 * Every shortcut is also reachable by clicking something, so this is an
 * accelerator layer rather than the only route to a feature. Keystrokes are
 * ignored while focus is in a text field, which is what stops `1` changing the
 * simulation speed while someone is typing a seed.
 */

import { useEffect } from 'react'
import { TICK_RATE } from '../sim/state.ts'
import { sendCommand, useStore } from '../state/store.ts'

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

export function useKeyboard(): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const store = useStore.getState()
      const mod = event.metaKey || event.ctrlKey

      // The palette is modal and owns its own keys once open.
      if (mod && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        store.setPaletteOpen(!store.paletteOpen)
        return
      }

      if (event.key === 'Escape') {
        if (store.paletteOpen) {
          // The input handles Escape when it has focus, but focus can be
          // elsewhere (a result row, or the frame after opening), so close here
          // too rather than leaving the overlay stuck.
          store.setPaletteOpen(false)
          return
        }
        if (store.helpOpen) {
          store.setHelpOpen(false)
          return
        }
        if (store.notificationsOpen || store.userMenuOpen || store.siteMenuOpen) {
          store.closeAllMenus()
          return
        }
        if (store.selection) store.select(null)
        return
      }

      if (store.paletteOpen || store.helpOpen) return
      if (isTyping(event.target)) return
      if (mod || event.altKey) return

      const snapshot = store.snapshot

      switch (event.key) {
        case '/':
          event.preventDefault()
          store.setPaletteOpen(true)
          break

        case '?':
          event.preventDefault()
          store.setHelpOpen(true)
          break

        case ' ':
          event.preventDefault()
          if (snapshot) sendCommand({ type: 'setPaused', paused: !snapshot.paused })
          break

        case '1':
          sendCommand({ type: 'setSpeed', speed: TICK_RATE })
          sendCommand({ type: 'setPaused', paused: false })
          break
        case '2':
          sendCommand({ type: 'setSpeed', speed: TICK_RATE * 5 })
          sendCommand({ type: 'setPaused', paused: false })
          break
        case '3':
          sendCommand({ type: 'setSpeed', speed: TICK_RATE * 20 })
          sendCommand({ type: 'setPaused', paused: false })
          break

        case 'r':
        case 'R':
          window.dispatchEvent(new CustomEvent('kelvin:camera-preset', { detail: 'site' }))
          break

        case 'd':
        case 'D':
          store.setDemoMode(!store.demoMode)
          break

        case 'a':
        case 'A': {
          // Jump to the most severe open alert at the active site, then network-wide.
          if (!snapshot) break
          const here = snapshot.alerts.filter((x) => x.siteId === snapshot.activeSiteId)
          const target = here[0] ?? snapshot.alerts[0]
          if (target) {
            if (target.siteId !== snapshot.activeSiteId) {
              sendCommand({ type: 'setActiveSite', siteId: target.siteId })
            }
            store.focusOn(target.focus)
          }
          break
        }

        case '[':
        case ']': {
          if (!snapshot) break
          const ids = snapshot.sites.map((s) => s.id)
          const index = ids.indexOf(snapshot.activeSiteId)
          const next = ids[(index + (event.key === ']' ? 1 : -1) + ids.length) % ids.length]
          if (next) sendCommand({ type: 'setActiveSite', siteId: next })
          break
        }

        default:
          break
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
