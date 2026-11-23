// Breaking the rules on board, and paying for it (cabinCrew.js does the watching and the chasing).
//
// RULES: stay in your own cabin (or one behind it), keep out of the galleys, buckle up when the sign is on,
// never touch an emergency exit. violation() says what you're doing wrong right now; the crew fill the
// SUSPICION meter while one of them can see it (eye + bar at the top, "?" then "!" over their heads). Full
// meter = a CHASE: the crew run after you (faster than walking, slower than sprinting; sprinting drains
// your STAMINA, and when it's gone you're slow), a second attendant cuts you off after a few seconds, the
// chase music kicks in. Break their line of sight and HIDE: lock yourself in a lavatory (E / the HIDE
// button at its door) or get under a blanket in any seat (H). If they saw you hide, they knock / pull the
// blanket off. Lose them long enough and you ESCAPE (coins, once a flight).
//
// PUNISHMENTS climb with your record this flight (the wanted stars): 1 escorted back + belt locked,
// 2 a coin FINE, 3 DOWNGRADED to the last row (a snoring neighbour, a crying baby, no menu for a while),
// 4 CUFFED to your seat for the rest of the flight and DETAINED on arrival: a cell at the destination
// (wait it out or pay bail in coins). Pulling an exit handle sounds the alarm: everyone chases you, and
// being caught after that goes straight to level 4. All sounds are synthesised (registerSfx).
import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, SphereGeometry, TorusGeometry } from 'three'
import { FLIGHT } from './config.js'
import { player } from './player.js'
import { seating } from './seating.js'
import { inputState, onKey } from './input.js'
import { registerSfx, sfx } from './audio.js'
import { rbox } from './detail.js'
import './hud/rules.css'

const R = FLIGHT.rules
const rr = (a, b) => a + Math.random() * (b - a)
const pick = (a) => a[Math.floor(Math.random() * a.length)]

