/**
 * Everything the pilot remembers, in IndexedDB on this device.
 *
 * There is no server. That is not a shortcut taken to save time — it is the
 * single design decision that keeps this pilot out of the hardest parts of
 * POPIA. Nothing crosses a border (s72) because nothing crosses anything, and
 * a breach of a thing that was never transmitted is a breach of one laptop.
 *
 * Four stores:
 *   members   one row per returning member, keyed by a hash of their phone
 *   sessions  the image-free log — this is the pilot's actual output
 *   frames    the images themselves, as Blobs, with a kept flag
 *   consents  what each member agreed to, and to which version of the text
 *
 * The images and the log are deliberately separate. Deleting every image
 * leaves the log intact, which is what lets the pilot answer its questions
 * without holding anybody's photograph.
 */

const DB_NAME = 'podium-pilot'
const DB_VERSION = 1

let dbPromise = null

function open() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result

      const members = db.createObjectStore('members', { keyPath: 'memberKey' })
      members.createIndex('lastVisitAt', 'lastVisitAt')

      const sessions = db.createObjectStore('sessions', { keyPath: 'id' })
      sessions.createIndex('startedAt', 'startedAt')
      sessions.createIndex('memberKey', 'memberKey')

      const frames = db.createObjectStore('frames', { keyPath: 'id' })
      frames.createIndex('sessionId', 'sessionId')
      frames.createIndex('memberKey', 'memberKey')
      frames.createIndex('kept', 'kept')
      frames.createIndex('createdAt', 'createdAt')

      db.createObjectStore('consents', { keyPath: 'id', autoIncrement: true })
      db.createObjectStore('meta', { keyPath: 'key' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

function tx(store, mode, fn) {
  return open().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(store, mode)
        const req = fn(t.objectStore(store))
        t.oncomplete = () => resolve(req ? req.result : undefined)
        t.onerror = () => reject(t.error)
        t.onabort = () => reject(t.error)
      }),
  )
}

const put = (store, value) => tx(store, 'readwrite', (s) => s.put(value))
const get = (store, key) => tx(store, 'readonly', (s) => s.get(key))
const all = (store) => tx(store, 'readonly', (s) => s.getAll())
const del = (store, key) => tx(store, 'readwrite', (s) => s.delete(key))

// ── identity ───────────────────────────────────────────────────────────────

/**
 * A phone number becomes a lookup key and nothing else.
 *
 * SHA-256 over a salt and the normalised number, so the same number always
 * gives the same key and a returning member is recognised without the number
 * being written down.
 *
 * Be clear about what this is and is not. South African mobile numbers are a
 * space of roughly 100 million, and the salt sits on the same laptop as the
 * hashes — anyone holding the device can walk the whole space in seconds and
 * recover every number. This is PSEUDONYMISATION, not anonymisation: the
 * records stay personal information under POPIA, and the consent text must not
 * claim they are unreadable.
 *
 * `memberIdMode: 'code'` in config.json avoids the problem entirely by never
 * deriving the key from anything about the person. See RISKS-POPIA.md risk 1a.
 */
export async function memberKeyFor(phone, salt) {
  const normalised = normalisePhone(phone)
  if (!normalised) throw new Error('A phone number is needed to recognise you next time')
  const bytes = new TextEncoder().encode(`${salt}:${normalised}`)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * A random member code: about 2 billion possibilities, no personal information
 * in it at all. Ambiguous characters are left out because a member reads this
 * off a phone screen and types it back a month later.
 */
const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'

export function newMemberCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  const chars = [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length])
  return `${chars.slice(0, 3).join('')}-${chars.slice(3).join('')}`
}

/** The code *is* the key — nothing is derived, so nothing can be reversed. */
export function memberKeyForCode(code) {
  const cleaned = String(code || '').toUpperCase().replace(/[^0-9A-Z]/g, '')
  if (cleaned.length !== 6) return null
  return `c_${cleaned}`
}

/** South African numbers, written the four ways people actually write them. */
export function normalisePhone(raw) {
  const digits = String(raw || '').replace(/[^\d+]/g, '')
  if (!digits) return null
  let d = digits.replace(/^\+/, '')
  if (d.startsWith('0')) d = `27${d.slice(1)}`
  if (d.startsWith('27') && d.length === 11) return `+${d}`
  // Anything else is kept as typed, so a visitor with a foreign number still works.
  return d.length >= 8 ? `+${d}` : null
}

// ── members ────────────────────────────────────────────────────────────────

export async function getMember(memberKey) {
  return (await get('members', memberKey)) ?? null
}

export async function upsertMember(member) {
  await put('members', member)
  return member
}

export async function listMembers() {
  return all('members')
}

// ── sessions ───────────────────────────────────────────────────────────────

export async function saveSession(session) {
  await put('sessions', session)
  return session
}

export async function listSessions() {
  const rows = await all('sessions')
  return rows.sort((a, b) => b.startedAt - a.startedAt)
}

// ── frames ─────────────────────────────────────────────────────────────────

export async function saveFrame(frame) {
  await put('frames', frame)
  return frame
}

export async function framesForSession(sessionId) {
  return tx('frames', 'readonly', (s) => s.index('sessionId').getAll(sessionId))
}

export async function framesForMember(memberKey) {
  const rows = await tx('frames', 'readonly', (s) => s.index('memberKey').getAll(memberKey))
  return rows.filter((f) => f.kept).sort((a, b) => a.createdAt - b.createdAt)
}

