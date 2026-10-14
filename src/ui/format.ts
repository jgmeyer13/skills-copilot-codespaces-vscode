/**
 * Formatting.
 *
 * Centralised because consistency in how numbers are written is most of what
 * makes an operations surface feel trustworthy. Every figure that updates live
 * is rendered in a tabular-numeral mono face, so values never reflow as digits
 * change — a KPI that jitters while you read it reads as unreliable.
 */

import { MIN_PER_DAY } from '../sim/state.ts'

const GROUPED = new Intl.NumberFormat('en-GB')

export function int(value: number): string {
  return GROUPED.format(Math.round(value))
}

/** Compact for tile-sized figures: 1,412 stays, 14,120 becomes 14.1k. */
export function compact(value: number): string {
  const n = Math.round(value)
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 10_000) return `${(n / 1000).toFixed(1)}k`
  return GROUPED.format(n)
}

export function pct(value: number, digits = 1): string {
  return `${value.toFixed(digits)}%`
}

/** Signed delta with an explicit plus, for KPI change indicators. */
export function delta(value: number, digits = 0): string {
  const rounded = Number(value.toFixed(digits))
  if (rounded === 0) return digits > 0 ? `0.${'0'.repeat(digits)}` : '0'
  return `${rounded > 0 ? '+' : '−'}${Math.abs(rounded).toFixed(digits)}`
}

export function degrees(value: number, digits = 1): string {
  // Minus sign rather than hyphen: temperatures are read at a glance and the
  // typographic minus aligns with digits in a mono face.
  const text = Math.abs(value).toFixed(digits)
  return `${value < 0 ? '−' : ''}${text} °C`
}

/** Clock minutes (possibly beyond one day) as HH:MM. */
export function clock(minuteOfDay: number): string {
  const within = ((minuteOfDay % MIN_PER_DAY) + MIN_PER_DAY) % MIN_PER_DAY
  const h = Math.floor(within / 60)
  const m = Math.floor(within % 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** A duration in clock minutes as a short human string. */
export function duration(minutes: number): string {
  const abs = Math.abs(minutes)
  if (abs < 1) return `${Math.round(abs * 60)} s`
  if (abs < 60) return `${Math.round(abs)} min`
  const h = Math.floor(abs / 60)
  const m = Math.round(abs % 60)
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`
}

/** "in 14 min" / "12 min ago", for ETAs and alert ages. */
export function relative(targetMin: number, nowMin: number): string {
  const diff = targetMin - nowMin
  if (Math.abs(diff) < 1) return 'now'
  return diff > 0 ? `in ${duration(diff)}` : `${duration(-diff)} ago`
}

/** Strip the site prefix from a qualified id: 'KEF-01:FL-03' → 'FL-03'. */
export function shortId(id: string): string {
  const parts = id.split(':')
  return parts[parts.length - 1] ?? id
}

export function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

/** Human labels for simulation enums, kept out of the components. */
export const PHASE_LABEL: Record<string, string> = {
  inbound: 'Inbound',
  queued: 'In yard queue',
  approach: 'Approaching',
  reversing: 'Reversing',
  docked: 'At dock',
  departing: 'Departing',
  gone: 'Departed',
}

export const FORKLIFT_STATE_LABEL: Record<string, string> = {
  idle: 'Idle',
  travelling: 'Travelling',
  lifting: 'Lifting',
  lowering: 'Lowering',
  charging: 'On charge',
  blocked: 'Blocked',
}

export const STAGE_LABEL: Record<string, string> = {
  confirmed: 'Order confirmed',
  picked: 'Picked',
  loading: 'Loading',
  inTransit: 'In transit',
  delivered: 'Delivered',
  scrapped: 'Scrapped',
}

export const ZONE_LABEL: Record<string, string> = {
  AMBIENT: 'Ambient',
  CHILL: 'Chilled',
  FROZEN: 'Frozen',
  ULTRA: 'Ultra-cold',
}

export const WEATHER_LABEL: Record<string, string> = {
  clear: 'Clear',
  overcast: 'Overcast',
  snow: 'Snow',
  sleet: 'Sleet',
  fog: 'Fog',
  gale: 'Gale',
}

export function zoneVar(zone: string): string {
  return `var(--zone-${zone.toLowerCase()})`
}
