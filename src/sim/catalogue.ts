/**
 * The contents of the Kelvin world: thermal zones, stock, carriers, customers and
 * the three sites.
 *
 * Every company, hospital and vessel name here is invented. Any resemblance to a
 * real operator is coincidence — the geography is real, the businesses are not.
 */

import type { Carrier, Customer, Sku, Zone, ZoneSpec } from './types.ts'

// ─────────────────────────────────────────────────────────────────────────────
// Thermal zones
// ─────────────────────────────────────────────────────────────────────────────

export const ZONE_SPECS: readonly ZoneSpec[] = [
  {
    zone: 'AMBIENT',
    label: 'Ambient',
    minC: 15,
    maxC: 25,
    setpointC: 20,
    budgetMin: 2880, // 48 h — packaging doesn't really spoil
    color: '#E3B04B',
  },
  {
    zone: 'CHILL',
    label: 'Chilled',
    minC: 2,
    maxC: 8,
    setpointC: 5,
    budgetMin: 240, // 4 h
    color: '#45D9E8',
  },
  {
    zone: 'FROZEN',
    label: 'Frozen',
    minC: -25,
    maxC: -18,
    setpointC: -21,
    budgetMin: 120, // 2 h
    color: '#6AA8FF',
  },
  {
    zone: 'ULTRA',
    label: 'Ultra-cold',
    minC: -75,
    maxC: -65,
    setpointC: -70,
    budgetMin: 45, // under an hour — this is the one that bites
    color: '#A98CFF',
  },
]

const ZONE_BY_KEY: Record<Zone, ZoneSpec> = {
  AMBIENT: ZONE_SPECS[0] as ZoneSpec,
  CHILL: ZONE_SPECS[1] as ZoneSpec,
  FROZEN: ZONE_SPECS[2] as ZoneSpec,
  ULTRA: ZONE_SPECS[3] as ZoneSpec,
}

export function zoneSpec(zone: Zone): ZoneSpec {
  return ZONE_BY_KEY[zone]
}

/** Thermal budget below this fraction raises a warning; at 0 the load is condemned. */
export const THERMAL_WARN = 0.35
export const THERMAL_CRITICAL = 0.15

// ─────────────────────────────────────────────────────────────────────────────
// Stock
// ─────────────────────────────────────────────────────────────────────────────

export const SKUS: readonly Sku[] = [
  // CHILL — fresh fish moving to the airport, and chilled pharma
  { id: 'SKU-SAL-04', name: 'Salmon loin, 4 kg case', zone: 'CHILL', unit: 'cases', unitsPerPallet: 48, lowAt: 0.25 },
  { id: 'SKU-COD-06', name: 'Cod fillet, 6 kg case', zone: 'CHILL', unit: 'cases', unitsPerPallet: 40, lowAt: 0.25 },
  { id: 'SKU-INS-100', name: 'Insulin analogue, 100 IU', zone: 'CHILL', unit: 'cartons', unitsPerPallet: 900, lowAt: 0.3 },
  { id: 'SKU-ANT-10', name: 'Influenza antigen, 10-dose', zone: 'CHILL', unit: 'trays', unitsPerPallet: 640, lowAt: 0.3 },
  { id: 'SKU-SER-05', name: 'Serum albumin, 5 % bag', zone: 'CHILL', unit: 'bags', unitsPerPallet: 320, lowAt: 0.28 },

  // FROZEN — the volume business
  { id: 'SKU-LAN-05', name: 'Langoustine, 5 kg block', zone: 'FROZEN', unit: 'blocks', unitsPerPallet: 60, lowAt: 0.2 },
  { id: 'SKU-CAP-10', name: 'Capelin roe, 10 kg tub', zone: 'FROZEN', unit: 'tubs', unitsPerPallet: 36, lowAt: 0.2 },
  { id: 'SKU-PLA-UN', name: 'Plasma units, cryo', zone: 'FROZEN', unit: 'units', unitsPerPallet: 480, lowAt: 0.35 },
  { id: 'SKU-HER-20', name: 'Herring fillet, 20 kg', zone: 'FROZEN', unit: 'boxes', unitsPerPallet: 28, lowAt: 0.2 },

  // ULTRA — low volume, high consequence
  { id: 'SKU-MRN-195', name: 'mRNA vaccine, 195-vial tray', zone: 'ULTRA', unit: 'trays', unitsPerPallet: 120, lowAt: 0.4 },
  { id: 'SKU-CAR-T', name: 'CAR-T cassette', zone: 'ULTRA', unit: 'cassettes', unitsPerPallet: 64, lowAt: 0.45 },
  { id: 'SKU-RGT-DP', name: 'Reagent kit, deep-freeze', zone: 'ULTRA', unit: 'kits', unitsPerPallet: 180, lowAt: 0.4 },

  // AMBIENT — the consumables that keep the cold chain running
  { id: 'SKU-EPS-BX', name: 'EPS insulated shipper', zone: 'AMBIENT', unit: 'units', unitsPerPallet: 220, lowAt: 0.2 },
  { id: 'SKU-DRY-25', name: 'Dry ice pellets, 25 kg', zone: 'AMBIENT', unit: 'sacks', unitsPerPallet: 40, lowAt: 0.35 },
  { id: 'SKU-THB-LG', name: 'Thermal blanket, pallet', zone: 'AMBIENT', unit: 'rolls', unitsPerPallet: 96, lowAt: 0.2 },
  { id: 'SKU-LOG-TT', name: 'Temperature logger, single-use', zone: 'AMBIENT', unit: 'units', unitsPerPallet: 1200, lowAt: 0.3 },
]

