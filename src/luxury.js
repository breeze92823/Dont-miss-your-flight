// Phase 3: the cockpit, the Sky Lounge upstairs and the luxury seats (geometry: airport/deck.js).
//
// COCKPIT. Four ways onto the flight deck: (1) the KEYPAD - the code is on a crew note in the front galley
// (SEARCH it, risky: it's crew-only), three wrong codes call security; (2) the first officer's COFFEE RUN -
// every so often the door stands open while he fetches a coffee (SNEAK IN); (3) a COCKPIT TOUR - free for
// First, coins for anyone else with a clean record; (4) the PILOT UNIFORM from the crew-rest locker - the
// door opens for you and the pilots think you're the relief crew. Inside: PA (a captain's announcement to
// everyone), the SEATBELT sign, THRUST (engines roar), AUTOPILOT off (the plane lurches). A stranger fills
// the pilots' suspicion (faster near them, and with every control): full = SECURITY BREACH (rules.breach).
// Out again unseen = CAPTAIN SNEAKY (coins, once a flight). Doorway + stair are scripted walks.
//
// SKY LOUNGE. The spiral stair in First's stair hall: climb it, fade, you're upstairs. A Sky Bar (cocktails
// shaken + slid down the bar, drunk on the spot with their effect), sofas and stools to sit on, a SPA shower
// (steam, water, frosted glass: "squeaky clean"), and the CREW REST (a sleeper who wakes up if you linger,
// the locker with the pilot uniform). The lounge is First Class: anyone else the bartender spots fills his
// meter and gets escorted down (crew.escortNow).
//
// LUXURY SEATS (First + Business seats, sneakers too): BED (Z) - lie flat under a duvet, Zzz, the flight
// passes x`sleepTime`; MASSAGE (X) - the seat rumbles, you jiggle, a calm effect after; DOORS (C, First
// suites) - privacy doors slide shut: nobody sees you in there (rules.setPrivate).
import { Group, Mesh, MeshStandardMaterial, SphereGeometry, Vector3 } from 'three'
import { FLIGHT } from './config.js'
import { player, resetPlayer } from './player.js'
import { seating, sit, standUp, SIT } from './seating.js'
import { inputState, onKey } from './input.js'
import { registerSfx, sfx } from './audio.js'
import { makeDish } from './airport/food.js'
import { rbox } from './detail.js'
import { syncYawToPlayer } from './camera.js'
import { ICON } from './hud/icons.js'

const LX = FLIGHT.luxury
const PL = LX.pilots
const rr = (a, b) => a + Math.random() * (b - a)
const pick = (a) => a[Math.floor(Math.random() * a.length)]
const ease = (t) => t * t * (3 - 2 * t)
const deg = (d) => (d * Math.PI) / 180

// --- Sounds -------------------------------------------------------------------------------------------
registerSfx('keyBeep', ({ now, out, tone }, o) => {
  const t = now()
  tone(out(o.vol ?? 0.3, o.pan), t, 0.08, { type: 'square', f: o.f ?? 1400, peak: 0.12, a: 0.002 })
})
registerSfx('keyOk', ({ now, out, tone }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.35, o.pan)
  ;[1319, 1760, 2637].forEach((f, i) => tone(d, t + i * 0.09, 0.18, { type: 'square', f, peak: 0.1, a: 0.002 }))
})
registerSfx('keyBad', ({ now, out, tone }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.4, o.pan)
  tone(d, t, 0.45, { type: 'square', f: 140, peak: 0.18, a: 0.004, curve: 'hold' })
  tone(d, t, 0.45, { type: 'square', f: 147, peak: 0.14, a: 0.004, curve: 'hold' })
})
// Rummaging through galley drawers.
registerSfx('rummage', ({ now, out, tone, noise }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.35, o.pan)
  for (let i = 0; i < 6; i++) {
    const at = t + i * 0.17 + Math.random() * 0.05
    noise('pink', d, at, 0.08, { type: 'bandpass', f: rr(900, 2600), q: 1.5, peak: 0.6, a: 0.004 })
    if (i % 2) tone(d, at, 0.05, { f: rr(2000, 3500), peak: 0.06, a: 0.002 })
  }
})
// The autopilot disconnect "cavalry charge".
registerSfx('apOff', ({ now, out, tone }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.35, o.pan)
  for (let i = 0; i < 6; i++) tone(d, t + i * 0.16, 0.15, { type: 'square', f: i % 2 ? 1050 : 820, peak: 0.1, a: 0.004, curve: 'hold' })
})
// The engines spooling up hard.
registerSfx('roar', ({ now, out, tone, noise }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.45, o.pan)
  noise('brown', d, t, 2.6, { type: 'lowpass', f: 300, f2: 1200, peak: 0.9, a: 0.4 })
  noise('white', d, t, 2.6, { type: 'bandpass', f: 1800, f2: 4200, q: 1.2, peak: 0.25, a: 0.5 })
  tone(d, t, 2.6, { type: 'sawtooth', f: 90, f2: 220, peak: 0.08, a: 0.5 })
})
// The PA chime (two-tone, like a real cabin call).
registerSfx('paChime', ({ now, out, tone }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.35, o.pan)
  tone(d, t, 1.0, { f: 784, peak: 0.25, a: 0.004 })
  tone(d, t + 0.45, 1.2, { f: 622, peak: 0.25, a: 0.004 })
})
// A cocktail shaker.
registerSfx('shaker', ({ now, out, noise, tone }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.35, o.pan)
  for (let i = 0; i < 10; i++) {
    const at = t + i * 0.11
    noise('white', d, at, 0.06, { type: 'bandpass', f: 3500 + (i % 2) * 1500, q: 2, peak: 0.6, a: 0.003 })
    tone(d, at, 0.04, { f: 2400 + Math.random() * 1600, peak: 0.05, a: 0.002 })
  }
})
// A glass sliding down the bar to a stop.
registerSfx('slide', ({ now, out, noise, tone }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.3, o.pan)
  noise('pink', d, t, 0.6, { type: 'bandpass', f: 1600, f2: 800, q: 2, peak: 0.4, a: 0.03 })
  tone(d, t + 0.6, 0.3, { f: 2637, peak: 0.12, a: 0.002 })
})
// Shower running (loop it by re-triggering).
registerSfx('showerRun', ({ now, out, noise }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.25, o.pan)
  noise('white', d, t, 0.55, { type: 'bandpass', f: 5200, q: 0.6, peak: 0.5, a: 0.05 })
  noise('pink', d, t, 0.55, { type: 'lowpass', f: 900, peak: 0.25, a: 0.05 })
})
// The massage seat's motors.
registerSfx('massage', ({ now, out, tone, noise }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.25, o.pan)
  tone(d, t, 0.45, { type: 'sawtooth', f: 48, peak: 0.18, a: 0.05, vib: 6, vibRate: 9, curve: 'hold' })
  noise('brown', d, t, 0.45, { type: 'lowpass', f: 200, peak: 0.5, a: 0.05 })
})
// Lounge ambience: a soft jazzy chord.
registerSfx('loungeChord', ({ now, out, tone }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.12, o.pan)
  for (const f of o.notes ?? [262, 330, 392, 494]) tone(d, t + Math.random() * 0.05, 2.8, { type: 'triangle', f, peak: 0.12, a: 0.4 })
})
// A metal locker door.
registerSfx('locker', ({ now, out, tone, noise }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.4, o.pan)
  tone(d, t, 0.4, { type: 'triangle', f: 420, f2: 610, peak: 0.08, a: 0.02 })
  noise('white', d, t + 0.35, 0.08, { type: 'bandpass', f: 1500, q: 1.2, peak: 0.6, a: 0.002 })
  tone(d, t + 0.35, 0.6, { f: 330, peak: 0.08, a: 0.002 })
})
const CHORDS = [[262, 330, 392, 494], [220, 277, 330, 415], [294, 349, 440, 523], [247, 311, 370, 466]]

