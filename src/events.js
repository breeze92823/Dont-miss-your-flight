// Phase 4: IN-FLIGHT EVENTS (tunables FLIGHT.fun.events), one every so often during the cruise:
//
// - STORM: the captain warns you, the seatbelt sign comes on, the cabin goes storm-blue with flickering
//   lights, rain drums on the hull, LIGHTNING flashes through every window (and the screen) with a thunder
//   crack a moment later, the plane bumps about (flight.js bump: stumbles / bonks), the baby wakes up
//   crying, the row jumps. Still buckled in a seat when it passes: STORM SURVIVOR (coins).
// - OXYGEN MASK DRILL: "This is only a drill!": yellow masks drop out of the ceiling over every row near
//   you, bouncing on their tubes; PUT ON MASK (E) before the timer runs out (you must be sitting): the
//   mask snaps onto your face, you breathe through it (hiss), your neighbours put theirs on too: SAFETY
//   STAR (coins). Too slow: a sad trombone. The masks reel back up.
// - The CAPTAIN'S JOKES: the PA chime, a joke, a rimshot and the cabin laughing / clapping.
import { CylinderGeometry, Group, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Quaternion, Vector3 } from 'three'
import { FLIGHT } from './config.js'
import { player } from './player.js'
import { seating } from './seating.js'
import { registerSfx, sfx } from './audio.js'
import { lathe } from './detail.js'
import './hud/events.css'

const E = FLIGHT.fun.events
const rr = (a, b) => a + Math.random() * (b - a)
const pick = (a) => a[Math.floor(Math.random() * a.length)]

// --- Sounds -------------------------------------------------------------------------------------------
// A thunder crack and a long rolling rumble (o.near 0..1: louder and sharper close by).
registerSfx('thunder', ({ now, out, tone, noise }, o) => {
  const t = now()
  const near = o.near ?? 0.6
  const d = out((o.vol ?? 0.5) * (0.6 + near * 0.4), o.pan)
  noise('white', d, t, 0.25, { type: 'highpass', f: 1200, peak: 0.5 * near, a: 0.002 })
  noise('brown', d, t, 3.2, { type: 'lowpass', f: 420, f2: 90, peak: 0.9, a: 0.02 })
  noise('pink', d, t + 0.3, 2.4, { type: 'lowpass', f: 260, f2: 70, peak: 0.6, a: 0.3 })
  tone(d, t, 1.2, { f: 48, f2: 28, peak: 0.5, a: 0.01 })
})
// Rain drumming on the fuselage (one ~2.4 s swell).
registerSfx('rainHull', ({ now, out, noise }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.18, o.pan)
  noise('white', d, t, 2.6, { type: 'bandpass', f: 2600, q: 0.7, peak: 0.5, a: 0.6, loop: true })
  noise('pink', d, t, 2.6, { type: 'lowpass', f: 700, peak: 0.4, a: 0.6, loop: true })
})
// The masks dropping: a pneumatic pop per panel + a hiss of oxygen.
registerSfx('maskDrop', ({ now, out, tone, noise }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.4, o.pan)
  for (let i = 0; i < 5; i++) {
    tone(d, t + i * 0.07, 0.08, { f: 300, f2: 120, peak: 0.4, a: 0.002 })
    noise('pink', d, t + i * 0.07, 0.06, { type: 'bandpass', f: 1500, q: 2, peak: 0.5, a: 0.002 })
  }
  noise('white', d, t + 0.2, 1.4, { type: 'highpass', f: 4000, peak: 0.25, a: 0.1 })
})
// Snapping the mask on: a rubbery thwap + the first breath.
registerSfx('maskOn', ({ now, out, tone, noise }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.4, o.pan)
  tone(d, t, 0.12, { type: 'triangle', f: 260, f2: 140, peak: 0.5, a: 0.002 })
  noise('pink', d, t, 0.05, { type: 'bandpass', f: 900, q: 3, peak: 0.6, a: 0.001 })
  noise('white', d, t + 0.18, 0.6, { type: 'bandpass', f: 1800, f2: 1200, q: 1.2, peak: 0.25, a: 0.15 })
})
// Breathing through the mask (in... out...).
registerSfx('maskBreath', ({ now, out, noise }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.18, o.pan)
  noise('white', d, t, 0.7, { type: 'bandpass', f: 1500, f2: 2200, q: 1.5, peak: 0.3, a: 0.25 })
  noise('pink', d, t + 0.9, 0.8, { type: 'bandpass', f: 1100, f2: 800, q: 1.5, peak: 0.25, a: 0.2 })
})
// Ba-dum-tss.
registerSfx('rimshot', ({ now, out, tone, noise }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.4, o.pan)
  tone(d, t, 0.12, { f: 180, f2: 110, peak: 0.6, a: 0.002 })
  noise('white', d, t, 0.1, { type: 'bandpass', f: 1800, q: 1, peak: 0.4, a: 0.002 })
  tone(d, t + 0.16, 0.12, { f: 150, f2: 90, peak: 0.6, a: 0.002 })
  noise('white', d, t + 0.16, 0.1, { type: 'bandpass', f: 1800, q: 1, peak: 0.4, a: 0.002 })
  noise('white', d, t + 0.34, 0.9, { type: 'highpass', f: 6000, peak: 0.35, a: 0.002 })
})