/**
 * Dry ice sublimates in store — about 1 % of mass a day even in a good box. The
 * inventory system treats it as shrinkage, which is the kind of detail that only
 * shows up in a business that actually runs a cold chain.
 */
export const SUBLIMATING_SKUS: readonly string[] = ['SKU-DRY-25']

export const SKU_BY_ID: Readonly<Record<string, Sku>> = Object.fromEntries(SKUS.map((s) => [s.id, s]))

export function skusForZone(zone: Zone): Sku[] {
  return SKUS.filter((s) => s.zone === zone)
}

// ─────────────────────────────────────────────────────────────────────────────
// Carriers — the liveries you see in the yard
// ─────────────────────────────────────────────────────────────────────────────

export const CARRIERS: readonly Carrier[] = [
  { id: 'CAR-NFR', name: 'Nordfrakt', color: '#2E6FD6' },
  { id: 'CAR-ISB', name: 'Isbjørn Logistik', color: '#D8DEE9' },
  { id: 'CAR-SAG', name: 'Saga Haul', color: '#C8503C' },
  { id: 'CAR-FJO', name: 'Fjordlink', color: '#2FA98C' },
  { id: 'CAR-VIN', name: 'Vinterveg', color: '#E0A33E' },
  { id: 'CAR-ARC', name: 'Arctic Line', color: '#6C5CE0' },
  { id: 'CAR-KLV', name: 'Kelvin Fleet', color: '#3FE3D0' },
]

export const CARRIER_BY_ID: Readonly<Record<string, Carrier>> = Object.fromEntries(
  CARRIERS.map((c) => [c.id, c]),
)

// ─────────────────────────────────────────────────────────────────────────────
// Customers
// ─────────────────────────────────────────────────────────────────────────────

export const CUSTOMERS: readonly Customer[] = [
  { id: 'CUS-NVS', name: 'Nordvest Sykehus Group', city: 'Tromsø', country: 'NO' },
  { id: 'CUS-HEL', name: 'Helia Pharma', city: 'Uppsala', country: 'SE' },
  { id: 'CUS-ATB', name: 'Atlas Biologics', city: 'Leiden', country: 'NL' },
  { id: 'CUS-SJA', name: 'Sjávar Export', city: 'Grimsby', country: 'GB' },
  { id: 'CUS-KRO', name: 'Kronborg Grocers', city: 'Copenhagen', country: 'DK' },
  { id: 'CUS-VIN', name: 'Vinter Foods', city: 'Hamburg', country: 'DE' },
  { id: 'CUS-BRG', name: 'Bergen Klinikk', city: 'Bergen', country: 'NO' },
  { id: 'CUS-ORK', name: 'Orkney Fish Union', city: 'Kirkwall', country: 'GB' },
  { id: 'CUS-MED', name: 'Meridian Health Trust', city: 'Dublin', country: 'IE' },
  { id: 'CUS-BOR', name: 'Borea Nutrition', city: 'Rotterdam', country: 'NL' },
]

export const CUSTOMER_BY_ID: Readonly<Record<string, Customer>> = Object.fromEntries(
  CUSTOMERS.map((c) => [c.id, c]),
)

