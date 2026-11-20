// Colyseus link to ../Dont-miss-your-flight-backend (room "world"). Never throws and never blocks
// play: without a server the game runs on the browser save.
//
// Saves: a signed-in player's progress lives on the server. On join it answers `progress` (the
// saved doc -> store.hydrate), `noProgress` (new account, guest or no database: keep the current
// state and save it) or `serverError` (the save could not be read: never overwrite it). From then on
// store.snapshot() goes up as `saveProgress` whenever it changed (at most every NET.saveEvery s, and
// when the tab hides). Guests, and everyone while the server has not answered, keep the browser
// save (localStorage) instead.
//
// Daily Reward: server-authoritative for signed-in players (`daily` / `claimDaily` -> `dailyResult`,
// on the server's UTC days); guests and offline players use the store's local calendar, so a reload
// never re-unlocks a day.
//
// Trolls: `sendTroll(id, text)` relays a bought troll (or a job broadcast) to everyone else in the
// room; theirs arrive through the handler set with `onTrolled` as { id, from, text }.
import { Client } from '@colyseus/sdk'
import { DEV_MODE, NET, SERVER_URL } from './config.js'
import { store } from './store.js'
import { authState, canResolveServer, getPfp, launchRoomId, locateRoom, resolveServerEndpoint, subscribeAuth, updateRoom } from './bloxity.js'

export const net = { room: null, connected: false, hydrated: false, daily: null }

// --- Identity ---------------------------------------------------------------------
function storedId(key, make) {
  try {
    let id = localStorage.getItem(key)
    if (!id) localStorage.setItem(key, (id = make()))
    return id
  } catch {
    return make()
  }
}
const rand = () => Math.random().toString(36).slice(2, 8)
const GUEST = storedId('dmyf.guest', () => `guest-${rand()}`)
// Dev mode (no SDK) plays as a per-browser dev id, so a local server with Mongo keeps its save.
const DEV = DEV_MODE ? storedId('dmyf.dev', () => `dev-${rand()}`) : ''

function identity() {
  if (DEV) return { userId: DEV, username: `Dev ${DEV.slice(4)}` }
  const u = authState.user
  const id = u && (u._id || u.id || u.userId || u.uid)
  if (!id) return { userId: GUEST, username: authState.guest?.displayName || authState.guest?.username || 'Guest' }
  return { userId: String(id), username: String(u.displayName || u.username || u.name || 'Player') }
}
const isGuestId = (id) => id.startsWith('guest-')
export const hasServer = () => !!(SERVER_URL || canResolveServer())
let sentId = ''
export const isGuest = () => isGuestId(sentId || identity().userId)
// Progress goes to the server only once it has answered for this identity (and never for guests).
const onServer = () => net.connected && net.hydrated && !isGuest()

// --- Saving -----------------------------------------------------------------------
let lastSaved = ''
let dirty = false
function send(type, payload) {
  try {
    net.room?.send(type, payload)
  } catch (err) {
    console.warn('[net] send failed', type, err)
  }
}
function serverSave() {
  const snap = JSON.stringify(store.snapshot())
  if (snap === lastSaved) return
  lastSaved = snap
  send('saveProgress', JSON.parse(snap))
}
// The browser copy: a guest's (or a serverless session's) only save, and for an account a mirror
// that brings its progress back when the server has none (a server without a database, a first
// join). Each account mirrors under its own key so accounts never mix.
const accountKey = () => `${store.KEY}:${sentId}`
let loadedId = ''
// Until the server has answered for this account, the state is still the guest save it started on.
const localKey = () => (!hasServer() || isGuest() || loadedId !== sentId ? store.KEY : accountKey())
export function saveNow() {
  dirty = false
  if (onServer()) serverSave()
  if (authState.ready || !hasServer()) store.localSave(localKey())
}
// Every store change: the browser save at once when it is the one in use, the server's batched.
store.setSaveHook(() => {
  dirty = true
  if (!onServer()) saveNow()
  else store.localSave(localKey())
})

// --- Server clock --------------------------------------------------------------------
let clockOffset = 0
export const serverNow = () => Date.now() + clockOffset
function keepClock(msg) {
  if (typeof msg?.serverTime === 'number') clockOffset = msg.serverTime - Date.now()
}
store.setClock(serverNow)

// --- Daily Reward ---------------------------------------------------------------------
const listeners = new Set()
export function onNetChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
const changed = (what) => {
  for (const fn of listeners) fn(what)
}
const serverDaily = () => onServer() && net.daily
// { unlocked, claimed[], nextAt } on the clock in use.
export function dailyView() {
  if (serverDaily()) return net.daily
  return store.localDaily()
}
// Time (ms) on the same clock as dailyView().nextAt.
export const dailyNow = () => (serverDaily() ? serverNow() : Date.now())

const waiting = {}
function request(type, payload, answer) {
  return new Promise((resolve) => {
    if (!net.connected || !net.hydrated) return resolve({ ok: false, reason: 'offline' })
    if (waiting[answer]) return resolve({ ok: false, reason: 'busy' })
    const timer = setTimeout(() => {
      delete waiting[answer]
      resolve({ ok: false, reason: 'timeout' })
    }, NET.requestTimeout * 1000)
    waiting[answer] = (msg) => {
      clearTimeout(timer)
      delete waiting[answer]
      resolve(msg)
    }
    send(type, payload)
  })
}
// Claims day i (0-based): { ok, reason? }. The caller grants the reward only on ok.
export async function claimDaily(i) {
  if (!serverDaily()) return { ok: store.claimLocalDaily(i), reason: 'locked' }
  return request('claimDaily', { day: i }, 'dailyResult')
}
// The countdown reached the next day: the server unlocks it (the local calendar rolls by itself).
export function refreshDaily() {
  if (serverDaily()) send('dailyRefresh', {})
  changed('daily')
}

