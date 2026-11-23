// Phase 4: your NEIGHBOURS on board (tunables FLIGHT.fun.neighbours). Spawned around your seat at boarding
// (there are no bot passengers, so these few are the ones who make the cabin feel lived in):
//
// - a KID in the seat behind you who has kicking fits: thump, your seat jolts, "Hehe!". TURN AROUND (you
//   twist round and ask nicely: works more often than not, better the second time; or they kick harder)
//   or buy them a TOY PLANE (coins): it flies over in an arc, they zoom it about and never kick again.
// - a CHATTY passenger beside you who tells you aviation facts (babble, gestures, head turned to you).
//   CHAT back a few times = best seat buddies (coins + a cookie on your tray), or put HEADPHONES on: they
//   sulk and everything around you goes quieter.
// - a BABY across the aisle (in a carry-cot, a tired parent beside it) with crying fits: PEEKABOO (hands
//   over your face, "BOO!": a giggle, or another wail) or a LULLABY (humming, floating notes, a yawn, Zzz).
//   Calming it once a flight pays coins: BABY WHISPERER.
// - a SNORER a row ahead: NUDGE them (a snort, "I wasn't asleep!"), quiet for a while.
// The buttons go into the rule bar (rules.addActions), the first one on G. Every sound is synthesised.
import { CylinderGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, SphereGeometry, TorusGeometry, Vector3 } from 'three'
import { FLIGHT } from './config.js'
import { player } from './player.js'
import { seating, SIT } from './seating.js'
import { onKey } from './input.js'
import { registerSfx, sfx } from './audio.js'
import { rbox } from './detail.js'

const N = FLIGHT.fun.neighbours
const L = N.lines
const rr = (a, b) => a + Math.random() * (b - a)
const pick = (a) => a[Math.floor(Math.random() * a.length)]
const deg = (d) => (d * Math.PI) / 180
const ease = (t) => t * t * (3 - 2 * t)

// --- Sounds -------------------------------------------------------------------------------------------
// A kick into the back of your seat: a padded thump + a plastic creak.
registerSfx('seatKick', ({ now, out, tone, noise }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.4, o.pan)
  tone(d, t, 0.16, { f: 110, f2: 55, peak: 0.8, a: 0.002 })
  noise('brown', d, t, 0.12, { type: 'lowpass', f: 500, peak: 0.7, a: 0.002 })
  noise('pink', d, t + 0.03, 0.09, { type: 'bandpass', f: 2400, f2: 1600, q: 6, peak: 0.25, a: 0.003 })
})
// A kid's cheeky giggle: quick bouncing high notes.
registerSfx('kidLaugh', ({ now, out, tone }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.25, o.pan)
  ;[880, 1046, 880, 1175, 988].forEach((f, i) => tone(d, t + i * 0.09, 0.08, { type: 'triangle', f, f2: f * 0.85, peak: 0.3, a: 0.004 }))
})
// "Vrrrooom!": a kid's mouth-engine plane noise.
registerSfx('kidZoom', ({ now, out, tone, noise }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.22, o.pan)
  tone(d, t, 0.9, { type: 'sawtooth', f: 220, f2: 520, peak: 0.07, a: 0.05, vib: 30, vibRate: 22, curve: 'hold' })
  noise('pink', d, t, 0.9, { type: 'bandpass', f: 800, f2: 2200, q: 2, peak: 0.25, a: 0.05 })
})
// A baby's giggle: a bright rising chirp, twice.
registerSfx('babyGiggle', ({ now, out, tone }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.3, o.pan)
  for (let i = 0; i < 4; i++) tone(d, t + i * 0.12, 0.1, { type: 'sine', f: 900 + i * 120, f2: 1300 + i * 120, peak: 0.3, a: 0.005, vib: 40, vibRate: 30 })
})
// One hummed lullaby note (soft, round, a little vibrato).
registerSfx('hum', ({ now, out, tone }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.25, o.pan)
  tone(d, t, o.dur ?? 0.55, { type: 'sine', f: o.f ?? 392, peak: 0.35, a: 0.06, vib: 4, vibRate: 5, curve: 'hold' })
  tone(d, t, o.dur ?? 0.55, { type: 'triangle', f: (o.f ?? 392) * 2, peak: 0.05, a: 0.08, curve: 'hold' })
})
// A poke + a big snort.
registerSfx('snort', ({ now, out, tone, noise }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.35, o.pan)
  noise('pink', d, t, 0.05, { type: 'bandpass', f: 1500, q: 2, peak: 0.5, a: 0.002 })
  tone(d, t + 0.1, 0.3, { type: 'sawtooth', f: 140, f2: 70, peak: 0.12, a: 0.01, vib: 20, vibRate: 40 })
  noise('brown', d, t + 0.1, 0.3, { type: 'lowpass', f: 600, peak: 0.6, a: 0.01 })
})
// Headphones on: a soft padded click and a muffle sweep.
registerSfx('headphones', ({ now, out, tone, noise }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.3, o.pan)
  tone(d, t, 0.06, { type: 'triangle', f: 1200, peak: 0.3, a: 0.002 })
  noise('pink', d, t + 0.04, 0.35, { type: 'lowpass', f: o.off ? 300 : 3000, f2: o.off ? 3000 : 300, peak: 0.3, a: 0.02 })
})
// "Peek-a-BOO!": a little rising whoosh into a pop.
registerSfx('peekaboo', ({ now, out, tone, noise }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.3, o.pan)
  noise('white', d, t, 0.25, { type: 'bandpass', f: 600, f2: 3000, q: 1.5, peak: 0.25, a: 0.1 })
  tone(d, t + 0.22, 0.15, { type: 'square', f: 660, f2: 990, peak: 0.08, a: 0.003 })
})

