/**
 * Clock, weather and the thermal model.
 *
 * This is where the setting earns its keep. Outside air temperature and wind are
 * not decoration: they feed straight into how fast heat leaks through an open
 * dock door, which decides how long a zone stays in band, which decides whether
 * stock is still sellable. A +9 °C gale at Trondheim costs real money; a −12 °C
 * aurora night at Gardermoen is free refrigeration.
 */

import { MINUTES_PER_TICK, MIN_PER_DAY, type SiteRuntime, type WorldState, zoneStateFor } from '../state.ts'
import { zoneSpec } from '../catalogue.ts'
import type { Pallet, Weather, WeatherKind, Zone } from '../types.ts'

/**
 * Solar declination, radians. Pinned to late October — the sites are at 60–64 °N,
 * so this gives roughly eight hours of daylight at Keflavík and a long blue dusk,
 * which is the look the whole scene is built around.
 */
const DECLINATION = (-13 * Math.PI) / 180

/** Civil twilight bounds for the daylight ramp, radians. */
const TWILIGHT_LO = (-6 * Math.PI) / 180
const TWILIGHT_HI = (8 * Math.PI) / 180

/** Heat leak through a fully open dock door, °C per clock-minute per °C of gradient. */
const LEAK_COEF: Record<Zone, number> = {
  AMBIENT: 0.02,
  CHILL: 0.035,
  FROZEN: 0.016,
  ULTRA: 0.009,
}

/** Refrigeration plant pull-down, fraction of the gap closed per clock-minute. */
const PLANT_RATE: Record<Zone, number> = {
  AMBIENT: 0.05,
  CHILL: 0.16,
  FROZEN: 0.15,
  ULTRA: 0.13,
}

/**
 * A docked trailer seals the opening. Real docks use inflatable shelters and air
 * curtains, so an open door with a trailer against it leaks very little — the
 * operationally dangerous case is a door standing open with no trailer in it,
 * which is exactly what the door-open alert is for.
 */
const TRAILER_SEAL = 0.12

/** The dock apron is held around +6 °C — chilled, but nowhere near frozen. */
const APRON_SETPOINT = 6
const APRON_PLANT_RATE = 0.09
const APRON_LEAK_COEF = 0.055

/** Stock turnover slowly restores zone integrity once the zone is back in band. */
const INTEGRITY_RECOVERY_PER_MIN = 0.004

// ─────────────────────────────────────────────────────────────────────────────
// Clock
// ─────────────────────────────────────────────────────────────────────────────

export function advanceClock(world: WorldState): void {
  const clock = world.clock
  clock.minuteOfDay += MINUTES_PER_TICK
  if (clock.minuteOfDay >= MIN_PER_DAY) {
    clock.minuteOfDay -= MIN_PER_DAY
    clock.day += 1
  }

  // Use the active site's latitude for the sun — the whole scene is one site at a
  // time, so a single sun position is the honest thing to compute.
  const site = world.sites.find((s) => s.def.id === world.activeSiteId) ?? world.sites[0]
  const latRad = ((site?.def.lat ?? 64) * Math.PI) / 180

  // Hour angle: 0 at solar noon, ±π at midnight.
  const hourAngle = ((clock.minuteOfDay / MIN_PER_DAY) * 2 - 1) * Math.PI
  const sinEl =
    Math.sin(DECLINATION) * Math.sin(latRad) +
    Math.cos(DECLINATION) * Math.cos(latRad) * Math.cos(hourAngle)
  const elevation = Math.asin(clampNum(sinEl, -1, 1))

  const cosAz =
    (Math.sin(DECLINATION) - Math.sin(elevation) * Math.sin(latRad)) /
    Math.max(1e-6, Math.cos(elevation) * Math.cos(latRad))
  let azimuth = Math.acos(clampNum(cosAz, -1, 1))
  if (hourAngle > 0) azimuth = 2 * Math.PI - azimuth

  clock.sunElevation = elevation
  clock.sunAzimuth = azimuth
  clock.daylight = smoothstep(TWILIGHT_LO, TWILIGHT_HI, elevation)
  clock.isNight = elevation < TWILIGHT_LO
}

