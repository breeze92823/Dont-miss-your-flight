// The cabin crew on board (airport/cabin.js is the plane, flight.js the trip).
//
// Five crew: a bartender behind the First Class bar, three attendants posted just aft of each class curtain
// (the purser at First, one at Business, one at the mid galley in front of Economy) and one patrolling
// Economy. You may always walk aft, never forward past your own class:
//   strike 1  the attendant at that curtain steps in ("Excuse me!"), the curtain stays shut, you're nudged
//             back through it and offered an upgrade (coins) on the action button
//   strike 2  firmer (WARNING 2/2), nudged back again, the offer again
//   strike 3  walked back to your seat (fade), seatbelt sign on for you for FLIGHT.crew.belted s
// Strikes are remembered FLIGHT.crew.memory s.
// The meal service (FLIGHT.crew.serviceAt s into the cruise) empties the posts: carts roll down Economy and
// Premium, a tray of champagne goes round Business, the bartender serves First. That's the window to sneak
// forward: an attendant who sees you standing in a cabin you didn't pay for (facing you, within
// FLIGHT.crew.spot m, same cabin) walks over and takes you back; one who returns to an empty post does the
// same. Sit in a free seat up there unseen for FLIGHT.crew.sneakTime s: SNEAKY UPGRADE (coins, once a flight).
// Your own meal lands on your tray table (what you ordered at check-in in Economy / Premium, plated + a
// glass of fizz up front) with steam and bubbles, and is stowed for landing.
// All sounds are synthesised (registerSfx); particles go through fx.js.
import { Group, Vector3 } from 'three'
import { FLIGHT } from './config.js'
import { player } from './player.js'
import { seating } from './seating.js'
import { registerSfx, rollLoop, sfx } from './audio.js'
import { angTo } from './linepath.js'
import { makeCart, makeServingTray } from './airport/cabin.js'

const C = FLIGHT.crew
const R = FLIGHT.rules
const rr = (a, b) => a + Math.random() * (b - a)
const pick = (a) => a[Math.floor(Math.random() * a.length)]

// --- Sounds -------------------------------------------------------------------------------------------
// A polite throat-clear: two short voiced bursts.
registerSfx('ahem', ({ now, out, tone, noise }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.3, o.pan)
  for (const [at, f] of [[0, 190], [0.2, 160]]) {
    tone(d, t + at, 0.14, { type: 'triangle', f, f2: f * 0.8, peak: 0.35, a: 0.01 })
    noise('pink', d, t + at, 0.13, { type: 'bandpass', f: 520, q: 3, peak: 0.45, a: 0.01 })
  }
})
// A curtain swept along its rod: cloth swish + the rings jingling.
registerSfx('curtain', ({ now, out, tone, noise }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.25, o.pan)
  noise('pink', d, t, 0.45, { type: 'bandpass', f: 700, f2: 2600, q: 0.9, peak: 0.6, a: 0.12 })
  for (let i = 0; i < 5; i++) tone(d, t + 0.03 + i * 0.06 + Math.random() * 0.02, 0.09, { f: 3000 + Math.random() * 1600, peak: 0.05, a: 0.002 })
})
// Glass on glass.
registerSfx('clink', ({ now, out, tone }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.25, o.pan)
  tone(d, t, 0.5, { f: 2637, peak: 0.25, a: 0.002 })
  tone(d, t, 0.3, { f: 5310, peak: 0.08, a: 0.002 })
  tone(d, t + 0.07, 0.45, { f: 3136, peak: 0.18, a: 0.002 })
})
// A cork pop and a long fizz.
registerSfx('champagne', ({ now, out, tone, noise }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.35, o.pan)
  noise('white', d, t, 0.05, { f: 1800, q: 0.7, peak: 0.9, a: 0.001 })
  tone(d, t, 0.12, { f: 520, f2: 160, peak: 0.5, a: 0.002 })
  noise('white', d, t + 0.08, 1.6, { type: 'highpass', f: 6500, peak: 0.12, a: 0.05 })
  for (let i = 0; i < 12; i++) tone(d, t + 0.1 + Math.random() * 1.2, 0.03, { f: 3000 + Math.random() * 3000, peak: 0.03, a: 0.002 })
})
// A meal tray set down on a tray table.
registerSfx('trayDown', ({ now, out, tone, noise }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.35, o.pan)
  noise('pink', d, t, 0.06, { f: 1600, q: 1.2, peak: 0.7, a: 0.002 })
  tone(d, t, 0.1, { f: 280, f2: 180, peak: 0.35 })
  noise('white', d, t + 0.05, 0.04, { f: 3800, q: 2, peak: 0.25, a: 0.002 })
})
// Seatbelt: buckle slid in, click-clack.
registerSfx('buckle', ({ now, out, tone, noise }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.35, o.pan)
  noise('white', d, t, 0.12, { type: 'bandpass', f: 2400, f2: 4200, q: 2, peak: 0.25, a: 0.03 })
  for (const at of [0.14, 0.2]) {
    noise('white', d, t + at, 0.025, { type: 'highpass', f: 3000, peak: 0.8, a: 0.001 })
    tone(d, t + at, 0.05, { f: 2200, peak: 0.12, a: 0.001 })
  }
})
// A vacuum toilet flushing behind a lavatory door.
registerSfx('flush', ({ now, out, tone, noise }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.2, o.pan)
  noise('white', d, t, 0.25, { type: 'highpass', f: 2500, peak: 0.5, a: 0.01 })
  noise('brown', d, t + 0.05, 1.4, { type: 'lowpass', f: 900, f2: 160, peak: 0.9, a: 0.04 })
  for (let i = 0; i < 6; i++) tone(d, t + 0.4 + i * 0.13, 0.08, { f: 300 + Math.random() * 300, f2: 600, peak: 0.08, a: 0.01 })
})
// Tiptoe music for sneaking forward: four plucked notes.
registerSfx('sneak', ({ now, out, tone }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.25, o.pan)
  ;[659, 784, 659, 523].forEach((f, i) => tone(d, t + i * 0.16, 0.14, { type: 'triangle', f, peak: 0.3, a: 0.004 }))
})
// Upgrade sparkle: a bright rising arpeggio.
registerSfx('upgrade', ({ now, out, tone }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.3, o.pan)
  ;[1047, 1319, 1568, 2093, 2637].forEach((f, i) => {
    tone(d, t + i * 0.07, 0.6, { f, peak: 0.18, a: 0.004 })
    tone(d, t + i * 0.07, 0.3, { f: f * 2, peak: 0.04, a: 0.004 })
  })
})
// The crew call / seatbelt ding: one soft bell.
registerSfx('ding', ({ now, out, tone }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.3, o.pan)
  tone(d, t, 1.4, { f: 1319, peak: 0.22, a: 0.004 })
  tone(d, t, 0.8, { f: 2651, peak: 0.07, a: 0.003 })
})

