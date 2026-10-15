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
 * SHA-256 over a salt and the normalised number. The same number always gives
 * the same key, so a returning member is recognised; the number itself is
 * never written down, so there is nothing to leak and nothing to misuse for
 * marketing later. The salt lives in config.json and must be changed before
 * the pilot — without it, a short national number space is small enough to
 * walk through exhaustively.
 */
export async function memberKeyFor(phone, salt) {
  const normalised = normalisePhone(phone)
  if (!normalised) throw new Error('A phone number is needed to recognise you next time')
  const bytes = new TextEncoder().encode(`${salt}:${normalised}`)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('')
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

/** Everything of one member's, images and record alike. The s24 request. */
export async function forgetMember(memberKey) {
  const frames = await tx('frames', 'readonly', (s) => s.index('memberKey').getAll(memberKey))
  await Promise.all(frames.map((f) => del('frames', f.id)))
  await del('members', memberKey)
  const sessions = await tx('sessions', 'readonly', (s) => s.index('memberKey').getAll(memberKey))
  // The sessions stay, because they hold no image and no identifier once the
  // member key is gone — but the key itself has to go with them.
  await Promise.all(
    sessions.map((row) => put('sessions', { ...row, memberKey: null, forgotten: true })),
  )
  return { frames: frames.length, sessions: sessions.length }
}

// ── consent ────────────────────────────────────────────────────────────────

export async function recordConsent(record) {
  return tx('consents', 'readwrite', (s) => s.add(record))
}

export async function listConsents() {
  return all('consents')
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