// --- The masks (instanced: a yellow cup on a clear tube per seat near you) -----------------------------
const MAX = 72
const matCup = new MeshStandardMaterial({ color: '#ffd23b', roughness: 0.45 })
const matTube = new MeshStandardMaterial({ color: '#dfe9f2', roughness: 0.2, transparent: true, opacity: 0.6 })
const cupGeo = lathe([[0, 0], [0.04, 0.004], [0.075, 0.05], [0.09, 0.085], [0.088, 0.09], [0, 0.09]], 14).rotateX(Math.PI) // the soft cup, mouth down
const tubeGeo = new CylinderGeometry(0.012, 0.012, 1, 6).translate(0, -0.5, 0) // hangs down from y 0, scaled to length
function makeMyMask() {
  const holder = new Group()
  const g = new Group()
  g.position.set(0, -0.1, 0.36)
  holder.add(g)
  const cup = new Mesh(lathe([[0, 0], [0.09, 0.005], [0.11, 0.08], [0.115, 0.1], [0, 0.1]], 14), matCup)
  cup.rotation.x = -Math.PI / 2
  cup.position.z = 0.02
  g.add(cup)
  const strap = new Mesh(new CylinderGeometry(0.34, 0.34, 0.03, 22, 1, true), new MeshStandardMaterial({ color: '#e8ecf2', roughness: 0.6, side: 2 }))
  strap.position.set(0, 0.04, -0.36)
  g.add(strap)
  return holder
}