// --- The crew -----------------------------------------------------------------------------------------
// trip: { seat, cls, code, returnToSeat(beltedSeconds), upgradeTo(k) -> code | null, offer(cfg | null),
//         serveMeal(seat, dishIds) }
// rules (rules.js): violation(), hidden / hide, punish(reason), report(), escaped(), setLavBusy(), onAlarm.
export function createCabinCrew({ scene, crowd, cabin, hud, store, fx, trip, rules }) {
  const F = cabin.floorY
  const X = FLIGHT.cabin.x
  const AX = cabin.aisle
  const zones = cabin.zones
  const crew = []
  const timers = []
  const meals = []
  const fwd = new Vector3()
  const fadeEl = document.createElement('div')
  Object.assign(fadeEl.style, { position: 'fixed', inset: '0', background: '#06122a', opacity: '0', pointerEvents: 'none', zIndex: '40', transition: 'opacity 220ms ease' })
  document.body.appendChild(fadeEl)
  const fade = (a, ms) => {
    fadeEl.style.transition = `opacity ${ms}ms ease`
    fadeEl.style.opacity = a
  }
  const st = { susp: 0, chase: null, on: false, t: 0, service: 'before', strikes: 0, lastStrike: -99, cool: 0, sneakT: 0, sneaked: false, sneakHint: false, escorting: false, offerT: 0, lavT: 6, moteT: 0, wasForbidden: false, served: false, barT: 0 }

  const later = (t, fn) => timers.push({ t, fn })
  const line = (key, extra = {}) => pick(C.lines[key]).replace('{seat}', trip.code).replace('{cls}', extra.cls ?? zones[trip.cls].name)
  const vol = (x, z, v) => v * Math.max(0, 1 - Math.hypot(x - player.position.x, z - player.position.z) / 14)

  function addCrew(role, k, at, look) {
    const npc = crowd.add({ x: at.x, z: at.z, y: F, yaw: at.yaw ?? 0, bag: null, pack: false, ...look, name: look.name })
    if (!npc) return null
    const c = { npc, role, k, home: { x: at.x, z: at.z, yaw: at.yaw ?? 0 }, mode: 'post', path: [], v: 1.3, done: null, tray: null, cart: null, sayT: rr(3, 8), face: null }
    crew.push(c)
    return c
  }
  const UNIFORM = { shirt: '#1d2b52', arms: '#1d2b52', pants: '#16203d', hat: true, hatColor: '#16203d' }

  // --- Walking ----------------------------------------------------------------------------------------
  // Via the nearest aisle (NPCs don't collide): out to the aisle, along it, then across to the target.
  function route(c, to, ax = null) {
    const n = c.npc
    const a = ax ?? (Math.abs(to.x - X - AX) < Math.abs(to.x - X + AX) ? X + AX : X - AX)
    const pts = []
    if (Math.abs(n.x - a) > 0.15) pts.push({ x: a, z: n.z })
    if (Math.abs(n.z - to.z) > 0.15) pts.push({ x: a, z: to.z })
    pts.push({ x: to.x, z: to.z })
    return pts
  }
  function walk(c, pts, v, done) {
    c.path = pts
    c.v = v
    c.done = done
  }
  function stepWalk(c, dt) {
    const n = c.npc
    if (!c.path.length) {
      n.speed = 0
      if (c.face != null) n.yaw = angTo(n.yaw, c.face, dt * 6)
      return
    }
    const p = c.path[0]
    const dx = p.x - n.x
    const dz = p.z - n.z
    const d = Math.hypot(dx, dz)
    const step = Math.min(d, c.v * dt)
    if (d > 1e-3) {
      n.x += (dx / d) * step
      n.z += (dz / d) * step
      n.yaw = angTo(n.yaw, Math.atan2(dx, dz), dt * 8)
    }
    n.speed = dt > 0 ? step / dt : 0
    if (d - step < 0.02) {
      c.path.shift()
      if (!c.path.length) {
        n.speed = 0
        const f = c.done
        c.done = null
        f?.()
      }
    }
  }
  function goHome(c) {
    c.mode = 'busy'
    walk(c, route(c, c.home), 1.4, () => {
      c.delivering = false // back from a menu order: on duty again
      c.mode = c.role === 'walker' ? 'walk' : 'post'
      c.face = c.role === 'walker' ? null : c.home.yaw
      c.npc.mode = 'idle'
      returned(c)
    })
  }
  // Stop whatever service run this crew member is on (a new run token; props put away).
  function interrupt(c) {
    c.run = (c.run ?? 0) + 1
    takeCart(c, false)
    holdTray(c, false)
    c.path = []
    c.done = null
    // an order this one was carrying goes back to the galley queue (someone else brings it)
    if (c.order) orders.unshift(c.order)
    c.order = null
    c.delivering = false
    c.chasing = false
  }
  // On duty at a curtain: standing at the post, or stepping in to stop someone right now.
  const atPost = (c) => !!c && (c.guard || (c.mode === 'post' && Math.hypot(c.npc.x - c.home.x, c.npc.z - c.home.z) < 0.6))
  const postOf = (k) => crew.find((c) => c.role === 'post' && c.k === k)

  // --- Props carried: trays, carts ---------------------------------------------------------------------
  function holdTray(c, on) {
    if (on && !c.tray) {
      c.tray = makeServingTray()
      scene.add(c.tray)
    } else if (!on && c.tray) {
      scene.remove(c.tray)
      c.tray = null
    }
  }
  function takeCart(c, on) {
    if (on && !c.cart) {
      const g = makeCart()
      scene.add(g)
      c.cart = { g, loop: rollLoop() }
    } else if (!on && c.cart) {
      scene.remove(c.cart.g)
      c.cart.loop.set(0, 0.016, 0)
      c.cart = null
    }
  }
  function placeProps(c, dt) {
    const n = c.npc
    fwd.set(Math.sin(n.yaw), 0, Math.cos(n.yaw))
    if (c.tray) {
      c.tray.position.set(n.x + fwd.x * 0.42 - fwd.z * 0.22, F + 1.42, n.z + fwd.z * 0.42 + fwd.x * 0.22)
      c.tray.rotation.y = n.yaw
    }
    if (c.cart) {
      c.cart.g.position.set(n.x + fwd.x * 0.85, F, n.z + fwd.z * 0.85)
      c.cart.g.rotation.y = n.yaw + Math.PI
      c.cart.loop.set(n.speed * 1.6, dt, Math.min(1, vol(n.x, n.z, 1.2)))
    }
  }

  // --- Your meal ---------------------------------------------------------------------------------------
  function mealKind() {
    if (trip.cls === 0) return 'first'
    if (trip.cls === 1) return 'business'
    return trip.tags?.has?.('chicken') ? 'chicken' : 'pasta'
  }
  // The complimentary meal: real dishes on your tray (inflight.js), eaten bite by bite with EAT.
  const MEAL_DISHES = { first: ['wagyu', 'champagne'], business: ['steak', 'mocktail'], chicken: ['chicken'], pasta: ['pasta'] }
  function serveMe(c) {
    const s = trip.seat
    if (!s || st.served) return
    st.served = true
    const kind = mealKind()
    trip.serveMeal(s, MEAL_DISHES[kind])
    c.npc.mode = 'serve'
    crowd.say(c.npc, kind === 'first' ? 'Your champagne and the wagyu, enjoy!' : kind === 'business' ? 'Steak and a sunset mocktail for you.' : kind === 'chicken' ? 'Chicken, like you ordered at check-in!' : 'Pasta for you! Bon appétit.', 3)
    store.addCoins(C.mealCoins, { x: s.x, y: s.y + 1, z: s.z })
    hud.toast(`${kind === 'chicken' ? 'Chicken it is!' : kind === 'pasta' ? 'Pasta it is!' : 'Dinner is served!'} Tap EAT (or press E) to dig in.`)
  }
  function missedMeal(c) {
    if (st.served) return
    st.served = true
    crowd.say(c.npc, `Passenger in ${trip.code}...? Nobody home!`, 3)
    hud.toast('You missed the meal service! Stay in your seat next time.')
    sfx('hmm')
  }
  const inMySeat = () => !!seating.seat && seating.seat === trip.seat && !st.escorting

  // --- Orders from the menu (inflight.js) ---------------------------------------------------------------
  // Whoever is free brings it (the attendant of that cabin first: the bartender up in First, the walker
  // in Economy). An attendant who leaves a curtain post to deliver leaves that curtain unguarded...
  const orders = [] // { seat, item, onServe }
  const freeForOrder = (c) => c && !c.guard && !c.todo && !c.delivering && (c.mode === 'post' || c.mode === 'walk' || c.mode === 'pause')
  function deliverer(seat) {
    const k = seat.cls
    const pref = k === 0 ? crew.find((c) => c.role === 'bar') : k === 3 ? crew.find((c) => c.role === 'walker') : postOf(k)
    if (freeForOrder(pref)) return pref
    let best = null
    let bd = Infinity
    for (const c of crew) {
      if (!freeForOrder(c)) continue
      const d = Math.abs(c.npc.z - seat.z) + (c.role === 'post' ? 6 : 0) // keep the posts guarding if possible
      if (d < bd) {
        bd = d
        best = c
      }
    }
    return best
  }
  function runDelivery(c, o) {
    interrupt(c)
    const run = c.run
    c.mode = 'busy'
    c.delivering = true
    c.order = o
    c.face = null
    holdTray(c, true)
    c.npc.mode = 'serve'
    const seat = o.seat
    const ax = seat.aisleX
    walk(c, route(c, { x: ax, z: seat.z - 0.35 }, ax), 1.7, () => {
      if (c.run !== run) return
      c.order = null
      c.face = Math.atan2(seat.x - c.npc.x, seat.z - c.npc.z)
      const ok = o.onServe()
      if (ok) {
        crowd.say(c.npc, pick([`Here's your ${o.item.name}!`, `One ${o.item.name}, enjoy!`, 'Bon appétit!', `${o.item.name}, fresh from the galley!`]), 2.4)
        holdTray(c, false)
      }
      later(1.3, () => {
        if (c.run !== run) return
        holdTray(c, false) // (still `delivering` on the way back: they won't turn on their customer)
        c.npc.mode = 'idle'
        goHome(c)
      })
    })
  }

  // --- The meal service -----------------------------------------------------------------------------
  // A cart down `ax` through zone k's rows, a stop at each row; then back to the post.
  function cartRun(c, k, ax) {
    if (c.mode !== 'post') return
    const rows = zones[k].rows
    c.mode = 'busy'
    const run = (c.run = (c.run ?? 0) + 1)
    takeCart(c, true)
    c.npc.mode = 'push'
    const stops = rows.map((r) => ({ x: ax, z: r.z - 0.85, row: r.row }))
    const next = (i) => {
      if (c.run !== run) return
      if (i >= stops.length) {
        c.npc.mode = 'push'
        walk(c, route(c, c.home, ax), 1.1, () => {
          takeCart(c, false)
          c.npc.mode = 'idle'
          c.mode = 'post'
          c.face = c.home.yaw
          returned(c)
        })
        return
      }
      const sp = stops[i]
      walk(c, route(c, sp, ax), 0.95, () => {
        if (c.run !== run) return
        c.npc.mode = 'idle'
        c.face = ax > X ? -Math.PI / 2 : Math.PI / 2
        if (Math.random() < 0.6) crowd.say(c.npc, pick(FLIGHT.crewLines), 1.6)
        if (trip.seat && trip.seat.row === sp.row && trip.seat.cls === k) {
          if (inMySeat()) serveMe(c)
          else missedMeal(c)
        }
        later(1.5, () => {
          c.face = null
          c.npc.mode = 'push'
          next(i + 1)
        })
      })
    }
    next(0)
  }
  // A tray round zone k (Business / First): to your seat if you're in it, else along the rows.
  function trayRun(c, k, ax) {
    if (c.mode !== 'post') return
    c.mode = 'busy'
    const run = (c.run = (c.run ?? 0) + 1)
    holdTray(c, true)
    c.npc.mode = 'serve'
    const mine = trip.seat && trip.seat.cls === k ? trip.seat : null
    const rows = zones[k].rows
    const stops = mine ? [{ x: mine.aisleX + (mine.aisleX > X ? -0.25 : 0.25), z: mine.z - 0.2, row: mine.row }] : rows.map((r) => ({ x: ax, z: r.z - 0.3, row: r.row }))
    const next = (i) => {
      if (c.run !== run) return
      if (i >= stops.length) {
        walk(c, route(c, c.home, ax), 1.3, () => {
          holdTray(c, false)
          c.npc.mode = 'idle'
          c.mode = 'post'
          c.face = c.home.yaw
          returned(c)
        })
        return
      }
      const sp = stops[i]
      walk(c, route(c, sp, mine ? mine.aisleX : ax), 1.2, () => {
        if (c.run !== run) return
        c.face = Math.atan2(X - c.npc.x, 0)
        if (mine) {
          c.face = Math.atan2(mine.x - c.npc.x, mine.z - c.npc.z)
          if (inMySeat()) serveMe(c)
          else missedMeal(c)
        } else if (Math.random() < 0.5) crowd.say(c.npc, pick(['Champagne?', 'A warm towel?', 'Something to drink?']), 1.6)
        later(mine ? 2.2 : 1.2, () => {
          c.face = null
          c.npc.mode = 'serve'
          next(i + 1)
        })
      })
    }
    next(0)
  }
  function startService() {
    st.service = 'on'
    cabin.setMood('meal')
    sfx('bingBong', { vol: 0.35 })
    hud.toast('Ladies and gentlemen, our meal service is beginning!')
    // Each crew member's run starts as soon as they're free at their post (update() picks up `todo`).
    const ax = (k, other) => (trip.seat?.cls === k ? trip.seat.aisleX : other)
    for (const c of crew) {
      if (c.role === 'bar') c.todo = () => trayRun(c, 0, ax(0, X + AX))
      else if (c.role === 'post' && c.k === 1) c.todo = () => trayRun(c, 1, ax(1, X - AX))
      else if (c.role === 'post' && c.k === 2) c.todo = () => cartRun(c, 2, ax(2, X + AX))
      else if (c.role === 'post' && c.k === 3) c.todo = () => cartRun(c, 3, ax(3, X - AX))
    }
  }
  // A crew member back at their post: anyone they guard against who's still past the curtain is taken back.
  function returned(c) {
    if (crew.every((q) => (q.mode === 'post' && !q.todo) || q.role === 'walker') && st.service === 'on') {
      st.service = 'done'
      cabin.setMood('night')
      sfx('bingBong', { vol: 0.28 })
      hud.toast('Cabin lights dimmed: sit back and relax.')
    }
    if (c.role !== 'post' || st.escorting || st.chase) return
    const pz = player.position.z
    // back at the post and you're past their curtain: they turn round, very suspicious
    if (trip.cls >= c.k && pz < zones[c.k].curtain - 0.2 && !rules.hidden) {
      st.susp = Math.max(st.susp, 0.7)
      c.face = Math.atan2(player.position.x - c.npc.x, pz - c.npc.z)
      crowd.say(c.npc, '❗', 1.4)
      sfx('alertBang', { vol: vol(c.npc.x, c.npc.z, 0.4) })
    }
  }

  // --- Rules: who may go where -------------------------------------------------------------------
  // Strike at the curtain (the attendant on duty there).
  function intercept(c, k) {
    st.cool = 1.1
    const now = st.t
    st.strikes = now - st.lastStrike > C.memory ? 1 : st.strikes + 1
    st.lastStrike = now
    const n = c.npc
    const pp = player.position
    const ax = pp.x > X ? X + AX : X - AX
    const cz = zones[k].curtain
    // step into the opening, hand up (still guarding the curtain while out of position)
    c.mode = 'busy'
    c.guard = true
    n.mode = 'stop'
    walk(c, [{ x: X + (ax - X) * 0.55, z: cz + 0.55 }], 3.2, () => {
      c.face = Math.atan2(pp.x - n.x, pp.z - n.z) + Math.PI
    })
    c.face = null
    if (st.strikes >= 3) {
      st.strikes = 1
      escort(c, 'escort', 'curtain')
      return
    }
    const firm = st.strikes === 2
    crowd.say(n, line(firm ? 'firm' : 'polite', { cls: zones[k - 1].name }), 3)
    sfx('ahem', { vol: vol(n.x, n.z, firm ? 0.45 : 0.32) })
    if (firm) later(0.25, () => sfx('ding', { vol: 0.25 }))
    hud.big(firm ? 'WARNING 2/2' : 'EXCUSE ME!', firm ? 'red' : 'gold', 1.6)
    hud.toast(firm ? `Last warning! Your seat is ${trip.code} (${zones[trip.cls].name}).` : `${zones[k - 1].name} is for ticket holders. Your seat: ${trip.code}.`)
    nudge()
    // the upgrade offer, on the action button for a while
    const target = k - 1
    const price = FLIGHT.classes[target].upgrade
    if (price) {
      st.offerT = 9
      trip.offer({
        label: `${zones[target].name} has free seats!`,
        text: `Upgrade to ${zones[target].short}`,
        color: 'green',
        price,
        onTap: () => hud.confirm(`Upgrade to ${zones[target].name}`, price, () => upgrade(target, c), `Move up to ${zones[target].name} for the rest of the flight.`),
      })
    }
    later(2.6, () => {
      if (st.escorting) return
      c.guard = false
      n.mode = 'idle'
      goHome(c) // returned() then re-checks that you stayed behind the curtain
    })
  }
  // Polite but firm: back through the curtain (aft), a puff of dust, sparkle of "nope".
  function nudge() {
    player.auto = null
    player.velocity.x = 0
    player.velocity.z = C.push
    player.velocity.y = 2.2
    player.stun = 0.45
    const pp = player.position
    sfx('curtain', { vol: 0.4 })
    sfx('shove', { vol: 0.25 })
    fx.sparkle(pp.x, pp.y + 1.3, pp.z - 0.3, { count: 18, color: '#ffe08a', size: 0.26, speed: 4.5, up: 1.6, life: 0.5, grav: 3 })
    fx.puff(pp.x, pp.y + 0.1, pp.z, { count: 10, size: 0.35, spread: 0.4, up: 0.4, speed: 2, life: 0.7, alpha: 0.3, color: '#d2cbc0' })
  }
  // Fade, and you're back in your own seat with the belt on; the attendant beside your row.
  function escort(c, kind, reason = 'trespass') {
    if (st.escorting === 'now') return
    st.escorting = 'now'
    player.stun = 0.8
    st.sneakT = 0
    st.susp = 0
    const pun = rules.punish(reason) // the record decides: warning, fine, downgrade, cuffs
    fade(1, 240)
    sfx('whoosh', { vol: 0.45, dur: 0.4 })
    hud.big(pun.title ?? (kind === 'caught' ? 'BACK TO YOUR SEAT!' : 'ESCORTED BACK!'), 'red', 1.8)
    const belted = pun.belted ?? C.belted
    later(0.32, () => {
      trip.returnToSeat(belted)
      const s = trip.seat
      const n = c.npc
      n.x = s.aisleX
      n.z = s.z - 0.7
      c.path = []
      c.face = Math.atan2(s.x - n.x, s.z - n.z)
      n.mode = 'point'
      crowd.say(n, line('escort'), 3)
      cabin.setSeatbelt(true)
      sfx('buckle', { vol: 0.5 })
      later(0.3, () => sfx('ding', { vol: 0.3 }))
      hud.toast(belted === Infinity ? 'Restrained until landing!' : `Seatbelt locked for ${belted} s. Stay in ${zones[trip.cls].name}!`)
      later(0.12, () => {
        fade(0, 450)
        fx.sparkle(s.x, s.y + 0.8, s.z, { count: 22, color: '#9fd0ff', size: 0.28, speed: 3, up: 1.5, life: 0.7, grav: 2 })
      })
      later(Math.min(belted, 8), () => {
        cabin.setSeatbelt(false)
        sfx('ding', { vol: 0.25 })
      })
      later(2.4, () => {
        st.escorting = false
        c.guard = false
        n.mode = 'idle'
        goHome(c)
      })
    })
  }
  function upgrade(k, c) {
    const code = trip.upgradeTo(k)
    if (!code) {
      hud.toast(`Sorry, ${zones[k].name} is full!`)
      return
    }
    st.strikes = 0
    st.offerT = 0
    trip.offer(null)
    sfx('upgrade', { vol: 0.4 })
    sfx('fanfare')
    const pp = player.position
    fx.confetti(pp.x, pp.y + 2.2, pp.z, 60)
    fx.sparkle(pp.x, pp.y + 1.2, pp.z, { count: 30, color: zones[k].color, size: 0.35, speed: 5, up: 3, life: 1, grav: 4 })
    hud.big(`UPGRADED TO ${zones[k].short}!`, 'gold', 2.2)
    hud.toast(`Your new seat: ${code}. Enjoy ${zones[k].name}!`)
    if (c) crowd.say(c.npc, line('welcome', { cls: zones[k].name }), 3)
  }

  // --- Watching + chasing (rules.js keeps your record and does the punishing) -----------------------
  const onDuty = (c) => !c.delivering && !c.chasing
  // Can attendant c see you? Right beside them always; else facing you, within range, same cabin.
  function sees(c, pp, range) {
    const n = c.npc
    const dx = pp.x - n.x
    const dz = pp.z - n.z
    const d = Math.hypot(dx, dz)
    if (d < R.feel) return true
    if (d > range || cabin.classAt(n.z) !== cabin.classAt(pp.z)) return false
    return (Math.sin(n.yaw) * dx + Math.cos(n.yaw) * dz) / Math.max(d, 1e-3) > 0.3
  }
  // The meter: returns whether someone saw you break a rule this frame.
  function watch(dt, pp) {
    if (st.chase) return stepChase(dt, pp)
    const v = rules.violation()
    let seer = null
    if (v) {
      const range = seating.seat ? R.seatedSight : R.sight
      for (const c of crew) {
        if (onDuty(c) && sees(c, pp, range)) {
          seer = c
          break
        }
      }
    }
    if (!seer) {
      st.susp = Math.max(0, st.susp - R.suspDecay * dt)
      return false
    }
    const before = st.susp
    st.susp = Math.min(1, st.susp + R.suspRate * v.weight * dt)
    const n = seer.npc
    // a post turns to stare; a "?" the first time, a "!" when it's obvious
    if (seer.mode === 'post') seer.face = Math.atan2(pp.x - n.x, pp.z - n.z)
    seer.reactT = (seer.reactT ?? 0) - dt
    if (before < 0.05 && seer.reactT <= 0) {
      seer.reactT = 3
      crowd.say(n, '❓', 1.2)
      sfx('huh', { vol: vol(n.x, n.z, 0.4) })
    }
    if (before < 0.6 && st.susp >= 0.6) {
      crowd.say(n, `❗ ${v.label}`, 2.2)
      sfx('alertBang', { vol: vol(n.x, n.z, 0.45) })
      hud.big('👀 SPOTTED!', 'gold', 1)
    }
    if (st.susp >= 1) startChase(seer, v.kind)
    return true
  }
  function addChaser(c) {
    if (!c || c.chasing) return
    interrupt(c) // drops a cart / tray / order
    c.mode = 'busy'
    c.chasing = true
    c.guard = false
    c.face = null
    c.npc.mode = 'idle'
    c.planT = 0
    st.chase.chasers.push(c)
    crowd.say(c.npc, pick(C.lines.chase), 2)
  }
  function startChase(seer, reason) {
    if (st.chase) return
    const pp = player.position
    st.chase = { t: 0, reason, chasers: [], last: { x: pp.x, z: pp.z }, unseenT: 0, mode: 'chase', searchT: 0, helper: false, knocks: 0, knockT: 1 }
    addChaser(seer)
    sfx('whistle', { vol: 0.5 })
    later(0.1, () => sfx('alertBang', { vol: 0.4 }))
    hud.big('🚨 RUN!', 'red', 1.6)
    hud.toast('The crew are after you! Sprint (Shift / RUN), break their line of sight, then HIDE.')
  }
  // Everyone at once (the exit-door alarm).
  function alarm() {
    st.susp = 1
    const pp = player.position
    const free = crew.filter((c) => !c.chasing).sort((a, b) => Math.hypot(a.npc.x - pp.x, a.npc.z - pp.z) - Math.hypot(b.npc.x - pp.x, b.npc.z - pp.z))
    if (!st.chase) startChase(free.shift(), 'door')
    else st.chase.reason = 'door'
    if (!st.chase) return
    st.chase.helper = true
    for (const c of free.slice(0, 2)) addChaser(c)
  }
  rules.onAlarm = alarm
  // Through the aisles: along their aisle, across at the nearest galley / door cross-aisle if needed.
  function chasePath(c, to) {
    const n = c.npc
    if (Math.hypot(to.x - n.x, to.z - n.z) < 2.2) return [{ x: to.x, z: to.z }]
    const side = (x) => (x < X ? X - AX : X + AX)
    const a0 = side(n.x)
    const a1 = side(to.x)
    const pts = []
    if (Math.abs(n.x - a0) > 0.3) pts.push({ x: a0, z: n.z })
    if (a0 !== a1) {
      let cz = cabin.crossZ[0]
      for (const z of cabin.crossZ) if (Math.abs(n.z - z) + Math.abs(to.z - z) < Math.abs(n.z - cz) + Math.abs(to.z - cz)) cz = z
      pts.push({ x: a0, z: cz }, { x: a1, z: cz })
    }
    pts.push({ x: a1, z: to.z }, { x: to.x, z: to.z })
    return pts
  }
  // Returns whether a chaser sees you this frame.
  function stepChase(dt, pp) {
    const ch = st.chase
    ch.t += dt
    const hide = rules.hide
    let seen = false
    if (!hide) {
      for (const c of ch.chasers) {
        const d = Math.hypot(pp.x - c.npc.x, pp.z - c.npc.z)
        if (d < 5 || (d < R.chaseSight && cabin.classAt(c.npc.z) === cabin.classAt(pp.z))) seen = true
      }
    }
    if (seen) {
      ch.last.x = pp.x
      ch.last.z = pp.z
      ch.unseenT = 0
      if (ch.mode === 'search') {
        ch.mode = 'chase'
        sfx('alertBang', { vol: 0.4 })
        crowd.say(ch.chasers[0].npc, 'THERE!', 1.4)
      }
    } else ch.unseenT += dt
    // a second attendant joins from wherever is closest, by radio
    if (!ch.helper && ch.t > R.helperAfter) {
      ch.helper = true
      const h = crew.filter((c) => !c.chasing && !c.delivering).sort((a, b) => Math.hypot(a.npc.x - pp.x, a.npc.z - pp.z) - Math.hypot(b.npc.x - pp.x, b.npc.z - pp.z))[0]
      if (h) {
        sfx('radio', { vol: 0.4 })
        crowd.say(ch.chasers[0].npc, pick(C.lines.radio), 2)
        addChaser(h)
      }
    }
    const spotted = hide && hide.spotted
    let target = seen ? pp : ch.last
    let speed = R.chaseSpeed
    if (spotted) target = hide.at
    else if (ch.unseenT > R.loseAfter) {
      if (ch.mode !== 'search') {
        ch.mode = 'search'
        ch.searchT = 0
        crowd.say(ch.chasers[0].npc, pick(C.lines.search), 2.4)
        sfx('huh', { vol: 0.4 })
      }
      speed = R.chaseSpeed * 0.4
    }
    for (const c of ch.chasers) {
      const n = c.npc
      const d = Math.hypot(target.x - n.x, target.z - n.z)
      c.planT -= dt
      if (c.planT <= 0 && d > 0.6 && !(spotted && d < 1.6)) {
        c.planT = 0.2
        walk(c, chasePath(c, target), speed, null)
      }
      // grabbed
      if (!hide && Math.hypot(pp.x - n.x, pp.z - n.z) < R.catchDist) {
        caught(c)
        return seen
      }
      // at the hiding place they saw you use: knock knock... / the blanket comes off
      if (spotted && d < 1.6) {
        c.path = []
        c.face = Math.atan2(target.x - n.x, target.z - n.z)
        ch.knockT -= dt
        if (ch.knockT <= 0) {
          ch.knockT = 1.1
          if (hide.kind === 'blanket') {
            crowd.say(n, pick(C.lines.blanket), 2)
            rules.unhide(true)
            caught(c)
            return seen
          }
          ch.knocks++
          if (ch.knocks > R.knocks) {
            rules.unhide(true)
            caught(c)
            return seen
          }
          sfx('knock', { vol: 0.6 })
          crowd.say(n, ch.knocks >= R.knocks ? "I'm coming in!" : C.lines.knock[(ch.knocks - 1) % C.lines.knock.length], 1.6)
          hud.big('KNOCK KNOCK!', 'gold', 0.8)
        }
      }
    }
    // searching where they lost you, then giving up
    if (ch.mode === 'search' && !spotted) {
      ch.searchT += dt
      for (const c of ch.chasers) if (!c.path.length) c.npc.yaw += Math.sin(st.t * 2 + c.k) * dt * 2.5 // looking around
      if (ch.searchT > R.searchTime) giveUp()
    }
    return seen
  }
  function endChase() {
    const ch = st.chase
    st.chase = null
    if (!ch) return []
    for (const c of ch.chasers) c.chasing = false
    return ch.chasers
  }
  function giveUp() {
    const chasers = endChase()
    st.susp = 0.35
    for (const c of chasers) {
      crowd.say(c.npc, pick(C.lines.lost), 2)
      c.npc.mode = 'idle'
      goHome(c)
    }
    rules.escaped()
  }
  function caught(c) {
    const reason = st.chase?.reason ?? 'trespass'
    const chasers = endChase()
    for (const q of chasers) if (q !== c) goHome(q)
    c.mode = 'busy'
    c.path = []
    c.npc.mode = 'stop'
    crowd.say(c.npc, pick(C.lines.gotcha), 2)
    hud.big('GOTCHA!', 'red', 1)
    const pp = player.position
    fx.sparkle(pp.x, pp.y + 1.6, pp.z, { count: 20, color: '#ffe14a', size: 0.25, speed: 4, up: 2, life: 0.6, grav: 4 })
    fx.puff(pp.x, pp.y + 0.1, pp.z, { count: 10, size: 0.4, alpha: 0.35, life: 0.6, color: '#d2cbc0' })
    player.stun = 0.6
    player.velocity.x = player.velocity.z = 0
    later(0.35, () => escort(c, 'caught', reason))
  }

  // --- Lifecycle --------------------------------------------------------------------------------------
  function clear() {
    for (const c of crew) {
      holdTray(c, false)
      takeCart(c, false)
      crowd.remove(c.npc)
    }
    crew.length = 0
    timers.length = 0
    orders.length = 0
    stowMeals(false)
    fade(0, 0)
  }
  function stowMeals(loud = true) {
    for (const m of meals) {
      if (loud) fx.puff(m.g.position.x, m.g.position.y + 0.1, m.g.position.z, { count: 8, size: 0.25, alpha: 0.35, life: 0.5, color: '#ffffff' })
      scene.remove(m.g)
    }
    if (loud && meals.length) sfx('trayDown', { vol: 0.3 })
    meals.length = 0
  }

  return {
    // On board: crew to their places.
    start() {
      clear()
      Object.assign(st, { susp: 0, chase: null, on: true, t: 0, service: 'before', strikes: 0, lastStrike: -99, cool: 0, sneakT: 0, sneaked: false, sneakHint: false, escorting: false, offerT: 0, served: false, barT: 0 })
      const g = cabin.galley
      addCrew('bar', 0, { x: g.front.x, z: g.front.z, yaw: 0 }, { shirt: '#f4f5f7', arms: '#f4f5f7', pants: '#16203d', hat: false, name: 'bartender' })
      for (let k = 1; k < zones.length; k++) {
        const p = cabin.posts[k]
        addCrew('post', k, p, { ...UNIFORM, hatColor: k === 1 ? '#7a5a1c' : '#16203d', name: k === 1 ? 'purser' : 'flight attendant' })
      }
      const w = addCrew('walker', 3, { x: X + AX, z: g.back.z, yaw: Math.PI }, { ...UNIFORM, name: 'flight attendant' })
      if (w) w.mode = 'walk'
    },
    stop: clear,
    stowMeals,
    // Someone (the lounge bartender, a woken-up crew member) calls it in: the nearest attendant takes you back.
    escortNow(reason) {
      if (st.escorting) return
      const pp = player.position
      const c = crew.filter((q) => !q.chasing).sort((a, b) => Math.hypot(a.npc.x - pp.x, a.npc.z - pp.z) - Math.hypot(b.npc.x - pp.x, b.npc.z - pp.z))[0]
      if (!c) return
      if (st.chase) for (const q of endChase()) if (q !== c) goHome(q)
      interrupt(c)
      c.mode = 'busy'
      escort(c, 'caught', reason)
    },
    // An order for `seat`: onServe() at the seat puts it on the tray (false: nothing to hand over).
    deliver(seat, item, onServe) {
      orders.push({ seat, item, onServe })
    },
    get escorting() {
      return !!st.escorting
    },
    // Every frame on board. phase: takeoff | cruise | landing; cruiseT = s since the seatbelt sign went off.
    update(dt, phase, cruiseT, others = []) {
      if (!st.on) return
      st.t += dt
      st.cool = Math.max(0, st.cool - dt)
      for (let i = timers.length - 1; i >= 0; i--) {
        const tm = timers[i]
        tm.t -= dt
        if (tm.t <= 0) {
          timers.splice(i, 1)
          tm.fn()
        }
      }
      for (const c of crew) {
        stepWalk(c, dt)
        placeProps(c, dt)
      }
      const pp = player.position
      const cruising = phase === 'cruise'

      // Economy walker: up and down an aisle between the galleys, now and then a word.
      const w = crew.find((c) => c.role === 'walker')
      if (w && w.mode === 'walk' && !w.path.length) {
        // (not down the aisle your seat camera sits in while you're seated)
        const ax = seating.seat ? 2 * X - seating.seat.aisleX : Math.random() < 0.5 ? X - AX : X + AX
        const zs = zones[3].rows
        const to = { x: ax, z: rr(zs[0].z, zs[zs.length - 1].z) }
        walk(w, route(w, to, ax), 1.1, () => {
          w.mode = 'pause'
          if (Math.random() < 0.4) crowd.say(w.npc, pick(['Blanket?', 'Water, anyone?', 'Seatbelts loosely fastened, please.', 'Headphones are in the pocket.']), 2.4)
          later(rr(2, 5), () => w.mode === 'pause' && (w.mode = 'walk'))
        })
      }

      // The service: each run starts once that crew member is free at their post.
      if (cruising && st.service === 'before' && cruiseT > C.serviceAt) startService()
      for (const c of crew) {
        if (!c.todo || c.mode !== 'post' || c.guard || st.escorting) continue
        const run = c.todo
        c.todo = null
        run()
      }
      // menu orders: the next free attendant takes the next one
      if (orders.length && !st.escorting) {
        const c = deliverer(orders[0].seat)
        if (c) runDelivery(c, orders.shift())
      }

      // Curtains: open for crew passing, for you going where you may (or sneaking past an empty post),
      // and for the other passengers.
      for (const cu of cabin.curtains) {
        let open = 0
        const near = (x, z, r = 1.4) => Math.abs(z - cu.cz) < r && Math.abs(x - cu.ax) < 1.0
        for (const c of crew) if (near(c.npc.x, c.npc.z) || (c.cart && near(c.cart.g.position.x, c.cart.g.position.z, 1.6))) open = 1
        for (const o of others) if (near(o.x, o.z)) open = 1
        if (near(pp.x, pp.z)) {
          const allowed = trip.cls < cu.k
          const post = postOf(cu.k)
          if (allowed || !atPost(post)) open = 1
        }
        if (open && cu.target === 0 && cu.open < 0.2 && cu.dir > 0) {
          sfx('curtain', { vol: vol(cu.ax, cu.cz, 0.3) })
          fx.puff(cu.ax, F + 1.6, cu.cz, { count: 4, size: 0.3, spread: 0.5, up: 0.1, speed: 0.6, life: 0.9, alpha: 0.12, color: '#ffffff' })
        }
        cu.target = open
      }

      // You, past a curtain you shouldn't be.
      let seenNow = false
      if (cruising && !st.escorting) {
        const zone = cabin.classAt(pp.z)
        const forbidden = zone < trip.cls
        // at a guarded curtain: the attendant there steps in
        if (st.cool <= 0 && !st.chase) {
          for (let k = trip.cls; k >= 1; k--) {
            const cz = zones[k].curtain
            const post = postOf(k)
            if (pp.z < cz + 0.5 && pp.z > cz - 1.6 && atPost(post)) {
              intercept(post, k)
              break
            }
          }
        }
        if (forbidden) {
          if (!st.wasForbidden && !st.sneakHint && st.service === 'on') {
            st.sneakHint = true
            hud.big('SNEAKING...', 'gold', 1.6)
            hud.toast(`The crew is busy with the meal! Grab a free seat in ${zones[zone].name} and sit tight for ${C.sneakTime} s.`)
            sfx('sneak', { vol: 0.35 })
          }
        }
        // The crew watching: whoever sees a rule broken fills the meter; full = a chase.
        seenNow = watch(dt, pp)
        if (forbidden) {
          // sitting tight in someone else's cabin, unseen
          if (seating.seat && seating.seat.cls < trip.cls && !st.escorting && !seenNow && !st.chase) {
            st.sneakT += dt
            if (st.sneakT >= C.sneakTime && !st.sneaked) {
              st.sneaked = true
              const s = seating.seat
              sfx('upgrade', { vol: 0.35 })
              hud.big('SNEAKY UPGRADE!', 'gold', 2)
              fx.sparkle(s.x, s.y + 1, s.z, { count: 36, color: '#ffd84a', size: 0.3, speed: 4, up: 3, life: 1, grav: 4 })
              store.addCoins(C.sneakReward, { x: s.x, y: s.y + 1.4, z: s.z })
            }
          } else st.sneakT = 0
        } else st.sneakHint = false
        st.wasForbidden = forbidden
      }

      if (!cruising) st.susp = 0
      rules.report(st.chase ? 1 : st.susp, !!st.chase, seenNow)

      // The upgrade offer times out.
      if (st.offerT > 0) {
        st.offerT -= dt
        if (st.offerT <= 0) trip.offer(null)
      }

      // Posts: a word when you pass; the bartender pours for First passengers at the bar.
      for (const c of crew) {
        c.sayT -= dt
        if (c.mode !== 'post' || c.sayT > 0) continue
        const d = Math.hypot(pp.x - c.npc.x, pp.z - c.npc.z)
        if (d < 2.6) {
          c.sayT = rr(10, 16)
          if (c.role === 'bar') {
            if (trip.cls === 0 && cruising) {
              crowd.say(c.npc, pick(['Champagne, darling?', 'Something from the bar?', 'On the house, of course.']), 2.6)
              sfx('pour', { vol: 0.3 })
              later(0.7, () => sfx('champagne', { vol: 0.25 }))
              for (let i = 0; i < 6; i++) later(0.8 + i * 0.12, () => fx.sparkle(c.npc.x, F + 1.2, c.npc.z + 0.55, { count: 2, color: '#ffe8a0', size: 0.08, speed: 0.2, up: 0.6, life: 0.9, grav: -0.6 }))
            }
          } else if (trip.cls < c.k || cabin.classAt(pp.z) >= c.k) crowd.say(c.npc, pick(C.lines.post), 2.4)
        }
      }

      // Meals: steam and bubbles.
      for (const m of meals) {
        m.t += dt
        if (m.t < 50 && Math.random() < dt * 4) {
          const p = m.g.userData.steam
          fx.puff(m.g.position.x + p.x, m.g.position.y + p.y, m.g.position.z + p.z, { count: 1, size: 0.08, grow: 3, spread: 0.03, up: 0.35, speed: 0.05, life: 1.4, alpha: 0.22, color: '#ffffff', drag: 1 })
        }
        if (m.g.userData.fancy && Math.random() < dt * 6) {
          const p = m.g.userData.fizz
          fx.sparkle(m.g.position.x + p.x, m.g.position.y + p.y - 0.05, m.g.position.z + p.z, { count: 1, color: '#ffe8a0', size: 0.05, speed: 0.05, up: 0.25, life: 0.6, grav: -0.5 })
        }
      }

      // Lavatories: occupied / vacant now and then (a flush when one frees up near you).
      st.lavT -= dt
      if (st.lavT <= 0) {
        st.lavT = rr(6, 14)
        const i = Math.floor(Math.random() * 4)
        const busy = Math.random() < 0.5
        rules.setLavBusy(i, busy)
        if (!busy && Math.random() < 0.6) sfx('flush', { vol: 0.08 })
      }

      // Dust motes drifting in the light shafts (gold ones in First).
      st.moteT -= dt
      if (st.moteT <= 0) {
        st.moteT = 0.12
        const first = cabin.classAt(pp.z) === 0
        const side = first ? (Math.random() < 0.5 ? -1 : 1) : -1
        const x = X + side * rr(1.6, 3.4)
        fx.trail(x, F + rr(0.4, 2.0), pp.z + rr(-4, 4), { glow: true, color: first ? '#ffd27a' : '#fff6dc', size: 0.035, size1: 0.045, alpha: 0.45, life: 3.5, vx: rr(-0.05, 0.05), vy: rr(-0.02, 0.05), vz: rr(-0.05, 0.05), drag: 0.1, grav: 0, fadeIn: 0.3 })
      }
    },
  }
}