// ─────────────────────────────────────────────────────────────────────────────
// Operators — forklift drivers, so the fleet list reads like a shift roster
// ─────────────────────────────────────────────────────────────────────────────

export const OPERATORS: readonly string[] = [
  'A. Sigurðardóttir',
  'J. Halvorsen',
  'M. Lindqvist',
  'T. Bjarnason',
  'K. Nilsen',
  'R. Eriksen',
  'P. Jóhannsson',
  'S. Dahl',
  'L. Mikkelsen',
  'H. Thorsen',
  'E. Rasmussen',
  'N. Guðmundsdóttir',
]

// ─────────────────────────────────────────────────────────────────────────────
// Sites
// ─────────────────────────────────────────────────────────────────────────────

export interface SiteDefinition {
  id: string
  name: string
  shortName: string
  country: string
  region: string
  lat: number
  lon: number
  timezone: string
  doorCount: number
  /** Which zones this site actually operates, in rack-row order. */
  zoneMix: Zone[]
  /** Mean outside air temperature by season, °C. Iceland is milder than people expect. */
  baseTempC: number
  tempSwingC: number
  /** Relative traffic weight — drives truck arrival rate. */
  intensity: number
  forklifts: number
  description: string
}

export const SITE_DEFS: readonly SiteDefinition[] = [
  {
    id: 'KEF-01',
    name: 'Keflavík Cold Port',
    shortName: 'Keflavík',
    country: 'Iceland',
    region: 'Reykjanes',
    lat: 63.985,
    lon: -22.605,
    timezone: 'Atlantic/Reykjavik',
    doorCount: 8,
    zoneMix: ['CHILL', 'CHILL', 'FROZEN', 'FROZEN', 'ULTRA', 'AMBIENT'],
    baseTempC: 4.5,
    tempSwingC: 5,
    intensity: 1.0,
    forklifts: 7,
    description:
      'Fresh catch inbound from the Reykjanes quays, graded and flown out within eighteen hours. Pharma transits here on the North Atlantic rotation.',
  },
  {
    id: 'OSL-02',
    name: 'Gardermoen Biohub',
    shortName: 'Gardermoen',
    country: 'Norway',
    region: 'Ullensaker',
    lat: 60.194,
    lon: 11.1,
    timezone: 'Europe/Oslo',
    doorCount: 6,
    zoneMix: ['ULTRA', 'ULTRA', 'CHILL', 'CHILL', 'FROZEN', 'AMBIENT'],
    baseTempC: -3,
    tempSwingC: 7,
    intensity: 0.75,
    forklifts: 5,
    description:
      'Biologics and vaccine distribution for the Nordic health trusts. The −70 °C vault holds the national mRNA reserve.',
  },
  {
    id: 'TRD-03',
    name: 'Trondheim Fjord Depot',
    shortName: 'Trondheim',
    country: 'Norway',
    region: 'Trøndelag',
    lat: 63.458,
    lon: 10.925,
    timezone: 'Europe/Oslo',
    doorCount: 10,
    zoneMix: ['FROZEN', 'FROZEN', 'FROZEN', 'CHILL', 'AMBIENT', 'AMBIENT'],
    baseTempC: 1,
    tempSwingC: 6,
    intensity: 1.25,
    forklifts: 9,
    description:
      'The volume site. Frozen pelagic out of the fjord, insulated packaging in, and the busiest yard on the network.',
  },
]

export const SITE_IDS: readonly string[] = SITE_DEFS.map((s) => s.id)

export function siteDef(id: string): SiteDefinition {
  const found = SITE_DEFS.find((s) => s.id === id)
  if (!found) throw new Error(`Unknown site: ${id}`)
  return found
}

// ─────────────────────────────────────────────────────────────────────────────
// Fleet naming
// ─────────────────────────────────────────────────────────────────────────────

/** Icelandic and Norwegian plate formats, so the yard list reads right. */
export function plateFor(siteId: string, n: number): string {
  if (siteId === 'KEF-01') {
    const letters = ['AB', 'KF', 'RN', 'SV', 'TH', 'VK']
    return `${letters[n % letters.length]}${String(100 + (n * 37) % 900)}`
  }
  const letters = ['BN', 'DT', 'EK', 'HV', 'LR', 'NS']
  return `${letters[n % letters.length]} ${String(10000 + (n * 613) % 90000)}`
}