export async function setFrameKept(id, kept) {
  const frame = await get('frames', id)
  if (!frame) return null
  frame.kept = kept
  await put('frames', frame)
  return frame
}

export async function deleteFrame(id) {
  return del('frames', id)
}

/** Deletes every image belonging to a session. The log row survives. */
export async function deleteSessionFrames(sessionId) {
  const rows = await framesForSession(sessionId)
  await Promise.all(rows.map((f) => del('frames', f.id)))
  return rows.length
}

/**
 * Everything of one member's, images and record alike. The s24 request.
 *
 * Three stores are touched and each for a different reason. Frames and the
 * member row are theirs, so they go. Sessions stay, because an image-free
 * row carrying no key is no longer about anybody and deleting it would
 * quietly corrupt the pilot's own arithmetic — but the key goes with them.
 * Consent records stay for the same reason and lose their key too: the proof
 * that consent was given on a date is a record about the operator's conduct,
 * not a profile of the member.
 */
export async function forgetMember(memberKey) {
  const frames = await tx('frames', 'readonly', (s) => s.index('memberKey').getAll(memberKey))
  await Promise.all(frames.map((f) => del('frames', f.id)))
  await del('members', memberKey)

  const sessions = await tx('sessions', 'readonly', (s) => s.index('memberKey').getAll(memberKey))
  await Promise.all(
    sessions.map((row) => put('sessions', { ...row, memberKey: null, forgotten: true })),
  )

  const consents = (await all('consents')).filter((c) => c.memberKey === memberKey)
  await Promise.all(
    consents.map((row) => put('consents', { ...row, memberKey: null, forgotten: true })),
  )

  return { frames: frames.length, sessions: sessions.length, consents: consents.length }
}

// ── consent ────────────────────────────────────────────────────────────────

export async function recordConsent(record) {
  return tx('consents', 'readwrite', (s) => s.add(record))
}

export async function listConsents() {
  return all('consents')
}

// ── demo data and the real-pilot gate ──────────────────────────────────────

/*
 * Everything recorded before the operator presses "Start real pilot" is marked
 * demo: true and is shown as DEMO everywhere it appears. The gate exists
 * because a seeded dashboard looks exactly like a real one, and a number that
 * came from a fixture has a way of ending up in a pitch deck six weeks later.
 */

export async function pilotState() {
  const startedAt = await getMeta('pilotStartedAt')
  const rows = await all('sessions')
  return {
    started: !!startedAt,
    startedAt: startedAt ?? null,
    demoSessions: rows.filter((r) => r.demo).length,
    realSessions: rows.filter((r) => !r.demo).length,
  }
}

/** Deletes every demo session, frame and member. Irreversible, deliberately. */
export async function wipeDemo() {
  const sessions = (await all('sessions')).filter((s) => s.demo)
  const frames = (await all('frames')).filter((f) => f.demo)
  const members = (await all('members')).filter((m) => m.demo)
  await Promise.all([
    ...sessions.map((r) => del('sessions', r.id)),
    ...frames.map((r) => del('frames', r.id)),
    ...members.map((r) => del('members', r.memberKey)),
  ])
  return { sessions: sessions.length, frames: frames.length, members: members.length }
}

/**
 * Wipes the demo data and opens the real pilot. Refuses if anything demo
 * survives the wipe, so "the pilot started" can never be true while fixture
 * rows are still in the dashboard.
 */
export async function startRealPilot() {
  const wiped = await wipeDemo()
  const left = (await all('sessions')).filter((s) => s.demo).length
  if (left) throw new Error(`${left} demo session(s) survived the wipe — not starting`)
  const at = Date.now()
  await setMeta('pilotStartedAt', at)
  return { ...wiped, startedAt: at }
}

// ── meta ───────────────────────────────────────────────────────────────────

export const getMeta = (key) => get('meta', key).then((r) => (r ? r.value : null))
export const setMeta = (key, value) => put('meta', { key, value })

// ── the purge ──────────────────────────────────────────────────────────────

/**
 * "Anything not kept is deleted from the device the same day."
 *
 * Runs at startup and every ten minutes while the app is open. Two rules:
 * unkept frames go at the end of the day they were made, and kept frames go
 * after the retention window in config.json. Both are deliberately blunt —
 * a retention policy with exceptions is one nobody can describe to a member
 * in a sentence.
 */
export async function purge({ retentionDays }) {
  const rows = await all('frames')
  const now = Date.now()
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const keptCutoff = now - retentionDays * 86400000

  const doomed = rows.filter((f) =>
    f.kept ? f.createdAt < keptCutoff : f.createdAt < startOfToday.getTime(),
  )
  await Promise.all(doomed.map((f) => del('frames', f.id)))
  return { deleted: doomed.length, remaining: rows.length - doomed.length }
}

/** Used by the verification run and by the operator's "reset the day" control. */
export async function wipeEverything() {
  const db = await open()
  await Promise.all(
    ['members', 'sessions', 'frames', 'consents'].map(
      (name) =>
        new Promise((resolve, reject) => {
          const t = db.transaction(name, 'readwrite')
          t.objectStore(name).clear()
          t.oncomplete = resolve
          t.onerror = () => reject(t.error)
        }),
    ),
  )
}
