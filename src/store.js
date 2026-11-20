// Coins + unlocks. Everything is bought with coins earned in game: no premium currency.
// Where it is saved is net.js's call: a signed-in player's progress lives on the server
// (../Dont-miss-your-flight-backend), a guest's (or everyone's without a server) in this browser.
// `snapshot()` is the saved shape, `hydrate(doc)` loads one; every change calls the save hook.
//
// data: coins, suitcases/suitcase, hats/hat (the jobs: 'security' | 'pilot'), passes (SHOP.passes
// ids), visited (DESTINATIONS codes), dest (booked DESTINATIONS index), timed { id: epoch ms the
// timed reward ends, on the server's clock } and dailyLocal (the offline Daily Reward calendar).
import { START_COINS } from './config.js'

const KEY = 'dmyf-save-v1'
const DAY_MS = 86_400_000
const defaults = () => ({
  coins: START_COINS,
  suitcases: ['purple'],
  suitcase: 'purple',
  hats: [],
  hat: null,
  passes: [],
  visited: [],
  dest: 0,
  timed: {},
  dailyLocal: { day: 0, last: -1, claimed: [] },
})

const data = defaults()
const listeners = new Set()
const emit = (e) => {
  for (const fn of listeners) fn(e)
}

// The game's clock for timed rewards: the server's when connected (net.js sets it).
let clock = () => Date.now()
let onSave = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(store.snapshot()))
  } catch {
    // storage blocked: this session only
  }
}
const save = () => onSave()

const isList = (v) => Array.isArray(v) && v.every((x) => typeof x === 'string')

export const store = {
  data,
  KEY,
  get coins() {
    return data.coins
  },
  on(fn) {
    listeners.add(fn)
    return () => listeners.delete(fn)
  },
  setClock(fn) {
    clock = fn
  },
  now: () => clock(),
  setSaveHook(fn) {
    onSave = fn
  },
  // from: optional world position the coins fly from (HUD animates them). Earned coins are doubled
  // for VIP; `raw` skips that (Daily Reward amounts, refunds).
  addCoins(n, from = null, raw = false) {
    if (!raw && n > 0 && store.has('vip')) n *= 2
    data.coins += n
    save()
    emit({ type: 'coins', delta: n, from })
    return n
  },
  spend(n) {
    if (data.coins < n) {
      emit({ type: 'broke', need: n })
      return false
    }
    data.coins -= n
    save()
    emit({ type: 'coins', delta: -n })
    return true
  },
  own(list, id) {
    if (!data[list].includes(id)) data[list].push(id)
    save()
    emit({ type: 'own', list, id })
  },
  set(key, value) {
    data[key] = value
    save()
    emit({ type: 'set', key, value })
  },

  // --- Passes, jobs and timed rewards -----------------------------------------------------------
  // Seconds left on a timed reward (0 = none / ended).
  timeLeft(id) {
    const at = data.timed[id]
    return at ? Math.max(0, (at - clock()) / 1000) : 0
  },
  // Owned for good (a pass or a job hat) or running as a timed reward.
  has(id) {
    return data.passes.includes(id) || data.hats.includes(id) || store.timeLeft(id) > 0
  },
  ownsForGood(id) {
    return data.passes.includes(id) || data.hats.includes(id)
  },
  // A timed reward for `minutes` (stacks onto one that is still running).
  grantTimed(id, minutes) {
    const from = Math.max(clock(), data.timed[id] ?? 0)
    data.timed[id] = from + minutes * 60_000
    save()
    emit({ type: 'timed', id })
  },
  // Drops ended timed rewards (and takes off a hat that was only a free shift). Returns the ids.
  expire() {
    const gone = []
    for (const id of Object.keys(data.timed)) {
      if (store.timeLeft(id) > 0) continue
      delete data.timed[id]
      gone.push(id)
    }
    if (!gone.length) return gone
    if (data.hat && !store.has(data.hat)) data.hat = null
    save()
    for (const id of gone) emit({ type: 'expired', id })
    return gone
  },
  visit(code) {
    if (data.visited.includes(code)) return false
    data.visited.push(code)
    save()
    emit({ type: 'visited', code })
    return true
  },

  // --- Offline Daily Reward calendar (net.js uses the server's when it can) -------------------------
  // The same rules as the backend's daily.ts, on this device's calendar days.
  localDaily() {
    const d = data.dailyLocal
    const today = Math.floor((Date.now() - new Date().getTimezoneOffset() * 60_000) / DAY_MS)
    if (d.last < today) {
      if (d.day === 0 || d.claimed.length >= 7) {
        d.day = 1
        d.claimed = []
      } else d.day = Math.min(7, d.day + 1)
      d.last = today
      save()
    }
    const midnight = new Date()
    midnight.setHours(24, 0, 0, 0)
    return { unlocked: d.day, claimed: [...d.claimed], nextAt: midnight.getTime(), serverTime: Date.now() }
  },
  claimLocalDaily(i) {
    const v = store.localDaily()
    if (i < 0 || i >= v.unlocked || v.claimed.includes(i)) return false
    data.dailyLocal.claimed.push(i)
    save()
    return true
  },

  // --- Save shape -----------------------------------------------------------------------------
  snapshot() {
    return {
      coins: Math.floor(data.coins),
      suitcases: [...data.suitcases],
      suitcase: data.suitcase,
      hats: [...data.hats],
      hat: data.hat ?? '',
      passes: [...data.passes],
      visited: [...data.visited],
      dest: data.dest,
      timed: { ...data.timed },
      dailyLocal: { ...data.dailyLocal, claimed: [...data.dailyLocal.claimed] },
    }
  },
  // Loads a save (server doc or browser save); missing fields keep a fresh player's values.
  hydrate(doc) {
    const d = defaults()
    const src = doc && typeof doc === 'object' ? doc : {}
    data.coins = Number.isFinite(src.coins) ? src.coins : d.coins
    data.suitcases = isList(src.suitcases) && src.suitcases.length ? [...src.suitcases] : d.suitcases
    data.suitcase = data.suitcases.includes(src.suitcase) ? src.suitcase : data.suitcases[0]
    data.hats = isList(src.hats) ? [...src.hats] : d.hats
    data.passes = isList(src.passes) ? [...src.passes] : d.passes
    data.visited = isList(src.visited) ? [...src.visited] : d.visited
    data.dest = Number.isInteger(src.dest) ? src.dest : d.dest
    data.timed = src.timed && typeof src.timed === 'object' ? { ...src.timed } : {}
    const dl = src.dailyLocal
    data.dailyLocal = dl && Number.isInteger(dl.day) && Array.isArray(dl.claimed) ? { day: dl.day, last: dl.last ?? -1, claimed: [...dl.claimed] } : d.dailyLocal
    data.hat = typeof src.hat === 'string' && src.hat ? src.hat : null
    if (data.hat && !store.has(data.hat)) data.hat = null
    emit({ type: 'hydrate' })
    emit({ type: 'coins', delta: 0 })
  },
  // A browser save, or null. `key` = KEY (guests / no server) or a per-account mirror (net.js).
  localLoad(key = KEY) {
    try {
      const raw = localStorage.getItem(key)
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  },
  localSave(key = KEY) {
    try {
      localStorage.setItem(key, JSON.stringify(store.snapshot()))
    } catch {
      // ignore
    }
  },
}

// The browser save loads at once (net.js swaps in the server's when it answers).
const local = store.localLoad()
if (local) {
  // Old saves (daily: { last, streak }) simply start the new calendar.
  store.hydrate(local)
}
