// Life in your seat (flight.js owns the trip, cabinCrew.js the crew, airport/food.js the dishes).
//
// SEATBELT (B / the BELT button): click-clack, the strap slides shut across your lap. Buckled you can't
// stand up (tug the strap: "Unbuckle first!"). The sign comes on for take-off, turbulence and landing:
// buckle up within FLIGHT.belt.graceS s for a Model Passenger bonus. Turbulence knocks over anyone
// standing (stumble) and bonks anyone sitting unbuckled (stars, spilled drink); buckled you're safe.
//
// MENU (M / the MENU button): the card for the cabin of the seat you're in (and every cabin behind it), in
// coins (First / Business ticket holders get their own cabin's dishes free). An attendant plates it up and
// brings it to your tray table (sizzle, tray down, sparkle). EAT (E / the EAT button): your arm lifts
// each piece to your mouth (crunch / chew / slurp / sip / fizz / creamy sounds, crumbs, chewing), drinks
// are lifted and sipped (the level drops, bubbles), the last bite gets a happy jingle, a sparkle and the
// dish's effect (FLIGHT.foodEffects: bouncy legs, turbo, fire breath, brain freeze, golden glow...).
// Synth sounds via registerSfx; particles via fx.js.
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three'
import { FLIGHT } from './config.js'
import { player } from './player.js'
import { lockSeat, seating, SIT } from './seating.js'
import { inputState, onKey } from './input.js'
import { registerSfx, sfx } from './audio.js'
import { makeDish, makeTray, TRAY_SLOTS } from './airport/food.js'
import { rbox } from './detail.js'
import { ICON } from './hud/icons.js'
import './hud/inflight.css'

const MENU = FLIGHT.menu
const ITEMS = Object.fromEntries(MENU.items.map((i) => [i.id, i]))
const EFFECTS = FLIGHT.foodEffects
const BELT = FLIGHT.belt
const rr = (a, b) => a + Math.random() * (b - a)
const pick = (a) => a[Math.floor(Math.random() * a.length)]
const ease = (t) => t * t * (3 - 2 * t)
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t)
const deg = (d) => (d * Math.PI) / 180
const EFFECT_TAG = {
  none: '😋 Crunchy',
  full: '😋 Yum!',
  warm: '♨️ Cosy',
  happy: '💖 Happy',
  calm: '🍃 Calm',
  jump: '🫧 Bouncy',
  speed: '⚡ Speedy',
  turbo: '🚀 Turbo',
  spicy: '🔥 Fire breath',
  sleepy: '😴 Sleepy',
  cold: '🥶 Brain freeze',
  golden: '✨ Golden',
}
const CATS = [
  ['all', 'All'],
  ['meal', 'Meals'],
  ['snack', 'Snacks'],
  ['dessert', 'Desserts'],
  ['drink', 'Drinks'],
]
const TIER_COL = ['#e8b54a', '#4f8dff', '#2fc4b2', '#3a8bff']
const SC = MENU.scale // the food is drawn bigger than life, to match the chunky avatars
// Tray table per cabin (First .. Economy): height above the floor, distance ahead of the seat.
const TABLE_H = [0.84, 0.84, 0.86, 0.88]
const TABLE_DZ = [0.8, 0.78, 0.7, 0.62]