// ─────────────────────────────────────────────────────────────────────────────
// Weather
// ─────────────────────────────────────────────────────────────────────────────

const WEATHER_KINDS: readonly WeatherKind[] = ['clear', 'overcast', 'snow', 'sleet', 'fog', 'gale']

export function updateWeather(site: SiteRuntime, world: WorldState): void {
  const nowMin = world.clock.day * MIN_PER_DAY + world.clock.minuteOfDay

  // Ease the intensity ramp so precipitation fades in and out instead of popping.
  site.weather.intensity = Math.min(1, site.weather.intensity + MINUTES_PER_TICK * 0.05)

  if (nowMin < site.nextWeatherMin) {
    driftTemperature(site, world)
    return
  }

  // Colder sites favour snow; milder maritime sites favour sleet and fog.
  const cold = site.weather.ambientC < 0
  const weights = cold ? [3, 4, 4.5, 1, 1.2, 1.6] : [3, 5, 1.2, 2.8, 2.2, 2.2]
  // Weather is sticky — doubling the current kind's weight avoids a strobing sky.
  const adjusted = WEATHER_KINDS.map((k, i) => (k === site.weather.kind ? (weights[i] ?? 1) * 2 : weights[i] ?? 1))
  const next = site.rng.weighted(WEATHER_KINDS, adjusted)

  site.weather.kind = next
  site.weather.windKph =
    next === 'gale' ? site.rng.range(55, 95) : next === 'clear' ? site.rng.range(4, 20) : site.rng.range(12, 42)
  site.weather.visibility =
    next === 'fog' ? site.rng.range(0.15, 0.4) : next === 'snow' ? site.rng.range(0.4, 0.7) : site.rng.range(0.75, 1)
  site.weather.intensity = 0
  site.nextWeatherMin = nowMin + site.rng.range(90, 320)

  world.pendingEvents.push({
    type: 'weatherChanged',
    tick: world.tick,
    siteId: site.def.id,
    weather: { ...site.weather },
  })
}

function driftTemperature(site: SiteRuntime, world: WorldState): void {
  // Diurnal swing around the site's seasonal mean, coldest just before dawn.
  const phase = (world.clock.minuteOfDay / MIN_PER_DAY) * Math.PI * 2
  const diurnal = -Math.cos(phase - 0.6) * site.def.tempSwingC * 0.5
  const weatherOffset = weatherTempOffset(site.weather.kind)
  const target = site.def.baseTempC + diurnal + weatherOffset
  site.weather.ambientC += (target - site.weather.ambientC) * MINUTES_PER_TICK * 0.04
}

