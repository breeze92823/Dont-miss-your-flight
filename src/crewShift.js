// Phase 4 multiplayer (tunables FLIGHT.fun.crew; backend `cabin` messages, net.js sendCabin / onCabin):
//
// REPORT A STOWAWAY. Every real passenger on board shares their ticket's class (presence `cls`). Stand near
// one who is in a cabin ahead of it (sneaking into First, say) and REPORT them: the message goes to THEIR
// game, which checks it is true (they really are forward of their ticket, not hidden, not crew) and has its
// own crew escort them to their seat (the usual punishment ladder), then confirms: you get coins (once
// per passenger a flight). A false report does nothing to them.
//
// FLIGHT-ATTENDANT SHIFT. In a galley, buy a CREW SHIFT (coins): a crew pillbox hat everyone sees
// (presence `hat` 'crew' + `crew`), the crew stop caring where you walk, and a service cart rolls in
// front of you (wheels rumble). SERVE the passengers you pass: a snack arcs from the cart to them. Real
// passengers get it on their tray table (and their game sends a tip back); your neighbours thank you and
// tip too. Stowaways you catch on shift you ESCORT (bigger reward). The shift ends in a galley (END SHIFT),
// on landing (a bonus per passenger served) or when you are punished.
import { Vector3 } from 'three'
import { FLIGHT } from './config.js'
import { player } from './player.js'
import { seating } from './seating.js'
import { registerSfx, rollLoop, sfx } from './audio.js'
import { makeCart } from './airport/cabin.js'
import { makeDish } from './airport/food.js'
import { makeHat } from './suitcase.js'

const CR = FLIGHT.fun.crew
const ITEMS = Object.fromEntries(FLIGHT.menu.items.map((i) => [i.id, i]))
const rr = (a, b) => a + Math.random() * (b - a)
const pick = (a) => a[Math.floor(Math.random() * a.length)]
const ease = (t) => t * t * (3 - 2 * t)
const deg = (d) => (d * Math.PI) / 180
const an = (name) => (/^[aeiou]/i.test(name) ? `an ${name}` : `a ${name}`)

// A two-tone radio blip + static: the crew being called.
registerSfx('crewCall', ({ now, out, tone, noise }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.35, o.pan)
  noise('white', d, t, 0.25, { type: 'bandpass', f: 2200, q: 2, peak: 0.25, a: 0.01 })
  tone(d, t + 0.05, 0.1, { type: 'square', f: 1320, peak: 0.08, a: 0.002 })
  tone(d, t + 0.17, 0.12, { type: 'square', f: 990, peak: 0.08, a: 0.002 })
})
// Putting on the uniform: a fabric swish + a bright chime.
registerSfx('uniform', ({ now, out, tone, noise }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.35, o.pan)
  noise('pink', d, t, 0.35, { type: 'bandpass', f: 900, f2: 2400, q: 1.2, peak: 0.35, a: 0.05 })
  ;[784, 988, 1319].forEach((f, i) => tone(d, t + 0.2 + i * 0.08, 0.3, { type: 'triangle', f, peak: 0.18, a: 0.004 }))
})
// A tip landing in your pocket: coin clinks.
registerSfx('tip', ({ now, out, tone }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.35, o.pan)
  ;[2093, 2637, 3136].forEach((f, i) => tone(d, t + i * 0.06, 0.2, { f, peak: 0.14, a: 0.002 }))
})