// --- Props --------------------------------------------------------------------------------------------
const M = {
  white: new MeshStandardMaterial({ color: '#f4f6fa', roughness: 0.4 }),
  blue: new MeshStandardMaterial({ color: '#1c8cf0', roughness: 0.4 }),
  red: new MeshStandardMaterial({ color: '#e8434f', roughness: 0.5 }),
  skin: new MeshStandardMaterial({ color: '#f2c9a0', roughness: 0.7 }),
  pink: new MeshStandardMaterial({ color: '#ffc6dd', roughness: 0.85 }),
  cot: new MeshStandardMaterial({ color: '#d9b27a', roughness: 0.9 }),
  quilt: new MeshStandardMaterial({ color: '#9fd8ff', roughness: 0.9 }),
  dark: new MeshStandardMaterial({ color: '#22252d', roughness: 0.5 }),
  pad: new MeshStandardMaterial({ color: '#ff4b6b', roughness: 0.6 }),
  mouth: new MeshBasicMaterial({ color: '#7a1a2a' }),
  eye: new MeshBasicMaterial({ color: '#2a1a10' }),
}
// A toy plane (white, blue tail + wings tips), ~30 cm long: nose toward -Z.
function makeToy() {
  const g = new Group()
  const body = new Mesh(new CylinderGeometry(0.035, 0.03, 0.3, 10).rotateX(Math.PI / 2), M.white)
  g.add(body)
  const nose = new Mesh(new SphereGeometry(0.035, 10, 8), M.white)
  nose.position.z = -0.15
  g.add(nose)
  const wing = new Mesh(rbox(0.34, 0.012, 0.07, 0.005, 1), M.white)
  wing.position.set(0, -0.005, 0)
  g.add(wing)
  for (const s of [-1, 1]) {
    const tip = new Mesh(rbox(0.02, 0.04, 0.05, 0.005, 1), M.blue)
    tip.position.set(s * 0.17, 0.015, 0.01)
    g.add(tip)
  }
  const fin = new Mesh(rbox(0.012, 0.08, 0.06, 0.005, 1), M.blue)
  fin.position.set(0, 0.05, 0.13)
  g.add(fin)
  const tail = new Mesh(rbox(0.12, 0.01, 0.04, 0.004, 1), M.blue)
  tail.position.set(0, 0.01, 0.13)
  g.add(tail)
  const stripe = new Mesh(new CylinderGeometry(0.036, 0.036, 0.03, 10).rotateX(Math.PI / 2), M.red)
  stripe.position.z = -0.06
  g.add(stripe)
  g.scale.setScalar(1.6)
  return g
}
// The baby in a carry-cot: head + bonnet + a mouth that opens to wail, two little waving arms, a quilt.
function makeBaby() {
  const g = new Group()
  const cot = new Mesh(rbox(0.46, 0.24, 0.66, 0.09, 2), M.cot)
  cot.position.y = 0.12
  g.add(cot)
  const quilt = new Mesh(rbox(0.42, 0.06, 0.42, 0.03, 1), M.quilt)
  quilt.position.set(0, 0.25, 0.08)
  g.add(quilt)
  const head = new Group()
  head.position.set(0, 0.3, -0.16)
  g.add(head)
  head.add(new Mesh(new SphereGeometry(0.12, 14, 10), M.skin))
  const bonnet = new Mesh(new SphereGeometry(0.13, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.pink)
  bonnet.position.set(0, 0.015, -0.02)
  bonnet.rotation.x = 0.6
  head.add(bonnet)
  const mouth = new Mesh(new SphereGeometry(0.026, 8, 6), M.mouth)
  mouth.position.set(0, -0.04, 0.105)
  mouth.scale.set(1, 0.5, 0.6)
  head.add(mouth)
  const eyes = []
  for (const s of [-1, 1]) {
    const e = new Mesh(new SphereGeometry(0.013, 6, 5), M.eye)
    e.position.set(s * 0.042, 0.02, 0.108)
    head.add(e)
    eyes.push(e)
  }
  head.rotation.y = Math.PI // facing up the cot toward the aisle side doesn't matter: it faces +Z (aft)
  const arms = []
  for (const s of [-1, 1]) {
    const a = new Mesh(new CylinderGeometry(0.025, 0.025, 0.14, 6), M.pink)
    a.position.set(s * 0.12, 0.3, -0.02)
    g.add(a)
    arms.push(a)
  }
  g.userData = { head, mouth, eyes, arms }
  return g
}
// Over-ear headphones (a band + two padded cups), centred on the head.
function makeHeadphones() {
  const holder = new Group()
  const g = new Group()
  g.position.set(0, -0.22, -0.02)
  holder.add(g)
  const band = new Mesh(new TorusGeometry(0.37, 0.03, 6, 22, Math.PI), M.dark)
  g.add(band)
  for (const s of [-1, 1]) {
    const cup = new Mesh(new CylinderGeometry(0.12, 0.12, 0.08, 16).rotateZ(Math.PI / 2), M.dark)
    cup.position.set(s * 0.36, -0.02, 0)
    g.add(cup)
    const pad = new Mesh(new CylinderGeometry(0.09, 0.09, 0.02, 16).rotateZ(Math.PI / 2), M.pad)
    pad.position.set(s * 0.41, -0.02, 0)
    g.add(pad)
  }
  return holder
}

// Seated poses on top of SIT (character-space radians), standing ones arms-only.
function basePose(seated) {
  const P = {}
  if (seated) for (const k in SIT) P[k] = { ...SIT[k] }
  P.ArmL1 ??= { x: 0, z: 0 }
  P.ArmR1 ??= { x: 0, z: 0 }
  P.ArmL2 ??= { x: 0 }
  P.ArmR2 ??= { x: 0 }
  P.Spine1 ??= { x: 0 }
  P.Neck1 = { x: 0, y: 0 }
  return P
}

// freeSeat(s): nobody (bot or real passenger) sits there. wear(obj) / unwear(obj): on your avatar's head.
export function createNeighbours({ scene, cabin, crowd, hud, store, fx, trip, rules, inflight, freeSeat = () => true, sayMe = () => {}, shake = () => {}, wear = () => false }) {
  const st = {
    phase: 'off',
    t: 0,
    kid: null, // { npc, seat, front, kickIn, kickT, nextKick, calmT, toy, glares }
    chatty: null, // { npc, seat, chatIn, talkT, line, babbleT, friend, chats, sulkT }
    baby: null, // { g, parent, seat, cryIn, cryT, wailT, sleepT, calmedPaid }
    snorer: null, // { npc, seat, snoreT, wakeT }
    act: null, // what you're doing: { kind: 'glare' | 'peek' | 'lullaby' | 'chat', t, ... }
    phones: false,
    phonesWhy: '', // 'you' | 'movie'
  }
  const timers = []
  const later = (t, fn) => timers.push({ t, fn })
  const anims = []
  const tmp = new Vector3()
  const toy = makeToy()
  toy.visible = false
  scene.add(toy)
  const phones = makeHeadphones()
  const seatPose = basePose(true)
  const standPose = basePose(false)

  const me = () => (seating.seat ? seating.seat : player.position)
  const dist = (s) => {
    const m = me()
    return Math.hypot(m.x - s.x, m.z - s.z)
  }
  const quiet = () => (st.phones ? 0.3 : 1) // headphones on: the cabin goes quieter
  const seatAt = (row, letter) => cabin.seats.find((q) => q.row === row && q.letter === letter)
  const takeable = (q) => q && !q.npc && freeSeat(q)
  function seatNpc(q, o = {}) {
    const k = o.scale ?? 1
    const n = crowd.add({ x: q.x, z: q.z, y: q.y - 0.555 * k, yaw: Math.PI, bag: null, pack: false, ...o })
    if (!n) return null
    n.mode = 'sit'
    q.npc = n
    return n
  }
  // the head turned toward you (relative to the body, which faces the nose)
  function lookAtMe(n, on = true) {
    if (!on) return (n.data.head = null)
    const m = me()
    let a = Math.atan2(m.x - n.x, m.z - n.z) - n.yaw
    a = Math.atan2(Math.sin(a), Math.cos(a))
    n.data.head = Math.max(-1.3, Math.min(1.3, a))
  }

  // --- Spawning around your seat --------------------------------------------------------------------------
  function spawn(s) {
    clear()
    // the kid: right behind you
    const kq = seatAt(s.row + 1, s.letter)
    if (kq && kq.cls === s.cls && takeable(kq)) {
      const npc = seatNpc(kq, { scale: 0.68, name: pick(N.kidNames), shirt: pick(['#ff6a3a', '#3ac46a', '#ffcf3a', '#4aa8ff']), hat: Math.random() < 0.4, hatColor: '#e8434f' })
      if (npc) st.kid = { npc, seat: kq, front: s, kickIn: rr(8, 14), kickT: 0, nextKick: 0, calmT: 0, toy: false, glares: 0 }
    }
    // the chatty one: the seat beside you (same block)
    const row = cabin.seats.filter((q) => q.row === s.row && q !== s && takeable(q)).sort((a, b) => Math.abs(a.x - s.x) - Math.abs(b.x - s.x))
    const cq = row[0] && Math.abs(row[0].x - s.x) < 1.3 ? row[0] : null
    if (cq) {
      const npc = seatNpc(cq, { name: pick(['chatty chris', 'talkative tess', 'gabby gus', 'nattering nina']), shirt: '#b06aff' })
      if (npc) st.chatty = { npc, seat: cq, chatIn: rr(10, 16), talkT: 0, line: 0, babbleT: 0, friend: false, chats: 0, sulkT: 0, said: 0 }
    }
    // the baby: across the aisle (this row or the next one up), the parent beside it
    const across = cabin.seats
      .filter((q) => Math.abs(q.row - s.row) <= 1 && takeable(q) && Math.sign(q.x - s.aisleX) !== Math.sign(s.x - s.aisleX) && Math.abs(q.x - s.x) > 1.2)
      .sort((a, b) => Math.abs(a.x - s.aisleX) + Math.abs(a.row - s.row) * 0.5 - (Math.abs(b.x - s.aisleX) + Math.abs(b.row - s.row) * 0.5))
    const bq = across[0]
    if (bq) {
      const g = makeBaby()
      g.position.set(bq.x, bq.y + 0.02, bq.z)
      g.scale.setScalar(1.25)
      scene.add(g)
      bq.npc = { baby: true }
      const pq = cabin.seats.filter((q) => q.row === bq.row && q !== bq && takeable(q) && Math.abs(q.x - bq.x) < 1).sort((a, b) => Math.abs(a.x - bq.x) - Math.abs(b.x - bq.x))[0]
      const parent = pq ? seatNpc(pq, { name: 'tired parent', shirt: '#7a8a9a' }) : null
      st.baby = { g, seat: bq, parent, pseat: pq, cryIn: rr(14, 24), cryT: 0, wailT: 0, sleepT: 0, paid: false, giggleT: 0 }
    }
    // the snorer: a row or two ahead, either side
    const sq = cabin.seats.filter((q) => (q.row === s.row - 1 || q.row === s.row - 2) && q.cls === s.cls && takeable(q) && Math.abs(q.x - s.x) < 3.2).sort((a, b) => Math.abs(a.x - s.x) - Math.abs(b.x - s.x))[1]
    if (sq) {
      const npc = seatNpc(sq, { name: 'sleepy stan', shirt: '#4a5a7a' })
      if (npc) st.snorer = { npc, seat: sq, snoreT: rr(2, 4), wakeT: 0 }
    }
  }
  function clear() {
    for (const k of ['kid', 'chatty', 'snorer']) {
      const p = st[k]
      if (!p) continue
      crowd.remove(p.npc)
      p.seat.npc = null
      st[k] = null
    }
    const b = st.baby
    if (b) {
      scene.remove(b.g)
      b.seat.npc = null
      if (b.parent) {
        crowd.remove(b.parent)
        b.pseat.npc = null
      }
      st.baby = null
    }
    toy.visible = false
    st.act = null
    setPhones(false, '')
  }

  // --- Headphones (also worn for the movies) ------------------------------------------------------------
  function setPhones(on, why = 'you') {
    if (on === st.phones && (on ? why === st.phonesWhy : true)) return
    st.phones = on
    st.phonesWhy = on ? why : ''
    // a movie with headphones on: the chatty one lets you watch in peace
    const c = st.chatty
    if (on && why === 'movie' && c) {
      c.talkT = 0
      c.npc.data.talk = false
      lookAtMe(c.npc, false)
      c.sulkT = Math.max(c.sulkT, FLIGHT.fun.screen.movieTime)
    }
    phones.parent?.remove(phones)
    if (on) wear(phones)
  }
  function togglePhones() {
    const on = !st.phones
    setPhones(on, 'you')
    sfx('headphones', { vol: 0.35, off: !on })
    const p = player.renderPosition
    fx.sparkle(p.x, p.y + 1.9, p.z, { count: 8, color: '#ff4b6b', size: 0.14, speed: 1.2, up: 1, life: 0.5, grav: 2 })
    hud.toast(on ? '🎧 Headphones on. Ahh, peace and quiet.' : '🎧 Headphones off.')
    const c = st.chatty
    if (on && c && c.talkT > 0) {
      c.talkT = 0
      c.sulkT = N.headphones
      c.npc.data.talk = false
      lookAtMe(c.npc, false)
      crowd.say(c.npc, pick(L.sulk), 2.4)
      sfx('hmm')
    }
  }

  // --- The kid -------------------------------------------------------------------------------------------
  function stepKid(dt) {
    const k = st.kid
    if (!k) return
    const n = k.npc
    if (k.toy) {
      // zooming the toy plane about in front of them
      const a = n.yaw
      const sw = Math.sin(st.t * 4)
      tmp.set(-0.26 + Math.cos(st.t * 4) * 0.08, 1.42 * n.k + sw * 0.12, -0.32)
      const c = Math.cos(a)
      const s = Math.sin(a)
      toy.position.set(n.x + tmp.x * c + tmp.z * s, n.y + tmp.y, n.z - tmp.x * s + tmp.z * c)
      toy.rotation.set(Math.sin(st.t * 3) * 0.3, a + Math.sin(st.t * 2) * 0.6, Math.sin(st.t * 4) * 0.6)
      if (Math.random() < dt * 0.25) {
        sfx('kidZoom', { vol: 0.18 * quiet() })
        for (let i = 0; i < 5; i++) later(i * 0.12, () => fx.trail(toy.position.x, toy.position.y, toy.position.z, { glow: true, color: '#bfe6ff', size: 0.06, size1: 0.01, alpha: 0.9, life: 0.6, vx: 0, vy: 0.1, vz: 0, grav: 0 }))
      }
      return
    }
    k.calmT = Math.max(0, k.calmT - dt)
    if (k.kickT > 0) {
      k.kickT -= dt
      n.data.kick = 1
      k.nextKick -= dt
      if (k.nextKick <= 0) {
        k.nextKick = N.kickGap * rr(0.8, 1.3)
        kick(k, 1)
      }
      if (k.kickT <= 0) {
        n.data.kick = 0
        k.kickIn = rr(...N.kickEvery)
      }
    } else if (k.calmT <= 0 && st.phase === 'cruise') {
      k.kickIn -= dt
      if (k.kickIn <= 0) {
        k.kickT = rr(...N.kickBurst)
        crowd.say(n, pick(L.kick), 2)
        sfx('kidLaugh', { vol: 0.22 * quiet() })
      }
    }
  }
  // One kick into the seat in front (yours, if you sit in it).
  function kick(k, power) {
    const f = k.front
    const mine = seating.seat === f
    const near = dist(f) < 4
    if (!near) return
    sfx('seatKick', { vol: (mine ? 0.45 : 0.15) * power * (mine ? 1 : quiet()) })
    fx.puff(f.x, f.y + 0.9, f.z + 0.35, { count: 2, size: 0.18, spread: 0.15, up: 0.4, speed: 0.4, life: 0.5, alpha: 0.25, color: '#d9d4cc' })
    if (mine) {
      shake(0.05 * power, 0.14)
      if (Math.random() < 0.25) fx.sparkle(f.x, f.y + 1.6, f.z + 0.1, { count: 4, color: '#ff4a4a', size: 0.14, speed: 1.5, up: 1.2, life: 0.4, grav: 2 })
    }
    if (Math.random() < 0.12) crowd.say(k.npc, pick(L.kick), 1.6)
  }
  function turnAround() {
    const k = st.kid
    if (!k || st.act) return
    st.act = { kind: 'glare', t: 0, dur: 1.9 }
    sayMe(pick(['Could you stop kicking, please?', 'Hey! Please stop!', 'Little one... my seat!']), 2)
    sfx('hmm')
    lookAtMe(k.npc)
    later(1.0, () => {
      if (!st.kid) return
      const works = Math.random() < N.glareWorks + k.glares * 0.25
      k.glares++
      if (works) {
        k.kickT = 0
        k.npc.data.kick = 0
        k.calmT = N.glareCalm
        k.kickIn = rr(...N.kickEvery)
        k.npc.scare = 0.5
        crowd.say(k.npc, pick(L.sorry), 2)
        sfx('chime', { vol: 0.25 })
        hud.toast(`${k.npc.name} stopped kicking. For now...`)
      } else {
        k.kickT = Math.max(k.kickT, 3)
        crowd.say(k.npc, pick(L.refuse), 2)
        sfx('kidLaugh', { vol: 0.3 })
        for (let i = 0; i < 3; i++) later(0.2 + i * 0.25, () => st.kid && kick(st.kid, 1.5))
        hud.toast('That only made it worse. Maybe a toy would help?')
      }
      later(1.2, () => st.kid && lookAtMe(st.kid.npc, false))
    })
  }
  function buyToy() {
    const k = st.kid
    if (!k || k.toy) return
    hud.confirm('Toy Plane', N.toyPrice, () => giveToy(), `A little skyhop air plane for ${k.npc.name}. No more kicking, guaranteed!`)
  }
  function giveToy() {
    const k = st.kid
    if (!k) return
    sayMe(pick(['Here, this is for you!', 'Catch! A plane of your own!']), 2)
    const p = player.renderPosition
    const from = new Vector3(p.x, p.y + 1.7, p.z)
    toy.visible = true
    sfx('whoosh', { vol: 0.35, dur: 0.6 })
    let t = 0
    anims.push((dt) => {
      t += dt
      const e = ease(Math.min(1, t / 0.9))
      const n = k.npc
      tmp.set(n.x, n.y + 1.3 * n.k, n.z)
      toy.position.lerpVectors(from, tmp, e)
      toy.position.y += Math.sin(e * Math.PI) * 0.9
      toy.rotation.set(0, Math.atan2(tmp.x - from.x, tmp.z - from.z) + Math.PI, Math.sin(e * 12) * 0.3)
      if (Math.random() < 0.6) fx.trail(toy.position.x, toy.position.y, toy.position.z, { glow: true, color: '#ffffff', size: 0.07, size1: 0.01, alpha: 0.9, life: 0.4, vx: 0, vy: 0, vz: 0, grav: 0 })
      if (t >= 0.9) {
        k.toy = true
        k.kickT = 0
        n.data.kick = 0
        n.data.toy = true
        n.scare = 0.6
        crowd.say(n, pick(L.toy), 2.4)
        sfx('kidZoom', { vol: 0.3 })
        later(0.3, () => sfx('kidLaugh', { vol: 0.3 }))
        fx.confetti(n.x, n.y + 1.4, n.z, 24)
        hud.big('🛩️ PEACE AND QUIET!', 'green', 2)
        inflight.applyEffect?.('happy')
        return false
      }
      return true
    })
  }

  // --- The chatty passenger -----------------------------------------------------------------------------
  function stepChatty(dt) {
    const c = st.chatty
    if (!c) return
    const n = c.npc
    c.sulkT = Math.max(0, c.sulkT - dt)
    if (c.talkT > 0) {
      c.talkT -= dt
      n.data.talk = true
      lookAtMe(n)
      c.babbleT -= dt
      if (c.babbleT <= 0) {
        c.babbleT = rr(0.09, 0.17)
        if (dist(c.seat) < 6) sfx('talk', { vol: (st.phones ? 0.012 : 0.06), f: rr(380, 640) })
      }
      c.lineT -= dt
      if (c.lineT <= 0) {
        c.lineT = 3
        crowd.say(n, st.phones ? '... blah blah ...' : c.said++ === 0 ? pick(L.chatHello) : pick(L.facts), 2.8)
      }
      if (c.talkT <= 0) {
        n.data.talk = false
        lookAtMe(n, false)
        c.chatIn = rr(...N.chatEvery)
      }
    } else if (c.sulkT <= 0 && st.phase === 'cruise' && dist(c.seat) < 3) {
      c.chatIn -= dt
      if (c.chatIn <= 0) startTalk(c)
    }
  }
  function startTalk(c) {
    c.talkT = N.chatFor
    c.lineT = 0
    c.babbleT = 0
  }
  function chat() {
    const c = st.chatty
    if (!c || st.act) return
    if (st.phones) setPhones(false)
    if (c.talkT <= 0) startTalk(c)
    c.talkT = Math.max(c.talkT, 4)
    c.lineT = 1.4
    st.act = { kind: 'chat', t: 0, dur: 1.4 }
    sayMe(pick(['No way!', 'Really?!', 'Tell me more!', 'Haha, wow!', 'That\'s amazing!', 'I did NOT know that!']), 1.6)
    for (let i = 0; i < 6; i++) later(i * 0.11, () => sfx('talk', { vol: 0.06, f: rr(620, 860) }))
    c.chats++
    const n = c.npc
    fx.sparkle(n.x, n.y + 2, n.z, { count: 6, color: '#ff7ab0', size: 0.18, speed: 1, up: 1.4, life: 0.8, grav: -0.5 })
    if (!c.friend && c.chats >= N.friendChats) {
      c.friend = true
      later(1.6, () => {
        if (!st.chatty) return
        crowd.say(n, pick(L.friend), 3)
        n.data.clap = 1.4
        sfx('cheer', { vol: 0.25 })
        hud.big('💜 BEST SEAT BUDDY!', 'gold', 2)
        const p = player.renderPosition
        store.addCoins(N.friendCoins, { x: p.x, y: p.y + 1.6, z: p.z })
        for (let i = 0; i < 10; i++) later(i * 0.08, () => fx.trail(n.x + rr(-0.3, 0.3), n.y + 1.6, n.z + rr(-0.3, 0.3), { glow: true, color: '#ff6aa8', size: 0.14, size1: 0.05, alpha: 1, life: 1.2, vx: rr(-0.2, 0.2), vy: 0.8, vz: 0, grav: -0.2 }))
        // a cookie on your tray, if you're in a plane seat with room
        if (seating.seat && seating.seat.cls != null) later(1, () => inflight.serve?.(seating.seat, ['cookie']))
      })
    } else if (c.chats < N.friendChats) hud.toast(`${n.name} likes you more! (${c.chats}/${N.friendChats})`)
  }

  // --- The baby ------------------------------------------------------------------------------------------
  function stepBaby(dt) {
    const b = st.baby
    if (!b) return
    const u = b.g.userData
    b.giggleT = Math.max(0, b.giggleT - dt)
    const crying = b.cryT > 0
    if (b.sleepT > 0) {
      b.sleepT -= dt
      if (Math.random() < dt * 0.8) fx.trail(b.seat.x, b.seat.y + 0.7, b.seat.z, { glow: true, color: '#9fb6ff', size: 0.08, size1: 0.2, alpha: 0.9, life: 1.6, vx: 0.15, vy: 0.4, vz: 0, grav: 0 })
      for (const e of u.eyes) e.scale.y = 0.2
    } else for (const e of u.eyes) e.scale.y = crying ? 0.25 : 1
    if (crying) {
      b.cryT -= dt
      b.wailT -= dt
      const k = Math.sin(st.t * 18)
      u.head.position.y = 0.3 + Math.abs(k) * 0.012
      u.arms[0].rotation.x = Math.sin(st.t * 11) * 0.8
      u.arms[1].rotation.x = Math.sin(st.t * 11 + 2) * 0.8
      u.mouth.scale.set(1.3, 1.1 + Math.abs(k) * 0.4, 0.8)
      if (b.wailT <= 0) {
        b.wailT = rr(1.4, 1.9)
        const d = dist(b.seat)
        if (d < 14) sfx('babyCry', { vol: Math.min(0.34, 3 / (d + 4)) * quiet() })
        for (let i = 0; i < 6; i++) fx.trail(b.seat.x + rr(-0.08, 0.08), b.seat.y + 0.48, b.seat.z - 0.15, { glow: true, color: '#7ad8ff', size: 0.06, size1: 0.03, alpha: 1, life: 0.6, vx: rr(-0.5, 0.5), vy: rr(0.6, 1.2), vz: rr(-0.3, 0.3), grav: 5 })
        if (b.parent && Math.random() < 0.35) crowd.say(b.parent, pick(L.parent), 2)
      }
      if (b.parent) b.parent.data.talk = Math.sin(st.t * 0.7) > 0
      if (b.cryT <= 0) stopCry(false)
    } else {
      u.mouth.scale.set(1, b.giggleT > 0 ? 0.9 : 0.5, 0.6)
      u.arms[0].rotation.x = b.giggleT > 0 ? Math.sin(st.t * 14) * 0.6 : 0
      u.arms[1].rotation.x = b.giggleT > 0 ? -Math.sin(st.t * 14) * 0.6 : 0
      u.head.position.y = 0.3 + (b.giggleT > 0 ? Math.abs(Math.sin(st.t * 12)) * 0.02 : 0)
      if (b.sleepT <= 0 && st.phase === 'cruise') {
        b.cryIn -= dt
        if (b.cryIn <= 0) {
          b.cryT = rr(...N.cryFor)
          b.wailT = 0
          if (dist(b.seat) < 6) hud.toast('👶 The baby across the aisle is crying! Try PEEKABOO or a LULLABY.')
        }
      }
    }
  }
  function stopCry(calmed) {
    const b = st.baby
    if (!b) return
    b.cryT = 0
    b.cryIn = rr(...N.cryEvery)
    if (b.parent) b.parent.data.talk = false
    if (!calmed) return
    b.sleepT = N.babySleep
    b.cryIn = N.babySleep + rr(...N.cryEvery)
    if (b.parent) crowd.say(b.parent, pick(L.thanks), 2.6)
    if (!b.paid) {
      b.paid = true
      hud.big('👶 BABY WHISPERER!', 'gold', 2.2)
      sfx('fanfare', { vol: 0.3 })
      const p = player.renderPosition
      store.addCoins(N.babyCoins, { x: p.x, y: p.y + 1.6, z: p.z })
    } else hud.toast('The baby drifts off to sleep...')
  }
  function peekaboo() {
    const b = st.baby
    if (!b || st.act) return
    st.act = { kind: 'peek', t: 0, dur: 1.6 }
    sayMe('Peek-a-...', 0.9)
    later(0.85, () => {
      sayMe('BOO!', 0.9)
      sfx('peekaboo', { vol: 0.35 })
      if (!st.baby) return
      const giggle = b.cryT <= 0 || Math.random() < N.peekChance
      later(0.3, () => {
        if (!st.baby) return
        if (giggle) {
          b.giggleT = 1.6
          sfx('babyGiggle', { vol: 0.35 })
          for (let i = 0; i < 8; i++) later(i * 0.1, () => fx.trail(b.seat.x + rr(-0.2, 0.2), b.seat.y + 0.6, b.seat.z, { glow: true, color: pick(['#ff6aa8', '#ffd84a', '#7ad8ff']), size: 0.12, size1: 0.04, alpha: 1, life: 1.1, vx: rr(-0.3, 0.3), vy: 0.9, vz: 0, grav: -0.2 }))
          if (b.cryT > 0) stopCry(true)
        } else {
          b.wailT = 0
          b.cryT = Math.max(b.cryT, 3)
          hud.toast('Not funny enough... try again!')
        }
      })
    })
  }
  function lullaby() {
    const b = st.baby
    if (!b || st.act) return
    st.act = { kind: 'lullaby', t: 0, dur: N.lullaby }
    sayMe('🎵 Hush little baby... 🎵', 2.4)
    const notes = [392, 330, 392, 330, 349, 392, 294, 262, 294, 330]
    notes.forEach((f, i) => later(i * (N.lullaby / notes.length), () => {
      sfx('hum', { f, vol: 0.28, dur: 0.48 })
      const p = player.renderPosition
      const s = st.baby?.seat
      if (!s) return
      fx.trail(p.x, p.y + 2, p.z, { glow: true, color: pick(['#9fd8ff', '#ffc6dd', '#fff0a0']), size: 0.14, size1: 0.06, alpha: 1, life: 1.4, vx: (s.x - p.x) * 0.6, vy: 0.3, vz: (s.z - p.z) * 0.6, grav: 0 })
    }))
    later(N.lullaby, () => {
      if (!st.baby) return
      sfx('yawn', { vol: 0.25 })
      if (st.baby.cryT > 0) stopCry(true)
      else {
        st.baby.sleepT = N.babySleep
        hud.toast('The baby drifts off to sleep...')
      }
    })
  }

  // --- The snorer -----------------------------------------------------------------------------------------
  function stepSnorer(dt) {
    const s = st.snorer
    if (!s) return
    if (s.wakeT > 0) {
      s.wakeT -= dt
      s.npc.data.phone = true
      return
    }
    s.npc.data.phone = false
    s.snoreT -= dt
    if (s.snoreT <= 0) {
      s.snoreT = rr(3, 4.5)
      const d = dist(s.seat)
      if (d < 12) {
        sfx('snore', { vol: Math.min(0.28, 2.4 / (d + 3)) * quiet() })
        const q = s.seat
        for (let i = 0; i < 3; i++) later(i * 0.4, () => fx.trail(q.x + 0.1, q.y + 1.4, q.z, { glow: true, color: '#9fb6ff', size: 0.1, size1: 0.25, alpha: 0.9, life: 1.6, vx: 0.2, vy: 0.45, vz: 0, grav: 0 }))
      }
    }
  }
  function nudge() {
    const s = st.snorer
    if (!s || s.wakeT > 0) return
    sayMe(pick(['*poke*', 'Excuse me...', 'Psst! You\'re snoring!']), 1.4)
    later(0.4, () => {
      if (!st.snorer) return
      sfx('snort', { vol: 0.4 })
      s.npc.scare = 0.7
      crowd.say(s.npc, pick(L.snorer), 2.2)
      s.wakeT = N.snoreWake
      const q = s.seat
      fx.sparkle(q.x, q.y + 1.5, q.z, { count: 10, color: '#ffffff', size: 0.16, speed: 2, up: 1.5, life: 0.5, grav: 3 })
    })
  }

  // --- Your pose while you do it -------------------------------------------------------------------------
  function pose(seated) {
    const a = st.act
    if (!a) return null
    const P = seated ? seatPose : standPose
    const S = seated ? SIT : null
    const k = Math.min(1, a.t / 0.25) * Math.min(1, (a.dur - a.t) / 0.25)
    const set = (bone, ax, v) => (P[bone][ax] = (S?.[bone]?.[ax] ?? 0) + (v - (S?.[bone]?.[ax] ?? 0)) * k)
    for (const b of ['ArmL1', 'ArmR1', 'ArmL2', 'ArmR2', 'Spine1']) {
      P[b].x = S?.[b]?.x ?? 0
      P[b].z = S?.[b]?.z ?? 0
      P[b].y = 0
    }
    P.Neck1.x = P.Neck1.y = 0
    if (a.kind === 'glare') {
      // twist round toward the kid behind you
      set('Spine1', 'y', deg(45))
      set('Neck1', 'y', deg(55))
      set('ArmR1', 'x', deg(-70))
      set('ArmR1', 'z', deg(-40))
      set('ArmR2', 'x', deg(-40))
    } else if (a.kind === 'peek') {
      if (a.t < 0.85) {
        // hands over your face
        set('ArmL1', 'x', deg(-150))
        set('ArmR1', 'x', deg(-150))
        set('ArmL1', 'z', deg(30))
        set('ArmR1', 'z', deg(-30))
        set('ArmL2', 'x', deg(-110))
        set('ArmR2', 'x', deg(-110))
      } else {
        // BOO! arms wide
        set('ArmL1', 'x', deg(-90))
        set('ArmR1', 'x', deg(-90))
        set('ArmL1', 'z', deg(70))
        set('ArmR1', 'z', deg(-70))
        set('Neck1', 'x', deg(-12))
      }
    } else if (a.kind === 'lullaby') {
      // swaying, hands together
      set('Spine1', 'z', Math.sin(a.t * 2.4) * 0.12)
      set('Neck1', 'x', deg(8))
      set('ArmL1', 'x', deg(-60))
      set('ArmR1', 'x', deg(-60))
      set('ArmL1', 'z', deg(-15))
      set('ArmR1', 'z', deg(15))
    } else if (a.kind === 'chat') {
      set('Neck1', 'x', Math.sin(a.t * 14) * 0.12)
      set('ArmR1', 'x', deg(-60) + Math.sin(a.t * 9) * 0.3)
      set('ArmR2', 'x', deg(-50))
    }
    return P
  }

  // --- Context buttons -----------------------------------------------------------------------------------
  rules.addActions(() => {
    if (st.phase !== 'cruise' || st.act || player.position.y > cabin.floorY + 10) return []
    const out = []
    const k = st.kid
    if (k && !k.toy && dist(k.seat) < 2.6) {
      if (k.kickT > 0) out.push({ pri: 3, icon: '😠', label: 'TURN AROUND', fn: turnAround, cls: 'red' })
      out.push({ pri: k.kickT > 0 ? 2.5 : 0.5, icon: '🛩️', label: `TOY 🪙${N.toyPrice}`, fn: buyToy, cls: 'green' })
    }
    const b = st.baby
    if (b && b.cryT > 0 && dist(b.seat) < 3.6) {
      out.push({ pri: 4, icon: '👻', label: 'PEEKABOO', fn: peekaboo, cls: 'blue' })
      out.push({ pri: 3.5, icon: '🎵', label: 'LULLABY', fn: lullaby, cls: 'blue' })
    }
    const c = st.chatty
    if (c && dist(c.seat) < 2.4) {
      if (c.talkT > 0) {
        out.push({ pri: 3, icon: '💬', label: 'CHAT', fn: chat, cls: 'blue' })
        out.push({ pri: 2.8, icon: '🎧', label: st.phones ? 'PHONES OFF' : 'HEADPHONES', fn: togglePhones, cls: 'blue' })
      } else {
        out.push({ pri: 0.4, icon: '💬', label: 'CHAT', fn: chat, cls: 'blue' })
        if (st.phones && st.phonesWhy === 'you') out.push({ pri: 0.3, icon: '🎧', label: 'PHONES OFF', fn: togglePhones, cls: 'blue' })
      }
    }
    const s = st.snorer
    if (s && s.wakeT <= 0 && dist(s.seat) < 2.8) out.push({ pri: 1, icon: '👉', label: 'NUDGE', fn: nudge, cls: 'blue' })
    out.sort((a, b2) => b2.pri - a.pri)
    const top = out.slice(0, seating.seat && seating.seat.cls <= 1 ? 1 : 2) // luxury seats already have BED / MASSAGE / DOORS
    if (top[0]) top[0].key = 'G'
    for (const a of top) a.pri = 2
    return top
  })
  onKey('KeyG', () => {
    if (st.phase !== 'cruise') return
    // the same choice as the first button
    const k = st.kid
    const b = st.baby
    const c = st.chatty
    const s = st.snorer
    if (b && b.cryT > 0 && dist(b.seat) < 3.6) return peekaboo()
    if (k && !k.toy && k.kickT > 0 && dist(k.seat) < 2.6) return turnAround()
    if (c && dist(c.seat) < 2.4) return chat()
    if (s && s.wakeT <= 0 && dist(s.seat) < 2.8) return nudge()
  })

  return {
    st,
    // Seated / standing pose overrides while you turn round, play peekaboo, hum, chat (else null).
    pose: () => (seating.seat ? pose(true) : null),
    standPose: () => (seating.seat ? null : pose(false)),
    // Everyone around you (events.js: they jump at thunder, clap at jokes, put masks on).
    npcs() {
      const out = []
      for (const k of ['kid', 'chatty', 'snorer']) if (st[k]) out.push(st[k].npc)
      if (st.baby?.parent) out.push(st.baby.parent)
      return out
    },
    // Wake the baby up crying (thunder!).
    startle() {
      const b = st.baby
      if (b && b.cryT <= 0) {
        b.sleepT = 0
        b.cryT = rr(4, 6)
        b.wailT = 0.3
      }
    },
    setPhones,
    get phones() {
      return st.phones
    },
    board(seat) {
      st.phase = 'takeoff'
      spawn(seat)
    },
    setPhase(p) {
      st.phase = p
      if (p !== 'cruise') {
        st.act = null
        if (st.kid) {
          st.kid.kickT = 0
          st.kid.npc.data.kick = 0
        }
        if (st.chatty) {
          st.chatty.talkT = 0
          st.chatty.npc.data.talk = false
        }
        if (st.baby) st.baby.cryT = 0
      }
    },
    clear() {
      clear()
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
      if (st.act) {
        st.act.t += dt
        if (st.act.t >= st.act.dur) st.act = null
      }
      stepKid(dt)
      stepChatty(dt)
      stepBaby(dt)
      stepSnorer(dt)
    },
  }
}