function weatherTempOffset(kind: WeatherKind): number {
  switch (kind) {
    case 'clear':
      return -2.5 // clear skies radiate heat away
    case 'overcast':
      return 1.5
    case 'snow':
      return -1
    case 'sleet':
      return 0.5
    case 'fog':
      return 0.5
    case 'gale':
      return 2.5 // maritime gales here come off the Atlantic and are mild
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Thermal zones
// ─────────────────────────────────────────────────────────────────────────────

export function updateThermal(site: SiteRuntime, _world: WorldState): void {
  const dt = MINUTES_PER_TICK
  const ambient = site.weather.ambientC
  const windFactor = 1 + site.weather.windKph / 60

  // Effective open area per zone, discounted by whether a trailer is sealing it.
  const openByZone: Partial<Record<Zone, number>> = {}
  let openTotal = 0
  for (let i = 0; i < site.doors.length; i++) {
    const door = site.doors[i]
    const bay = site.layout.bays[i]
    if (!door || !bay) continue
    const sealed = site.trucks.some((t) => t.bayId === bay.id && t.phase === 'docked')
    const effective = door.openness * (sealed ? TRAILER_SEAL : 1)
    openByZone[bay.zone] = (openByZone[bay.zone] ?? 0) + effective
    openTotal += effective
  }

  // The apron sees every open door regardless of which zone it serves.
  const apronLeak = APRON_LEAK_COEF * openTotal * windFactor * (ambient - site.apronC)
  site.apronC += (APRON_SETPOINT - site.apronC) * APRON_PLANT_RATE * dt + apronLeak * dt

  for (const zs of site.zoneStates) {
    const spec = zoneSpec(zs.zone)
    const open = openByZone[zs.zone] ?? 0
    // Heat flows in from the apron through the open door, not from outside air
    // directly — the door opens into the building, not the weather.
    const gradient = site.apronC - zs.tempC
    const leak = LEAK_COEF[zs.zone] * open * windFactor * gradient
    zs.tempC += (spec.setpointC - zs.tempC) * PLANT_RATE[zs.zone] * dt + leak * dt

    const wasInBand = zs.inBand
    zs.inBand = zs.tempC >= spec.minC && zs.tempC <= spec.maxC

    if (!zs.inBand) {
      zs.outOfBandMin += dt
      // Racked stock burns its budget for as long as the zone is out of band.
      zs.integrity = Math.max(0, zs.integrity - dt / spec.budgetMin)
    } else {
      if (!wasInBand) zs.outOfBandMin = 0
      zs.integrity = Math.min(1, zs.integrity + INTEGRITY_RECOVERY_PER_MIN * dt)
    }
  }
}

/**
 * The temperature a pallet is actually sitting in, given where it is.
 * This is the single function that decides whether a load survives.
 *
 * Staging lanes are conditioned: a bay allocated to a zone has refrigerated
 * staging behind it, so a pallet dropped at the right door is safe. A pallet
 * staged at the *wrong* door is out on the apron at +6 °C and is in trouble —
 * which is the mistake a real floor actually makes.
 */
export function exposureTempC(site: SiteRuntime, pallet: Pallet, truckBoxC: number): number {
  switch (pallet.state) {
    case 'racked': {
      const zs = zoneStateFor(site, pallet.zone)
      return zs ? zs.tempC : zoneSpec(pallet.zone).setpointC
    }
    case 'onTruck':
      return truckBoxC
    case 'staged': {
      // Nearest dock door decides which staging lane the pallet is sitting in.
      let nearest = site.layout.bays[0]
      let best = Infinity
      for (const bay of site.layout.bays) {
        const d = Math.abs(bay.position.x - pallet.x)
        if (d < best) {
          best = d
          nearest = bay
        }
      }
      if (nearest && nearest.zone === pallet.zone) {
        const zs = zoneStateFor(site, pallet.zone)
        return zs ? zs.tempC : zoneSpec(pallet.zone).setpointC
      }
      return site.apronC
    }
    case 'carried':
    default:
      return site.apronC
  }
}

/**
 * Multiplier on the thermal burn rate by pallet state. Product in transit across
 * the floor travels under an insulated cover, so a forklift run costs a fraction
 * of what standing exposed on the apron does.
 */
export function burnMultiplier(state: Pallet['state']): number {
  return state === 'carried' ? 0.2 : 1
}

// ─────────────────────────────────────────────────────────────────────────────

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clampNum((x - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

export function clampNum(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

/** Format clock minutes as HH:MM. Shared by the UI and the alert text. */
export function formatClock(minuteOfDay: number): string {
  const total = Math.floor(minuteOfDay)
  const h = Math.floor(total / 60) % 24
  const m = total % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function describeWeather(w: Weather): string {
  const label: Record<WeatherKind, string> = {
    clear: 'Clear',
    overcast: 'Overcast',
    snow: 'Snow',
    sleet: 'Sleet',
    fog: 'Fog',
    gale: 'Gale',
  }
  return `${label[w.kind]} · ${w.ambientC.toFixed(1)} °C · ${Math.round(w.windKph)} km/h`
}