// --- Sounds ---------------------------------------------------------------------------------------------
// A crisp bite: a few bright crackles and a low snap.
registerSfx('crunch', ({ now, out, tone, noise }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.45, o.pan)
  tone(d, t, 0.06, { f: 240, f2: 110, peak: 0.35, a: 0.002 })
  const n = 4 + Math.floor(Math.random() * 3)
  for (let i = 0; i < n; i++) {
    const at = t + i * rr(0.025, 0.06)
    noise('white', d, at, rr(0.025, 0.05), { type: 'bandpass', f: rr(1800, 4800), q: rr(1.5, 4), peak: rr(0.5, 0.95), a: 0.001 })
  }
  noise('pink', d, t + 0.02, 0.18, { type: 'bandpass', f: 1200, q: 0.8, peak: 0.25, a: 0.004 })
})
// Chewing: three muffled squishy bites.
registerSfx('chew', ({ now, out, tone, noise }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.45, o.pan)
  for (let i = 0; i < 3; i++) {
    const at = t + i * 0.17
    noise('pink', d, at, 0.12, { type: 'lowpass', f: rr(500, 800), f2: 260, q: 1.2, peak: 0.8, a: 0.012 })
    tone(d, at, 0.1, { f: rr(130, 170), f2: 90, peak: 0.18, a: 0.01 })
    noise('white', d, at + 0.03, 0.05, { type: 'bandpass', f: 2600, q: 3, peak: 0.12, a: 0.004 })
  }
})
// Slurp: a bubbly suck sweeping up through the straw / noodles.
registerSfx('slurp', ({ now, out, tone, noise }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.4, o.pan)
  noise('pink', d, t, 0.55, { type: 'bandpass', f: 500, f2: 2600, q: 2.2, peak: 0.9, a: 0.04 })
  tone(d, t, 0.5, { type: 'triangle', f: 260, f2: 780, peak: 0.08, a: 0.03, vib: 40, vibRate: 22 })
  for (let i = 0; i < 6; i++) tone(d, t + 0.05 + i * 0.07, 0.04, { f: rr(500, 1100), f2: rr(1200, 1800), peak: 0.1, a: 0.003 })
})
// A small sip then a gulp.
registerSfx('sip', ({ now, out, tone, noise }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.4, o.pan)
  noise('pink', d, t, 0.2, { type: 'bandpass', f: 1500, f2: 3200, q: 2.5, peak: 0.45, a: 0.02 })
  tone(d, t + 0.25, 0.14, { f: 210, f2: 95, peak: 0.45, a: 0.006 })
  noise('brown', d, t + 0.25, 0.12, { type: 'lowpass', f: 400, peak: 0.4, a: 0.006 })
})
// Gulp + fizz: a fizzy drink going down (bubbles crackling).
registerSfx('fizzy', ({ now, out, tone, noise }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.4, o.pan)
  tone(d, t + 0.05, 0.13, { f: 220, f2: 100, peak: 0.45, a: 0.006 })
  tone(d, t + 0.3, 0.13, { f: 200, f2: 95, peak: 0.35, a: 0.006 })
  noise('white', d, t, 0.9, { type: 'highpass', f: 6000, peak: 0.18, a: 0.04 })
  for (let i = 0; i < 14; i++) tone(d, t + Math.random() * 0.8, 0.02, { f: rr(3000, 7000), peak: 0.04, a: 0.001 })
})
// Creamy spoonful: spoon clink, a soft squish and a happy "mm".
registerSfx('creamy', ({ now, out, tone, noise }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.4, o.pan)
  tone(d, t, 0.18, { f: 3300, peak: 0.12, a: 0.002 })
  tone(d, t, 0.1, { f: 6100, peak: 0.04, a: 0.002 })
  noise('pink', d, t + 0.12, 0.2, { type: 'lowpass', f: 900, f2: 300, peak: 0.5, a: 0.02 })
  tone(d, t + 0.3, 0.45, { type: 'triangle', f: 210, f2: 250, peak: 0.16, a: 0.05, vib: 4, vibRate: 6, curve: 'hold' })
})
// "Mmm!": a happy hum (rising) + a little sparkle.
registerSfx('mmm', ({ now, out, tone }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.35, o.pan)
  tone(d, t, 0.7, { type: 'triangle', f: 190, f2: 260, peak: 0.25, a: 0.06, vib: 5, vibRate: 6, curve: 'hold' })
  tone(d, t, 0.7, { type: 'sine', f: 380, f2: 520, peak: 0.08, a: 0.06, curve: 'hold' })
  ;[1568, 2093].forEach((f, i) => tone(d, t + 0.45 + i * 0.08, 0.4, { f, peak: 0.08, a: 0.004 }))
})
// Plate cleaned: a bright four-note jingle.
registerSfx('plateDone', ({ now, out, tone }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.35, o.pan)
  ;[1047, 1319, 1568, 2093].forEach((f, i) => {
    tone(d, t + i * 0.075, 0.5, { f, peak: 0.2, a: 0.004 })
    tone(d, t + i * 0.075, 0.25, { f: f * 2, peak: 0.05, a: 0.004 })
  })
})
// A cartoon burp (growly saw with fast wobble).
registerSfx('burp', ({ now, out, tone, noise }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.35, o.pan)
  tone(d, t, 0.45, { type: 'sawtooth', f: 110, f2: 70, peak: 0.2, a: 0.02, vib: 9, vibRate: 32, curve: 'hold' })
  tone(d, t, 0.45, { type: 'square', f: 55, f2: 40, peak: 0.08, a: 0.02, vib: 4, vibRate: 30, curve: 'hold' })
  noise('brown', d, t, 0.4, { type: 'lowpass', f: 600, peak: 0.4, a: 0.02 })
})
// Fire breath: a burp with a roaring whoosh.
registerSfx('fireBurp', ({ now, out, tone, noise }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.4, o.pan)
  tone(d, t, 0.3, { type: 'sawtooth', f: 120, f2: 80, peak: 0.16, a: 0.02, vib: 9, vibRate: 30 })
  noise('white', d, t + 0.05, 0.7, { type: 'bandpass', f: 600, f2: 3500, q: 0.7, peak: 0.6, a: 0.05 })
  noise('brown', d, t + 0.05, 0.8, { type: 'lowpass', f: 400, peak: 0.6, a: 0.05 })
  for (let i = 0; i < 8; i++) noise('white', d, t + 0.1 + Math.random() * 0.6, 0.02, { type: 'highpass', f: 4000, peak: 0.4, a: 0.001 })
})
// Brain freeze: a descending wobbly whine and a shiver.
registerSfx('brainFreeze', ({ now, out, tone, noise }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.35, o.pan)
  tone(d, t, 0.9, { f: 2400, f2: 500, peak: 0.12, a: 0.01, vib: 60, vibRate: 14 })
  noise('white', d, t + 0.2, 0.6, { type: 'bandpass', f: 5000, q: 3, peak: 0.25, a: 0.02 })
  for (let i = 0; i < 6; i++) tone(d, t + 0.3 + i * 0.07, 0.05, { type: 'square', f: 180, peak: 0.04, a: 0.003 })
})
// A big sleepy yawn.
registerSfx('yawn', ({ now, out, tone, noise }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.3, o.pan)
  tone(d, t, 1.2, { type: 'triangle', f: 260, f2: 170, peak: 0.2, a: 0.2, vib: 6, vibRate: 5, curve: 'hold' })
  noise('pink', d, t, 1.1, { type: 'bandpass', f: 900, f2: 500, q: 1.5, peak: 0.25, a: 0.25 })
})
// Golden glow: a shimmering harp sweep.
registerSfx('shimmer', ({ now, out, tone }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.3, o.pan)
  ;[1319, 1568, 1976, 2349, 2637, 3136].forEach((f, i) => tone(d, t + i * 0.05, 0.9, { f, peak: 0.09, a: 0.003 }))
})
// Menu card opened: a papery rustle.
registerSfx('menuOpen', ({ now, out, noise }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.35, o.pan)
  for (let i = 0; i < 5; i++) noise('pink', d, t + i * 0.05 + Math.random() * 0.02, 0.07, { type: 'bandpass', f: rr(2500, 5500), q: 1.5, peak: 0.5, a: 0.006 })
  noise('white', d, t, 0.3, { type: 'highpass', f: 3500, peak: 0.15, a: 0.03 })
})
// A page flicked (tab switch).
registerSfx('menuFlip', ({ now, out, noise }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.3, o.pan)
  noise('white', d, t, 0.09, { type: 'bandpass', f: 4200, f2: 2000, q: 1.2, peak: 0.55, a: 0.004 })
})
// Order placed: the galley's counter bell, twice.
registerSfx('orderUp', ({ now, out, tone }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.35, o.pan)
  for (const at of [0, 0.16]) {
    tone(d, t + at, 0.7, { f: 2637, peak: 0.2, a: 0.002 })
    tone(d, t + at, 0.4, { f: 5274, peak: 0.05, a: 0.002 })
    tone(d, t + at, 0.5, { f: 3951, peak: 0.06, a: 0.002 })
  }
})
// A hot dish arriving: a short sizzle.
registerSfx('sizzle', ({ now, out, tone, noise }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.25, o.pan)
  noise('white', d, t, 0.9, { type: 'highpass', f: 3500, peak: 0.35, a: 0.02 })
  for (let i = 0; i < 16; i++) tone(d, t + Math.random() * 0.8, 0.015, { f: rr(4000, 8000), peak: 0.05, a: 0.001 })
})
// The strap pulled tight (trying to stand while buckled).
registerSfx('beltTug', ({ now, out, tone, noise }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.35, o.pan)
  noise('pink', d, t, 0.14, { type: 'bandpass', f: 900, f2: 1600, q: 3, peak: 0.6, a: 0.01 })
  tone(d, t, 0.18, { type: 'triangle', f: 160, f2: 120, peak: 0.25, a: 0.004 })
  noise('white', d, t + 0.12, 0.03, { type: 'highpass', f: 3000, peak: 0.4, a: 0.001 })
})
// Unbuckled: the latch lifts (clack) and the strap slides out.
registerSfx('unbuckle', ({ now, out, tone, noise }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.35, o.pan)
  noise('white', d, t, 0.03, { type: 'highpass', f: 2500, peak: 0.8, a: 0.001 })
  tone(d, t, 0.06, { f: 1700, peak: 0.12, a: 0.001 })
  noise('white', d, t + 0.06, 0.16, { type: 'bandpass', f: 4000, f2: 2000, q: 2, peak: 0.25, a: 0.02 })
})
// Head bonk: a hollow knock and a cartoon boing.
registerSfx('bonk', ({ now, out, tone, noise }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.45, o.pan)
  tone(d, t, 0.16, { f: 620, f2: 180, peak: 0.5, a: 0.002 })
  noise('pink', d, t, 0.06, { type: 'bandpass', f: 900, q: 2, peak: 0.6, a: 0.002 })
  tone(d, t + 0.08, 0.5, { type: 'triangle', f: 300, f2: 720, peak: 0.18, a: 0.01, vib: 30, vibRate: 18 })
})
// Stumble: a whoosh, a "whoa" and feet scrambling.
registerSfx('stumble', ({ now, out, tone, noise }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.4, o.pan)
  noise('pink', d, t, 0.35, { type: 'bandpass', f: 600, f2: 1800, q: 0.8, peak: 0.5, a: 0.03 })
  tone(d, t + 0.05, 0.4, { type: 'triangle', f: 420, f2: 250, peak: 0.18, a: 0.03, vib: 10, vibRate: 8 })
  for (let i = 0; i < 4; i++) noise('pink', d, t + 0.15 + i * 0.08, 0.05, { type: 'lowpass', f: 700, peak: 0.6, a: 0.003 })
})
// A drink sloshing over the tray.
registerSfx('spill', ({ now, out, tone, noise }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.35, o.pan)
  noise('pink', d, t, 0.4, { type: 'bandpass', f: 1400, f2: 500, q: 1, peak: 0.6, a: 0.01 })
  for (let i = 0; i < 6; i++) tone(d, t + 0.05 + Math.random() * 0.3, 0.05, { f: rr(600, 1400), f2: rr(1500, 2500), peak: 0.06, a: 0.003 })
})

