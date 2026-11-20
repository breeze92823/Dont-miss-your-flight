// Colyseus link to ../Dont-miss-your-flight-backend (room "world"). Never throws and never blocks
// play: without a server the game runs on the browser save and you are the only passenger.
//
// Identity: a signed-in player sends their Bloxity game token (Legion.SDK.auth.getToken()); the
// server verifies it with Bloxity and only then loads / saves that account. Guests (and local dev
// without the SDK, `dev-...` ids the dev server trusts) play unsaved on the server.
//
// Saves: a signed-in player's progress lives on the server. On join it answers `progress` (the
// saved doc -> store.hydrate), `noProgress` (new account, guest or no database: keep the current
// state and save it) or `serverError` (the save could not be read: never overwrite it). From then on
// store.snapshot() goes up as `saveProgress` whenever it changed (at most every NET.saveEvery s, and
// when the tab hides). Guests, and everyone while the server has not answered, keep the browser
// save (localStorage) instead.
//
// Fellow passengers: everyone in the room is on the roster (room.state.players, drawn by remote.js).
// This client keeps its own entry current: `pose` ~10/s, `trip` (zone / line / held spot / what you
// carry) and `setAvatar` when they change, `emote` when you play one (sendPresence each frame).
//
// Daily Reward: server-authoritative for signed-in players (`daily` / `claimDaily` -> `dailyResult`,
// on the server's UTC days); guests and offline players use the store's local calendar.
// Trolls: `sendTroll(id, text)` relays to everyone else; theirs arrive through `onTrolled`.
// Rewarded ads: `claimAdReward(token)` -> the server verifies the token with Bloxity -> { ok, coins }.
import { Client } from '@colyseus/sdk'
import { DEV_MODE, NET, REMOTE, SERVER_URL } from './config.js'
import { store } from './store.js'
import { authState, canResolveServer, getPfp, getToken, launchRoomId, locateRoom, lookJson, resolveServerEndpoint, subscribeAuth, updateRoom } from './bloxity.js'

export const net = { room: null, connected: false, hydrated: false, daily: null, you: null }

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
// `?dev=<name>` picks another dev player (two tabs of one browser as two passengers).
const devParam = DEV_MODE ? new URLSearchParams(location.search).get('dev')?.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 20) : ''
const DEV = DEV_MODE ? (devParam ? `dev-${devParam}` : storedId('dmyf.dev', () => `dev-${rand()}`)) : ''

// { userId (this browser's key for the account), username, token (proof for the server) }
function identity() {
  if (DEV) return { userId: DEV, username: `Dev ${DEV.slice(4)}`, token: '' }
  const u = authState.user
  const id = u && (u._id || u.id || u.userId || u.uid)
  if (!id) return { userId: GUEST, username: authState.guest?.displayName || authState.guest?.username || 'Guest', token: '' }
  return { userId: String(id), username: String(u.displayName || u.username || u.name || 'Player'), token: getToken() }
}
// What the server is sent: the token for accounts, a trusted dev id locally, a name for guests.
const wire = (id) => ({ token: id.token || undefined, userId: id.token ? undefined : id.userId, username: id.username, pfp: getPfp() })
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
// that brings its progress back when the server has none. Each account mirrors under its own key.
const accountKey = () => `${store.KEY}:${sentId}`
let loadedId = ''
const localKey = () => (!hasServer() || isGuest() || loadedId !== sentId ? store.KEY : accountKey())
export function saveNow() {
  dirty = false
  if (onServer()) serverSave()
  if (authState.ready || !hasServer()) store.localSave(localKey())
}
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
export function dailyView() {
  if (serverDaily()) return net.daily
  return store.localDaily()
}
export const dailyNow = () => (serverDaily() ? serverNow() : Date.now())