// Lying flat (the bed): straight legs, hands folded on the chest.
const LIE = {
  LegL1: { x: 0 },
  LegR1: { x: 0 },
  LegL2: { x: 0 },
  LegR2: { x: 0 },
  ArmL1: { x: deg(-30), z: deg(18) },
  ArmR1: { x: deg(-30), z: deg(-18) },
  ArmL2: { x: deg(-85) },
  ArmR2: { x: deg(-85) },
  Spine1: { x: 0 },
}
const JIGGLE = {}
for (const k in SIT) JIGGLE[k] = { ...SIT[k] }
JIGGLE.Neck1 = { x: 0 }

// hooks: { bump(k), roar(), timeScale(k), drone(on) }. setDisguise(on): the pilot cap on your avatar.
export function createLuxury({ scene, cabin, deck, crowd, hud, store, fx, trip, rules, inflight, crew, hooks, setDisguise = () => {}, sayMe = () => {}, shake = () => {} }) {
  const F = cabin.floorY
  const C = deck.cockpit
  const LG = deck.lounge
  const st = {
    phase: 'off',
    t: 0,
    script: null, // { pts, i, seg, speed, done, face }
    code: '0000',
    note: false,
    wrong: 0,
    legal: null, // in the cockpit as: 'tour' | 'uniform' | null (a stranger)
    tourT: 0,
    pilotSusp: 0,
    pilotSay: 0,
    sneakyPaid: false,
    sneaked: false, // went in as a stranger this visit
    ctrlT: 0,
    coffee: null, // { stage, t }
    coffeeIn: 60,
    disguised: false,
    upSusp: 0,
    upSay: 0,
    restT: 0,
    sleeperAwake: false,
    shower: null,
    bed: null,
    massage: 0,
    doors: null, // { seat, k, target, panels }
    chordT: 0,
    climbStep: 0,
    hintedCoffee: false,
    tourUsed: false,
  }
  const timers = []
  const later = (t, fn) => timers.push({ t, fn })
  const pilots = []
  let barman = null
  const tmp = new Vector3()
  const where = () => (player.position.y > F + 20 ? 'lounge' : player.position.z < C.zF - 0.2 ? 'cockpit' : 'main')
  const near = (a, r) => Math.hypot(player.position.x - a.x, player.position.z - a.z) < r

  // --- Props: the bed duvet, the sleeper in the crew rest, the privacy doors -------------------------
  const duvet = new Group()
  {
    const m = new MeshStandardMaterial({ color: '#f4efe4', roughness: 0.95 })
    const b = new Mesh(rbox(1.0, 0.18, 1.3, 0.08, 2), m)
    b.position.set(0, 0, 0)
    duvet.add(b)
    const fold = new Mesh(rbox(1.01, 0.06, 0.25, 0.03, 1), new MeshStandardMaterial({ color: '#c9a14a', roughness: 0.8 }))
    fold.position.set(0, 0.09, 0.55)
    duvet.add(fold)
    const pillow = new Mesh(rbox(0.7, 0.16, 0.42, 0.07, 2), new MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 }))
    pillow.position.set(0, -0.42, 1.05)
    duvet.add(pillow)
    duvet.visible = false
    scene.add(duvet)
  }
  const sleeper = new Group()
  {
    const blanket = new Mesh(new SphereGeometry(0.4, 14, 10).scale(1, 0.45, 2.2), new MeshStandardMaterial({ color: '#1d2b52', roughness: 0.95 }))
    blanket.position.y = 0.12
    sleeper.add(blanket)
    const head = new Mesh(new SphereGeometry(0.17, 12, 10), new MeshStandardMaterial({ color: '#e8b890', roughness: 0.7 }))
    head.position.set(0, 0.2, 0.78)
    sleeper.add(head)
    const cap = new Mesh(new SphereGeometry(0.18, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new MeshStandardMaterial({ color: '#16203d', roughness: 0.6 }))
    cap.position.set(0, 0.25, 0.8)
    cap.rotation.x = 0.4
    sleeper.add(cap)
    sleeper.position.set(LG.bunk.x, LG.bunk.y, LG.bunk.z)
    sleeper.visible = false
    scene.add(sleeper)
  }
  const doorMat = cabin.mats.wood
  function makeDoorPanel() {
    const m = new Mesh(rbox(0.05, 1.28, 0.95, 0.02, 1), doorMat)
    scene.add(m)
    return m
  }

  // --- Scripted walks (the doorway, the stair, the shower) -----------------------------------------
  // pts: [{ x, y?, z, face? }]; speed m/s. While it runs you're frozen and moved along it.
  function walkPath(pts, speed, done) {
    if (seating.seat) standUp()
    player.frozen = true
    player.auto = null
    const p = player.position
    st.script = { pts: [{ x: p.x, y: p.y, z: p.z }, ...pts], i: 0, k: 0, speed, done }
  }
  function stepScript(dt) {
    const s = st.script
    if (!s) return
    const a = s.pts[s.i]
    const b = s.pts[s.i + 1]
    if (!b) {
      st.script = null
      player.frozen = false
      s.done?.()
      return
    }
    if (a.y == null) a.y = player.position.y
    if (b.y == null) b.y = a.y
    const len = Math.max(0.01, Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z))
    s.k += (dt * (b.speed ?? s.speed)) / len
    const k = Math.min(1, s.k)
    const y = a.y + (b.y - a.y) * k
    const face = b.face ?? Math.atan2(b.x - a.x, b.z - a.z)
    resetPlayer({ x: a.x + (b.x - a.x) * k, y, z: a.z + (b.z - a.z) * k }, Number.isFinite(face) ? face : player.facing)
    b.on?.(k)
    if (s.k >= 1) {
      s.i++
      s.k = 0
      b.arrive?.()
    }
  }
  const fadeTo = (fn) => {
    hud.cine.fade(1, 260)
    sfx('whoosh', { vol: 0.35, dur: 0.4 })
    later(0.3, () => {
      fn()
      syncYawToPlayer()
      later(0.1, () => hud.cine.fade(0, 380))
    })
  }

  // --- Pilots + the coffee run -------------------------------------------------------------------------
  function spawnPilots() {
    for (const p of pilots) crowd.remove(p.npc)
    pilots.length = 0
    C.pilots.forEach((at, i) => {
      const npc = crowd.add({ x: at.x, z: at.z, y: F + 0.01, yaw: Math.PI, bag: null, pack: false, shirt: '#f4f5f7', arms: '#f4f5f7', pants: '#16203d', hat: true, hatColor: '#16203d' })
      if (!npc) return
      npc.mode = 'sit'
      pilots.push({ npc, seat: at, path: [], v: 1.3, done: null })
    })
  }
  function pilotWalk(p, pts, done) {
    p.path = pts
    p.done = done
    p.npc.mode = 'idle'
  }
  function stepPilots(dt) {
    for (const p of pilots) {
      const n = p.npc
      if (!p.path.length) {
        n.speed = 0
        continue
      }
      const q = p.path[0]
      const dx = q.x - n.x
      const dz = q.z - n.z
      const d = Math.hypot(dx, dz)
      const step = Math.min(d, p.v * dt)
      if (d > 1e-3) {
        n.x += (dx / d) * step
        n.z += (dz / d) * step
        n.yaw = Math.atan2(dx, dz)
      }
      n.speed = dt > 0 ? step / dt : 0
      if (d - step < 0.02) {
        p.path.shift()
        if (!p.path.length) {
          n.speed = 0
          const f = p.done
          p.done = null
          f?.()
        }
      }
    }
  }
  function coffeeRun() {
    const fo = pilots[1]
    if (!fo || st.coffee) return
    st.coffee = { stage: 'out' }
    deck.setDoor(true)
    sfx('pneumatic', { vol: 0.35 })
    sfx('ding', { vol: 0.2 })
    crowd.say(fo.npc, pick(PL.coffee), 2.4)
    if (!st.hintedCoffee && (where() !== 'lounge') && player.position.z < cabin.zones[1].curtain) {
      st.hintedCoffee = true
      hud.toast('👀 The cockpit door is open! The first officer went for a coffee...')
    }
    const g = { x: C.door.x + 1.3, z: C.zF + 1.25 }
    pilotWalk(fo, [{ x: C.door.x + 0.3, z: C.zF - 0.8 }, { x: C.door.x, z: C.zF + 0.6 }, g], () => {
      fo.npc.mode = 'serve'
      fo.npc.yaw = Math.PI / 2
      sfx('pour', { vol: 0.25 })
      later(LX.coffeeTime, () => {
        pilotWalk(fo, [{ x: C.door.x, z: C.zF + 0.6 }, { x: C.door.x + 0.3, z: C.zF - 0.8 }, { x: fo.seat.x, z: fo.seat.z + 0.6 }, { x: fo.seat.x, z: fo.seat.z }], () => {
          fo.npc.mode = 'sit'
          fo.npc.yaw = Math.PI
          deck.setDoor(false)
          sfx('pneumatic', { vol: 0.3 })
          st.coffee = null
          st.coffeeIn = rr(...LX.coffeeEvery)
          // back in his seat: a stranger in here is VERY noticeable
          if (where() === 'cockpit' && !st.legal) {
            st.pilotSusp = Math.min(1, st.pilotSusp + 0.6)
            crowd.say(fo.npc, pick(PL.hm), 2)
          }
        })
      })
    })
  }

  // --- The cockpit door: keypad, tour, uniform, sneaking in ----------------------------------------
  function enterCockpit(as) {
    st.legal = as
    st.sneaked = !as
    st.pilotSusp = 0
    st.tourT = as === 'tour' ? LX.tourTime : 0
    deck.setDoor(true)
    sfx('pneumatic', { vol: 0.4 })
    walkPath([{ x: C.door.x, z: C.zF + 0.9 }, { x: C.door.x, z: C.zF - 0.4 }, { x: C.inside.x, z: C.inside.z }], 3.2, () => {
      if (!st.coffee) {
        deck.setDoor(false)
        sfx('pneumatic', { vol: 0.3 })
      }
      if (as === 'tour') {
        hud.big('✈️ COCKPIT TOUR!', 'gold', 1.8)
        crowd.say(pilots[0]?.npc, pick(PL.hello), 2.6)
      } else if (as === 'uniform') {
        hud.big('👨‍✈️ ON THE FLIGHT DECK', 'gold', 1.8)
        crowd.say(pilots[0]?.npc, pick(PL.relief), 2.6)
      } else {
        hud.big('🤫 IN THE COCKPIT!', 'gold', 1.6)
        hud.toast('The pilots haven\'t noticed you... yet. Press buttons, then get out unseen!')
        sfx('sneak', { vol: 0.35 })
      }
      const p = player.position
      fx.sparkle(p.x, p.y + 1.5, p.z, { count: 20, color: '#7ad8ff', size: 0.22, speed: 2.5, up: 2, life: 0.7, grav: 3 })
    })
  }
  function leaveCockpit(forced = false) {
    deck.setDoor(true)
    sfx('pneumatic', { vol: 0.35 })
    const was = st.sneaked && !forced
    walkPath([{ x: C.door.x, z: C.zF - 0.5 }, { x: C.door.x, z: C.zF + 0.6 }, { x: C.outside.x, z: C.outside.z }], 3.4, () => {
      if (!st.coffee) {
        deck.setDoor(false)
        sfx('pneumatic', { vol: 0.3 })
      }
      if (was && !st.sneakyPaid && !rules.chasing) {
        st.sneakyPaid = true
        sfx('upgrade', { vol: 0.4 })
        sfx('fanfare')
        hud.big('✈️ CAPTAIN SNEAKY!', 'gold', 2.4)
        const p = player.position
        fx.confetti(p.x, p.y + 2.2, p.z, 50)
        store.addCoins(LX.sneakyCoins, { x: p.x, y: p.y + 1.6, z: p.z })
        hud.toast(`In and out of the cockpit unseen! +${LX.sneakyCoins} coins.`)
      } else if (st.legal === 'tour') hud.toast('Thanks for visiting the flight deck!')
      st.legal = null
      st.sneaked = false
      st.pilotSusp = 0
    })
  }
  function openKeypad() {
    sfx('keyBeep', { vol: 0.3 })
    const body = hud.openWin('Cockpit Keypad', 'w-keypad', 'blue')
    body.innerHTML = `<div class="kp-screen"><span class="kp-code">----</span></div><div class="kp-hint">${st.note ? `📝 The crew note said: <b>${st.code}</b>` : '🔍 The code might be written down somewhere in the galley...'}</div><div class="kp-grid"></div>`
    const grid = body.querySelector('.kp-grid')
    const codeEl = body.querySelector('.kp-code')
    const screen = body.querySelector('.kp-screen')
    let typed = ''
    const show = () => (codeEl.textContent = (typed + '----').slice(0, 4))
    const press = (k) => {
      if (k === 'C') {
        typed = ''
        sfx('keyBeep', { vol: 0.3, f: 900 })
      } else if (k === 'OK') {
        if (typed === st.code) {
          sfx('keyOk', { vol: 0.45 })
          screen.classList.add('ok')
          deck.keyLight.color.set('#2ecc5a')
          later(0.5, () => {
            hud.closeWin()
            enterCockpit(null)
          })
          later(4, () => deck.keyLight.color.set('#ff2a3a'))
          return
        }
        st.wrong++
        sfx('keyBad', { vol: 0.45 })
        screen.classList.remove('bad')
        void screen.offsetWidth
        screen.classList.add('bad')
        typed = ''
        shake(0.05, 0.25)
        if (st.wrong >= LX.wrongCodes) {
          hud.closeWin()
          st.wrong = 0
          rules.breach('Captain: "Someone is trying to break into the cockpit! Crew, get them!"')
        } else hud.toast(`Wrong code! ${LX.wrongCodes - st.wrong} tries before security is called.`)
      } else if (typed.length < 4) {
        typed += k
        sfx('keyBeep', { vol: 0.3, f: 1200 + Number(k) * 60 })
      }
      show()
    }
    for (const k of ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', 'OK']) {
      const b = document.createElement('button')
      b.className = `kp-key ${k === 'OK' ? 'ok' : k === 'C' ? 'clr' : ''}`
      b.textContent = k
      b.addEventListener('pointerdown', (e) => e.stopPropagation())
      b.addEventListener('click', (e) => {
        e.stopPropagation()
        press(k)
      })
      grid.appendChild(b)
    }
  }
  function searchNote() {
    player.frozen = true
    player.velocity.x = player.velocity.z = 0
    sfx('rummage', { vol: 0.45 })
    hud.big('🔍 SEARCHING...', 'gold', 1.2)
    later(1.3, () => {
      player.frozen = false
      st.note = true
      sfx('rustle', { vol: 0.45 })
      sfx('upgrade', { vol: 0.25 })
      hud.big(`📝 CODE: ${st.code}`, 'green', 3)
      hud.toast(`A crew note: "Cockpit code ${st.code} — memorise and destroy!" Now try the keypad...`)
      const p = player.position
      fx.sparkle(p.x, p.y + 1.6, p.z, { count: 16, color: '#fff3c8', size: 0.2, speed: 2, up: 1.5, life: 0.7, grav: 3 })
    })
  }
  function askTour() {
    const first = trip.cls === 0
    if (rules.st.record > 0 && !first) {
      sfx('error')
      hud.toast('No tours for troublemakers! (Keep a clean record.)')
      return
    }
    const go = () => {
      st.tourUsed = true
      enterCockpit('tour')
    }
    if (first) go()
    else hud.confirm('Cockpit Tour', LX.tourPrice, go, `Visit the flight deck for ${LX.tourTime} s and meet the pilots.`)
  }

  // --- In the cockpit: the controls --------------------------------------------------------------------
  function control(kind) {
    if (st.ctrlT > 0) return
    st.ctrlT = 2.5
    const stranger = !st.legal
    const cap = pilots[0]?.npc
    if (kind === 'pa') {
      sfx('paChime', { vol: 0.4 })
      hud.openAnnounce({ pilot: true })
    } else if (kind === 'sign') {
      const on = !cabin.seatbelt
      cabin.setSeatbelt(on)
      sfx('bingBong', { vol: 0.45 })
      hud.big(on ? '💡 SEATBELT SIGN ON!' : '💡 SIGN OFF', 'gold', 1.4)
      hud.toast(on ? 'Ding! The whole cabin scrambles for their seatbelts!' : 'Ding! Everyone can stand up again.')
    } else if (kind === 'thrust') {
      sfx('roar', { vol: 0.5 })
      hooks.roar()
      shake(0.2, 2.2)
      hud.big('🚀 FULL THRUST!', 'red', 1.6)
    } else if (kind === 'auto') {
      sfx('apOff', { vol: 0.45 })
      hud.big('🤖 AUTOPILOT OFF!', 'red', 1.8)
      for (const [at, k] of [[0.4, 0.8], [1.2, 1], [2.0, 0.6]]) later(at, () => hooks.bump(k))
      later(2.6, () => cap && crowd.say(cap, 'I have control!', 2))
    }
    const p = player.position
    fx.sparkle(p.x, p.y + 1.3, p.z - 0.6, { count: 10, color: '#7cff6b', size: 0.12, speed: 1.5, up: 1, life: 0.5, grav: 2 })
    if (stranger) {
      st.pilotSusp = Math.min(1, st.pilotSusp + LX.control * (kind === 'auto' || kind === 'thrust' ? 1.6 : 1))
      if (cap && st.pilotSusp < 1) crowd.say(cap, pick(PL.hm), 1.6)
    } else if (kind === 'auto' || kind === 'thrust') cap && crowd.say(cap, pick(PL.prank), 2)
  }
  function stepCockpit(dt) {
    st.ctrlT = Math.max(0, st.ctrlT - dt)
    if (where() !== 'cockpit' || st.script) return
    if (st.legal === 'tour') {
      st.tourT -= dt
      if (st.tourT <= 0) {
        hud.toast("Tour's over! Back to your seat, please.")
        leaveCockpit()
      }
      return
    }
    if (st.legal) return
    // a stranger: the pilots slowly notice (faster right behind them)
    const p = player.position
    const close = pilots.some((q) => Math.hypot(q.npc.x - p.x, q.npc.z - p.z) < 1.1)
    const before = st.pilotSusp
    st.pilotSusp = Math.min(1, st.pilotSusp + dt * (LX.pilotNotice + (close ? LX.pilotClose : 0)))
    st.pilotSay -= dt
    if (st.pilotSay <= 0 && st.pilotSusp > 0.45 && pilots.length) {
      st.pilotSay = 3
      crowd.say(pick(pilots).npc, pick(PL.hm), 1.6)
      sfx('huh', { vol: 0.35 })
    }
    if (before < 1 && st.pilotSusp >= 1) {
      for (const q of pilots) {
        crowd.say(q.npc, pick(PL.who), 2.4)
        q.npc.scare = 1
      }
      st.sneaked = false
      rules.breach('Captain: "THERE IS SOMEONE IN MY COCKPIT! Crew, NOW!"')
    }
  }

  // --- Upstairs: the stair, the bar, the spa, the crew rest ------------------------------------------
  function climb() {
    const sa = deck.stair
    walkPath([{ x: sa.bottom.x, z: sa.bottom.z }, { ...sa.at(0) }], 3, () => {
      st.climbStep = 0
      player.frozen = true
      st.script = { climb: 0 }
    })
  }
  function stepClimb(dt) {
    const s = st.script
    if (!s || s.climb == null) return false
    const down = !!s.down
    s.climb = Math.min(1, s.climb + dt / 2.4)
    const t = down ? 1 - s.climb : s.climb
    const p = deck.stair.at(t, tmp)
    resetPlayer(p, down ? p.face + Math.PI : p.face)
    const step = Math.floor(s.climb * deck.stair.steps)
    if (step !== st.climbStep) {
      st.climbStep = step
      sfx('step', { vol: 0.35 })
    }
    if (s.climb >= 1) {
      st.script = null
      if (!down) {
        fadeTo(() => {
          resetPlayer({ x: LG.arrive.x, y: LG.y + 0.05, z: LG.arrive.z }, LG.arrive.face)
          player.frozen = false
          sfx('chime', { vol: 0.35 })
          hud.big('✨ SKY LOUNGE ✨', 'gold', 2)
          if (trip.cls !== 0 && !st.disguised) hud.toast("Sky Lounge: First Class only... don't let the bartender notice you!")
          const a = player.position
          fx.sparkle(a.x, a.y + 1.4, a.z, { count: 26, color: '#ffd27a', size: 0.25, speed: 2.5, up: 2, life: 0.9, grav: 2 })
        })
      } else {
        walkPath([{ x: deck.stair.bottom.x, z: deck.stair.bottom.z }], 3, () => {})
      }
    }
    return true
  }
  function descend() {
    fadeTo(() => {
      const p = deck.stair.at(1, tmp)
      resetPlayer(p, p.face + Math.PI)
      player.frozen = true
      st.climbStep = deck.stair.steps
      st.script = { climb: 0, down: true }
    })
  }
  function openBar() {
    const free = trip.cls === 0
    sfx('menuOpen', { vol: 0.4 })
    const body = hud.openWin('Sky Bar', 'w-menu', 'yellow')
    body.innerHTML = `<div class="fm-head"><span class="fm-tag" style="--c:#e8b54a">${free ? '✦ Complimentary for First Class' : '🍸 Shaken to order'}</span></div><div class="fm-grid"></div>`
    const grid = body.querySelector('.fm-grid')
    for (const c of LX.cocktails) {
      const card = document.createElement('div')
      card.className = 'fm-card'
      card.style.setProperty('--c', '#e8b54a')
      card.innerHTML = `<span class="fm-ico">${c.icon}</span><span class="fm-name">${c.name}</span><span class="fm-desc">${c.desc}</span>`
      const b = document.createElement('button')
      b.className = `fm-buy ${free ? 'free' : ''}`
      b.innerHTML = free ? 'FREE' : `<span class="price fm-price">${ICON.coin}${c.price}</span>`
      b.addEventListener('pointerdown', (e) => e.stopPropagation())
      b.addEventListener('click', (e) => {
        e.stopPropagation()
        if (!free && !store.spend(c.price)) return
        hud.closeWin()
        mix(c)
      })
      card.appendChild(b)
      grid.appendChild(card)
    }
  }
  // The bartender shakes it, pours it, slides it down the bar; you knock it back.
  function mix(c) {
    if (!barman) return
    crowd.say(barman, pick(['One ' + c.name + ', coming up!', 'Shaken, not stirred!', 'Watch this...']), 2.2)
    barman.mode = 'serve'
    sfx('shaker', { vol: 0.45 })
    later(1.15, () => sfx('shaker', { vol: 0.4 }))
    for (let i = 0; i < 8; i++) later(i * 0.25, () => fx.sparkle(barman.x, LG.y + 1.6, barman.z + 0.3, { count: 2, color: '#e8f6ff', size: 0.07, speed: 1, up: 0.8, life: 0.4, grav: 3 }))
    later(2.3, () => {
      sfx('pour', { vol: 0.35 })
      const d = makeDish(c.dish)
      d.g.scale.setScalar(1.6)
      d.g.position.set(LG.barman.x, LG.y + 1.15, LG.barman.z + 0.9)
      scene.add(d.g)
      const from = d.g.position.clone()
      const p = player.position
      const to = new Vector3(Math.max(LG.x - 1.8, Math.min(LG.x + 1.8, p.x)), LG.y + 1.15, LG.bar.z - 0.65)
      later(0.6, () => sfx('slide', { vol: 0.4 }))
      let t = 0
      const slide = { fn: null }
      slide.fn = (dt) => {
        t += dt
        const k = ease(Math.min(1, Math.max(0, (t - 0.6) / 0.6)))
        d.g.position.lerpVectors(from, to, k)
        d.g.rotation.y = k * Math.PI * 2
        if (t > 1.3 && !slide.drunk) {
          slide.drunk = true
          sfx('clink', { vol: 0.3 })
          sfx(c.effect === 'spicy' ? 'fireBurp' : 'fizzy', { vol: 0.45 })
          sayMe(pick(['Cheers!', 'Mmm, fancy!', 'Delicious!', 'Now THAT is a drink!']), 1.8)
          fx.sparkle(to.x, to.y + 0.25, to.z, { count: 22, color: '#ffe8a0', size: 0.2, speed: 2, up: 1.6, life: 0.8, grav: 3 })
          inflight.applyEffect(c.effect)
          later(1.2, () => {
            scene.remove(d.g)
            d.g.traverse((o) => o.isMesh && o.geometry.dispose())
          })
        }
        return t < 2.6
      }
      anims.push(slide.fn)
      barman.mode = 'idle'
    })
  }
  const anims = []
  function shower() {
    const sp = LG.spa
    walkPath([{ x: LG.spaStand.x, z: LG.spaStand.z }, { x: sp.x - 0.1, z: sp.z, face: -Math.PI / 2 }], 2.5, () => {
      player.frozen = true
      st.shower = { t: 0, sndT: 0 }
      hud.big('🚿 SHOWER TIME!', 'blue', 1.4)
      sayMe(pick(['La la laaa ♪', 'Ahh, hot water!', 'Singing in the shower ♪']), 2.5)
    })
  }
  function stepShower(dt) {
    const s = st.shower
    if (!s) return
    s.t += dt
    s.sndT -= dt
    const sp = LG.spa
    if (s.sndT <= 0) {
      s.sndT = 0.5
      sfx('showerRun', { vol: 0.3 })
    }
    // water from the rain head, steam rising, the glass fogging
    for (let i = 0; i < 3; i++) fx.trail(sp.x + rr(-0.2, 0.2), LG.y + 2.25, sp.z + rr(-0.2, 0.2), { glow: true, color: '#bfe8ff', size: 0.04, size1: 0.03, alpha: 0.9, life: 0.5, vx: 0, vy: -4, vz: 0, grav: 6, drag: 0 })
    if (Math.random() < dt * 6) fx.puff(sp.x + rr(-0.4, 0.4), LG.y + rr(0.6, 2), sp.z + rr(-0.6, 0.6), { count: 1, size: 0.4, grow: 2.5, alpha: 0.25, life: 2, up: 0.3, speed: 0.1, color: '#ffffff' })
    deck.spaGlass.material.opacity = Math.min(0.85, 0.35 + s.t * 0.15)
    if (s.t >= LX.shower) {
      st.shower = null
      walkPath([{ x: LG.spaStand.x, z: LG.spaStand.z, face: Math.PI }], 2.5, () => {
        sfx('plateDone', { vol: 0.4 })
        hud.big('✨ SQUEAKY CLEAN!', 'green', 1.8)
        inflight.applyEffect('fresh')
        later(2, () => (deck.spaGlass.material.opacity = 0.35))
      })
    }
  }
  function openLocker() {
    if (st.disguised) return hud.toast("You're already in uniform, captain.")
    sfx('locker', { vol: 0.5 })
    later(0.4, () => sfx('rustle', { vol: 0.45 }))
    later(1.0, () => {
      st.disguised = true
      setDisguise(true)
      sfx('upgrade', { vol: 0.4 })
      hud.big('👨‍✈️ PILOT DISGUISE!', 'gold', 2.2)
      hud.toast('In uniform! The crew barely look twice, the cockpit door opens for you, and the lounge is yours.')
      const p = player.position
      fx.sparkle(p.x, p.y + 1.6, p.z, { count: 30, color: '#ffd84a', size: 0.25, speed: 3, up: 2, life: 0.9, grav: 3 })
      if (Math.random() < 0.3) wake('Hey... is that MY uniform?!')
    })
  }
  function wake(text) {
    if (st.sleeperAwake) return
    st.sleeperAwake = true
    sfx('alertBang', { vol: 0.45 })
    hud.big('😠 THE CREW WOKE UP!', 'red', 1.6)
    hud.toast(`Off-duty attendant: "${text}"`)
    later(1.2, () => crew.escortNow('crewrest'))
  }
  function stepLounge(dt) {
    if (where() !== 'lounge') {
      st.upSusp = Math.max(0, st.upSusp - dt * 0.2)
      st.restT = 0
      return
    }
    // ambience: soft jazz chords
    st.chordT -= dt
    if (st.chordT <= 0) {
      st.chordT = 3.2
      sfx('loungeChord', { vol: 0.1, notes: pick(CHORDS) })
    }
    const p = player.position
    // the crew rest: the sleeper's Zzz, and he wakes if you hang about
    const cr = LG.crew
    const inRest = p.x < cr.x1 && p.z > cr.z0
    if (!st.sleeperAwake && Math.random() < dt * 0.8) fx.trail(LG.bunk.x, LG.bunk.y + 0.5, LG.bunk.z + 0.8, { glow: true, color: '#9fb6ff', size: 0.1, size1: 0.25, alpha: 0.9, life: 1.6, vx: 0.15, vy: 0.4, vz: 0, grav: 0 })
    if (inRest && !st.disguised && !st.script) {
      st.restT += dt
      if (st.restT > LX.crewRestWake) wake('What are you doing in the crew rest?!')
    } else st.restT = Math.max(0, st.restT - dt)
    // the bartender: First Class only (or the uniform)
    if (!barman || trip.cls === 0 || st.disguised) {
      st.upSusp = Math.max(0, st.upSusp - dt * 0.2)
    } else {
      const dx = p.x - barman.x
      const dz = p.z - barman.z
      const d = Math.hypot(dx, dz)
      const seen = d < 1.5 || (d < LX.loungeSight && (Math.sin(barman.yaw) * dx + Math.cos(barman.yaw) * dz) / d > 0.2)
      if (seen) {
        const before = st.upSusp
        st.upSusp = Math.min(1, st.upSusp + dt * LX.loungeRate)
        if (before < 0.05) {
          crowd.say(barman, '❓', 1.2)
          sfx('huh', { vol: 0.35 })
        }
        if (before < 0.6 && st.upSusp >= 0.6) {
          crowd.say(barman, '❗ This lounge is for First Class guests!', 2.4)
          sfx('alertBang', { vol: 0.4 })
          hud.big('👀 SPOTTED!', 'gold', 1)
        }
        if (st.upSusp >= 1) {
          st.upSusp = 0
          crowd.say(barman, 'Security! Please escort this passenger.', 2.4)
          crew.escortNow('lounge')
        }
      } else st.upSusp = Math.max(0, st.upSusp - dt * 0.15)
    }
    // walk into a sofa or a stool to sit
    if (!seating.seat && seating.cooldown <= 0 && !st.script) {
      for (const s of [...LG.sofas, ...LG.stools]) {
        if (Math.hypot(p.x - s.x, p.z - s.z) < 0.55) {
          const stand = { x: s.x - Math.sin(s.yaw) * 0.85, y: LG.y + 0.02, z: s.z - Math.cos(s.yaw) * 0.85 }
          sit({ ...s, lounge: LG.stools.includes(s) ? 'stool' : 'sofa' }, stand, {})
          break
        }
      }
    }
  }

  // --- Luxury seats: bed, massage, privacy doors ----------------------------------------------------
  const luxSeat = () => seating.seat && seating.seat.cls != null && seating.seat.cls <= 1 && cabin.seats.includes(seating.seat)
  function toggleBed() {
    if (st.bed) return wakeUp()
    if (!luxSeat()) return
    const s = seating.seat
    st.bed = { seat: s, t: 0, snoreT: 2 }
    st.massage = 0
    hooks.timeScale(LX.sleepTime)
    duvet.position.set(s.x, s.y + 0.72, s.z - 0.75)
    duvet.visible = true
    sfx('rustle', { vol: 0.5 })
    later(0.4, () => sfx('yawn', { vol: 0.35 }))
    hud.big('💤 SWEET DREAMS...', 'blue', 1.8)
    hud.toast(`Lie-flat bed! Time flies x${LX.sleepTime} while you sleep. Z (or BED) to wake up.`)
  }
  function wakeUp() {
    if (!st.bed) return
    st.bed = null
    duvet.visible = false
    hooks.timeScale(1)
    sfx('rustle', { vol: 0.4 })
    sfx('ding', { vol: 0.25 })
    hud.big('☀️ GOOD MORNING!', 'gold', 1.4)
  }
  function toggleMassage() {
    if (!luxSeat()) return
    if (st.bed) wakeUp()
    if (st.massage > 0) {
      st.massage = 0
      return
    }
    st.massage = LX.massage
    st.massageSnd = 0
    hud.big('💆 MASSAGE MODE', 'blue', 1.4)
    sayMe(pick(['Ooooh...', 'Ahhh, yes...', 'That\'s the spot!']), 2)
  }
  function stepMassage(dt) {
    if (st.massage <= 0) return
    if (!luxSeat()) {
      st.massage = 0
      return
    }
    st.massage -= dt
    st.massageSnd -= dt
    if (st.massageSnd <= 0) {
      st.massageSnd = 0.45
      sfx('massage', { vol: 0.3 })
    }
    const s = seating.seat
    if (Math.random() < dt * 3) fx.trail(s.x + rr(-0.3, 0.3), s.y + 1.2, s.z, { glow: true, color: pick(['#ff9ac0', '#ffd27a', '#ffffff']), size: 0.1, size1: 0.04, alpha: 1, life: 1, vx: 0, vy: 0.5, vz: 0, grav: 0 })
    if (st.massage <= 0) {
      sfx('mmm', { vol: 0.4 })
      inflight.applyEffect('calm')
    }
  }
  function toggleDoors() {
    const s = seating.seat
    if (!s || s.cls !== 0 || !cabin.seats.includes(s)) return
    if (!st.doors || st.doors.seat !== s) {
      closeDoorsNow()
      const X = FLIGHT.cabin.x
      const sides = Math.abs(s.x - X) < 0.5 ? [-1, 1] : [Math.sign(X - s.x)]
      st.doors = { seat: s, k: 0, target: 0, panels: sides.map((d) => ({ d, m: makeDoorPanel() })) }
    }
    const d = st.doors
    d.target = d.target ? 0 : 1
    sfx('whoosh', { vol: 0.3, dur: 0.5 })
    later(0.5, () => sfx('clink', { vol: 0.15 }))
    hud.big(d.target ? '🚪 PRIVACY MODE' : '🚪 DOORS OPEN', 'gold', 1.2)
    if (d.target) hud.toast('Suite doors shut: nobody can see you in here.')
  }
  function closeDoorsNow() {
    if (!st.doors) return
    for (const p of st.doors.panels) scene.remove(p.m)
    st.doors = null
    rules.setPrivate(false)
  }
  function stepDoors(dt) {
    const d = st.doors
    if (!d) return
    if (seating.seat !== d.seat) d.target = 0
    d.k += Math.sign(d.target - d.k) * Math.min(Math.abs(d.target - d.k), dt * 2)
    const s = d.seat
    for (const p of d.panels) p.m.position.set(s.x + p.d * 0.7, F + 0.66, s.z + 0.62 - ease(d.k) * 1.15)
    rules.setPrivate(d.k > 0.9 && seating.seat === s)
    if (d.k <= 0 && d.target === 0 && seating.seat !== s) closeDoorsNow()
  }

  // --- Context buttons (merged into the rule bar by rules.js) ---------------------------------------
  rules.addActions(() => {
    if (st.phase !== 'cruise' || st.script || st.shower) return []
    const list = []
    const w = where()
    if (w === 'cockpit') {
      list.push({ icon: '🚪', label: 'LEAVE', key: 'E', fn: () => leaveCockpit(), cls: 'green', only: true })
      list.push({ icon: '📢', label: 'PA', fn: () => control('pa'), cls: 'blue', only: true })
      list.push({ icon: '💡', label: 'SIGN', fn: () => control('sign'), cls: 'blue', only: true })
      list.push({ icon: '🚀', label: 'THRUST', fn: () => control('thrust'), cls: 'red', only: true })
      list.push({ icon: '🤖', label: 'AUTOPILOT', fn: () => control('auto'), cls: 'red', only: true })
      return list
    }
    if (seating.seat) {
      if (luxSeat()) {
        list.push({ icon: st.bed ? '☀️' : '🛏️', label: st.bed ? 'WAKE' : 'BED', key: 'Z', fn: toggleBed, cls: 'blue' })
        if (!st.bed) list.push({ icon: '💆', label: st.massage > 0 ? 'STOP' : 'MASSAGE', key: 'X', fn: toggleMassage, cls: 'blue' })
        if (seating.seat.cls === 0 && !st.bed) list.push({ icon: '🚪', label: st.doors?.target ? 'OPEN' : 'DOORS', key: 'C', fn: toggleDoors, cls: 'blue' })
      }
      return list
    }
    if (w === 'lounge') {
      if (near(LG.bar, 1.7)) list.push({ icon: '🍸', label: 'SKY BAR', key: 'E', fn: openBar, cls: 'blue' })
      if (near(LG.arrive, 1.8)) list.push({ icon: '⬇️', label: 'DOWNSTAIRS', key: 'E', fn: descend, cls: 'green' })
      if (near(LG.spaStand, 1.6)) list.push({ icon: '🚿', label: 'SHOWER', key: 'E', fn: shower, cls: 'blue' })
      if (near(LG.locker, 1.5)) list.push({ icon: '🧥', label: 'LOCKER', key: 'E', fn: openLocker, cls: 'red' })
      return list
    }
    // main deck
    if (near(deck.stair.bottom, 1.9)) list.push({ icon: '⬆️', label: 'SKY LOUNGE', key: 'E', fn: climb, cls: 'green' })
    if (near(C.outside, 2.1) && player.position.z > C.zF) {
      if (deck.doorOpen > 0.5 && st.coffee) list.push({ icon: '🚪', label: 'SNEAK IN', key: 'E', fn: () => enterCockpit(st.disguised ? 'uniform' : null), cls: 'red' })
      else if (st.disguised) list.push({ icon: '👨‍✈️', label: 'ENTER', key: 'E', fn: () => enterCockpit('uniform'), cls: 'green' })
      else {
        list.push({ icon: '🔢', label: 'KEYPAD', key: 'E', fn: openKeypad, cls: 'blue' })
        if (!st.tourUsed) list.push({ icon: '🎫', label: 'TOUR', fn: askTour, cls: 'green' })
      }
    }
    if (near(C.note, 1.6) && !st.note) list.push({ icon: '🔍', label: 'SEARCH', key: 'E', fn: searchNote, cls: 'blue' })
    return list
  })
  onKey('KeyZ', () => st.phase === 'cruise' && toggleBed())
  onKey('KeyX', () => st.phase === 'cruise' && toggleMassage())
  onKey('KeyC', () => st.phase === 'cruise' && toggleDoors())
  // The lounge and the cockpit are out of the main-deck crew's sight (the bartender / pilots watch there).
  rules.ruleHook = () => (st.script || where() !== 'main' ? null : undefined) // scripted walks never count
  rules.disguised = () => st.disguised
  rules.onPunished = () => {
    wakeUp()
    st.massage = 0
    if (st.disguised) {
      st.disguised = false
      setDisguise(false)
      later(1, () => hud.toast('Your pilot disguise was confiscated!'))
    }
    st.legal = null
    st.sneaked = false
    st.pilotSusp = 0
  }

  function clearNpcs() {
    for (const p of pilots) crowd.remove(p.npc)
    pilots.length = 0
    if (barman) crowd.remove(barman)
    barman = null
  }

  return {
    st,
    // The seated pose override (bed / massage), else null.
    pose() {
      if (st.bed && seating.seat === st.bed.seat) return LIE
      if (st.massage > 0 && seating.seat) {
        const w = Math.sin(st.t * 40) * 0.06
        JIGGLE.Spine1.x = SIT.Spine1.x + w
        JIGGLE.Neck1.x = Math.sin(st.t * 31) * 0.08
        return JIGGLE
      }
      return null
    },
    // Lying in the bed: where the avatar goes (feet forward, head on the pillow), else null.
    bodyPose() {
      const b = st.bed
      if (!b || seating.seat !== b.seat) return null
      const s = b.seat
      return { x: s.x, y: s.y + 0.32, z: s.z - 1.45, rx: -Math.PI / 2 } // feet over the ottoman, head on the pillow
    },
    board() {
      clearNpcs()
      Object.assign(st, { phase: 'takeoff', script: null, legal: null, note: false, wrong: 0, pilotSusp: 0, sneakyPaid: false, sneaked: false, coffee: null, coffeeIn: rr(...LX.coffeeEvery), disguised: false, upSusp: 0, restT: 0, sleeperAwake: false, shower: null, bed: null, massage: 0, hintedCoffee: false, tourUsed: false })
      st.code = String(1000 + Math.floor(Math.random() * 9000))
      setDisguise(false)
      deck.setVisible(true)
      deck.setDoor(false)
      sleeper.visible = true
      spawnPilots()
      barman = crowd.add({ x: LG.barman.x, z: LG.barman.z, y: LG.y + 0.01, yaw: 0, bag: null, pack: false, shirt: '#f4f5f7', arms: '#16203d', pants: '#16203d', hat: false, name: 'sky bar' })
      if (barman) barman.mode = 'idle'
    },
    setPhase(p) {
      st.phase = p
      if (p !== 'cruise') {
        wakeUp()
        st.massage = 0
        st.shower = null
        if (st.script) {
          st.script = null
          player.frozen = false
        }
        st.legal = null
        hud.closeWinIf?.('w-keypad')
      }
    },
    // Landed / gone: everything off, the uniform back in the locker.
    clear() {
      clearNpcs()
      closeDoorsNow()
      wakeUp()
      duvet.visible = false
      sleeper.visible = false
      deck.setVisible(false)
      if (st.disguised) setDisguise(false)
      st.disguised = false
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
      if (st.phase === 'off') return
      deck.update(dt)
      stepPilots(dt)
      if (!stepClimb(dt)) stepScript(dt)
      if (st.phase !== 'cruise') return
      // the first officer's coffee run (not mid-chase, not while you're in there)
      st.coffeeIn -= dt
      if (st.coffeeIn <= 0 && !st.coffee && !rules.chasing && where() !== 'cockpit') coffeeRun()
      stepCockpit(dt)
      stepLounge(dt)
      stepShower(dt)
      stepMassage(dt)
      stepDoors(dt)
      // the pilots' / the bartender's meter shows on the same eye at the top
      const w = where()
      rules.setExtraSusp(w === 'cockpit' && !st.legal ? st.pilotSusp : w === 'lounge' ? st.upSusp : 0)
      // the bed: Zzz, snores; moving wakes you
      const b = st.bed
      if (b) {
        if (seating.seat !== b.seat) wakeUp()
        else {
          b.t += dt
          b.snoreT -= dt
          if (b.snoreT <= 0) {
            b.snoreT = rr(3, 4.5)
            sfx('snore', { vol: 0.25 })
          }
          if (Math.random() < dt * 1.5) fx.trail(b.seat.x, b.seat.y + 0.8, b.seat.z + 0.6, { glow: true, color: '#9fb6ff', size: 0.12, size1: 0.3, alpha: 0.9, life: 1.8, vx: 0.15, vy: 0.45, vz: 0, grav: 0 })
          if (Math.hypot(inputState.move.x, inputState.move.z) > 0.5) wakeUp()
        }
      }
    },
  }
}