// --- The belt across your lap ------------------------------------------------------------------------
function makeBelt() {
  const g = new Group()
  const strap = new MeshStandardMaterial({ color: '#3a4258', roughness: 0.7 })
  const metal = new MeshStandardMaterial({ color: '#dfe4ec', roughness: 0.2, metalness: 0.9 })
  const halves = []
  for (const s of [-1, 1]) {
    const h = new Group()
    const band = new Mesh(new BoxGeometry(0.26, 0.05, 0.016), strap)
    band.position.x = s * 0.13
    h.add(band)
    const plate = new Mesh(rbox(0.07, 0.06, 0.022, 0.008, 1), metal)
    plate.position.x = s * 0.015
    h.add(plate)
    g.add(h)
    halves.push(h)
  }
  const lever = new Mesh(new BoxGeometry(0.05, 0.03, 0.01), metal)
  lever.position.set(0, 0, 0.014)
  g.add(lever)
  g.visible = false
  return { g, halves, lever }
}

// trip: { seat, cls (ticket class) }. crew: cabinCrew (deliver). sayMe(text, s): a bubble over you.
// shake(amp, dur): camera shake. headPos(out): your head (neck pivot) in world space, or false.
export function createInflight({ scene, cabin, crew, hud, store, fx, trip, sayMe = () => {}, shake = () => {}, headPos = () => false }) {
  const F = cabin.floorY
  const st = {
    belted: false,
    forced: false, // take-off / landing / an escort: buckled by the crew, no unbuckling
    seatRef: null, // the seat the belt is drawn on
    beltAnim: 1, // 0..1 shut
    beltTarget: 0,
    tugT: 0,
    tugHintT: 0,
    tug: 0,
    sign: false,
    signT: 0,
    signPaid: true,
    phase: 'off',
    bite: null, // the bite / sip in progress
    biteQueued: false,
    trays: new Map(), // seat -> { g, dishes: [] }
    orders: [], // { item, seat }
    effect: null, // { id, t, cfg, fxT }
    bonk: 0,
    joltSafe: false,
    menuOpen: false,
    beltPulse: false,
    dine: 0, // s left of the dining close-up (food arriving, eating)
    banT: 0, // s the crew refuse to take your order (rules.js punishment)
    dineK: 0, // 0..1 blend into it
  }
  const dc = { pos: new Vector3(), look: new Vector3(), from: new Vector3(), fromLook: new Vector3(), fov: 70 }
  const timers = []
  const later = (t, fn) => timers.push({ t, fn })
  const belt = makeBelt()
  scene.add(belt.g)
  const mouth = new Vector3()
  const tmp = new Vector3()
  const tmp2 = new Vector3()
  player.boost ??= { speed: 1, jump: 1 }

  // --- Seat bar (inside the bottom action block, above the cruise label) ----------------------------
  const bar = document.createElement('div')
  bar.className = 'seatbar'
  bar.innerHTML = `
    <button class="sb-btn sb-belt"><span class="sb-ico">🔓</span><span class="sb-l">BELT</span><span class="sb-k">B</span></button>
    <button class="sb-btn sb-menu"><span class="sb-ico">📋</span><span class="sb-l">MENU</span><span class="sb-k">M</span></button>
    <button class="sb-btn sb-eat"><span class="sb-ico">🍴</span><span class="sb-l">EAT</span><span class="sb-n"></span><span class="sb-k">E</span></button>
    <span class="sb-buff"></span>`
  hud.actSlot.appendChild(bar)
  const bBelt = bar.querySelector('.sb-belt')
  const bMenu = bar.querySelector('.sb-menu')
  const bEat = bar.querySelector('.sb-eat')
  const eatN = bar.querySelector('.sb-n')
  const buffEl = bar.querySelector('.sb-buff')
  const tapBtn = (b, fn) => {
    b.addEventListener('pointerdown', (e) => e.stopPropagation())
    b.addEventListener('click', (e) => {
      e.stopPropagation()
      fn()
    })
  }
  tapBtn(bBelt, () => toggleBelt())
  tapBtn(bMenu, () => openMenu())
  tapBtn(bEat, () => eat())
  onKey('KeyB', () => active() && toggleBelt())
  onKey('KeyM', () => active() && seating.seat && openMenu())
  // (E is bound in rules.js: lavatory / exit handle when standing near one, else eat())
  const active = () => st.phase === 'cruise'
  let barShown = null
  let barKey = ''
  function refreshBar() {
    const seated = !!seating.seat && seating.seat.cls != null && st.phase === 'cruise' // a plane seat (not a lounge sofa / stool)
    const tray = seated ? st.trays.get(seating.seat) : null
    const left = tray ? tray.dishes.filter((d) => d.left > 0).length : 0
    const show = seated || !!st.effect
    if (show !== barShown) {
      barShown = show
      hud.root.classList.toggle('has-seatbar', show)
    }
    const e = st.effect
    const buff = e && e.cfg.s > 0 ? `${EFFECT_TAG[e.id] ?? ''} ${Math.ceil(e.t)}s` : ''
    // only touch the DOM when something changed (this runs every frame)
    const key = `${seated}|${st.belted}|${seated && st.sign && !st.belted}|${left}|${!!st.bite}|${buff}`
    if (key === barKey) return
    barKey = key
    bar.classList.toggle('seated', seated)
    bBelt.classList.toggle('on', st.belted)
    bBelt.classList.toggle('warn', seated && st.sign && !st.belted)
    bBelt.querySelector('.sb-ico').textContent = st.belted ? '🔒' : '🔓'
    bBelt.querySelector('.sb-l').textContent = st.belted ? 'BUCKLED' : 'BELT'
    bEat.classList.toggle('show', left > 0)
    bEat.classList.toggle('busy', !!st.bite)
    eatN.textContent = left > 1 ? `×${left}` : ''
    buffEl.classList.toggle('show', !!buff)
    buffEl.textContent = buff
  }

  // --- Seatbelt ----------------------------------------------------------------------------------
  function placeBelt() {
    const s = seating.seat
    if (!s) return
    // across your lap: just in front of the hips, a little above the cushion (you face -Z)
    belt.g.position.set(s.x, s.y + 0.2, s.z - 0.2)
    belt.g.rotation.set(-0.25, 0, 0)
  }
  function buckle(on, { quiet = false, forced = null } = {}) {
    if (forced != null) st.forced = forced
    if (on === st.belted) return
    st.belted = on
    st.beltTarget = on ? 1 : 0
    lockSeat(on)
    if (!seating.seat) return
    st.seatRef = seating.seat
    placeBelt()
    belt.g.visible = true
    if (quiet) {
      st.beltAnim = st.beltTarget
      return
    }
    const p = belt.g.position
    if (on) {
      sfx('buckle', { vol: 0.55 })
      later(0.2, () => {
        fx.sparkle(p.x, p.y + 0.04, p.z, { count: 8, color: '#dff3ff', size: 0.08, speed: 1.2, up: 0.6, life: 0.4, grav: 3 })
        belt.g.scale.setScalar(1.25)
      })
      // buckled while the sign is on: a Model Passenger bonus, once per sign
      if (st.sign && !st.signPaid && st.phase === 'cruise' && st.signT <= BELT.graceS) {
        st.signPaid = true
        later(0.4, () => {
          sfx('ding', { vol: 0.35 })
          hud.big('MODEL PASSENGER!', 'green', 1.4)
          fx.sparkle(p.x, p.y + 0.6, p.z, { count: 22, color: '#7cff6b', size: 0.22, speed: 2.5, up: 2, life: 0.8, grav: 3 })
          store.addCoins(BELT.goodCoins, { x: p.x, y: p.y + 0.8, z: p.z })
        })
      }
    } else {
      sfx('unbuckle', { vol: 0.5 })
      fx.sparkle(p.x, p.y + 0.04, p.z, { count: 5, color: '#ffffff', size: 0.06, speed: 1, up: 0.5, life: 0.3, grav: 3 })
    }
  }
  function toggleBelt() {
    if (!seating.seat || seating.seat.cls == null) return
    if (st.belted && st.forced) {
      sfx('error')
      hud.toast(st.phase === 'cruise' ? 'The crew buckled you in! Wait for the ding.' : 'Seatbelt must stay on for now!')
      tugFx()
      return
    }
    buckle(!st.belted)
    if (!st.belted && st.sign) hud.toast('Careful! The seatbelt sign is still on.')
    refreshBar()
  }
  function tugFx() {
    st.tug = 1
    sfx('beltTug', { vol: 0.45 })
    const p = belt.g.position
    fx.puff(p.x, p.y, p.z, { count: 3, size: 0.12, alpha: 0.25, life: 0.4, spread: 0.1, up: 0.2, color: '#ffffff' })
  }

  // --- Turbulence ---------------------------------------------------------------------------------
  // k 0..1: one jolt. flight.js calls a few in a row once the sign is on.
  function jolt(k) {
    if (st.phase !== 'cruise') return
    shake(0.08 + 0.16 * k, 0.45)
    const pp = player.position
    if (!seating.seat) {
      // standing: thrown off balance
      const a = Math.random() * Math.PI * 2
      player.velocity.x += Math.cos(a) * BELT.stumble * k
      player.velocity.z += Math.sin(a) * BELT.stumble * k * 0.6
      player.velocity.y = 2 + 2 * k
      player.stun = 0.35 + 0.35 * k
      sfx('stumble', { vol: 0.45 })
      fx.puff(pp.x, pp.y + 0.1, pp.z, { count: 8, size: 0.3, alpha: 0.3, life: 0.6, color: '#d2cbc0' })
      if (k > 0.6) sayMe(pick(['Whoa!', 'Woah woah!', 'Aaah!', 'Hold on!']), 1.6)
      if (k > 0.6) hud.big('WHOA!', 'red', 0.9)
    } else if (!st.belted) {
      if (k < 0.5) return
      // sitting unbuckled: up out of the seat and bonk
      st.bonk = 1
      sfx('bonk', { vol: 0.5 })
      later(0.05, () => {
        if (headPos(tmp)) {
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2
            fx.trail(tmp.x + Math.cos(a) * 0.3, tmp.y + 0.55, tmp.z + Math.sin(a) * 0.3, { glow: true, color: '#ffe14a', size: 0.12, size1: 0.06, alpha: 1, life: 1.1, vx: -Math.sin(a) * 0.9, vy: 0.05, vz: Math.cos(a) * 0.9, drag: 0.4, grav: 0 })
          }
        }
      })
      hud.big('BONK!', 'red', 1.0)
      sayMe(pick(['Ouch!', 'My head!', 'Should have buckled up...']), 1.8)
      spill()
    } else if (!st.joltSafe) {
      st.joltSafe = true
      const s = seating.seat
      fx.sparkle(s.x, s.y + 0.6, s.z, { count: 10, color: '#9fd0ff', size: 0.16, speed: 1.5, up: 1, life: 0.6, grav: 2 })
      hud.toast('Buckled up: safe and sound!')
    }
    // a drink on your tray sloshes on the big ones (even buckled)
    if (k > 0.8 && seating.seat && Math.random() < 0.5) spill(0.12)
  }
  function spill(amount = 0.25) {
    const tray = st.trays.get(seating.seat)
    const d = tray?.dishes.find((q) => q.drink && q.left > 0 && q !== st.bite?.dish)
    if (!d) return
    d.level = Math.max(0.05, d.level - amount)
    d.dish.liquid.scale.y = d.level
    const p = d.dish.g.position
    sfx('spill', { vol: 0.4 })
    const col = ITEMS[d.id].crumbs[0]
    for (let i = 0; i < 12; i++) fx.trail(p.x, p.y + 0.12, p.z, { color: col, size: 0.035, size1: 0.02, alpha: 0.9, life: 0.6, vx: rr(-0.8, 0.8), vy: rr(0.6, 1.4), vz: rr(-0.8, 0.8), drag: 0.6, grav: 7 })
  }

  // --- Trays + dishes -------------------------------------------------------------------------------
  function trayFor(seat, make = true) {
    let t = st.trays.get(seat)
    if (t || !make) return t
    const cls = seat.cls
    const h = TABLE_H[cls]
    const g = makeTray(cls, cls <= 2 ? h / SC : 0)
    g.scale.setScalar(SC)
    g.position.set(seat.x, F + h, seat.z - TABLE_DZ[cls])
    scene.add(g)
    fx.puff(g.position.x, g.position.y + 0.05, g.position.z, { count: 6, size: 0.18, alpha: 0.35, life: 0.45, spread: 0.15, up: 0.2, color: '#ffffff' })
    t = { g, seat, dishes: [], clearT: 0 }
    st.trays.set(seat, t)
    return t
  }
  const freeSlot = (t) => TRAY_SLOTS.findIndex((_, i) => !t.dishes.some((d) => d.slot === i))
  // Put a dish on a seat's tray (the crew's hand-off). Returns false when the tray is full.
  function addDish(seat, id, { quiet = false } = {}) {
    const t = trayFor(seat)
    let slot = freeSlot(t)
    if (slot < 0) return false
    const item = ITEMS[id]
    const dish = makeDish(id)
    // drinks prefer the back right slot when it's free
    if (dish.drink && !t.dishes.some((d) => d.slot === 2)) slot = 2
    const sp = TRAY_SLOTS[slot]
    dish.g.position.set(t.g.position.x + sp.x * SC, t.g.position.y + t.g.userData.top * SC, t.g.position.z + sp.z * SC)
    dish.g.scale.setScalar(0.01)
    scene.add(dish.g)
    const d = { id, dish, slot, left: item.bites, bites: item.bites, level: 1, drink: dish.drink, pop: 0, done: false, t: 0, seat }
    t.dishes.push(d)
    t.clearT = 0
    const p = dish.g.position
    if (!quiet) {
      if (seating.seat === seat) dineShot(2.6)
      sfx('trayDown', { vol: 0.45 })
      if (dish.steam) later(0.15, () => sfx('sizzle', { vol: 0.22 }))
      if (dish.fizz) later(0.2, () => sfx('champagne', { vol: 0.25 }))
      else later(0.25, () => sfx('clink', { vol: 0.18 }))
      fx.sparkle(p.x, p.y + 0.15, p.z, { count: 14, color: TIER_COL[item.tier], size: 0.14, speed: 1.4, up: 1, life: 0.7, grav: 2 })
    }
    return true
  }
  // Clear a seat's tray (landing: "trays stowed"; or once everything on it is finished).
  function clearTray(seat, loud = true) {
    const t = st.trays.get(seat)
    if (!t) return
    if (st.bite && st.bite.dish.seat === seat) endBite(true)
    for (const d of t.dishes) {
      scene.remove(d.dish.g)
      disposeTree(d.dish.g)
    }
    if (loud) {
      const p = t.g.position
      fx.puff(p.x, p.y + 0.1, p.z, { count: 8, size: 0.25, alpha: 0.35, life: 0.5, color: '#ffffff' })
      sfx('trayDown', { vol: 0.25 })
    }
    scene.remove(t.g)
    disposeTree(t.g)
    st.trays.delete(seat)
  }

  // --- The menu ---------------------------------------------------------------------------------------
  const onTray = (seat) => {
    const t = st.trays.get(seat)
    return (t ? t.dishes.filter((d) => d.left > 0).length : 0) + st.orders.filter((o) => o.seat === seat).length
  }
  const freeFor = (item, seat) => trip.cls <= 1 && item.tier === trip.cls && seat.cls === trip.cls
  function openMenu() {
    const seat = seating.seat
    if (!seat || seat.cls == null) return hud.toast('Sit down in a seat to order from the menu!')
    sfx('menuOpen', { vol: 0.4 })
    const k = seat.cls
    const name = FLIGHT.classes[k].name
    const body = hud.openWin(`${name} Menu`, 'w-menu', ['yellow', 'blue', 'green', 'blue'][k])
    st.menuOpen = true
    const sneaky = k < trip.cls
    const head = document.createElement('div')
    head.className = 'fm-head'
    head.innerHTML = `<span class="fm-tag" style="--c:${TIER_COL[k]}">${sneaky ? '🤫 Sneaky order' : `✈ Seat ${seat.code}`}</span><span class="fm-tray"></span>`
    body.appendChild(head)
    const trayEl = head.querySelector('.fm-tray')
    const tabs = document.createElement('div')
    tabs.className = 'fm-tabs'
    body.appendChild(tabs)
    const grid = document.createElement('div')
    grid.className = 'fm-grid'
    body.appendChild(grid)
    const items = MENU.items.filter((i) => i.tier >= k).sort((a, b) => a.tier - b.tier)
    let cat = 'all'
    const refreshTray = () => {
      const n = onTray(seat)
      trayEl.textContent = `Tray ${n}/${MENU.maxTray}`
      trayEl.classList.toggle('full', n >= MENU.maxTray)
      grid.classList.toggle('full', n >= MENU.maxTray)
    }
    const draw = () => {
      grid.innerHTML = ''
      for (const it of items) {
        if (cat !== 'all' && it.cat !== cat) continue
        const free = freeFor(it, seat)
        const card = document.createElement('div')
        card.className = 'fm-card'
        card.style.setProperty('--c', TIER_COL[it.tier])
        card.innerHTML = `<span class="fm-ico">${it.icon}</span><span class="fm-tier">${MENU.tiers[3 - it.tier]}</span><span class="fm-name">${it.name}</span><span class="fm-desc">${it.desc}</span><span class="fm-eff">${EFFECT_TAG[it.effect] ?? ''}</span>`
        const buy = document.createElement('button')
        buy.className = `fm-buy ${free ? 'free' : ''}`
        buy.innerHTML = free ? 'FREE' : `<span class="price fm-price">${ICON.coin}${it.price}</span>`
        card.appendChild(buy)
        tapBtn(buy, () => {
          if (onTray(seat) >= MENU.maxTray) {
            sfx('error')
            hud.toast('Your tray is full! Eat something first.')
            return
          }
          if (!seating.seat) return
          if (st.banT > 0) {
            sfx('error')
            hud.toast(`The crew won't serve you for another ${Math.ceil(st.banT)} s!`)
            return
          }
          if (!free && !store.spend(it.price)) return
          order(it, seat)
          card.classList.remove('ordered')
          void card.offsetWidth
          card.classList.add('ordered')
          refreshTray()
        })
        grid.appendChild(card)
      }
    }
    for (const [id, label] of CATS) {
      if (id !== 'all' && !items.some((i) => i.cat === id)) continue
      const b = document.createElement('button')
      b.className = `fm-tab ${id === cat ? 'on' : ''}`
      b.textContent = label
      tapBtn(b, () => {
        cat = id
        sfx('menuFlip', { vol: 0.35 })
        for (const q of tabs.children) q.classList.toggle('on', q === b)
        draw()
      })
      tabs.appendChild(b)
    }
    draw()
    refreshTray()
  }
  function order(item, seat) {
    sfx('orderUp', { vol: 0.4 })
    sfx('coin', { vol: 0.2 })
    st.orders.push({ item, seat })
    hud.toast(`${item.icon} ${item.name} ordered! An attendant is bringing it to ${seat.code}.`)
    const p = player.renderPosition
    fx.sparkle(p.x, p.y + 1.6, p.z, { count: 10, color: TIER_COL[item.tier], size: 0.2, speed: 2, up: 1.6, life: 0.6, grav: 3 })
    const o = st.orders[st.orders.length - 1]
    // the galley plates it up, then the crew walks it over (cabinCrew.deliver: whoever is free)
    later(rr(...MENU.deliverIn), () => {
      if (!st.orders.includes(o)) return
      crew.deliver(seat, item, () => {
        const i = st.orders.indexOf(o)
        if (i < 0) return false
        st.orders.splice(i, 1)
        if (!addDish(seat, item.id)) {
          if (!freeFor(item, seat)) store.addCoins(item.price)
          hud.toast('Your tray was full: the order was refunded.')
          return false
        }
        if (seating.seat === seat) {
          hud.toast(`Here's your ${item.name}! Tap EAT (or E) to dig in.`)
          bEat.classList.remove('pop')
          void bEat.offsetWidth
          bEat.classList.add('pop')
        } else hud.toast(`Your ${item.name} is waiting on the tray at ${seat.code}!`)
        return true
      })
    })
  }

  // --- Eating -------------------------------------------------------------------------------------------
  // A bite-sized blob in the dish's colour (a forkful of rice, a spoon of mash...).
  const morselMats = new Map()
  function morsel(item) {
    const col = item.crumbs[0]
    let m = morselMats.get(col)
    if (!m) morselMats.set(col, (m = new MeshStandardMaterial({ color: col, roughness: 0.6 })))
    return new Mesh(rbox(0.035, 0.025, 0.035, 0.012, 1), m)
  }
  // Dishes build their own geometries (one-offs): free them when a dish goes. Materials are shared.
  function disposeTree(o) {
    o.traverse((q) => q.isMesh && q.geometry?.dispose())
  }
  function mouthPos(out) {
    if (headPos(out)) {
      const f = player.facing
      out.x += Math.sin(f) * 0.3
      out.z += Math.cos(f) * 0.3
      out.y += 0.16
      return out
    }
    const s = seating.seat
    return out.set(s.x, s.y + 0.9, s.z - 0.25)
  }
  function eat() {
    const seat = seating.seat
    if (!seat) return
    const t = st.trays.get(seat)
    const d = t?.dishes.find((q) => q.left > 0)
    if (!d) {
      hud.toast('Nothing on your tray. Order something from the MENU!')
      return
    }
    if (st.bite) {
      st.biteQueued = true
      return
    }
    startBite(d)
  }
  function startBite(d) {
    const item = ITEMS[d.id]
    const b = { dish: d, item, t: 0, flying: [], home: null, done: false, said: false }
    if (d.drink) {
      b.home = d.dish.g.position.clone()
      b.dur = 1.35
    } else {
      // this bite's share of the pieces, detached from the dish so they fly to your mouth together
      // (the last bite takes whatever is left; a bite with no piece of its own takes a morsel)
      const i = d.bites - d.left
      const pieces = d.dish.pieces
      const a0 = Math.floor((i * pieces.length) / d.bites)
      const a1 = d.left <= 1 ? pieces.length : Math.floor(((i + 1) * pieces.length) / d.bites)
      for (let k = a0; k < a1; k++) {
        const piece = pieces[k]
        if (!piece?.parent) continue
        const from = new Vector3()
        piece.getWorldPosition(from)
        scene.attach(piece)
        b.flying.push({ obj: piece, from, scale0: piece.scale.clone(), off: b.flying.length })
      }
      if (!b.flying.length) {
        const m = morsel(item)
        m.scale.setScalar(SC)
        const from = d.dish.g.position.clone()
        from.y += 0.06 * SC
        m.position.copy(from)
        scene.add(m)
        b.flying.push({ obj: m, from, scale0: m.scale.clone(), off: 0, temp: true })
      }
      b.dur = 1.0
    }
    st.bite = b
    dineShot(b.dur + 2.2)
    refreshBar()
  }
  function endBite(abort = false) {
    const b = st.bite
    if (!b) return
    for (const f of b.flying) {
      scene.remove(f.obj)
      disposeTree(f.obj)
    }
    if (b.home) {
      b.dish.dish.g.position.copy(b.home)
      b.dish.dish.g.rotation.set(0, 0, 0)
    }
    st.bite = null
    if (!abort && st.biteQueued && seating.seat) {
      st.biteQueued = false
      eat()
    } else st.biteQueued = false
    refreshBar()
  }
  // The bite lands: sound, crumbs, chew; the dish shrinks; the last bite finishes it.
  function chomp(b) {
    const d = b.dish
    const item = b.item
    d.left -= 1
    sfx(item.sound === 'creamy' ? 'creamy' : item.sound, { vol: 0.5 })
    mouthPos(mouth)
    const cols = item.crumbs
    const n = item.sound === 'crunch' ? 14 : item.sound === 'chew' ? 8 : 5
    for (let i = 0; i < n; i++) {
      fx.trail(mouth.x, mouth.y - 0.05, mouth.z, { color: pick(cols), size: rr(0.025, 0.045), size1: 0.02, alpha: 1, life: rr(0.5, 0.9), vx: rr(-0.7, 0.7), vy: rr(0.3, 1.1), vz: rr(-0.7, 0.7), drag: 0.8, grav: 6, fadeIn: 0.01 })
    }
    if (item.sound === 'fizzy' || item.sound === 'sip' || item.sound === 'slurp') {
      for (let i = 0; i < 6; i++) fx.trail(mouth.x + rr(-0.06, 0.06), mouth.y, mouth.z + rr(-0.06, 0.06), { glow: true, color: '#ffffff', size: 0.04, size1: 0.01, alpha: 0.8, life: 0.7, vx: rr(-0.1, 0.1), vy: rr(0.4, 0.8), vz: rr(-0.1, 0.1), drag: 1, grav: -0.2 })
    }
    // a little "+1 bite" pop on the dish
    d.pop = 1
    if (!b.said && Math.random() < 0.35) sayMe(pick(['Yum!', 'Mmm!', 'So good!', 'Nom nom', 'Delicious!', 'Tasty!']), 1.3)
    b.said = true
    if (d.left <= 0) later(0.5, () => finish(d))
  }
  function finish(d) {
    const item = ITEMS[d.id]
    d.done = true
    sfx('plateDone', { vol: 0.4 })
    later(0.35, () => sfx(item.effect === 'spicy' ? 'fireBurp' : item.effect === 'cold' ? 'brainFreeze' : item.effect === 'sleepy' ? 'yawn' : item.effect === 'golden' ? 'shimmer' : Math.random() < 0.5 ? 'burp' : 'mmm', { vol: 0.4 }))
    const p = d.dish.g.position
    fx.sparkle(p.x, p.y + 0.15, p.z, { count: 18, color: '#ffe8a0', size: 0.18, speed: 2.2, up: 1.6, life: 0.8, grav: 3 })
    hud.big(`${item.icon} ALL GONE!`, 'green', 1.2)
    applyEffect(item.effect)
    // empty plate / glass whisked away after a moment
    later(5, () => {
      const t = st.trays.get(d.seat)
      if (!t) return
      const i = t.dishes.indexOf(d)
      if (i < 0) return
      t.dishes.splice(i, 1)
      scene.remove(d.dish.g)
      disposeTree(d.dish.g)
      fx.puff(p.x, p.y + 0.06, p.z, { count: 6, size: 0.18, alpha: 0.35, life: 0.45, color: '#ffffff' })
      sfx('whoosh', { vol: 0.12, dur: 0.25 })
      if (!t.dishes.length && !st.orders.some((o) => o.seat === d.seat)) later(1.2, () => !st.trays.get(d.seat)?.dishes.length && clearTray(d.seat))
      refreshBar()
    })
    refreshBar()
  }
  // Per frame: the arm lift, the flying morsel / cup, the chew.
  function stepBite(dt) {
    const b = st.bite
    if (!b) return
    if (!seating.seat || seating.seat !== b.dish.seat) return endBite(true)
    b.t += dt
    mouthPos(mouth)
    const d = b.dish
    if (d.drink) {
      // lift (0..0.35), sip (0.35..1.0), return (1.0..1.35)
      const g = d.dish.g
      const up = b.t < 0.35 ? ease(b.t / 0.35) : b.t < 1.0 ? 1 : 1 - ease((b.t - 1.0) / 0.35)
      tmp.copy(mouth)
      tmp.y -= 0.1 * SC
      g.position.lerpVectors(b.home, tmp, up)
      g.position.y += Math.sin(up * Math.PI) * 0.08
      g.rotation.x = up * 0.9 // rim toward your lips (+Z is your side)
      if (b.t >= 0.35 && !b.done) {
        b.done = true
        chomp(b)
        d.level = Math.max(0.04, d.left / d.bites)
      }
      if (b.t > 0.35 && b.t < 1.0) {
        // the level slides down while you drink
        const target = Math.max(0.04, d.left / d.bites)
        const cur = d.dish.liquid.scale.y
        d.dish.liquid.scale.y = cur + (target - cur) * Math.min(1, dt * 5)
        if (d.dish.fizz && Math.random() < dt * 20) fx.trail(g.position.x, g.position.y + 0.12, g.position.z, { glow: true, color: '#ffffff', size: 0.03, size1: 0.01, alpha: 0.7, life: 0.5, vx: rr(-0.1, 0.1), vy: 0.4, vz: rr(-0.1, 0.1), grav: -0.2 })
      }
      if (b.t >= b.dur) {
        d.dish.liquid.scale.y = d.left > 0 ? Math.max(0.04, d.left / d.bites) : 0.001
        endBite()
      }
      return
    }
    // food: fly the piece up (0..0.3), bite (0.3), chew (0.3..0.75), arm down (0.75..1.0)
    for (const f of b.flying) {
      // a few pieces at once trail each other a little
      const k = ease(clamp01((b.t - f.off * 0.03) / 0.3))
      tmp.lerpVectors(f.from, mouth, k)
      tmp.y += Math.sin(k * Math.PI) * 0.12
      f.obj.position.copy(tmp)
      f.obj.rotation.y += dt * 4
      if (b.t >= 0.3) {
        const s = clamp01(1 - (b.t - 0.3) / 0.12)
        f.obj.scale.copy(f.scale0).multiplyScalar(Math.max(0.001, s))
      }
    }
    if (b.t >= 0.3 && !b.done) {
      b.done = true
      chomp(b)
    }
    if (b.t >= b.dur) endBite()
  }
  // The pose on top of SIT: the right hand to the mouth, chewing, a jolt or a tug.
  const ARM = { x: -118, y: 0, z: -30, elbow: -62 } // the right arm at the mouth (degrees, character space)
  const POSE = {}
  for (const k in SIT) POSE[k] = { ...SIT[k] }
  POSE.Neck1 = { x: 0 }
  function pose() {
    if (!seating.seat) return null
    const b = st.bite
    let arm = 0
    let chew = 0
    if (b) {
      if (b.dish.drink) arm = b.t < 0.35 ? ease(b.t / 0.35) : b.t < 1.0 ? 1 : 1 - ease((b.t - 1.0) / 0.35)
      else {
        arm = b.t < 0.3 ? ease(b.t / 0.3) : b.t < 0.75 ? 1 : 1 - ease((b.t - 0.75) / 0.25)
        if (b.t > 0.3 && b.t < 0.85) chew = Math.sin((b.t - 0.3) * 38) * 0.5 + 0.5
      }
    }
    if (ARM.hold) arm = 1 // dev: freeze the arm up to tune it
    POSE.ArmR1.x = SIT.ArmR1.x + (deg(ARM.x) - SIT.ArmR1.x) * arm
    POSE.ArmR1.y = deg(ARM.y) * arm
    POSE.ArmR1.z = SIT.ArmR1.z + (deg(ARM.z) - SIT.ArmR1.z) * arm
    POSE.ArmR2.x = SIT.ArmR2.x + (deg(ARM.elbow) - SIT.ArmR2.x) * arm
    if (b?.dish.drink) {
      POSE.ArmL1.x = SIT.ArmL1.x + (deg(-80) - SIT.ArmL1.x) * arm * 0.6
      POSE.ArmL1.z = SIT.ArmL1.z + (deg(-22) - SIT.ArmL1.z) * arm * 0.6
    } else {
      POSE.ArmL1.x = SIT.ArmL1.x
      POSE.ArmL1.z = SIT.ArmL1.z
    }
    // head: chewing nods, tipping back to drink, a bonk jerk, the strap tug
    POSE.Neck1.x = deg(6) * chew - (b?.dish.drink ? deg(14) * arm : 0) - deg(28) * st.bonk
    POSE.Spine1.x = SIT.Spine1.x + deg(-14) * st.tug
    return POSE
  }

  // --- The dining close-up ---------------------------------------------------------------------------
  // From the aisle beside your row, a little ahead, looking down at you and your tray (nothing between:
  // the camera is outside the seat block). Moving / standing ends it; main blends back to the chase cam.
  function dineShot(s) {
    if (!seating.seat || st.phase !== 'cruise') return
    st.dine = Math.max(st.dine, s)
  }
  function dineTarget(seat, pos, look) {
    const side = Math.sign(seat.aisleX - seat.x) || 1
    pos.set(seat.aisleX + side * 0.55, F + 2.45, seat.z - 1.75)
    look.set(seat.x + side * 0.15, seat.y + 0.6, seat.z - 0.35)
  }
  function camera(cam, dt) {
    const seat = seating.seat
    const want = st.dine > 0 && !!seat && st.phase === 'cruise'
    if (!want) {
      st.dineK = 0
      return false
    }
    dineTarget(seat, tmp, tmp2)
    if (st.dineK === 0) {
      // start from wherever the chase cam is
      dc.from.copy(cam.position)
      cam.getWorldDirection(dc.fromLook).multiplyScalar(3).add(cam.position)
      dc.fov = cam.fov
    }
    st.dineK = Math.min(1, st.dineK + dt / 0.45)
    const k = ease(st.dineK)
    dc.pos.lerpVectors(dc.from, tmp, k)
    dc.look.lerpVectors(dc.fromLook, tmp2, k)
    // a gentle breathing drift
    dc.pos.y += Math.sin(performance.now() * 0.0011) * 0.015
    cam.position.copy(dc.pos)
    cam.lookAt(dc.look)
    const fov = dc.fov + (56 - dc.fov) * k
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov
      cam.updateProjectionMatrix()
    }
    return true
  }

  // --- Food effects ----------------------------------------------------------------------------------
  function applyEffect(id) {
    const cfg = EFFECTS[id] ?? EFFECTS.none
    hud.toast(cfg.toast)
    if (!(cfg.s > 0)) return
    st.effect = { id, t: cfg.s, cfg, fxT: 0 }
    player.boost.speed = cfg.speed ?? 1
    player.boost.jump = cfg.jump ?? 1
    const p = player.renderPosition
    if (id === 'spicy') {
      hud.big('🔥 SPICY! 🔥', 'red', 1.6)
      shake(0.12, 0.5)
    }
    if (id === 'golden') fx.confetti(p.x, p.y + 2.2, p.z, 30)
    if (id === 'turbo') hud.big('🚀 TURBO!', 'gold', 1.4)
    if (id === 'cold') shake(0.06, 1)
  }
  function endEffect() {
    st.effect = null
    player.boost.speed = 1
    player.boost.jump = 1
  }
  function stepEffect(dt) {
    const e = st.effect
    if (!e) return
    e.t -= dt
    if (e.t <= 0) return endEffect()
    e.fxT -= dt
    if (e.fxT > 0) return
    const p = player.renderPosition
    const f = player.facing
    const seat = seating.seat
    const hy = seat ? seat.y + 1.0 : p.y + 1.7
    const fwdX = Math.sin(f)
    const fwdZ = Math.cos(f)
    switch (e.id) {
      case 'spicy': {
        e.fxT = 0.05
        // fire from the mouth in short bursts
        if (Math.sin(e.t * 2.2) > 0.2) {
          const col = pick(['#ff4a1a', '#ff9d2e', '#ffd84a'])
          fx.trail(p.x + fwdX * 0.35, hy, p.z + fwdZ * 0.35, { glow: true, color: col, size: 0.12, size1: 0.35, alpha: 0.9, life: 0.45, vx: fwdX * 3.5 + rr(-0.4, 0.4), vy: rr(0.2, 0.8), vz: fwdZ * 3.5 + rr(-0.4, 0.4), drag: 2, grav: -1.5 })
          if (Math.random() < 0.04) sfx('fireBurp', { vol: 0.22 })
        }
        break
      }
      case 'sleepy':
        e.fxT = 0.5
        fx.trail(p.x + rr(-0.2, 0.2), hy + 0.4, p.z, { glow: true, color: '#9fb6ff', size: 0.14, size1: 0.3, alpha: 0.8, life: 1.6, vx: rr(0.1, 0.3), vy: 0.5, vz: 0, drag: 0.3, grav: 0 })
        if (Math.random() < 0.06) sfx('yawn', { vol: 0.2 })
        break
      case 'cold':
        e.fxT = 0.08
        fx.trail(p.x + rr(-0.4, 0.4), hy + rr(-0.6, 0.4), p.z + rr(-0.4, 0.4), { glow: true, color: pick(['#bfefff', '#ffffff', '#8fd8ff']), size: 0.08, size1: 0.02, alpha: 0.9, life: 0.8, vx: rr(-0.2, 0.2), vy: -0.2, vz: rr(-0.2, 0.2), grav: 0.5 })
        break
      case 'golden':
        e.fxT = 0.06
        fx.trail(p.x + rr(-0.35, 0.35), (seat ? seat.y : p.y) + rr(0.2, 1.8), p.z + rr(-0.35, 0.35), { glow: true, color: pick(['#ffd84a', '#fff1a8', '#ffb72e']), size: 0.1, size1: 0.02, alpha: 1, life: 0.9, vx: 0, vy: 0.35, vz: 0, grav: -0.2 })
        break
      case 'fresh':
        e.fxT = 0.1
        fx.trail(p.x + rr(-0.4, 0.4), (seat ? seat.y : p.y) + rr(0.3, 1.9), p.z + rr(-0.4, 0.4), { glow: true, color: pick(['#ffffff', '#bfefff', '#9ff7ff']), size: 0.08, size1: 0.02, alpha: 1, life: 0.8, vx: 0, vy: 0.25, vz: 0, grav: -0.1 })
        break
      case 'happy':
        e.fxT = 0.35
        fx.trail(p.x + rr(-0.4, 0.4), hy + 0.3, p.z + rr(-0.4, 0.4), { glow: true, color: pick(['#ff6a9a', '#ff9ac0', '#ff4a7a']), size: 0.16, size1: 0.08, alpha: 1, life: 1.4, vx: 0, vy: 0.6, vz: 0, grav: -0.1 })
        break
      case 'jump':
        e.fxT = 0.18
        fx.trail(p.x + rr(-0.3, 0.3), (seat ? seat.y : p.y) + rr(0.1, 0.5), p.z + rr(-0.3, 0.3), { glow: true, color: '#e8fbff', size: 0.07, size1: 0.12, alpha: 0.8, life: 1, vx: 0, vy: 0.8, vz: 0, grav: -0.4 })
        break
      case 'speed':
      case 'turbo': {
        e.fxT = e.id === 'turbo' ? 0.04 : 0.09
        const sp = Math.hypot(player.velocity.x, player.velocity.z)
        if (sp > 2 && !seat) fx.trail(p.x, p.y + 0.15, p.z, { glow: e.id === 'turbo', color: e.id === 'turbo' ? '#7ad8ff' : '#ffe14a', size: 0.18, size1: 0.05, alpha: 0.7, life: 0.4, vx: 0, vy: 0.2, vz: 0, grav: 0 })
        else e.fxT = 0.3
        break
      }
      case 'warm':
      case 'calm':
        e.fxT = 0.4
        fx.puff(p.x, hy + 0.2, p.z, { count: 1, size: 0.12, grow: 3, alpha: 0.18, life: 1.4, up: 0.4, speed: 0.05, spread: 0.2, color: e.id === 'warm' ? '#ffe6c8' : '#d8ffe0' })
        break
      default:
        e.fxT = 1
    }
  }

  // --- Lifecycle -------------------------------------------------------------------------------------
  function reset() {
    for (const seat of [...st.trays.keys()]) clearTray(seat, false)
    st.orders.length = 0
    timers.length = 0
    st.bite = null
    st.belted = false
    st.forced = false
    st.sign = false
    belt.g.visible = false
    st.phase = 'off'
    st.dine = 0
    st.banT = 0
    hud.root.classList.remove('has-seatbar')
    barShown = null
    barKey = ''
    bar.classList.remove('seated')
  }

  return {
    reset,
    pose,
    // Drives the camera during the dining close-up (true), else false (the chase cam).
    camera,
    st, // dev: __game.flight.inflight.st
    ARM, // dev: tune the eating arm
    // flight.js: take-off / cruise / landing / off.
    setPhase(p) {
      st.phase = p
      if (p !== 'cruise') hud.closeWinIf?.('w-menu')
    },
    // You were put in a seat. locked: the crew buckles you (take-off, landing, an escort).
    seated(locked) {
      st.seatRef = seating.seat
      if (locked) {
        st.belted = false
        buckle(true, { forced: true, quiet: st.phase !== 'cruise' })
      } else {
        st.belted = false
        st.forced = false
        belt.g.visible = false
      }
    },
    // The crew lets go of the belt (the ding): it stays buckled until you unbuckle it.
    release() {
      st.forced = false
      refreshBar()
    },
    buckle,
    eat: () => active() && eat(),
    // Order one dish by id for the seat you sit in (the seat screen's POPCORN): same checks as the menu.
    orderId(id) {
      const it = ITEMS[id]
      const seat = seating.seat
      if (!it || !seat || !active()) return false
      if (onTray(seat) >= MENU.maxTray) {
        sfx('error')
        hud.toast('Your tray is full! Eat something first.')
        return false
      }
      if (st.banT > 0) {
        sfx('error')
        hud.toast(`The crew won't serve you for another ${Math.ceil(st.banT)} s!`)
        return false
      }
      if (st.orders.some((o) => o.item === it && o.seat === seat)) {
        hud.toast(`Your ${it.name} is on its way!`)
        return false
      }
      if (freeFor(it, seat)) order(it, seat)
      else hud.confirm(it.name, it.price, () => order(it, seat), `${it.icon} ${it.desc} An attendant brings it to ${seat.code}.`)
      return true
    },
    // Another treat's effect (the Sky Bar, the spa): same toasts, boosts and particles as food.
    applyEffect,
    // A punishment: no menu orders for s seconds.
    ban(s) {
      st.banT = Math.max(st.banT, s)
    },
    get belted() {
      return st.belted
    },
    jolt,
    // Turbulence begins (flight.js): a new chance at the Model Passenger bonus.
    turbulence() {
      st.joltSafe = false
    },
    // The crew's meal service puts dishes straight on your tray (complimentary).
    serve(seat, ids) {
      ids.forEach((id, i) => addDish(seat, id, { quiet: i > 0 }))
      if (seating.seat === seat) {
        bEat.classList.remove('pop')
        void bEat.offsetWidth
        bEat.classList.add('pop')
      }
      refreshBar()
    },
    // Landing: trays stowed.
    stow() {
      for (const seat of [...st.trays.keys()]) clearTray(seat, true)
      st.orders.length = 0
      if (st.bite) endBite(true)
    },
    update(dt) {
      for (let i = timers.length - 1; i >= 0; i--) {
        const tm = timers[i]
        tm.t -= dt
        if (tm.t <= 0) {
          timers.splice(i, 1)
          tm.fn()
        }
      }
      stepEffect(dt)
      st.banT = Math.max(0, st.banT - dt)
      if (st.dine > 0) {
        st.dine = st.bite ? Math.max(st.dine, 0.5) : st.dine - dt
        if (!seating.seat || (!st.belted && Math.hypot(inputState.move.x, inputState.move.z) > 0.5)) st.dine = 0
      }
      const inCabin = st.phase !== 'off'
      if (inCabin) {
        // the belt follows the seat; standing up (or being moved) takes it off
        if (st.belted && seating.seat !== st.seatRef) {
          st.belted = false
          st.forced = false
          if (!seating.seat) lockSeat(false)
        }
        if (!seating.seat) belt.g.visible = false
        st.beltAnim += (st.beltTarget - st.beltAnim) * Math.min(1, dt * 14)
        if (belt.g.visible) {
          const a = st.beltAnim
          belt.halves[0].position.x = -(1 - a) * 0.22
          belt.halves[1].position.x = (1 - a) * 0.22
          belt.lever.rotation.x = st.belted ? 0 : -1.2
          belt.lever.visible = a > 0.6
          belt.g.scale.lerp(tmp2.set(1, 1, 1), Math.min(1, dt * 10))
          if (!st.belted && st.beltAnim < 0.03) belt.g.visible = false
        }
        // pushing to stand while buckled: the strap tugs you back
        st.tug = Math.max(0, st.tug - dt * 4)
        st.bonk = Math.max(0, st.bonk - dt * 2.5)
        st.tugT -= dt
        st.tugHintT -= dt
        if (seating.seat && st.belted && (Math.hypot(inputState.move.x, inputState.move.z) > 0.5 || inputState.jump)) {
          inputState.jump = false
          if (st.tugT <= 0) {
            st.tugT = 0.7
            tugFx()
            if (st.tugHintT <= 0 && st.phase === 'cruise') {
              st.tugHintT = 3
              hud.big(st.forced ? 'BELT LOCKED!' : 'UNBUCKLE FIRST!', 'gold', 1)
              if (!st.forced) hud.toast('Press B (or tap BELT) to unbuckle your seatbelt.')
            }
          }
        }
        // the sign: edges (take-off / turbulence / landing / escort)
        const sign = cabin.seatbelt
        if (sign !== st.sign) {
          st.sign = sign
          st.signT = 0
          if (sign && st.phase === 'cruise') {
            st.signPaid = st.belted // already buckled: nothing to earn
            if (seating.seat && !st.belted) {
              hud.big('BUCKLE UP!', 'gold', 1.4)
              hud.toast(`Seatbelt sign is on! Press B (or tap BELT) within ${BELT.graceS} s for a bonus.`)
            } else if (!seating.seat) hud.toast('Seatbelt sign is on! Get back to a seat and buckle up!')
          }
        }
        st.signT += dt
        stepBite(dt)
        // dishes: pop in when served, bounce on each bite, steam + bubbles
        for (const t of st.trays.values()) {
          for (const d of t.dishes) {
            d.t += dt
            const g = d.dish.g
            if (st.bite?.dish === d && d.drink) continue
            const grow = Math.min(1, d.t * 5)
            const pop = d.pop > 0 ? 1 + Math.sin(d.pop * Math.PI) * 0.12 : 1
            d.pop = Math.max(0, d.pop - dt * 4)
            const s = (grow < 1 ? ease(grow) * 1.1 - Math.max(0, grow - 0.85) * 0.66 : 1) * pop
            g.scale.set(s * SC, s * SC * (d.pop > 0 ? 1 - Math.sin(d.pop * Math.PI) * 0.18 : 1), s * SC)
            if (d.left > 0 && d.dish.steam && d.t < 70 && Math.random() < dt * 3) {
              const p = d.dish.steam
              fx.puff(g.position.x + p.x, g.position.y + p.y, g.position.z + p.z, { count: 1, size: 0.07, grow: 3, spread: 0.03, up: 0.3, speed: 0.04, life: 1.4, alpha: 0.2, color: '#ffffff', drag: 1 })
            }
            if (d.left > 0 && d.dish.fizz && Math.random() < dt * 5) {
              const p = d.dish.fizz
              fx.sparkle(g.position.x + p.x, g.position.y + p.y - 0.04, g.position.z + p.z, { count: 1, color: '#fff3c8', size: 0.04, speed: 0.04, up: 0.22, life: 0.6, grav: -0.5 })
            }
          }
        }
      } else if (st.belted) {
        st.belted = false
        belt.g.visible = false
      }
      refreshBar()
    },
  }
}