// --- Trolls ------------------------------------------------------------------------------
let onTroll = () => {}
export const onTrolled = (fn) => (onTroll = fn)
export const sendTroll = (id, text = '') => net.connected && send('troll', { id, text })

// --- Connection -----------------------------------------------------------------------------
function attach(room) {
  net.room = room
  net.connected = true
  room.onMessage('progress', (doc) => {
    net.hydrated = true
    lastSaved = ''
    keepClock(doc)
    // A reconnect under the same identity: this tab is newer than the save, so push it instead.
    if (loadedId === sentId || !doc || isGuest()) return saveNow()
    loadedId = sentId
    store.hydrate(doc)
    saveNow()
    changed('progress')
  })
  room.onMessage('noProgress', (msg) => {
    net.hydrated = true
    keepClock(msg)
    // Nothing on the server: this account's browser mirror, if it has one (else the current
    // state carries over, e.g. a guest signing up keeps what they earned).
    const mirror = loadedId !== sentId && !isGuest() ? store.localLoad(accountKey()) : null
    if (mirror) store.hydrate(mirror)
    loadedId = sentId
    lastSaved = ''
    saveNow()
    changed('progress')
  })
  room.onMessage('serverError', () => {
    net.hydrated = false
    console.warn('[net] the server could not read the saved progress; saving is off for this session')
  })
  room.onMessage('daily', (d) => {
    keepClock(d)
    net.daily = d // { unlocked, claimed, nextAt, serverTime }
    changed('daily')
  })
  room.onMessage('dailyResult', (r) => {
    if (Array.isArray(r?.claimed)) {
      keepClock(r)
      net.daily = { unlocked: r.unlocked, claimed: r.claimed, nextAt: r.nextAt, serverTime: r.serverTime }
      changed('daily')
    }
    waiting.dailyResult?.(r)
  })
  room.onMessage('trolled', (m) => {
    if (typeof m?.id === 'string') onTroll({ id: m.id, from: String(m.from || 'Someone').slice(0, 32), text: String(m.text || '') })
  })
  // The backend shares its protocol with other games: these are not used here.
  for (const t of ['spins', 'spinResult', 'leaderboard']) room.onMessage(t, () => {})
  room.onLeave(() => {
    if (net.room !== room) return
    net.room = null
    net.connected = false
    net.hydrated = false
    net.daily = null
    updateRoom('')
    changed('daily')
    setTimeout(connect, NET.rejoin * 1000)
  })
}

let launchRoom = launchRoomId()
async function joinLaunchRoom(options) {
  const id = launchRoom
  launchRoom = ''
  if (!id) return null
  try {
    if (SERVER_URL) return { room: await new Client(SERVER_URL).joinById(id.split('~').pop(), options), relay: '' }
    const at = await locateRoom(id)
    if (at) return { room: await new Client(at.endpoint).joinById(at.roomId, options), relay: at.relayRoomId }
  } catch (err) {
    console.info('[net] the invited room is gone or full; matchmaking instead', err?.message ?? err)
  }
  return null
}
async function joinAnyRoom(options) {
  if (SERVER_URL) return { room: await new Client(SERVER_URL).joinOrCreate('world', options), relay: '' }
  const { endpoint, relayRoomId } = await resolveServerEndpoint(/^(guest|dev)-/.test(options.userId) ? undefined : options.userId)
  return { room: await new Client(endpoint).joinOrCreate('world', options), relay: relayRoomId }
}

let connecting = false
let retryIn = NET.retry
async function connect() {
  if (!hasServer() || connecting || net.connected) return
  connecting = true
  try {
    const id = identity()
    sentId = id.userId
    const { room, relay } = (await joinLaunchRoom({ ...id, pfp: getPfp() })) ?? (await joinAnyRoom({ ...id, pfp: getPfp() }))
    retryIn = NET.retry
    attach(room)
    updateRoom(relay ? `${relay}~${room.roomId}` : room.roomId)
  } catch (err) {
    console.info(`[net] could not reach the server (retrying in ${retryIn}s); playing on the browser save`, err?.message ?? err)
    setTimeout(connect, retryIn * 1000)
    retryIn = Math.min(retryIn * 2, NET.retryMax)
  } finally {
    connecting = false
  }
}

export function initNet() {
  window.addEventListener('pagehide', saveNow)
  document.addEventListener('visibilitychange', () => document.hidden && saveNow())
  setInterval(() => dirty && saveNow(), NET.saveEvery * 1000)
  if (!hasServer()) return console.info('[net] no server configured; progress is kept in this browser')
  subscribeAuth((s) => {
    if (!s.ready) return
    if (!net.connected) return void connect()
    const id = identity()
    if (id.userId === sentId) return send('identify', { username: id.username, pfp: getPfp() })
    // Save under the OLD identity before switching.
    saveNow()
    net.hydrated = false
    net.daily = null
    // Signed out: back to this browser's guest save (the account's progress stays on the server).
    if (isGuestId(id.userId)) store.hydrate(store.localLoad(store.KEY))
    sentId = id.userId
    send('identify', { ...id, pfp: getPfp() })
  })
}