// others(out): the real passengers drawn in the cabin (remote.js actors: sid, x, y, z, name, state).
// sendCabin(to, kind, item) / onCabin(fn): net.js. wear(obj): on your avatar's head (main.js).
export function createCrewShift({ scene, cabin, crowd, hud, store, fx, trip, rules, inflight, crew, neighbours, others = () => [], sendCabin = () => false, onCabin = () => {}, sayMe = () => {}, shake = () => {}, wear = () => false }) {
  const F = cabin.floorY
  const st = { phase: 'off', t: 0, on: false, served: new Set(), servedN: 0, reportAt: new Map(), paid: new Set(), act: null, said: 0, warned: new Map() }
  const timers = []
  const later = (t, fn) => timers.push({ t, fn })
  const anims = []
  const hat = makeHat('crew')
  const cart = makeCart()
  cart.scale.setScalar(1.25)
  cart.visible = false
  scene.add(cart)
  let loop = null
  const fwd = new Vector3()
  const list = []
  const pos = () => player.position
  const onMainDeck = (x, y, z) => y < F + 10 && z > cabin.zFront && z < cabin.zBack
  const inGalley = () => {
    const p = pos()
    return cabin.galleyZones.find((g) => p.x > g.x0 && p.x < g.x1 && p.z > g.z0 && p.z < g.z1)
  }

  // Is that real passenger forward of their ticket's class?
  function stowaway(p) {
    const s = p.state
    if (!s || s.zone !== 'cabin' || s.crew || s.away || !(s.cls >= 0)) return false
    if (!onMainDeck(p.x, p.y, p.z)) return false
    return cabin.classAt(p.z) < s.cls
  }
  // Am I? (a report about me is checked here, in my own game)
  function meStowaway() {
    const p = pos()
    if (st.on || rules.hidden || crew.escorting || !onMainDeck(p.x, p.y, p.z)) return false
    const z = seating.seat ? seating.seat.z : p.z
    return cabin.classAt(z) < trip.cls
  }
  function nearest(maxD, filter) {
    list.length = 0
    const all = others(list) || list
    const p = pos()
    let best = null
    let bd = maxD
    for (const o of all) {
      if (!filter(o)) continue
      const d = Math.hypot(o.x - p.x, o.z - p.z)
      if (d < bd) {
        bd = d
        best = o
      }
    }
    return best
  }

  // --- The shift ----------------------------------------------------------------------------------------
  function buyShift() {
    hud.confirm('Crew Shift', CR.shiftPrice, () => startShift(), `Work this flight as cabin crew: a uniform, a service cart, tips for every passenger you serve, and ${CR.escortCoins} coins per stowaway you escort.`)
  }
  function startShift() {
    if (st.on || st.phase !== 'cruise') return
    st.on = true
    st.servedN = 0
    st.served.clear()
    wear(hat)
    sfx('uniform', { vol: 0.45 })
    hud.big('👔 ON DUTY!', 'gold', 1.8)
    hud.toast('Push the cart down the aisles and SERVE passengers. Escort any stowaways you find!', 4)
    const p = pos()
    fx.confetti(p.x, p.y + 2.2, p.z, 30)
    loop ??= rollLoop()
  }
  function endShift(why = 'done') {
    if (!st.on) return
    st.on = false
    hat.parent?.remove(hat)
    cart.visible = false
    loop?.set(0, 0.016, 0)
    if (why === 'punished') return later(1.2, () => hud.toast('Your crew uniform was taken away!'))
    const bonus = st.servedN * CR.shiftBonus
    sfx('fanfare', { vol: 0.3 })
    hud.big('👔 SHIFT OVER!', 'gold', 1.8)
    if (bonus > 0) {
      const q = player.renderPosition
      store.addCoins(bonus, { x: q.x, y: q.y + 1.6, z: q.z })
      hud.toast(`You served ${st.servedN} passenger${st.servedN === 1 ? '' : 's'}: +${bonus} coins shift bonus!`, 3.5)
    }
  }

  // --- Serving ------------------------------------------------------------------------------------------
  // the next snack off the cart (a passenger's or a neighbour's)
  const nextItem = () => pick(CR.serveItems)
  function flyDish(item, to, done) {
    const d = makeDish(item)
    d.g.scale.setScalar(FLIGHT.menu.scale)
    const from = new Vector3().copy(cart.visible ? cart.position : pos())
    from.y = F + 1.4
    d.g.position.copy(from)
    scene.add(d.g)
    sfx('whoosh', { vol: 0.3, dur: 0.5 })
    let t = 0
    anims.push((dt) => {
      t += dt
      const k = ease(Math.min(1, t / 0.7))
      d.g.position.lerpVectors(from, to, k)
      d.g.position.y += Math.sin(k * Math.PI) * 0.8
      d.g.rotation.y += dt * 8
      if (Math.random() < 0.5) fx.trail(d.g.position.x, d.g.position.y, d.g.position.z, { glow: true, color: '#fff3c4', size: 0.06, size1: 0.01, alpha: 0.9, life: 0.4, vx: 0, vy: 0, vz: 0, grav: 0 })
      if (t < 0.7) return true
      scene.remove(d.g)
      sfx('trayDown', { vol: 0.35 })
      fx.sparkle(to.x, to.y, to.z, { count: 14, color: '#ffd84a', size: 0.16, speed: 2, up: 1.6, life: 0.6, grav: 3 })
      done()
      return false
    })
  }
  function serveTarget() {
    const p = pos()
    // real passengers first (each once a shift), then your neighbours
    const r = nearest(CR.serveRange, (o) => o.state?.zone === 'cabin' && !o.state.crew && !st.served.has(o.sid))
    if (r) return { kind: 'remote', o: r, name: r.name || 'Passenger' }
    let best = null
    let bd = CR.serveRange
    for (const n of neighbours.npcs?.() ?? []) {
      if (st.served.has(n)) continue
      const d = Math.hypot(n.x - p.x, n.z - p.z)
      if (d < bd) {
        bd = d
        best = n
      }
    }
    return best ? { kind: 'npc', o: best, name: best.name } : null
  }
  function serve() {
    const t = serveTarget()
    if (!t || st.act) return
    const item = nextItem()
    const it = ITEMS[item]
    st.act = { kind: 'serve', t: 0, dur: 1 }
    sayMe(pick([`One ${it.name}, coming up!`, 'Snack time!', `Here's your ${it.name}!`, 'Enjoy your flight!']), 1.6)
    const o = t.o
    const to = new Vector3(o.x, F + (t.kind === 'npc' ? 1.3 : 1.2), o.z)
    if (t.kind === 'remote') {
      st.served.add(o.sid)
      flyDish(item, to, () => sendCabin(o.sid, 'serve', item))
      st.servedN++
      hud.toast(`${it.icon} You served ${t.name} ${an(it.name)}!`)
    } else {
      st.served.add(o)
      flyDish(item, to, () => {
        crowd.say(o, pick(['Thank you!', 'Ooh, lovely!', 'You\'re the best!', 'Yum!']), 2)
        o.data.clap = 1
        sfx('tip', { vol: 0.35 })
        const q = player.renderPosition
        store.addCoins(CR.npcTip, { x: q.x, y: q.y + 1.6, z: q.z })
        hud.toast(`${t.name} tipped you ${CR.npcTip} coins!`)
      })
      st.servedN++
    }
  }

  // --- Reporting ------------------------------------------------------------------------------------------
  function report(o) {
    const now = st.t
    if (now - (st.reportAt.get(o.sid) ?? -99) < CR.reportCooldown) return hud.toast('The crew already know about them!')
    st.reportAt.set(o.sid, now)
    if (!sendCabin(o.sid, 'report')) return hud.toast('Not connected: nobody heard you.')
    sfx('crewCall', { vol: 0.45 })
    st.act = { kind: 'point', t: 0, dur: 1.4 }
    sayMe(st.on ? pick(['Excuse me, wrong cabin!', 'Let me see your ticket...', 'Back to your seat, please!']) : pick(['Stowaway over here!', 'They don\'t belong here!', 'Crew! This one sneaked in!']), 2)
    hud.toast(st.on ? `👮 Escorting ${o.name || 'them'} back to their seat...` : `🚨 You reported ${o.name || 'them'} to the crew!`)
  }

  // --- Messages from other passengers --------------------------------------------------------------------
  onCabin((m) => {
    if (st.phase === 'off') return
    if (m.kind === 'report') {
      if (!meStowaway()) {
        hud.toast(`${m.name} tried to report you, but you're right where your ticket says. 😇`)
        return
      }
      sfx('crewCall', { vol: 0.5 })
      hud.big('🚨 REPORTED!', 'red', 1.6)
      hud.toast(`${m.name} told the crew you sneaked in!`, 3)
      crew.escortNow?.('reported')
      sendCabin(m.from, 'reportOk')
    } else if (m.kind === 'reportOk') {
      if (st.paid.has(m.from)) return
      st.paid.add(m.from)
      const coins = st.on ? CR.escortCoins : CR.reportCoins
      sfx('fanfare', { vol: 0.3 })
      hud.big(st.on ? '👮 STOWAWAY ESCORTED!' : '✅ STOWAWAY CAUGHT!', 'gold', 1.8)
      const q = player.renderPosition
      store.addCoins(coins, { x: q.x, y: q.y + 1.6, z: q.z })
      hud.toast(`The crew walked ${m.name} back to their seat. +${coins} coins!`)
    } else if (m.kind === 'serve') {
      const it = ITEMS[m.item]
      if (!it) return
      const s = seating.seat
      if (s && s.cls != null) {
        inflight.serve(s, [it.id])
        hud.toast(`${it.icon} Flight attendant ${m.name} served you ${an(it.name)}! Tap EAT to dig in.`, 3)
        sfx('ding', { vol: 0.3 })
        sendCabin(m.from, 'tip')
      } else hud.toast(`${m.name} tried to serve you ${an(it.name)}: sit down next time!`)
    } else if (m.kind === 'tip') {
      sfx('tip', { vol: 0.4 })
      const q = player.renderPosition
      store.addCoins(CR.remoteTip, { x: q.x, y: q.y + 1.6, z: q.z })
      hud.toast(`💰 ${m.name} tipped you ${CR.remoteTip} coins!`)
    }
  })

  // --- Buttons -------------------------------------------------------------------------------------------
  rules.addActions(() => {
    const p = pos()
    if (st.phase !== 'cruise' || st.act || !onMainDeck(p.x, p.y, p.z)) return []
    const out = []
    const s = nearest(CR.reportRange, stowaway)
    if (s) out.push({ icon: st.on ? '👮' : '🚨', label: st.on ? 'ESCORT' : 'REPORT', fn: () => report(s), cls: 'red', pri: 3.5 })
    if (st.on && !seating.seat && serveTarget()) out.push({ icon: '🍪', label: 'SERVE', key: 'G', fn: serve, cls: 'green', pri: 3.4 })
    if (!seating.seat && inGalley()) {
      if (st.on) out.push({ icon: '🏁', label: 'END SHIFT', fn: () => endShift(), cls: 'blue', pri: 3 })
      else out.push({ icon: '👔', label: `CREW SHIFT 🪙${CR.shiftPrice}`, fn: buyShift, cls: 'green', pri: 3 })
    }
    return out
  })
  // on duty the crew let you go anywhere (the cockpit stays locked: luxury.js)
  rules.onDuty = () => st.on
  const prevPunished = rules.onPunished
  rules.onPunished = () => {
    prevPunished?.()
    endShift('punished')
  }

  // Other passengers on a crew shift push their own cart (drawn here, in front of them).
  const remoteCarts = (st.remoteCarts = new Map()) // sid -> { g, seen }
  function stepRemoteCarts() {
    for (const c of remoteCarts.values()) c.seen = false
    if (st.phase !== 'off') {
      list.length = 0
      for (const o of others(list) || list) {
        const s = o.state
        if (!s?.crew || s.zone !== 'cabin' || s.anim === 'sit' || !onMainDeck(o.x, o.y, o.z)) continue
        let c = remoteCarts.get(o.sid)
        if (!c) {
          const g = makeCart()
          g.scale.setScalar(1.25)
          scene.add(g)
          c = { g, seen: true }
          remoteCarts.set(o.sid, c)
        }
        c.seen = true
        c.g.position.set(o.x + Math.sin(o.yaw) * 1.3, F, o.z + Math.cos(o.yaw) * 1.3)
        c.g.rotation.y = o.yaw + Math.PI
      }
    }
    for (const [sid, c] of remoteCarts) {
      if (c.seen) continue
      scene.remove(c.g)
      remoteCarts.delete(sid)
    }
  }
  // the standing pose while you hand something over / point someone out
  const P = { ArmR1: { x: 0, y: 0, z: 0 }, ArmR2: { x: 0 }, ArmL1: { x: 0, y: 0, z: 0 }, ArmL2: { x: 0 }, Neck1: { x: 0, y: 0 } }
  function standPose() {
    const a = st.act
    if (!a || seating.seat) return null
    const k = Math.min(1, a.t / 0.2) * Math.min(1, (a.dur - a.t) / 0.25)
    P.ArmR1.x = deg(a.kind === 'serve' ? -85 : -95) * k
    P.ArmR1.z = deg(a.kind === 'serve' ? -10 : -20) * k
    P.ArmR2.x = deg(a.kind === 'serve' ? -25 : -5) * k
    P.ArmL1.x = deg(a.kind === 'serve' ? -70 : 0) * k
    P.ArmL1.z = deg(a.kind === 'serve' ? 15 : 0) * k
    P.ArmL2.x = deg(a.kind === 'serve' ? -40 : 0) * k
    return P
  }

  return {
    st,
    get on() {
      return st.on
    },
    standPose,
    // what main.js shares with the other passengers
    presence: () => ({ crew: st.on, hat: st.on ? 'crew' : '' }),
    board() {
      st.phase = 'takeoff'
      st.paid.clear()
      st.reportAt.clear()
    },
    setPhase(p) {
      st.phase = p
      if (p !== 'cruise' && st.on) endShift(p === 'landing' ? 'done' : 'off')
      if (p !== 'cruise') st.act = null
    },
    clear() {
      if (st.on) endShift('off')
      st.phase = 'off'
      timers.length = 0
      anims.length = 0
    },
    update(dt) {
      st.t += dt
      for (let i = timers.length - 1; i >= 0; i--) {
        const tm = timers[i]
        tm.t -= dt
        if (tm.t <= 0) {
          timers.splice(i, 1)
          tm.fn()
        }
      }
      for (let i = anims.length - 1; i >= 0; i--) if (!anims[i](dt)) anims.splice(i, 1)
      if (st.act) {
        st.act.t += dt
        if (st.act.t >= st.act.dur) st.act = null
      }
      stepRemoteCarts(dt)
      if (!st.on) return
      // the cart rolls in front of you on the main deck (parked while you sit or go up / into the cockpit)
      const p = player.renderPosition
      const show = !seating.seat && onMainDeck(p.x, p.y, p.z)
      cart.visible = show
      const speed = Math.hypot(player.velocity.x, player.velocity.z)
      if (show) {
        const a = player.facing
        fwd.set(Math.sin(a), 0, Math.cos(a))
        cart.position.set(p.x + fwd.x * 1.3, F, p.z + fwd.z * 1.3)
        cart.rotation.y = a + Math.PI
      }
      loop?.set(show ? speed * 1.4 : 0, dt, 0.8)
    },
  }
}