// hooks: { bump(k), turbulence(), holdBelt(s), pushTurb(s) } from flight.js. sky: skyView (lightning).
// neighbours: { npcs(), startle() }. wear / unwear: on your avatar's head (main.js).
export function createEvents({ scene, cabin, crowd, hud, store, fx, rules, inflight, neighbours, sky, renderer = null, hooks = {}, sayMe = () => {}, shake = () => {}, wear = () => false }) {
  const F = cabin.floorY
  const st = { phase: 'off', t: 0, next: E.first, storm: null, drill: null, jokes: [], done: new Set() }
  const timers = []
  const later = (t, fn) => timers.push({ t, fn })
  const cups = new InstancedMesh(cupGeo, matCup, MAX)
  const tubes = new InstancedMesh(tubeGeo, matTube, MAX)
  cups.count = tubes.count = 0
  cups.frustumCulled = tubes.frustumCulled = false
  scene.add(cups, tubes)
  const myMask = makeMyMask()
  const m4 = new Matrix4()
  const q = new Quaternion()
  const v = new Vector3()
  const sc = new Vector3()
  const AX = new Vector3(1, 0, 0)

  // a full-screen lightning flash over the HUD-less view
  const flash = document.createElement('div')
  flash.className = 'storm-flash'
  hud.root.prepend(flash) // under the buttons
  function bolt(k = 1) {
    boltK = Math.max(boltK, k)
    cabin.lightning(k)
    sky?.lightning()
    flash.style.transition = 'none'
    flash.style.opacity = String(0.55 * k)
    void flash.offsetWidth
    flash.style.transition = 'opacity 0.5s ease-out'
    flash.style.opacity = '0'
  }
  // The storm darkens the whole picture (tone-mapping exposure x k); lightning spikes it. Day / night
  // (lighting.js) may change the base meanwhile: that's picked up.
  let exp = null
  function exposure(k) {
    if (!renderer) return
    const cur = renderer.toneMappingExposure
    if (!exp) exp = { base: cur, set: cur }
    else if (Math.abs(cur - exp.set) > 1e-4) exp.base = cur
    exp.set = exp.base * k
    renderer.toneMappingExposure = exp.set
  }
  function restoreExposure() {
    if (!exp || !renderer) return
    if (Math.abs(renderer.toneMappingExposure - exp.set) < 1e-4) renderer.toneMappingExposure = exp.base
    exp = null
  }
  let boltK = 0
  const onMainDeck = () => player.position.y < F + 10 && player.position.z > cabin.zFront
  const pals = () => neighbours.npcs?.() ?? []

  // --- Storm ---------------------------------------------------------------------------------------------
  function storm() {
    st.done.add('storm')
    st.storm = { t: 0, boltIn: 2.5, rainT: 0, bumpIn: 3 }
    sfx('bingBong', { vol: 0.3 })
    hud.toast('📢 Captain: "We\'re flying through a thunderstorm, folks. Back to your seats and buckle up!"', 4.5)
    cabin.setMood('storm')
    hooks.turbulence?.()
    hooks.holdBelt?.(E.storm.time + 1)
    sky?.setStorm(1)
    hud.root.classList.add('storming')
  }
  function stepStorm(dt) {
    const s = st.storm
    if (!s) return
    s.t += dt
    // dim in, dim out, flash on lightning
    const ramp = Math.min(1, s.t / 2.5, Math.max(0, (E.storm.time - s.t) / 2))
    boltK = Math.max(0, boltK - dt * 3)
    exposure(1 - ramp * 0.42 + boltK * boltK * 1.4)
    s.rainT -= dt
    if (s.rainT <= 0) {
      s.rainT = 2.3
      sfx('rainHull', { vol: 0.16 })
    }
    s.boltIn -= dt
    if (s.boltIn <= 0) {
      s.boltIn = rr(1.8, 4.2)
      const near = Math.random()
      bolt(0.6 + near * 0.4)
      if (Math.random() < 0.5) later(0.12, () => bolt(0.5)) // a double flash
      later(0.25 + (1 - near) * 1.1, () => {
        sfx('thunder', { vol: 0.5, near })
        shake(0.06 + near * 0.12, 0.6)
        if (near > 0.55) {
          for (const n of pals()) n.scare = 0.8
          neighbours.startle?.()
          if (Math.random() < 0.5) sayMe(pick(['Whoa!', 'Eek!', 'That was close!', '😨']), 1.2)
        }
      })
    }
    s.bumpIn -= dt
    if (s.bumpIn <= 0) {
      s.bumpIn = rr(2.5, 5)
      hooks.bump?.(rr(0.3, 0.8))
      sky?.bump(0.7)
    }
    if (s.t >= E.storm.time) endStorm()
  }
  function endStorm(quiet = false) {
    if (!st.storm) return
    st.storm = null
    restoreExposure()
    boltK = 0
    cabin.setMood('cruise')
    sky?.setStorm(0)
    hud.root.classList.remove('storming')
    if (quiet) return
    sfx('ding', { vol: 0.3 })
    hud.toast('📢 Captain: "We\'re through the storm. Thanks for your patience!"', 3.5)
    if (seating.seat && inflight.belted) {
      hud.big('⛈️ STORM SURVIVOR!', 'gold', 2)
      sfx('fanfare', { vol: 0.3 })
      const p = player.renderPosition
      store.addCoins(E.storm.coins, { x: p.x, y: p.y + 1.6, z: p.z })
    }
  }

  // --- Oxygen mask drill ---------------------------------------------------------------------------------
  function drill() {
    st.done.add('drill')
    const p = player.position
    // every seat within a few rows of you gets a mask
    const near = cabin.seats.filter((s) => Math.abs(s.z - p.z) < 6.5).sort((a, b) => Math.abs(a.z - p.z) - Math.abs(b.z - p.z)).slice(0, MAX)
    const masks = near.map((s) => ({ s, top: F + (Math.abs(s.x - FLIGHT.cabin.x) < 1.2 ? 2.76 : 2.6), len: 0, target: (Math.abs(s.x - FLIGHT.cabin.x) < 1.2 ? 2.76 : 2.6) - 1.85, t: -Math.random() * 0.25, worn: false, ph: Math.random() * 6 }))
    st.drill = { t: 0, masks, left: E.drill.time, on: false, up: false, warned: 0 }
    sfx('bingBong', { vol: 0.35 })
    hud.toast('📢 "This is only a DRILL! Put on your oxygen mask, quickly!"', 3.5)
    later(0.6, () => {
      sfx('maskDrop', { vol: 0.5 })
      hud.big('😷 MASK DRILL!', 'gold', 1.6)
      for (const n of pals()) later(rr(1, 4), () => (n.data.mask = true))
    })
  }
  function putOnMask() {
    const d = st.drill
    if (!d || d.on || d.up) return
    if (!seating.seat) return hud.toast('Sit down first!')
    d.on = true
    wear(myMask)
    // the mask over your seat is now on your face
    const m = d.masks.find((x) => x.s === seating.seat) ?? d.masks[0]
    if (m) m.worn = true
    sfx('maskOn', { vol: 0.5 })
    sayMe(pick(['*fwoosh*', 'Mask on!', 'Breathe normally...']), 1.3)
    const p = player.renderPosition
    fx.sparkle(p.x, p.y + 1.7, p.z, { count: 12, color: '#ffd23b', size: 0.16, speed: 1.6, up: 1.2, life: 0.6, grav: 2 })
    later(0.9, () => sfx('maskBreath', { vol: 0.2 }))
    later(2.6, () => st.drill?.on && sfx('maskBreath', { vol: 0.18 }))
    hud.big('😷 SAFETY STAR!', 'gold', 2)
    sfx('fanfare', { vol: 0.3 })
    store.addCoins(E.drill.coins, { x: p.x, y: p.y + 1.6, z: p.z })
    d.left = Math.min(d.left, 3) // the drill wraps up soon after
  }
  function stepDrill(dt) {
    const d = st.drill
    if (!d) return
    d.t += dt
    // the masks: a springy drop, a dangle, then reeled back up
    let n = 0
    for (const m of d.masks) {
      m.t += dt
      if (d.up) m.len = Math.max(0, m.len - dt * 1.6)
      else if (m.t > 0) {
        const k = m.t
        m.len = m.target * (1 - Math.exp(-6 * k) * Math.cos(13 * k))
      }
      if (m.worn || m.len <= 0.01 || n >= MAX) continue
      const sway = Math.sin(st.t * 2 + m.ph) * 0.12 * Math.min(1, m.len)
      q.setFromAxisAngle(AX, sway)
      m4.compose(v.set(m.s.x, m.top, m.s.z + 0.05), q, sc.set(1, m.len, 1))
      tubes.setMatrixAt(n, m4)
      // the cup at the end of the tube
      v.set(0, -m.len, 0).applyQuaternion(q).add(sc.set(m.s.x, m.top, m.s.z + 0.05))
      m4.compose(v, q, sc.set(1.4, 1.4, 1.4))
      cups.setMatrixAt(n, m4)
      n++
    }
    cups.count = tubes.count = n
    cups.instanceMatrix.needsUpdate = tubes.instanceMatrix.needsUpdate = true
    if (d.up) {
      if (n === 0) {
        cups.count = tubes.count = 0
        st.drill = null
      }
      return
    }
    d.left -= dt
    if (!d.on && Math.ceil(d.left) !== d.warned && d.left > 0) {
      d.warned = Math.ceil(d.left)
      sfx('tick', { vol: 0.25 })
      if (!seating.seat && d.warned <= 6 && d.warned % 2 === 0) hud.toast('Get to a seat and PUT ON YOUR MASK!')
    }
    if (d.left <= 0) endDrill()
  }
  function endDrill(quiet = false) {
    const d = st.drill
    if (!d || d.up) return
    d.up = true
    for (const n of pals()) n.data.mask = false
    if (d.on) {
      myMask.parent?.remove(myMask)
      d.on = false
    } else if (!quiet) {
      sfx('wahwah', { vol: 0.35 })
      hud.toast('Too slow! In a real emergency, mask on FIRST.', 3)
    }
    if (!quiet) later(0.6, () => {
      sfx('bingBong', { vol: 0.25 })
      hud.toast('📢 "Drill complete. Thank you for flying safely with skyhop air!"', 3)
    })
    if (quiet) {
      cups.count = tubes.count = 0
      st.drill = null
    }
  }

  // --- The captain's jokes -------------------------------------------------------------------------------
  function joke() {
    if (!st.jokes.length) st.jokes = [...E.jokes].sort(() => Math.random() - 0.5)
    const j = st.jokes.pop()
    sfx('paChime', { vol: 0.35 })
    hud.toast(`📢 Captain: "${j}"`, 5)
    later(Math.min(4, 1.6 + j.length * 0.025), () => {
      sfx('rimshot', { vol: 0.4 })
      later(0.3, () => sfx('laughTrack', { vol: 0.16 }))
      for (const n of pals()) {
        n.data.clap = 1.4
        if (Math.random() < 0.4) crowd.say(n, pick(['HAHA!', 'Hehe', 'Good one!', 'Groan...', '😂']), 1.6)
      }
      if (Math.random() < 0.5) sayMe(pick(['Haha!', 'Classic captain.', '🙄', 'LOL']), 1.4)
    })
  }

  function fire() {
    const can = (id) => !st.done.has(id)
    const opts = []
    if (can('storm')) opts.push('storm')
    if (can('drill') && onMainDeck() && !rules.chasing && !rules.hidden) opts.push('drill')
    opts.push('joke')
    // jokes in between the big two
    const id = st.lastBig && opts.length > 1 && Math.random() < 0.6 ? 'joke' : pick(opts)
    if (id !== 'joke') st.lastBig = true
    else st.lastBig = false
    if (id === 'storm') storm()
    else if (id === 'drill') drill()
    else joke()
    hooks.pushTurb?.(id === 'joke' ? 6 : 18) // the regular turbulence waits its turn
  }

  // E (rules.js) presses the first button with key E: the mask, while the drill is on.
  rules.addActions(() => {
    const d = st.drill
    if (st.phase !== 'cruise' || !d || d.on || d.up || !seating.seat) return []
    return [{ icon: '😷', label: `PUT ON MASK ${Math.max(0, Math.ceil(d.left))}`, key: 'E', fn: putOnMask, cls: 'red', pri: 10 }]
  })

  return {
    st,
    get storming() {
      return !!st.storm
    },
    // the mask (E) beats eating while the drill is on (rules.js asks before inflight.eat)
    claimE() {
      const d = st.drill
      if (d && !d.on && !d.up && seating.seat) {
        putOnMask()
        return true
      }
      return false
    },
    board() {
      st.phase = 'takeoff'
      st.done.clear()
      st.next = E.first
      st.lastBig = false
    },
    setPhase(p) {
      st.phase = p
      if (p !== 'cruise') {
        endStorm(true)
        endDrill(true)
      }
    },
    clear() {
      endStorm(true)
      endDrill(true)
      myMask.parent?.remove(myMask)
      st.phase = 'off'
      timers.length = 0
    },
    // dev: __game.flight.events.fire('storm' | 'drill' | 'joke')
    fire(id) {
      if (id === 'storm') storm()
      else if (id === 'drill') drill()
      else joke()
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
      stepStorm(dt)
      stepDrill(dt)
      if (st.phase !== 'cruise') return
      if (!st.storm && !st.drill) {
        st.next -= dt
        if (st.next <= 0) {
          st.next = rr(...E.every)
          fire()
        }
      }
    },
  }
}