// --- Sounds -------------------------------------------------------------------------------------------
// Knuckles on a lavatory door.
registerSfx('knock', ({ now, out, tone, noise }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.5, o.pan)
  for (let i = 0; i < 3; i++) {
    tone(d, t + i * 0.16, 0.12, { f: 180, f2: 90, peak: 0.6, a: 0.002 })
    noise('pink', d, t + i * 0.16, 0.06, { type: 'bandpass', f: 700, q: 2, peak: 0.7, a: 0.002 })
  }
})
// Heartbeat (lub-dub) while you hide and the crew are near.
registerSfx('heartbeat', ({ now, out, tone }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.45, o.pan)
  tone(d, t, 0.14, { f: 70, f2: 45, peak: 0.9, a: 0.004 })
  tone(d, t + 0.18, 0.12, { f: 60, f2: 40, peak: 0.6, a: 0.004 })
})
// Out of breath.
registerSfx('pant', ({ now, out, noise }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.3, o.pan)
  noise('pink', d, t, 0.22, { type: 'bandpass', f: 1300, f2: 900, q: 1.2, peak: 0.6, a: 0.04 })
  noise('pink', d, t + 0.3, 0.18, { type: 'bandpass', f: 900, f2: 1400, q: 1.2, peak: 0.45, a: 0.04 })
})
// A deep rumbling snore with a whistle on the way out.
registerSfx('snore', ({ now, out, tone, noise }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.3, o.pan)
  tone(d, t, 1.0, { type: 'sawtooth', f: 70, f2: 95, peak: 0.12, a: 0.3, vib: 6, vibRate: 28, curve: 'hold' })
  noise('brown', d, t, 1.0, { type: 'lowpass', f: 380, peak: 0.6, a: 0.3 })
  tone(d, t + 1.15, 0.6, { f: 900, f2: 1500, peak: 0.05, a: 0.1 })
})
// A baby's cry: wailing, wobbling, out of breath.
registerSfx('babyCry', ({ now, out, tone }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.25, o.pan)
  for (let i = 0; i < 2; i++) {
    const at = t + i * 0.75
    tone(d, at, 0.6, { type: 'sawtooth', f: 520, f2: 430, peak: 0.08, a: 0.05, vib: 25, vibRate: 9, curve: 'hold' })
    tone(d, at, 0.6, { type: 'triangle', f: 1040, f2: 860, peak: 0.07, a: 0.05, vib: 40, vibRate: 9, curve: 'hold' })
  }
})
// "Gotcha!": a grab, a thud and a whistle blast.
registerSfx('gotcha', ({ now, out, tone, noise }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.5, o.pan)
  noise('pink', d, t, 0.1, { type: 'bandpass', f: 1200, q: 1, peak: 0.8, a: 0.002 })
  tone(d, t, 0.2, { f: 160, f2: 60, peak: 0.6, a: 0.003 })
  tone(d, t + 0.12, 0.35, { type: 'square', f: 2100, peak: 0.05, a: 0.01, vib: 60, vibRate: 30 })
})
// Coins drained away: a falling run of clinks.
registerSfx('fineLoss', ({ now, out, tone }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.35, o.pan)
  ;[2637, 2349, 2093, 1760, 1568, 1319].forEach((f, i) => tone(d, t + i * 0.07, 0.25, { f, peak: 0.12, a: 0.002 }))
  tone(d, t + 0.45, 0.5, { type: 'triangle', f: 220, f2: 110, peak: 0.2, a: 0.01 })
})
// Sad trombone: wah wah wah waaah.
registerSfx('wahwah', ({ now, out, tone }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.35, o.pan)
  ;[[311, 0, 0.35], [294, 0.4, 0.35], [277, 0.8, 0.35], [262, 1.2, 1.0]].forEach(([f, at, dur]) => {
    tone(d, t + at, dur, { type: 'sawtooth', f, f2: f * 0.97, peak: 0.12, a: 0.04, vib: at > 1 ? 8 : 0, vibRate: 6, curve: 'hold' })
  })
})
// "!": the crew spot you (a sharp stinger).
registerSfx('alertBang', ({ now, out, tone, noise }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.4, o.pan)
  tone(d, t, 0.35, { type: 'square', f: 1760, f2: 1900, peak: 0.12, a: 0.003 })
  tone(d, t, 0.35, { type: 'square', f: 2217, peak: 0.08, a: 0.003 })
  noise('white', d, t, 0.08, { type: 'highpass', f: 3000, peak: 0.4, a: 0.001 })
})
// "?": a curious little two-note ping.
registerSfx('huh', ({ now, out, tone }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.3, o.pan)
  tone(d, t, 0.15, { type: 'triangle', f: 660, peak: 0.25, a: 0.004 })
  tone(d, t + 0.13, 0.25, { type: 'triangle', f: 990, peak: 0.25, a: 0.004 })
})
// The exit-door alarm: a harsh two-tone klaxon.
registerSfx('klaxon', ({ now, out, tone }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.35, o.pan)
  for (let i = 0; i < 4; i++) tone(d, t + i * 0.34, 0.3, { type: 'square', f: i % 2 ? 520 : 690, peak: 0.12, a: 0.01, curve: 'hold' })
})
// Wind howling through a cracked door seal.
registerSfx('wind', ({ now, out, noise }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.3, o.pan)
  noise('pink', d, t, o.dur ?? 2.5, { type: 'bandpass', f: 400, f2: 1400, q: 3, peak: 0.7, a: 0.3 })
  noise('white', d, t, o.dur ?? 2.5, { type: 'highpass', f: 5000, peak: 0.15, a: 0.3 })
})
// Handcuffs snapping shut.
registerSfx('cuffs', ({ now, out, tone, noise }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.45, o.pan)
  for (let i = 0; i < 6; i++) noise('white', d, t + i * 0.025, 0.015, { type: 'highpass', f: 4000, peak: 0.5, a: 0.001 })
  tone(d, t + 0.18, 0.12, { f: 2400, peak: 0.15, a: 0.001 })
  noise('white', d, t + 0.18, 0.04, { type: 'bandpass', f: 3000, q: 3, peak: 0.8, a: 0.001 })
})
// A heavy cell door: metal clank with a ring.
registerSfx('cageClank', ({ now, out, tone, noise }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.5, o.pan)
  noise('white', d, t, 0.12, { type: 'bandpass', f: 1800, q: 1, peak: 0.9, a: 0.002 })
  tone(d, t, 0.15, { f: 110, f2: 60, peak: 0.6, a: 0.003 })
  tone(d, t, 1.4, { f: 587, peak: 0.08, a: 0.003 })
  tone(d, t, 1.1, { f: 1247, peak: 0.05, a: 0.003 })
})
// Escaped! A cheeky rising run.
registerSfx('escaped', ({ now, out, tone }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.35, o.pan)
  ;[523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(d, t + i * 0.08, 0.3, { type: 'triangle', f, peak: 0.2, a: 0.004 }))
})
// A blanket thrown over / pulled off.
registerSfx('rustle', ({ now, out, noise }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.35, o.pan)
  noise('pink', d, t, 0.35, { type: 'bandpass', f: 1600, f2: 700, q: 0.8, peak: 0.6, a: 0.04 })
})
// The lavatory lock sliding to OCCUPIED.
registerSfx('lavLock', ({ now, out, tone, noise }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.4, o.pan)
  noise('white', d, t, 0.06, { type: 'bandpass', f: 2600, q: 2, peak: 0.6, a: 0.002 })
  tone(d, t + 0.05, 0.06, { f: 1400, peak: 0.15, a: 0.001 })
})
// Chase music: kick, bass, hat (one step each, scheduled by update()).
registerSfx('cKick', ({ now, out, tone }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.3, o.pan)
  tone(d, t, 0.18, { f: 140, f2: 45, peak: 0.9, a: 0.002 })
})
registerSfx('cBass', ({ now, out, tone }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.18, o.pan)
  tone(d, t, 0.17, { type: 'sawtooth', f: o.f ?? 110, peak: 0.25, a: 0.005 })
  tone(d, t, 0.17, { type: 'square', f: (o.f ?? 110) / 2, peak: 0.12, a: 0.005 })
})
registerSfx('cHat', ({ now, out, noise }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.1, o.pan)
  noise('white', d, t, 0.04, { type: 'highpass', f: 7000, peak: 0.6, a: 0.001 })
})
const BASS = [110, 0, 110, 131, 0, 147, 131, 98]