const waiting = {}
function request(type, payload, answer, needHydrated = true) {
  return new Promise((resolve) => {
    if (!net.connected || (needHydrated && !net.hydrated)) return resolve({ ok: false, reason: 'offline' })
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
export async function claimDaily(i) {
  if (!serverDaily()) return { ok: store.claimLocalDaily(i), reason: 'locked' }
  return request('claimDaily', { day: i }, 'dailyResult')
}
export function refreshDaily() {
  if (serverDaily()) send('dailyRefresh', {})
  changed('daily')
}

// --- Rewarded ads -----------------------------------------------------------------------------
// The server checks the reward token with Bloxity: { ok, coins?, reason? }. Offline: { ok: false, reason: 'offline' }.
export const claimAdReward = (rewardToken) => request('adReward', { rewardToken }, 'adRewardResult', false)

// --- Trolls ------------------------------------------------------------------------------
let onTroll = () => {}
export const onTrolled = (fn) => (onTroll = fn)
export const sendTroll = (id, text = '') => net.connected && send('troll', { id, text })

// --- Presence (this client's roster entry) ------------------------------------------------------
// main.js hands over what to report: () => { pose: {x,y,z,yaw,speed,grounded,anim}, trip: {...} }.
let presenceSource = null
export const setPresenceSource = (fn) => (presenceSource = fn)
const sentPresence = { pose: '', trip: '', avatar: null, emote: '' }
let poseIn = 0
let tripIn = 0
let aliveIn = 0
const round = (v, k = 100) => Math.round(v * k) / k
function currentPresence() {
  try {
    const p = presenceSource?.()
    if (!p) return null
    const q = p.pose
    return { pose: { x: round(q.x), y: round(q.y), z: round(q.z), yaw: round(q.yaw, 1000), speed: round(q.speed, 10), grounded: !!q.grounded, anim: q.anim || '' }, trip: p.trip }
  } catch {
    return null
  }
}
// Every frame: sends what changed, throttled. Plus the `alive` beat: it only goes out while the game
// loop runs, so a hidden tab / stopped game turns `away` on the server and the others stop waiting
// behind this player in a line.
export function sendPresence(dt) {
  if (!net.connected) return
  aliveIn -= dt
  if (aliveIn <= 0) {
    aliveIn = REMOTE.aliveEvery
    send('alive', {})
  }
  poseIn -= dt
  tripIn -= dt
  if (poseIn > 0 && tripIn > 0) return
  const p = currentPresence()
  if (!p) return
  if (poseIn <= 0) {
    poseIn = REMOTE.poseEvery
    const s = JSON.stringify(p.pose)
    if (s !== sentPresence.pose) {
      sentPresence.pose = s
      send('pose', p.pose)
    }
  }
  if (tripIn <= 0) {
    tripIn = REMOTE.tripEvery
    const s = JSON.stringify(p.trip)
    if (s !== sentPresence.trip) {
      sentPresence.trip = s
      send('trip', p.trip)
    }
    const look = lookJson()
    if (look !== sentPresence.avatar) {
      sentPresence.avatar = look
      send('setAvatar', { avatar: look })
    }
  }
}
export function sendEmote(id) {
  sentPresence.emote = id || ''
  if (net.connected) send('emote', { id: sentPresence.emote })
}

// --- Connection -----------------------------------------------------------------------------
function attach(room) {
  net.room = room
  net.connected = true
  const you = (msg) => {
    if (msg?.you && typeof msg.you === 'object') net.you = msg.you
  }
  room.onMessage('progress', (doc) => {
    net.hydrated = true
    lastSaved = ''
    keepClock(doc)
    you(doc)
    // A reconnect under the same identity: this tab is newer than the save, so push it instead.
    if (loadedId === sentId || !doc || isGuest()) return saveNow()
    loadedId = sentId
    const { you: _you, serverTime: _t, ...save } = doc
    store.hydrate(save)
    saveNow()
    changed('progress')
  })
  room.onMessage('noProgress', (msg) => {
    net.hydrated = true
    keepClock(msg)
    you(msg)
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
    net.daily = d
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
  room.onMessage('adRewardResult', (r) => waiting.adRewardResult?.(r))
  room.onMessage('trolled', (m) => {
    if (typeof m?.id === 'string') onTroll({ id: m.id, from: String(m.from || 'Someone').slice(0, 32), text: String(m.text || '') })
  })
  room.onLeave(() => {
    if (net.room !== room) return
    net.room = null
    net.connected = false
    net.hydrated = false
    net.daily = null
    sentPresence.pose = sentPresence.trip = ''
    sentPresence.avatar = null
    updateRoom('')
    changed('daily')
    changed('room')
    setTimeout(connect, NET.rejoin * 1000)
  })
  changed('room')
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
async function joinAnyRoom(options, userId) {
  if (SERVER_URL) return { room: await new Client(SERVER_URL).joinOrCreate('world', options), relay: '' }
  const { endpoint, relayRoomId } = await resolveServerEndpoint(/^(guest|dev)-/.test(userId) ? undefined : userId)
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
    const p = currentPresence()
    const look = lookJson()
    const options = { ...wire(id), ...(p && { pose: p.pose, trip: p.trip }), avatar: look }
    const { room, relay } = (await joinLaunchRoom(options)) ?? (await joinAnyRoom(options, id.userId))
    retryIn = NET.retry
    if (p) {
      sentPresence.pose = JSON.stringify(p.pose)
      sentPresence.trip = JSON.stringify(p.trip)
    }
    sentPresence.avatar = look
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
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) saveNow()
    // Tell the others at once (the missing beats would take a few seconds).
    if (net.connected) send(document.hidden ? 'away' : 'alive', document.hidden ? { on: true } : {})
  })
  setInterval(() => dirty && saveNow(), NET.saveEvery * 1000)
  if (!hasServer()) return console.info('[net] no server configured; progress is kept in this browser')
  subscribeAuth((s) => {
    if (!s.ready) return
    if (!net.connected) return void connect()
    const id = identity()
    // Same account (a name / picture update): the token again, so the server keeps it signed in.
    if (id.userId === sentId) return send('identify', wire(id))
    // Save under the OLD identity before switching.
    saveNow()
    net.hydrated = false
    net.daily = null
    // Signed out: back to this browser's guest save (the account's progress stays on the server).
    if (isGuestId(id.userId)) store.hydrate(store.localLoad(store.KEY))
    sentId = id.userId
    send('identify', wire(id))
  })
}