// --- Props -------------------------------------------------------------------------------------------
const M = {
  blanket: new MeshStandardMaterial({ color: '#3a5bd0', roughness: 0.95 }),
  stripe: new MeshStandardMaterial({ color: '#e8b54a', roughness: 0.9 }),
  metal: new MeshStandardMaterial({ color: '#cfd6e0', roughness: 0.2, metalness: 0.9 }),
  bars: new MeshStandardMaterial({ color: '#5a6170', roughness: 0.35, metalness: 0.8 }),
  red: new MeshBasicMaterial({ color: '#ff2a3a' }),
  blue: new MeshBasicMaterial({ color: '#2a6aff' }),
  skin: new MeshStandardMaterial({ color: '#f2c9a0', roughness: 0.7 }),
  baby: new MeshStandardMaterial({ color: '#ffd6e8', roughness: 0.8 }),
  basket: new MeshStandardMaterial({ color: '#d9b27a', roughness: 0.9 }),
}
// A lumpy blanket over a sitting body.
function makeBlanket() {
  const g = new Group()
  const body = new Mesh(new SphereGeometry(0.5, 16, 12).scale(1.05, 1.1, 0.85), M.blanket)
  body.position.y = 0.55
  g.add(body)
  const legs = new Mesh(rbox(0.75, 0.32, 0.7, 0.14, 2), M.blanket)
  legs.position.set(0, 0.2, -0.35)
  g.add(legs)
  // two stripes hugging the blanket (radius of the squashed sphere at that height)
  for (const y of [0.55, 0.85]) {
    const k = Math.sqrt(Math.max(0, 1 - ((y - 0.55) / 0.55) ** 2)) * 0.5
    const s = new Mesh(new TorusGeometry(k, 0.022, 4, 28).rotateX(Math.PI / 2).scale(1.06, 1, 0.86), M.stripe)
    s.position.y = y
    g.add(s)
  }
  g.userData.body = body
  return g
}
// Handcuffs resting on your lap.
function makeCuffs() {
  const g = new Group()
  for (const s of [-1, 1]) {
    const r = new Mesh(new TorusGeometry(0.06, 0.014, 6, 16), M.metal)
    r.position.x = s * 0.09
    r.rotation.x = Math.PI / 2
    g.add(r)
  }
  const chain = new Mesh(new BoxGeometry(0.06, 0.012, 0.012), M.metal)
  g.add(chain)
  return g
}
// A baby in a carry-cot (sits on the seat next to you after a downgrade).
function makeBaby() {
  const g = new Group()
  const cot = new Mesh(rbox(0.42, 0.22, 0.6, 0.08, 2), M.basket)
  cot.position.y = 0.11
  g.add(cot)
  const head = new Mesh(new SphereGeometry(0.11, 12, 10), M.skin)
  head.position.set(0, 0.27, 0.12)
  g.add(head)
  const bonnet = new Mesh(new SphereGeometry(0.12, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.baby)
  bonnet.position.set(0, 0.28, 0.13)
  bonnet.rotation.x = -0.5
  g.add(bonnet)
  const mouth = new Mesh(new SphereGeometry(0.025, 8, 6), new MeshBasicMaterial({ color: '#7a1a2a' }))
  mouth.position.set(0, 0.24, 0.0)
  g.add(mouth)
  const quilt = new Mesh(rbox(0.38, 0.06, 0.4, 0.03, 1), M.baby)
  quilt.position.set(0, 0.23, -0.1)
  g.add(quilt)
  g.userData.head = head
  g.userData.mouth = mouth
  return g
}
// The holding cell at the arrival curb: bars on four sides, a roof, a police light bar.
function makeCell() {
  const g = new Group()
  const W = 2.6
  const H = 3
  const bar = new CylinderGeometry(0.045, 0.045, H, 8)
  for (let i = 0; i <= 10; i++) {
    const k = -W / 2 + (i * W) / 10
    for (const [x, z] of [[k, -W / 2], [k, W / 2], [-W / 2, k], [W / 2, k]]) {
      const b = new Mesh(bar, M.bars)
      b.position.set(x, H / 2, z)
      g.add(b)
    }
  }
  for (const y of [0.05, H / 2, H]) {
    for (const [w, d, x, z] of [[W + 0.1, 0.1, 0, -W / 2], [W + 0.1, 0.1, 0, W / 2], [0.1, W + 0.1, -W / 2, 0], [0.1, W + 0.1, W / 2, 0]]) {
      const f = new Mesh(new BoxGeometry(w, 0.1, d), M.bars)
      f.position.set(x, y, z)
      g.add(f)
    }
  }
  const roof = new Mesh(new BoxGeometry(W + 0.2, 0.08, W + 0.2), M.bars)
  roof.position.y = H + 0.06
  g.add(roof)
  const red = new Mesh(rbox(0.5, 0.18, 0.22, 0.06, 1), M.red)
  red.position.set(-0.3, H + 0.2, 0)
  const blue = new Mesh(rbox(0.5, 0.18, 0.22, 0.06, 1), M.blue)
  blue.position.set(0.3, H + 0.2, 0)
  g.add(red, blue)
  g.userData.red = red
  g.userData.blue = blue
  return g
}

// trip: { seat, cls, code, downgrade() -> seat | null }. inflight: { belted, ban(s), eat() }.
export function createRules({ scene, cabin, crowd, hud, store, fx, trip, inflight, sayMe = () => {}, shake = () => {} }) {
  const F = cabin.floorY
  const st = {
    phase: 'off',
    susp: 0,
    chasing: false,
    record: 0, // catches this flight (wanted stars)
    severe: false, // pulled an exit handle: being caught now = cuffed + detained
    detained: false,
    escapedPaid: false,
    hide: null, // { kind: 'lav' | 'blanket', lav, seat, at: { x, z }, t, spotted }
    lastSeen: -99, // game time a chaser last had eyes on you
    t: 0,
    stamina: 1,
    restT: 0,
    tired: false,
    pantT: 0,
    heartT: 0,
    beat: 0,
    beatT: 0,
    alarmT: 0,
    lavBusy: [false, false, false, false],
    cuffed: false,
    seatPals: [], // a downgrade's neighbours: { kind: 'snore' | 'baby', npc | g, t }
    jail: null,
    banT: 0,
  }
  const timers = []
  const later = (t, fn) => timers.push({ t, fn })
  const blanket = makeBlanket()
  blanket.visible = false
  scene.add(blanket)
  const cuffs = makeCuffs()
  cuffs.visible = false
  scene.add(cuffs)

  // --- HUD: the wanted widget (top), the chase / hide vignettes, the context buttons ---------------
  const wanted = document.createElement('div')
  wanted.className = 'wanted'
  wanted.innerHTML = `<div class="w-row"><span class="w-eye">👁️</span><div class="w-bar"><i></i></div><span class="w-stars"></span></div><div class="w-state"></div><div class="w-stam"><span>⚡</span><div class="w-sbar"><i></i></div></div>`
  hud.root.appendChild(wanted)
  const wBar = wanted.querySelector('.w-bar i')
  const wStars = wanted.querySelector('.w-stars')
  const wState = wanted.querySelector('.w-state')
  const wStam = wanted.querySelector('.w-stam')
  const wSBar = wanted.querySelector('.w-sbar i')
  const vig = document.createElement('div')
  vig.className = 'rules-vig'
  vig.innerHTML = '<div class="rv-text"></div>'
  hud.root.appendChild(vig)
  const vigText = vig.querySelector('.rv-text')
  const ctx = document.createElement('div')
  ctx.className = 'rulebar'
  hud.actSlot.prepend(ctx)
  const ctxBtns = []
  for (let i = 0; i < 5; i++) {
    const b = document.createElement('button')
    b.className = 'rb-btn'
    b.innerHTML = '<span class="rb-ico"></span><span class="rb-l"></span><span class="rb-k"></span>'
    b.addEventListener('pointerdown', (e) => e.stopPropagation())
    b.addEventListener('click', (e) => {
      e.stopPropagation()
      b._fn?.()
    })
    ctx.appendChild(b)
    ctxBtns.push(b)
  }
  let ctxKey = ''
  function setCtx(list) {
    const key = list.map((a) => a.label).join('|')
    if (key === ctxKey) return
    ctxKey = key
    ctxBtns.forEach((b, i) => {
      const a = list[i]
      b.classList.toggle('show', !!a)
      if (!a) return
      b.className = `rb-btn show ${a.cls ?? ''}`
      b.querySelector('.rb-ico').textContent = a.icon
      b.querySelector('.rb-l').textContent = a.label
      b.querySelector('.rb-k').textContent = a.key ?? ''
      b._fn = a.fn
    })
    hud.root.classList.toggle('has-rulebar', list.length > 0)
  }
  let wantedKey = ''
  function drawWanted() {
    const show = st.phase === 'cruise' && (Math.max(st.susp, st.extraSusp ?? 0) > 0.01 || st.record > 0 || st.stamina < 0.999 || st.chasing || !!st.hide)
    const sm = Math.max(st.susp, st.extraSusp ?? 0)
    const state = st.chasing ? (st.hide ? 'HIDING...' : 'RUN!') : st.hide ? 'HIDDEN' : sm > 0.6 ? 'THEY SAW THAT!' : sm > 0.01 ? 'SUSPICIOUS...' : ''
    const stars = st.record
    const key = `${show}|${state}|${stars}|${st.chasing}|${st.stamina < 0.999}|${st.tired}`
    const susp = Math.max(st.susp, st.extraSusp ?? 0)
    wBar.style.transform = `scaleX(${st.chasing ? 1 : susp})`
    wSBar.style.transform = `scaleX(${st.stamina})`
    if (key === wantedKey) return
    wantedKey = key
    wanted.classList.toggle('show', show)
    wanted.classList.toggle('chase', st.chasing)
    wanted.classList.toggle('hot', sm > 0.6)
    wStars.innerHTML = [0, 1, 2, 3].map((i) => `<b class="${i < stars ? 'on' : ''}">★</b>`).join('')
    wState.textContent = state
    wStam.classList.toggle('show', st.stamina < 0.999 || st.chasing)
    wStam.classList.toggle('tired', st.tired)
  }
  let vigKey = ''
  function drawVig() {
    const kind = st.phase !== 'cruise' ? '' : st.hide ? 'hide' : st.chasing ? 'chase' : st.alarmT > 0 ? 'alarm' : ''
    const text = st.hide ? (st.hide.kind === 'lav' ? '🚽 Locked in the lavatory... they can\'t see you' : '🛏️ Under the blanket... shh!') : ''
    const key = kind + text
    if (key === vigKey) return
    vigKey = key
    vig.className = `rules-vig ${kind}`
    vigText.textContent = text
  }

  // --- What you're doing wrong ------------------------------------------------------------------------
  function violation() {
    if (st.phase !== 'cruise' || st.hide) return null
    if (st.private && seating.seat) return null // behind closed suite doors
    if (api.onDuty?.()) return null // crewShift.js: on a flight-attendant shift you're crew
    const hooked = api.ruleHook?.()
    if (hooked !== undefined) return hooked // luxury.js: upstairs / in the cockpit, the main-deck crew can't see you
    const v = baseViolation()
    // in a pilot's uniform the crew barely look twice
    if (v && api.disguised?.()) return { ...v, weight: v.weight * R.disguiseK, label: 'Hmm... new crew member?' }
    return v
  }
  function baseViolation() {
    const p = player.position
    const zone = cabin.classAt(p.z)
    if (zone < trip.cls) return { kind: 'trespass', weight: 1, label: `${FLIGHT.classes[zone].name} is for ticket holders!` }
    for (const g of cabin.galleyZones) if (p.x > g.x0 && p.x < g.x1 && p.z > g.z0 && p.z < g.z1 && !seating.seat) return { kind: 'galley', weight: 0.8, label: `Crew only in ${g.name}!` }
    if (cabin.seatbelt && st.signT > R.beltGrace && (!seating.seat || !inflight.belted)) return { kind: 'belt', weight: 0.5, label: 'The seatbelt sign is on!' }
    return null
  }

  // --- Stamina (sprinting on board drains it) ---------------------------------------------------------
  function stepStamina(dt) {
    const moving = Math.hypot(inputState.move.x, inputState.move.z) > 0.3
    const sprinting = inputState.sprint && moving && !seating.seat && !st.tired && !st.hide
    if (sprinting) {
      st.stamina = Math.max(0, st.stamina - dt / R.stamina)
      st.restT = R.restDelay
      if (st.stamina <= 0) {
        st.tired = true
        hud.big('OUT OF BREATH!', 'red', 1)
        sfx('pant', { vol: 0.4 })
      }
    } else {
      st.restT -= dt
      if (st.restT <= 0) st.stamina = Math.min(1, st.stamina + dt * R.regen)
      if (st.tired && st.stamina >= R.recover) st.tired = false
    }
    player.tired = st.tired
    if (st.tired) {
      st.pantT -= dt
      if (st.pantT <= 0) {
        st.pantT = 0.9
        sfx('pant', { vol: 0.3 })
        const p = player.renderPosition
        fx.puff(p.x, p.y + 1.7, p.z, { count: 2, size: 0.15, grow: 2, alpha: 0.35, life: 0.6, up: 0.3, speed: 0.2, color: '#ffffff' })
      }
    }
  }

  // --- Hiding ---------------------------------------------------------------------------------------------
  const nearLav = () => {
    const p = player.position
    return cabin.lavs.find((l) => Math.hypot(p.x - l.stand.x, p.z - l.stand.z) < R.reach)
  }
  const nearExit = () => {
    const p = player.position
    return cabin.exits.find((e) => Math.abs(p.z - e.z) < 1.0 && Math.abs(p.x - e.x) < 1.6)
  }
  function hideInLav(l) {
    if (st.lavBusy[l.i]) {
      sfx('knock', { vol: 0.4 })
      hud.toast('Occupied! Someone is in there. Try another lavatory.')
      return
    }
    st.hide = { kind: 'lav', lav: l, at: { x: l.stand.x, z: l.stand.z }, t: 0, spotted: st.t - st.lastSeen < R.spotWindow }
    player.auto = null
    player.velocity.x = player.velocity.z = 0
    player.frozen = true
    cabin.setLav(l.i, true)
    sfx('lavLock', { vol: 0.5 })
    later(0.15, () => sfx('curtain', { vol: 0.2 }))
    fx.puff(l.stand.x, F + 1, l.stand.z, { count: 8, size: 0.3, alpha: 0.3, life: 0.5, color: '#ffffff' })
    hud.big('🚽 LOCKED IN!', 'gold', 1.2)
  }
  function hideUnderBlanket() {
    const s = seating.seat
    if (!s) return
    st.hide = { kind: 'blanket', seat: s, at: { x: s.x, z: s.z }, t: 0, spotted: st.t - st.lastSeen < R.spotWindow }
    blanket.position.set(s.x, s.y - 0.05, s.z + 0.05)
    blanket.scale.setScalar(0.01)
    blanket.visible = true
    sfx('rustle', { vol: 0.5 })
    fx.puff(s.x, s.y + 0.6, s.z, { count: 6, size: 0.25, alpha: 0.25, life: 0.5, color: '#9fb6ff' })
  }
  // Out of hiding (you leaving, or the crew pulling you out).
  function unhide(forced = false) {
    const h = st.hide
    if (!h) return
    st.hide = null
    if (h.kind === 'lav') {
      player.frozen = false
      cabin.setLav(h.lav.i, false)
      sfx(forced ? 'cageClank' : 'lavLock', { vol: 0.45 })
      if (!forced && Math.random() < 0.5) later(0.1, () => sfx('flush', { vol: 0.3 }))
    } else {
      blanket.visible = false
      sfx('rustle', { vol: 0.5 })
      const s = h.seat
      fx.puff(s.x, s.y + 0.8, s.z, { count: 8, size: 0.3, alpha: 0.3, life: 0.5, color: '#9fb6ff' })
    }
  }
  function flush() {
    const l = st.hide?.lav
    if (!l) return
    sfx('flush', { vol: 0.55 })
    for (let i = 0; i < 14; i++) fx.trail(l.x, F + 0.6, l.z, { glow: true, color: '#bfe8ff', size: 0.08, size1: 0.02, alpha: 0.9, life: 0.9, vx: rr(-0.6, 0.6), vy: rr(0.8, 2), vz: rr(-0.6, 0.6), grav: 3 })
    if (Math.random() < 0.3) sayMe('*flush*', 1.2)
  }

  // --- The exit door ----------------------------------------------------------------------------------
  function pullExit(e) {
    st.severe = true
    st.alarmT = R.alarmTime
    cabin.setMood('alarm')
    sfx('klaxon', { vol: 0.45 })
    later(1.4, () => sfx('klaxon', { vol: 0.4 }))
    later(2.8, () => sfx('klaxon', { vol: 0.35 }))
    sfx('wind', { vol: 0.35, dur: 3 })
    shake(0.25, 1.2)
    hud.big('🚨 ALARM! 🚨', 'red', 2)
    hud.toast('Captain: "WHO TOUCHED THE EXIT DOOR?! Crew, stop that passenger!"')
    sayMe(pick(['Oops...', 'I just wanted some air!', 'Uh oh.']), 2)
    // papers and napkins sucked toward the door, a wisp of cold air
    for (let i = 0; i < 40; i++) {
      later(i * 0.05, () => {
        const p = player.position
        fx.trail(p.x + rr(-3, 3), F + rr(0.4, 2.4), e.z + rr(-3, 3), { color: pick(['#ffffff', '#f4ecd8', '#dfe8ff']), size: 0.08, size1: 0.06, alpha: 0.95, life: 1.2, vx: (e.x - p.x) * 1.2, vy: rr(-0.2, 0.4), vz: (e.z - p.z) * 0.8 + rr(-0.5, 0.5), drag: 0.2, grav: 0.3 })
      })
    }
    for (let i = 0; i < 20; i++) fx.trail(e.x, F + rr(0.5, 2), e.z + rr(-0.5, 0.5), { glow: true, color: '#e8f6ff', size: 0.15, size1: 0.5, alpha: 0.4, life: 1.4, vx: -e.side * rr(1, 3), vy: rr(-0.2, 0.3), vz: rr(-0.4, 0.4), drag: 1, grav: 0 })
    api.onAlarm?.()
  }

  // --- Punishments -------------------------------------------------------------------------------------
  // reason: what you were caught for. Returns { belted (s, Infinity = until landing), title }.
  function punish(reason) {
    if (st.hide) unhide(true)
    st.private = false
    api.onPunished?.()
    st.record = Math.min(4, st.record + 1)
    if (st.severe || reason === 'door') st.record = 4
    st.chasing = false
    st.susp = 0
    const lvl = st.record
    const P = R.punish
    sfx('gotcha', { vol: 0.5 })
    shake(0.2, 0.4)
    if (lvl === 1) {
      later(0.6, () => hud.big('⭐ WARNING!', 'gold', 1.8))
      later(0.7, () => hud.toast('First warning! Next time it costs you coins.'))
      return { belted: P.belted[0], title: 'BACK TO YOUR SEAT!' }
    }
    if (lvl === 2) {
      const fine = Math.min(store.coins, P.fine)
      later(0.6, () => {
        if (fine > 0) store.spend(fine)
        sfx('fineLoss', { vol: 0.45 })
        hud.big(`💸 FINED ${fine} COINS!`, 'red', 2)
        hud.toast('Fined for breaking the rules. One more and you\'re in the last row!')
        const p = player.renderPosition
        for (let i = 0; i < 16; i++) fx.trail(p.x, p.y + 1.4, p.z, { glow: true, color: '#ffd84a', size: 0.16, size1: 0.05, alpha: 1, life: 0.9, vx: rr(-2, 2), vy: rr(1, 3), vz: rr(-2, 2), grav: 6 })
      })
      return { belted: P.belted[1], title: 'FINED!' }
    }
    if (lvl === 3) {
      const s = trip.downgrade()
      inflight.ban(P.menuBan)
      later(0.6, () => {
        sfx('wahwah', { vol: 0.45 })
        hud.big(`⬇️ DOWNGRADED TO ${trip.code}!`, 'red', 2.4)
        hud.toast(`Last row, next to a snorer and a crying baby. No menu for ${P.menuBan} s.`)
        if (s) seatPals(s)
      })
      return { belted: P.belted[2], title: 'DOWNGRADED!' }
    }
    // level 4: cuffed to your seat, detained on arrival
    st.cuffed = true
    st.detained = true
    inflight.ban(9999)
    later(0.6, () => {
      sfx('cuffs', { vol: 0.55 })
      hud.big('🚔 CUFFED!', 'red', 2.4)
      hud.toast('Airport police will be waiting for you when we land!')
    })
    return { belted: Infinity, title: st.severe ? 'RESTRAINED!' : 'CUFFED!' }
  }
  // A downgrade's neighbours: a snorer on one side, a crying baby on the other.
  function seatPals(s) {
    clearPals()
    const row = cabin.seats.filter((q) => q.row === s.row && q !== s && !q.npc)
    row.sort((a, b) => Math.abs(a.x - s.x) - Math.abs(b.x - s.x))
    const [a, b] = row
    if (a) {
      const n = crowd.add({ x: a.x, z: a.z, y: a.y - 0.555, yaw: Math.PI, bag: null, pack: false })
      if (n) {
        n.mode = 'sit'
        a.npc = n
        st.seatPals.push({ kind: 'snore', npc: n, seat: a, t: rr(0.5, 2) })
      }
    }
    if (b) {
      const g = makeBaby()
      g.position.set(b.x, b.y + 0.02, b.z)
      scene.add(g)
      b.npc = { baby: true }
      st.seatPals.push({ kind: 'baby', g, seat: b, t: rr(1, 3) })
    }
  }
  function clearPals() {
    for (const p of st.seatPals) {
      if (p.npc) crowd.remove(p.npc)
      if (p.g) scene.remove(p.g)
      if (p.seat) p.seat.npc = null
    }
    st.seatPals.length = 0
  }
  function stepPals(dt) {
    for (const p of st.seatPals) {
      p.t -= dt
      const s = p.seat
      if (p.kind === 'snore') {
        if (p.t <= 0) {
          p.t = rr(3, 4.5)
          sfx('snore', { vol: 0.28 })
          for (let i = 0; i < 3; i++) later(i * 0.4, () => fx.trail(s.x + 0.1, s.y + 1.4, s.z, { glow: true, color: '#9fb6ff', size: 0.1, size1: 0.25, alpha: 0.9, life: 1.6, vx: 0.2, vy: 0.45, vz: 0, grav: 0 }))
        }
      } else if (p.t <= 0) {
        p.t = rr(4, 7)
        sfx('babyCry', { vol: 0.3 })
        const m = p.g.userData.mouth
        m.scale.setScalar(1.8)
        later(1.5, () => m.scale.setScalar(1))
        for (let i = 0; i < 6; i++) fx.trail(s.x + rr(-0.08, 0.08), s.y + 0.32, s.z + 0.05, { glow: true, color: '#7ad8ff', size: 0.05, size1: 0.03, alpha: 1, life: 0.6, vx: rr(-0.5, 0.5), vy: rr(0.6, 1.2), vz: rr(-0.3, 0.3), grav: 5 })
      }
      if (p.kind === 'baby') p.g.userData.head.position.y = 0.27 + Math.abs(Math.sin(st.t * 9)) * (p.t > 2.5 ? 0.015 : 0)
    }
  }

  // --- The holding cell on arrival ---------------------------------------------------------------------
  function jail(spawn, onRelease) {
    const g = makeCell()
    g.position.set(spawn.x, spawn.y, spawn.z)
    scene.add(g)
    const cop = crowd.add({ x: spawn.x + 2.2, z: spawn.z + 1.2, y: spawn.y, yaw: -Math.PI / 2, bag: null, pack: false, shirt: '#1d2b52', arms: '#1d2b52', pants: '#111a33', hat: true, hatColor: '#111a33', name: 'airport police' })
    if (cop) cop.mode = 'point'
    player.frozen = true
    st.jail = { g, cop, t: R.jailTime, onRelease, flash: 0, lift: 0 }
    sfx('cageClank', { vol: 0.6 })
    sfx('siren', { vol: 0.35 })
    shake(0.2, 0.5)
    hud.big('🚔 DETAINED!', 'red', 2.4)
    if (cop) crowd.say(cop, pick(['You\'re coming with us!', 'Pulling exit handles, eh?', 'Sit tight. We need a word.']), 3)
    hud.action({ label: `Holding cell · ${clockOf(st.jail.t)}`, text: 'Pay Bail', color: 'blue', price: R.bail, onTap: () => hud.confirm('Pay Bail', R.bail, () => release(true), 'Pay the fine and walk free right now.') })
    st.detained = false
  }
  const clockOf = (s) => `${Math.floor(s / 60)}:${String(Math.ceil(s % 60) % 60).padStart(2, '0')}`
  function release(paid) {
    const j = st.jail
    if (!j || j.lift) return
    j.lift = 0.001
    player.frozen = false
    sfx('cageClank', { vol: 0.5 })
    later(0.3, () => sfx(paid ? 'coin' : 'escaped', { vol: 0.4 }))
    hud.big(paid ? 'BAIL PAID!' : 'RELEASED!', 'green', 2)
    hud.toast('Behave on your next flight!')
    const p = player.position
    fx.confetti(p.x, p.y + 2.5, p.z, 30)
    if (j.cop) crowd.say(j.cop, 'Off you go. Behave!', 2.5)
    j.onRelease?.()
  }
  function stepJail(dt) {
    const j = st.jail
    if (!j) return
    j.flash += dt
    const on = Math.floor(j.flash * 4) % 2 === 0
    j.g.userData.red.visible = on
    j.g.userData.blue.visible = !on
    if (j.lift) {
      j.lift += dt
      j.g.position.y += dt * 4
      if (j.lift > 1.5) {
        scene.remove(j.g)
        if (j.cop) crowd.remove(j.cop)
        st.jail = null
      }
      return
    }
    j.t -= dt
    hud.actionLabel(`Holding cell · ${clockOf(Math.max(0, j.t))}`)
    if (Math.random() < dt * 0.6) sfx('siren', { vol: 0.12 })
    if (j.t <= 0) release(false)
  }

  // --- Context actions (E / the buttons over the seat bar) --------------------------------------------
  function actions() {
    const list = []
    if (st.phase !== 'cruise') return list
    for (const fn of extra) list.push(...fn())
    // pri: the mask drill beats the movie controls beat the neighbours beat the rest (stable otherwise)
    list.sort((a, b) => (b.pri ?? 0) - (a.pri ?? 0))
    if (list.some((a) => a.only)) return list.slice(0, 5)
    if (player.position.y > cabin.floorY + 10 || player.position.z < cabin.zFront) return list.slice(0, 5) // upstairs / cockpit: no lavs or exits here
    if (st.hide?.kind === 'lav') {
      list.push({ icon: '🚪', label: 'LEAVE', key: 'E', fn: () => unhide(), cls: 'green' })
      list.push({ icon: '🚽', label: 'FLUSH', fn: flush, cls: 'blue' })
      return list
    }
    if (st.hide?.kind === 'blanket') {
      list.push({ icon: '🛏️', label: 'COME OUT', key: 'H', fn: () => unhide(), cls: 'green' })
      return list
    }
    if (seating.seat) {
      list.push({ icon: '🙈', label: 'HIDE', key: 'H', fn: hideUnderBlanket, cls: 'blue' })
      return list.slice(0, 5)
    }
    const l = nearLav()
    if (l) list.push({ icon: '🚽', label: st.lavBusy[l.i] ? 'OCCUPIED' : 'HIDE', key: 'E', fn: () => hideInLav(l), cls: st.lavBusy[l.i] ? 'grey' : 'blue' })
    const e = nearExit()
    if (e) list.push({ icon: '🚨', label: 'PULL HANDLE', key: 'E', fn: () => pullExit(e), cls: 'red' })
    return list.slice(0, 5)
  }
  const extra = []
  let acts = []
  onKey('KeyE', () => {
    if (api.claimE?.()) return // events.js: PUT ON MASK during the drill
    const ea = acts.find((a) => a.key === 'E') // (neighbour buttons are on G)
    if (st.phase === 'cruise' && !seating.seat && ea) return ea.fn()
    if (st.hide?.kind === 'lav') return unhide()
    inflight.eat()
  })
  onKey('KeyH', () => {
    if (st.phase !== 'cruise') return
    if (st.hide?.kind === 'blanket') unhide()
    else if (seating.seat && !st.hide) hideUnderBlanket()
  })

  const api = {
    st,
    violation,
    punish,
    unhide,
    jail,
    onAlarm: null, // cabinCrew: everyone after you
    onPunished: null, // luxury.js: the disguise is confiscated, the bed / massage stop
    ruleHook: null, // luxury.js: () => violation | null | undefined (undefined = the usual rules)
    disguised: null, // luxury.js: () => wearing the pilot uniform
    // More context buttons (luxury.js): fn() -> [{ icon, label, key, fn, cls, only }] (only: no others).
    addActions(fn) {
      extra.push(fn)
    },
    // Another watcher's meter (the pilots, the lounge bartender) shown on the same eye.
    setExtraSusp(v) {
      st.extraSusp = v
    },
    // Closed First Class suite doors: nobody can see you sitting there.
    setPrivate(on) {
      st.private = on
    },
    // Broke into the cockpit and the pilots saw: the alarm, everyone chases, a catch = level 4.
    breach(text) {
      st.severe = true
      st.alarmT = R.alarmTime
      cabin.setMood('alarm')
      sfx('klaxon', { vol: 0.45 })
      later(1.4, () => sfx('klaxon', { vol: 0.4 }))
      shake(0.2, 0.8)
      hud.big('🚨 SECURITY BREACH! 🚨', 'red', 2.2)
      hud.toast(text)
      api.onAlarm?.()
    },
    get hidden() {
      return !!st.hide
    },
    get hide() {
      return st.hide
    },
    get detained() {
      return st.detained
    },
    get severe() {
      return st.severe
    },
    get cuffed() {
      return st.cuffed
    },
    get chasing() {
      return st.chasing
    },
    // The crew report each frame: the meter (0..1), whether they're chasing, whether one sees you.
    report(susp, chasing, seen) {
      st.susp = susp
      if (seen) st.lastSeen = st.t
      if (chasing && !st.chasing) {
        st.beat = 0
        st.beatT = 0
      }
      st.chasing = chasing
    },
    // The chase is over: you got away.
    escaped() {
      st.chasing = false
      sfx('escaped', { vol: 0.45 })
      hud.big('😎 ESCAPED!', 'green', 2)
      if (!st.escapedPaid) {
        st.escapedPaid = true
        const p = player.renderPosition
        store.addCoins(R.escapeCoins, { x: p.x, y: p.y + 1.6, z: p.z })
        hud.toast(`They lost you! +${R.escapeCoins} coins for the great escape.`)
      } else hud.toast('They lost you again...')
    },
    lavBusy: (i) => st.lavBusy[i] || st.hide?.lav?.i === i,
    // The crew's random lavatory traffic (never the one you're locked in).
    setLavBusy(i, busy) {
      if (st.hide?.lav?.i === i) return
      st.lavBusy[i] = busy
      cabin.setLav(i, busy)
    },
    hidesPlayer: () => st.hide?.kind === 'lav' || st.hide?.kind === 'blanket',
    setPhase(p) {
      st.phase = p
      if (p !== 'cruise') {
        if (st.hide) unhide()
        st.chasing = false
        st.susp = 0
        setCtx([])
      }
    },
    // New flight: a clean record (the arrival cell, if any, has already been served).
    reset() {
      if (st.hide) unhide()
      clearPals()
      Object.assign(st, { private: false, phase: 'off', susp: 0, chasing: false, record: 0, severe: false, escapedPaid: false, hide: null, stamina: 1, tired: false, alarmT: 0, cuffed: false, signT: 0 })
      player.tired = false
      cuffs.visible = false
      blanket.visible = false
      timers.length = 0
      setCtx([])
    },
    // Landed: neighbours + cuffs go (the record decides the cell).
    landed() {
      if (st.hide) unhide()
      clearPals()
      cuffs.visible = false
      st.chasing = false
      st.susp = 0
      player.tired = false
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
      stepJail(dt)
      if (st.phase === 'off') {
        player.tired = false
        drawWanted()
        drawVig()
        return
      }
      st.signT = cabin.seatbelt ? (st.signT ?? 0) + dt : 0
      if (st.phase === 'cruise') stepStamina(dt)
      stepPals(dt)
      // the alarm winds down
      if (st.alarmT > 0) {
        st.alarmT -= dt
        if (st.alarmT <= 0) cabin.setMood('night')
      }
      // hiding: the blanket breathes, the lavatory sign stays red, moving out of a blanket ends it
      const h = st.hide
      if (h) {
        h.t += dt
        if (h.kind === 'blanket') {
          const k = Math.min(1, h.t * 6)
          blanket.scale.set(k, k * (1 + Math.sin(st.t * 2.2) * 0.03), k)
          if (!seating.seat || seating.seat !== h.seat) unhide()
        }
        // heartbeat when the crew are hunting nearby
        if (st.chasing) {
          st.heartT -= dt
          if (st.heartT <= 0) {
            st.heartT = 0.75
            sfx('heartbeat', { vol: 0.5 })
          }
        }
      }
      // cuffs on your lap while you're restrained
      if (st.cuffed && seating.seat) {
        const s = seating.seat
        cuffs.visible = true
        cuffs.position.set(s.x, s.y + 0.32, s.z - 0.3)
      } else cuffs.visible = false
      // chase music: kick / bass / hat on an eighth-note grid
      if (st.chasing && st.phase === 'cruise') {
        st.beatT -= dt
        if (st.beatT <= 0) {
          st.beatT += 0.19
          const i = st.beat++ % 8
          if (i % 4 === 0) sfx('cKick', { vol: 0.3 })
          if (BASS[i]) sfx('cBass', { vol: 0.16, f: BASS[i] })
          sfx('cHat', { vol: i % 2 ? 0.06 : 0.1 })
        }
      }
      acts = actions()
      setCtx(acts)
      drawWanted()
      drawVig()
    },
  }
  return api
}
