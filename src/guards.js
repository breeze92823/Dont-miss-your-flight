// Checkpoint guards + barriers: nobody skips a step of the trip.
//
// Three checkpoints (GUARDS.checkpoints in config): the doorway from check-in into security, the
// screening lanes behind the security line, and the doorway out to the gates. Each closes the area
// behind it (`zone`) until you've done its step. The way in is blocked by a physical barrier: a laser
// gate (two scanner pedestals, beams, an energy curtain, a beacon) across a doorway, or a laser fence
// (bollards + beams) along the lanes. The barrier's collider is solid to the player only while they're
// not allowed; passengers (NPCs) who are allowed walk straight through and the beams step aside.
//
// Each checkpoint has a guard (a detailed, hand-built model: peaked cap + badge, sunglasses, earpiece
// with a coiled cord, hi-vis vest printed SECURITY, shoulder radio, duty belt with radio, baton and
// pouches, boots, gloves) who escalates:
//   1. instruct  - you walk up (or touch the lasers): whistle, point where to go, speech + toast
//   2. warning   - you push the barrier again: STOP hand, double whistle, radio, LAST WARNING
//   3. force     - you push again: the guard rushes you and shoves you back (knock-back + stun,
//                  dust, impact stars, camera shake, red vignette, dizzy stars)
// Anyone who still gets inside a zone (a glitch, a grapple, a launch) is chased down and grabbed when
// the guard can reach them, or radioed in otherwise, and escorted out (fade, teleport) to `safe`.
// All sounds are synthesised (registerSfx); particles go through fx.js.
import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  CanvasTexture,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  RepeatWrapping,
  Shape,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  TorusGeometry,
  TubeGeometry,
  Vector3,
} from 'three'
import { AIRPORT, GATES, GUARDS, QUEUE, SECURITY } from './config.js'
import { makePath } from './linepath.js'
import { player, resetPlayer } from './player.js'
import { syncYawToPlayer } from './camera.js'
import { RAPIER, addFixed, world } from './physics.js'
import { registerSfx, sfx } from './audio.js'
import { bake } from './bake.js'
import { lathe, nonIndexed, pole, rbox } from './detail.js'
import { fontReady, neon, solidBox } from './propkit.js'

const Y = AIRPORT.walkY
const TAU = Math.PI * 2
const FONT = 'Fredoka, "Arial Rounded MT Bold", Arial, sans-serif'
const rnd = (s) => (Math.random() - 0.5) * 2 * s
const pick = (a) => a[Math.floor(Math.random() * a.length)]
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a))
const angTo = (from, to, max) => {
  const d = wrap(to - from)
  return Math.abs(d) <= max ? to : from + Math.sign(d) * max
}
const damp = (k, dt) => 1 - Math.exp(-k * dt)
const norm = (b) => ({ x0: Math.min(b.x0, b.x1), x1: Math.max(b.x0, b.x1), z0: Math.min(b.z0, b.z1), z1: Math.max(b.z0, b.z1) })
const inBox = (b, x, z) => x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1
// Steps the player has done: 0 nothing, 1 checked in, 2 called to screening, 3 cleared security.
const NEED = { checked: 1, screening: 2, cleared: 3 }
const SCREENING = ['turn', 'tray', 'detector', 'wait', 'tomat', 'search', 'cleared']

// --- Sounds (synthesised, like the rest of the game) ---------------------------------------------------
// A pea whistle: a bright tone with a fast trill (the pea rattling), plus breath.
registerSfx('whistle', ({ now, out, tone, noise }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.22, o.pan)
  const blasts = o.blasts ?? 1
  for (let i = 0; i < blasts; i++) {
    const t0 = t + i * 0.3
    const dur = blasts > 1 ? 0.22 : 0.5
    tone(d, t0, dur, { type: 'sine', f: 2860, peak: 0.34, a: 0.012, curve: 'hold', vib: 170, vibRate: 33 })
    tone(d, t0, dur, { type: 'sine', f: 5720, peak: 0.05, a: 0.012, curve: 'hold', vib: 340, vibRate: 33 })
    noise('white', d, t0, dur, { type: 'highpass', f: 4800, peak: 0.12, a: 0.015 })
  }
})
// Touching a laser: a falling zap with crackle.
registerSfx('laserZap', ({ now, out, tone, noise }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.3, o.pan)
  tone(d, t, 0.2, { type: 'sawtooth', f: 2100, f2: 220, peak: 0.12 })
  tone(d, t, 0.12, { type: 'square', f: 900, f2: 1600, peak: 0.05 })
  noise('white', d, t, 0.16, { f: 3200, q: 1.6, peak: 0.4 })
})
// Access denied: a beating low buzzer.
registerSfx('deny', ({ now, out, tone, noise }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.22, o.pan)
  tone(d, t, 0.42, { type: 'square', f: 108, peak: 0.12, curve: 'hold' })
  tone(d, t, 0.42, { type: 'square', f: 115, peak: 0.09, curve: 'hold' })
  noise('pink', d, t, 0.4, { type: 'lowpass', f: 500, peak: 0.18 })
})
// Two-way radio: squelch, garbled voice bursts, squelch tail.
registerSfx('radio', ({ now, out, tone, noise }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.2, o.pan)
  noise('white', d, t, 0.07, { type: 'highpass', f: 2200, peak: 0.5 })
  tone(d, t, 0.05, { type: 'sine', f: 1250, peak: 0.12 })
  const n = 6 + Math.floor(Math.random() * 4)
  for (let k = 0; k < n; k++) noise('pink', d, t + 0.09 + k * 0.075, 0.068, { type: 'bandpass', f: 650 + Math.random() * 1100, q: 5, peak: 0.9 })
  noise('white', d, t + 0.12 + n * 0.075, 0.09, { type: 'highpass', f: 2600, peak: 0.45 })
})
// The shove: a cloth whoosh into a heavy body thud.
registerSfx('shove', ({ now, out, tone, noise }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.6, o.pan)
  noise('pink', d, t, 0.22, { type: 'lowpass', f: 300, f2: 2400, peak: 0.7 })
  tone(d, t + 0.05, 0.3, { f: 160, f2: 42, peak: 0.95, a: 0.003 })
  noise('brown', d, t + 0.05, 0.28, { type: 'lowpass', f: 700, peak: 0.8, a: 0.003 })
  noise('white', d, t + 0.05, 0.05, { f: 2600, q: 0.8, peak: 0.3 })
})
// A guard's effort grunt ("hup!").
registerSfx('grunt', ({ now, out, tone, noise }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.3, o.pan)
  tone(d, t, 0.2, { type: 'triangle', f: 210, f2: 130, peak: 0.4, a: 0.01 })
  tone(d, t, 0.18, { type: 'sawtooth', f: 105, f2: 70, peak: 0.05, a: 0.01 })
  noise('pink', d, t, 0.15, { type: 'bandpass', f: 650, q: 3, peak: 0.5 })
})
// A shouted "HEY!".
registerSfx('hey', ({ now, out, tone, noise }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.3, o.pan)
  tone(d, t, 0.34, { type: 'sawtooth', f: 250, f2: 205, peak: 0.07, a: 0.02, vib: 7, vibRate: 7 })
  tone(d, t, 0.34, { type: 'triangle', f: 500, f2: 410, peak: 0.25, a: 0.02 })
  noise('pink', d, t, 0.3, { type: 'bandpass', f: 1300, q: 2.5, peak: 0.3, a: 0.02 })
})
// Breach alarm: a short two-tone wail.
registerSfx('siren', ({ now, out, tone }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.2, o.pan)
  for (let i = 0; i < 4; i++) tone(d, t + i * 0.34, 0.34, { type: 'triangle', f: i % 2 ? 700 : 980, f2: i % 2 ? 980 : 700, peak: 0.2, curve: 'hold', a: 0.02 })
})
// The line disapproves: a few detuned falling "ooh"s with breath.
registerSfx('boo', ({ now, out, tone, noise }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.2, o.pan)
  for (let k = 0; k < 5; k++) {
    const f = 170 + Math.random() * 120
    const t0 = t + Math.random() * 0.12
    tone(d, t0, 0.75, { type: 'sawtooth', f, f2: f * 0.78, peak: 0.022, a: 0.06, vib: 5, vibRate: 5 + Math.random() * 3 })
    tone(d, t0, 0.75, { type: 'triangle', f: f * 2, f2: f * 1.55, peak: 0.08, a: 0.06 })
  }
  noise('pink', d, t, 0.7, { type: 'bandpass', f: 600, q: 1.5, peak: 0.25, a: 0.08 })
})
// A heavy boot step.
registerSfx('bootStep', ({ now, out, tone, noise }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.25, o.pan)
  noise('pink', d, t, 0.07, { type: 'lowpass', f: 900, peak: 0.7 })
  tone(d, t, 0.1, { f: 95, f2: 45, peak: 0.5 })
})

// --- Canvas painters --------------------------------------------------------------------------------------
function canvas(w, h) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}
function texOf(c, srgb = true) {
  const t = new CanvasTexture(c)
  if (srgb) t.colorSpace = SRGBColorSpace
  t.anisotropy = 4
  return t
}
function roundRect(x, X, Y0, w, h, r) {
  x.beginPath()
  x.moveTo(X + r, Y0)
  x.arcTo(X + w, Y0, X + w, Y0 + h, r)
  x.arcTo(X + w, Y0 + h, X, Y0 + h, r)
  x.arcTo(X, Y0 + h, X, Y0, r)
  x.arcTo(X, Y0, X + w, Y0, r)
  x.closePath()
}
function hazard(x, X, Y0, w, h, s = 22) {
  x.save()
  x.beginPath()
  x.rect(X, Y0, w, h)
  x.clip()
  x.fillStyle = '#ffcf1f'
  x.fillRect(X, Y0, w, h)
  x.fillStyle = '#16181d'
  for (let i = -h; i < w + h; i += s * 2) {
    x.beginPath()
    x.moveTo(X + i, Y0 + h)
    x.lineTo(X + i + s, Y0 + h)
    x.lineTo(X + i + s + h, Y0)
    x.lineTo(X + i + h, Y0)
    x.fill()
  }
  x.restore()
}

// A stern guard face on the skin colour; the sunglasses (a mesh) cover the eyes. Face centred at u 0.5.
function paintGuardFace(skin, variant) {
  const c = canvas(256, 128)
  const x = c.getContext('2d')
  x.fillStyle = skin
  x.fillRect(0, 0, 256, 128)
  const INK = '#1b1714'
  x.lineCap = 'round'
  x.strokeStyle = INK
  // Furrowed brows above the glasses.
  x.lineWidth = 6
  x.beginPath()
  x.moveTo(100, 36)
  x.lineTo(121, 43)
  x.moveTo(156, 36)
  x.lineTo(135, 43)
  x.stroke()
  // Nose shadow.
  x.globalAlpha = 0.22
  x.fillStyle = INK
  x.beginPath()
  x.ellipse(128, 72, 6, 3, 0, 0, TAU)
  x.fill()
  x.globalAlpha = 1
  if (variant === 1) {
    // Moustache.
    x.fillStyle = '#2a1d14'
    x.beginPath()
    x.moveTo(110, 82)
    x.quadraticCurveTo(128, 72, 146, 82)
    x.quadraticCurveTo(128, 80, 110, 82)
    x.fill()
  }
  if (variant === 2) {
    // Stubble.
    x.fillStyle = 'rgba(30,20,15,0.35)'
    for (let i = 0; i < 140; i++) {
      const a = Math.random() * Math.PI
      const r = 20 + Math.random() * 14
      x.fillRect(128 + Math.cos(a) * r * 1.3, 78 + Math.sin(a) * r * 0.9, 1.6, 1.6)
    }
  }
  // Flat, unimpressed mouth.
  x.lineWidth = 4
  x.beginPath()
  x.moveTo(115, 90)
  x.quadraticCurveTo(128, 87, 141, 90)
  x.stroke()
  return c
}
// "SECURITY" on dark vest fabric.
function paintPrint(text = 'SECURITY', w = 512, h = 128, bg = '#161a22') {
  const c = canvas(w, h)
  const x = c.getContext('2d')
  const draw = () => {
    x.fillStyle = bg
    x.fillRect(0, 0, w, h)
    x.fillStyle = '#ffffff'
    x.textAlign = 'center'
    x.textBaseline = 'middle'
    x.font = `700 ${Math.round(h * 0.72)}px ${FONT}`
    const m = x.measureText(text).width
    const k = Math.min(1, (w * 0.92) / m)
    x.save()
    x.translate(w / 2, h / 2 + 2)
    x.scale(k, 1)
    x.fillText(text, 0, 0)
    x.restore()
  }
  draw()
  return { c, draw }
}
// Round sleeve patch: navy disc, gold rim, white shield with a star.
function paintPatch() {
  const c = canvas(128, 128)
  const x = c.getContext('2d')
  x.fillStyle = '#e2b13c'
  x.beginPath()
  x.arc(64, 64, 62, 0, TAU)
  x.fill()
  x.fillStyle = '#18264a'
  x.beginPath()
  x.arc(64, 64, 54, 0, TAU)
  x.fill()
  x.fillStyle = '#f4f6fa'
  x.beginPath()
  x.moveTo(64, 22)
  x.lineTo(96, 34)
  x.quadraticCurveTo(96, 82, 64, 104)
  x.quadraticCurveTo(32, 82, 32, 34)
  x.closePath()
  x.fill()
  x.fillStyle = '#e2b13c'
  star(x, 64, 60, 16, 7)
  return c
}
function star(x, cx, cy, R, r) {
  x.beginPath()
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    const rr = i % 2 ? r : R
    x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr)
  }
  x.closePath()
  x.fill()
}
// Floor decal: hazard bands top + bottom, a red panel with the message.
function paintDecal(text) {
  const c = canvas(1024, 192)
  const x = c.getContext('2d')
  const draw = () => {
    x.clearRect(0, 0, 1024, 192)
    hazard(x, 0, 0, 1024, 30)
    hazard(x, 0, 162, 1024, 30)
    x.fillStyle = '#c81e2b'
    x.fillRect(0, 36, 1024, 120)
    x.strokeStyle = 'rgba(255,255,255,0.9)'
    x.lineWidth = 5
    x.strokeRect(10, 44, 1004, 104)
    x.fillStyle = '#ffffff'
    x.textAlign = 'center'
    x.textBaseline = 'middle'
    x.font = `700 74px ${FONT}`
    const m = x.measureText(text.toUpperCase()).width
    const k = Math.min(1, 950 / m)
    x.save()
    x.translate(512, 98)
    x.scale(k, 1)
    x.fillText(text.toUpperCase(), 0, 0)
    x.restore()
  }
  draw()
  return { c, draw }
}
function paintHazardTile() {
  const c = canvas(256, 64)
  hazard(c.getContext('2d'), 0, 0, 256, 64, 32)
  return c
}
// Energy curtain: soft horizontal scan lines.
function paintCurtain() {
  const c = canvas(32, 128)
  const x = c.getContext('2d')
  for (let y = 0; y < 128; y += 16) {
    const g = x.createLinearGradient(0, y, 0, y + 16)
    g.addColorStop(0, 'rgba(255,255,255,0)')
    g.addColorStop(0.5, 'rgba(255,255,255,0.9)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    x.fillStyle = g
    x.fillRect(0, y, 32, 16)
  }
  return c
}
// "!" alert mark above a guard's head.
function paintMark(color) {
  const c = canvas(128, 128)
  const x = c.getContext('2d')
  x.fillStyle = '#ffffff'
  x.beginPath()
  x.arc(64, 64, 60, 0, TAU)
  x.fill()
  x.fillStyle = color
  x.beginPath()
  x.arc(64, 64, 52, 0, TAU)
  x.fill()
  x.fillStyle = '#ffffff'
  roundRect(x, 55, 22, 18, 58, 8)
  x.fill()
  x.beginPath()
  x.arc(64, 96, 10, 0, TAU)
  x.fill()
  return c
}
// The lectern monitor: a pass-check UI.
function paintScreen() {
  const c = canvas(256, 160)
  const x = c.getContext('2d')
  x.fillStyle = '#0b1530'
  x.fillRect(0, 0, 256, 160)
  x.fillStyle = '#1f7bff'
  x.fillRect(0, 0, 256, 30)
  x.fillStyle = '#ffffff'
  x.font = `700 20px ${FONT}`
  x.textBaseline = 'middle'
  x.fillText('PASS CHECK', 12, 16)
  for (let i = 0; i < 5; i++) {
    x.fillStyle = i === 2 ? '#ff3b4a' : '#3be38a'
    x.beginPath()
    x.arc(20, 50 + i * 22, 6, 0, TAU)
    x.fill()
    x.fillStyle = 'rgba(200,220,255,0.55)'
    x.fillRect(34, 46 + i * 22, 90 + ((i * 37) % 80), 8)
  }
  x.strokeStyle = '#ff3b4a'
  x.lineWidth = 4
  x.strokeRect(150, 92, 92, 34)
  x.fillStyle = '#ff3b4a'
  x.font = `700 18px ${FONT}`
  x.fillText('DENIED', 160, 110)
  return c
}

// --- Shared materials + geometry helpers ---------------------------------------------------------------
// Solid-colour parts carry their colour as a vertex colour, so a whole body segment bakes to a couple of
// draw calls (cloth / gloss / metal) however many little parts it has.
function tint(geo, hex) {
  const g = nonIndexed(geo)
  for (const n of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(n)) g.deleteAttribute(n)
  const c = new Color(hex)
  const n = g.attributes.position.count
  const a = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    a[i * 3] = c.r
    a[i * 3 + 1] = c.g
    a[i * 3 + 2] = c.b
  }
  g.setAttribute('color', new BufferAttribute(a, 3))
  return g
}
let MATS = null
function mats() {
  if (MATS) return MATS
  const print = paintPrint()
  const printTex = texOf(print.c)
  fontReady.then(() => {
    print.draw()
    printTex.needsUpdate = true
  })
  MATS = {
    cloth: new MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }),
    gloss: new MeshStandardMaterial({ vertexColors: true, roughness: 0.3 }),
    metal: new MeshStandardMaterial({ vertexColors: true, roughness: 0.26, metalness: 0.9 }),
    glass: new MeshStandardMaterial({ color: '#0a0b0f', roughness: 0.04, metalness: 1, side: DoubleSide }),
    hivis: new MeshStandardMaterial({ color: '#d4ff2e', emissive: '#4a6800', roughness: 0.45 }),
    coil: new MeshStandardMaterial({ color: '#d7e8f3', roughness: 0.12, transparent: true, opacity: 0.6 }),
    print: new MeshStandardMaterial({ map: printTex, roughness: 0.75 }),
    patch: new MeshStandardMaterial({ map: texOf(paintPatch()), roughness: 0.7, transparent: true, alphaTest: 0.5 }),
    screen: new MeshBasicMaterial({ map: texOf(paintScreen()) }),
    red: neon('#ff2b36', 3),
    green: neon('#2dff79', 2.4),
    amber: neon('#ffae1a', 3),
    blue: neon('#3aa0ff', 3.4),
    dark: new MeshStandardMaterial({ color: '#2a1012', roughness: 0.35 }),
    steel: new MeshStandardMaterial({ color: '#2b313d', roughness: 0.32, metalness: 0.6 }),
    chrome: new MeshStandardMaterial({ color: '#dfe5ee', roughness: 0.12, metalness: 1 }),
    black: new MeshStandardMaterial({ color: '#101216', roughness: 0.35 }),
  }
  return MATS
}
function part(parent, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new Mesh(geo, mat)
  m.position.set(x, y, z)
  m.rotation.set(rx, ry, rz)
  parent.add(m)
  return m
}
// A coiled cord (radio / earpiece) from a to b: a helix around the straight line.
function coil(a, b, turns, r = 0.011, tube = 0.0055) {
  const pts = []
  const n = Math.max(12, turns * 6)
  const dir = new Vector3().subVectors(b, a)
  const u = new Vector3(1, 0, 0)
  if (Math.abs(dir.clone().normalize().x) > 0.8) u.set(0, 0, 1)
  const v = new Vector3().crossVectors(dir, u).normalize()
  u.crossVectors(v, dir).normalize()
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const ang = t * turns * TAU
    const sag = Math.sin(t * Math.PI) * 0.02
    pts.push(new Vector3().lerpVectors(a, b, t).addScaledVector(u, Math.cos(ang) * r + sag).addScaledVector(v, Math.sin(ang) * r))
  }
  return new TubeGeometry(new CatmullRomCurve3(pts), n * 2, tube, 4, false)
}
function starGeo(R, r, depth) {
  const s = new Shape()
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5
    const rr = i % 2 ? r : R
    if (i === 0) s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr)
    else s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr)
  }
  s.closePath()
  return new ExtrudeGeometry(s, { depth, bevelEnabled: false })
}
function shieldGeo(w, h, depth) {
  const s = new Shape()
  s.moveTo(0, h / 2)
  s.lineTo(w / 2, h * 0.36)
  s.quadraticCurveTo(w / 2, -h * 0.2, 0, -h / 2)
  s.quadraticCurveTo(-w / 2, -h * 0.2, -w / 2, h * 0.36)
  s.closePath()
  return new ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 1 })
}
// Rounded "cylinder" head, like the passengers': u wraps round, the face at u 0.5 faces +Z.
function headGeo(r = 0.19, h = 0.36) {
  const e = 0.07
  const pts = [[0, -h / 2]]
  for (let i = 0; i <= 3; i++) {
    const a = -Math.PI / 2 + (i / 3) * (Math.PI / 2)
    pts.push([r - e + Math.cos(a) * e, -h / 2 + e + Math.sin(a) * e])
  }
  for (let i = 0; i <= 3; i++) {
    const a = (i / 3) * (Math.PI / 2)
    pts.push([r - e + Math.cos(a) * e, h / 2 - e + Math.sin(a) * e])
  }
  pts.push([0, h / 2])
  const g = lathe(pts, 18).rotateY(Math.PI)
  const p = g.attributes.position
  const uv = g.attributes.uv
  for (let i = 0; i < p.count; i++) uv.setY(i, (p.getY(i) + h / 2) / h)
  return g
}

// --- The guard model -------------------------------------------------------------------------------------
// Faces +Z, feet at the origin (before GUARDS.scale). Pivots: hips (bob) -> legs (hip joints), torso (waist)
// -> head (neck), shoulders -> elbows. Every segment is baked to a few meshes.
const COL = { shirt: '#24345c', vest: '#161a22', pants: '#1b2338', gold: '#e2b13c', black: '#0f1013', leather: '#1c1712', chrome: '#cfd5de', white: '#f1f3f6', cap: '#131a2c', glove: '#141518', sole: '#2a2b2e', stripe: '#d9a52c' }
function buildGuardModel(cfg, idx) {
  const M = mats()
  const skin = cfg.skin
  const root = new Group()
  const body = new Group()
  body.scale.setScalar(GUARDS.scale)
  root.add(body)
  const hips = new Group()
  body.add(hips)
  const torso = new Group()
  torso.position.y = 0.675
  hips.add(torso)
  const head = new Group()
  head.position.y = 0.675
  torso.add(head)
  const seg = (pivot, build) => {
    const tmp = new Group()
    build(tmp)
    const b = bake(tmp, true)
    pivot.add(b)
    return b
  }
  const C = (hex, g) => tint(g, hex)

  // Torso: shirt, hi-vis vest with SECURITY front + back, badge, name tag, epaulettes, shoulder mic with a
  // coiled cord to the belt radio, duty belt (buckle, radio, baton, pouches, flashlight).
  seg(torso, (T) => {
    part(T, C(COL.shirt, rbox(0.56, 0.675, 0.28, 0.06, 2)), M.cloth, 0, 0.3375, 0)
    part(T, C(COL.vest, rbox(0.585, 0.47, 0.305, 0.05, 2)), M.cloth, 0, 0.37, 0)
    for (const s of [1, -1]) {
      part(T, C(COL.vest, rbox(0.13, 0.2, 0.3, 0.03, 1)), M.cloth, s * 0.17, 0.6, 0)
      part(T, new BoxGeometry(0.035, 0.2, 0.31), M.hivis, s * 0.17, 0.6, 0)
      part(T, C(COL.shirt, rbox(0.16, 0.035, 0.22, 0.012, 1)), M.cloth, s * 0.21, 0.69, 0) // epaulette
      for (const z of [0.05, -0.02]) part(T, C(COL.gold, new BoxGeometry(0.16, 0.008, 0.018)), M.metal, s * 0.21, 0.709, z)
      part(T, C(COL.shirt, rbox(0.13, 0.06, 0.09, 0.02, 1)), M.cloth, s * 0.07, 0.68, 0.105, 0, 0, s * 0.45) // collar
    }
    for (const y of [0.27, 0.43]) part(T, rbox(0.592, 0.048, 0.312, 0.018, 1), M.hivis, 0, y, 0)
    part(T, new PlaneGeometry(0.36, 0.085), M.print, 0, 0.35, 0.1535)
    part(T, new PlaneGeometry(0.5, 0.11), M.print, 0, 0.35, -0.1535, 0, Math.PI, 0)
    part(T, C(COL.gold, shieldGeo(0.07, 0.085, 0.01)), M.metal, 0.16, 0.54, 0.152)
    part(T, C(COL.white, new BoxGeometry(0.12, 0.028, 0.01)), M.gloss, -0.15, 0.55, 0.155)
    part(T, C(COL.black, new BoxGeometry(0.1, 0.007, 0.004)), M.cloth, -0.15, 0.55, 0.161)
    part(T, C(skin, new CylinderGeometry(0.085, 0.09, 0.09, 12)), M.cloth, 0, 0.7, 0)
    // Shoulder mic + antenna, coiled cord down to the radio on the left hip.
    part(T, C(COL.black, rbox(0.055, 0.085, 0.04, 0.012, 1)), M.gloss, 0.17, 0.6, 0.168)
    part(T, C(COL.chrome, new BoxGeometry(0.036, 0.04, 0.006)), M.metal, 0.17, 0.6, 0.19)
    part(T, C(COL.black, pole(0.006, 0, 0.07, 6)), M.gloss, 0.19, 0.64, 0.168)
    part(T, coil(new Vector3(0.17, 0.555, 0.16), new Vector3(0.3, 0.08, 0.07), 16), M.coil)
    // Duty belt.
    part(T, C(COL.leather, new BoxGeometry(0.6, 0.085, 0.312)), M.gloss, 0, 0.03, 0)
    part(T, C(COL.chrome, rbox(0.1, 0.065, 0.02, 0.008, 1)), M.metal, 0, 0.03, 0.158)
    part(T, C(COL.black, rbox(0.065, 0.15, 0.085, 0.015, 1)), M.gloss, 0.32, 0.0, 0.03) // radio
    part(T, C(COL.black, pole(0.008, 0.075, 0.22, 6)), M.gloss, 0.32, 0, 0.05)
    part(T, C(COL.chrome, new CylinderGeometry(0.012, 0.012, 0.02, 8)), M.metal, 0.33, 0.085, 0.01)
    part(T, C(COL.chrome, new TorusGeometry(0.033, 0.008, 6, 14)), M.metal, -0.315, 0.03, 0.045, Math.PI / 2, 0, 0) // baton ring
    part(T, C(COL.black, pole(0.022, -0.42, 0.1, 10)), M.gloss, -0.318, 0, 0.05, 0, 0, 0.06) // baton
    part(T, C(COL.black, pole(0.016, 0, 0.11, 8)), M.gloss, -0.27, -0.06, 0.05, 0, 0, Math.PI / 2) // side handle
    part(T, C(COL.leather, rbox(0.11, 0.08, 0.06, 0.015, 1)), M.gloss, -0.12, 0.03, -0.17) // cuff case
    part(T, C(COL.leather, rbox(0.09, 0.08, 0.06, 0.015, 1)), M.gloss, 0.12, 0.03, -0.17)
    part(T, C(COL.leather, rbox(0.07, 0.1, 0.06, 0.015, 1)), M.gloss, 0.17, 0.0, 0.165) // flashlight pouch
    part(T, C(COL.chrome, pole(0.02, -0.02, 0.12, 10)), M.metal, 0.22, -0.04, 0.165)
  })

  // Head: face, wrap-around sunglasses, peaked cap with a gold cord + star badge, earpiece + coiled tube.
  const hc = 0.2 // head centre above the neck
  seg(head, (H) => {
    part(H, headGeo(), new MeshStandardMaterial({ map: texOf(paintGuardFace(skin, idx % 3)), roughness: 0.6 }), 0, hc, 0)
    part(H, new CylinderGeometry(0.2, 0.2, 0.068, 22, 1, true, -1.15, 2.3), M.glass, 0, hc + 0.03, 0)
    for (const s of [1, -1]) part(H, C(COL.black, new BoxGeometry(0.008, 0.014, 0.17)), M.gloss, s * 0.198, hc + 0.04, -0.07)
    part(H, C(COL.black, new BoxGeometry(0.03, 0.016, 0.02)), M.gloss, 0, hc + 0.048, 0.2)
    part(H, C(COL.cap, lathe([[0.205, 0], [0.208, 0.05], [0.238, 0.115], [0.244, 0.14], [0.19, 0.157], [0, 0.163]], 22)), M.cloth, 0, hc + 0.13, 0)
    part(H, C(COL.black, new CylinderGeometry(0.212, 0.21, 0.062, 22, 1, true)), M.gloss, 0, hc + 0.16, 0)
    part(H, C(COL.gold, new TorusGeometry(0.212, 0.0065, 5, 26)), M.metal, 0, hc + 0.188, 0, Math.PI / 2, 0, 0)
    part(H, C(COL.black, new CylinderGeometry(0.175, 0.175, 0.02, 18, 1, false, -Math.PI / 2, Math.PI).scale(1, 1, 0.8)), M.gloss, 0, hc + 0.14, 0.13, 0.2, 0, 0)
    part(H, C(COL.gold, starGeo(0.034, 0.015, 0.008)), M.metal, 0, hc + 0.235, 0.218, -0.32, 0, 0)
    part(H, C('#d9c8b2', new CylinderGeometry(0.024, 0.024, 0.03, 10)), M.gloss, -0.2, hc - 0.01, 0, 0, 0, Math.PI / 2)
    part(H, coil(new Vector3(-0.205, hc - 0.03, -0.02), new Vector3(-0.15, -0.06, -0.06), 11, 0.009, 0.005), M.coil)
  })

  // Legs: trousers with a gold side stripe and cargo pocket, boots with a sole and cuff.
  const legs = [1, -1].map((s) => {
    const g = new Group()
    g.position.set(s * 0.135, 0.675, 0)
    hips.add(g)
    seg(g, (L) => {
      part(L, C(COL.pants, rbox(0.26, 0.6, 0.27, 0.05, 1)), M.cloth, 0, -0.3, 0)
      part(L, C(COL.stripe, new BoxGeometry(0.012, 0.55, 0.03)), M.cloth, s * 0.131, -0.29, 0)
      part(L, C('#151c2e', rbox(0.03, 0.13, 0.15, 0.01, 1)), M.cloth, s * 0.138, -0.32, 0.02)
      part(L, C(COL.black, rbox(0.285, 0.19, 0.37, 0.05, 1)), M.gloss, 0, -0.58, 0.035)
      part(L, C(COL.sole, new BoxGeometry(0.295, 0.04, 0.38)), M.cloth, 0, -0.655, 0.035)
      part(L, C(COL.black, rbox(0.272, 0.04, 0.282, 0.015, 1)), M.gloss, 0, -0.49, 0)
    })
    return g
  })

  // Arms: shirt sleeves (rolled at the elbow), skin forearms, leather gloves; a patch on the left
  // sleeve, a watch on the left wrist, a whistle that appears in the right hand when blown.
  let whistle = null
  const arms = [1, -1].map((s) => {
    const sh = new Group()
    sh.rotation.order = 'YXZ'
    sh.position.set(s * 0.4, 0.62, 0)
    torso.add(sh)
    seg(sh, (A) => {
      part(A, C(COL.shirt, rbox(0.255, 0.16, 0.255, 0.06, 1)), M.cloth, 0, -0.03, 0)
      part(A, C(COL.shirt, rbox(0.235, 0.34, 0.235, 0.05, 1)), M.cloth, 0, -0.17, 0)
      if (s > 0) part(A, new PlaneGeometry(0.12, 0.12), M.patch, 0.1185, -0.11, 0, 0, Math.PI / 2, 0)
    })
    const el = new Group()
    el.position.y = -0.34
    sh.add(el)
    seg(el, (E) => {
      part(E, C(COL.shirt, rbox(0.248, 0.07, 0.248, 0.03, 1)), M.cloth, 0, -0.01, 0)
      part(E, C(skin, rbox(0.215, 0.26, 0.215, 0.05, 1)), M.cloth, 0, -0.15, 0)
      part(E, C(COL.glove, rbox(0.205, 0.16, 0.205, 0.07, 1)), M.gloss, 0, -0.36, 0)
      if (s > 0) {
        part(E, C(COL.black, new BoxGeometry(0.222, 0.035, 0.222)), M.gloss, 0, -0.255, 0)
        part(E, C(COL.chrome, new CylinderGeometry(0.03, 0.03, 0.012, 12)), M.metal, 0, -0.255, 0.112, Math.PI / 2, 0, 0)
      }
    })
    if (s < 0) {
      whistle = new Group()
      part(whistle, new CylinderGeometry(0.02, 0.02, 0.075, 10), M.chrome, 0, 0, 0, Math.PI / 2, 0, 0)
      part(whistle, new BoxGeometry(0.03, 0.02, 0.05), M.chrome, 0, 0.012, 0.045)
      whistle.position.set(0, -0.42, 0.07)
      whistle.visible = false
      el.add(whistle)
    }
    return { sh, el, s }
  })

  // Alert mark (yellow "!" = instructed, red = last warning / force).
  const marks = { yellow: texOf(paintMark('#ffb400')), red: texOf(paintMark('#ff2b36')) }
  const mark = new Sprite(new SpriteMaterial({ map: marks.yellow, transparent: true, depthWrite: false, depthTest: false }))
  mark.renderOrder = 21
  mark.scale.set(0.42, 0.42, 1)
  mark.position.y = 2.85
  mark.visible = false
  root.add(mark)
  return { root, body, hips, torso, head, legs, arms, whistle, mark, marks }
}

// --- Barriers ----------------------------------------------------------------------------------------------
const BEAMS_GATE = [0.32, 0.56, 0.8, 1.04]
const BEAMS_FENCE = [0.46, 0.86]
function beamMats() {
  return {
    core: neon('#ff2a36', 3.2, { transparent: true, opacity: 0.9, blending: AdditiveBlending, depthWrite: false }),
    halo: new MeshBasicMaterial({ color: '#ff3040', transparent: true, opacity: 0.16, blending: AdditiveBlending, depthWrite: false }),
  }
}
// A beam (core + halo) along Z from za to zb at height y.
function beam(parent, bm, x, y, za, zb) {
  const L = Math.abs(zb - za)
  const zc = (za + zb) / 2
  part(parent, new CylinderGeometry(0.01, 0.01, L, 6, 1, true), bm.core, x, y, zc, Math.PI / 2, 0, 0)
  part(parent, new CylinderGeometry(0.034, 0.034, L, 8, 1, true), bm.halo, x, y, zc, Math.PI / 2, 0, 0)
}
// Floor decal lying in XZ, its text reading for someone walking +X (text runs along +Z).
function floorDecal(scene, map, x, z, len, depth) {
  const g = new PlaneGeometry(len, depth).rotateX(-Math.PI / 2).rotateY(-Math.PI / 2)
  const m = new MeshStandardMaterial({ map, transparent: true, depthWrite: false, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 })
  const mesh = new Mesh(g, m)
  mesh.position.set(x, Y + 0.016, z)
  mesh.receiveShadow = true
  mesh.renderOrder = 2
  scene.add(mesh)
  return mesh
}
function decalTex(text) {
  const d = paintDecal(text)
  const t = texOf(d.c)
  fontReady.then(() => {
    d.draw()
    t.needsUpdate = true
  })
  return t
}

// Laser gate across a doorway: two scanner pedestals (status strips, reader, lens column), four beams,
// an energy curtain, a beacon, a floor decal, and the collider that only blocks a player who isn't allowed.
function buildGate(scene, cfg) {
  const M = mats()
  const x = cfg.x
  const z0 = Math.min(cfg.z0, cfg.z1)
  const z1 = Math.max(cfg.z0, cfg.z1)
  const zc = (z0 + z1) / 2
  const S = new Group()
  const strips = []
  const lenses = []
  for (const pz of [z0, z1]) {
    const inner = Math.sign(zc - pz)
    part(S, rbox(0.42, 0.06, 0.34, 0.02, 1), M.black, x, Y + 0.03, pz)
    part(S, rbox(0.34, 1.16, 0.26, 0.05, 2), M.steel, x, Y + 0.64, pz)
    part(S, rbox(0.36, 0.05, 0.28, 0.02, 1), M.chrome, x, Y + 1.245, pz)
    part(S, rbox(0.24, 0.022, 0.18, 0.01, 1), M.black, x, Y + 1.28, pz)
    part(S, new BoxGeometry(0.11, 0.006, 0.08), M.blue, x, Y + 1.293, pz) // pass reader
    part(S, new BoxGeometry(0.09, 0.98, 0.02), M.black, x, Y + 0.66, pz + inner * 0.135)
    for (const by of BEAMS_GATE) part(S, new CylinderGeometry(0.02, 0.02, 0.02, 10), M.chrome, x, Y + by, pz + inner * 0.146, Math.PI / 2, 0, 0)
    // "no entry" roundel on the approach face.
    part(S, new CylinderGeometry(0.06, 0.06, 0.006, 16), M.red, x - 0.173, Y + 1.0, pz, 0, 0, Math.PI / 2)
    part(S, new BoxGeometry(0.008, 0.022, 0.08), M.chrome, x - 0.177, Y + 1.0, pz)
  }
  const baked = bake(S, true)
  scene.add(baked)
  // Live parts: status strips (both faces of both pedestals), lens dots, beacon.
  for (const pz of [z0, z1]) {
    const inner = Math.sign(zc - pz)
    for (const sx of [-1, 1]) strips.push(part(scene, new BoxGeometry(0.012, 0.74, 0.03), M.red, x + sx * 0.172, Y + 0.56, pz))
    for (const by of BEAMS_GATE) lenses.push(part(scene, new CylinderGeometry(0.011, 0.011, 0.006, 8), M.red, x, Y + by, pz + inner * 0.157, Math.PI / 2, 0, 0))
  }
  const beacon = new Group()
  beacon.position.set(x, Y + 1.27, z1)
  scene.add(beacon)
  part(beacon, new CylinderGeometry(0.06, 0.07, 0.04, 14), M.black, 0, 0.02, 0)
  const dome = part(beacon, lathe([[0.058, 0], [0.058, 0.05], [0.045, 0.09], [0, 0.105]], 14), M.dark, 0, 0.04, 0)
  const fin = part(beacon, new BoxGeometry(0.07, 0.06, 0.012), M.chrome, 0, 0.08, 0)
  // Beams + curtain.
  const bm = beamMats()
  const beams = new Group()
  for (const by of BEAMS_GATE) beam(beams, bm, x, Y + by, z0 + 0.15, z1 - 0.15)
  scene.add(beams)
  const ctex = texOf(paintCurtain(), false)
  ctex.wrapS = ctex.wrapT = RepeatWrapping
  ctex.repeat.set(1, 5)
  const cmat = new MeshBasicMaterial({ map: ctex, color: '#ff3346', transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, side: DoubleSide })
  const curtain = part(scene, new PlaneGeometry(z1 - z0 - 0.3, 4.1), cmat, x, Y + 2.05, zc, 0, Math.PI / 2, 0)
  curtain.visible = false
  floorDecal(scene, decalTex(cfg.decal), x - 0.85, zc, z1 - z0 + 0.3, 1.0)
  // Pedestals are always solid; the laser plane only for a player who isn't allowed through.
  for (const pz of [z0, z1]) solidBox(0.17, 0.62, 0.13, x, Y + 0.62, pz)
  const collider = addFixed(RAPIER.ColliderDesc.cuboid(0.12, 2.3, (z1 - z0) / 2 - 0.12), { x, y: Y + 2.3, z: zc })
  return {
    kind: 'gate',
    x,
    z0,
    z1,
    collider,
    strips,
    lenses,
    beacon: { dome, fin },
    beams: [{ group: beams, z0, z1 }],
    bm,
    curtain,
    cmat,
    ctex,
    alarm: 0,
    flare: 0,
    green: 0,
  }
}

// Laser fence along a line of x (the screening lanes): chrome bollards with LED rings, two beams between
// each pair, a hazard stripe + decals on the floor; one long collider for a player who isn't allowed.
function buildFence(scene, cfg) {
  const M = mats()
  const x = cfg.x
  const posts = [...cfg.posts].sort((a, b) => b - a)
  const z0 = Math.min(cfg.z0, cfg.z1)
  const z1 = Math.max(cfg.z0, cfg.z1)
  const S = new Group()
  const R = new Group()
  for (const pz of posts) {
    part(S, lathe([[0, 0], [0.13, 0], [0.135, 0.012], [0.12, 0.03], [0.07, 0.045], [0, 0.05]], 16), M.black, x, Y, pz)
    part(S, pole(0.055, 0.04, 0.92, 12), M.chrome, x, Y, pz)
    part(S, lathe([[0.062, 0], [0.068, 0.03], [0.06, 0.07], [0.035, 0.1], [0, 0.11]], 14), M.steel, x, Y + 0.95, pz)
    for (const by of BEAMS_FENCE) for (const s of [-1, 1]) part(S, new BoxGeometry(0.05, 0.05, 0.04), M.black, x, Y + by, pz + s * 0.07)
    part(R, new TorusGeometry(0.062, 0.012, 6, 18), M.red, x, Y + 0.93, pz, Math.PI / 2, 0, 0)
    addFixed(RAPIER.ColliderDesc.cylinder(0.55, 0.08), { x, y: Y + 0.55, z: pz })
  }
  scene.add(bake(S, true))
  const ring = bake(R, false).children[0]
  scene.add(ring)
  const bm = beamMats()
  const beams = []
  for (let i = 0; i < posts.length - 1; i++) {
    const a = posts[i]
    const b = posts[i + 1]
    const g = new Group()
    for (const by of BEAMS_FENCE) beam(g, bm, x, Y + by, a - 0.1, b + 0.1)
    g.visible = false
    scene.add(g)
    beams.push({ group: g, z0: b, z1: a })
  }
  // Floor: a hazard stripe along the fence (outside), and two "wait to be called" decals.
  const ht = texOf(paintHazardTile())
  ht.wrapS = ht.wrapT = RepeatWrapping
  ht.repeat.set((z1 - z0) / 0.7, 1)
  floorDecal(scene, ht, x - 0.32, (z0 + z1) / 2, z1 - z0, 0.26)
  const dt = decalTex(cfg.decal)
  for (const z of [-20.0, -37.2]) floorDecal(scene, dt, x - 1.1, z, 3.4, 0.64)
  const collider = addFixed(RAPIER.ColliderDesc.cuboid(0.12, 2.3, (z1 - z0) / 2), { x, y: Y + 2.3, z: (z0 + z1) / 2 })
  return { kind: 'fence', x, z0, z1, collider, strips: [ring], lenses: [], beacon: null, beams, bm, curtain: null, alarm: 0, flare: 0, green: 0 }
}

// The guard's lectern: navy cabinet printed SECURITY, chrome top, a pass-check monitor facing the guard.
function buildLectern(scene, L) {
  const M = mats()
  const g = new Group()
  part(g, tint(rbox(0.66, 0.98, 0.46, 0.06, 2), '#1c2742'), M.cloth, 0, 0.49, 0)
  part(g, tint(new BoxGeometry(0.62, 0.08, 0.42), COL.black), M.gloss, 0, 0.04, 0)
  part(g, rbox(0.74, 0.05, 0.54, 0.02, 1), M.chrome, 0, 1.0, 0)
  part(g, new PlaneGeometry(0.5, 0.11), M.print, 0, 0.72, 0.2315)
  for (const s of [-1, 1]) part(g, new BoxGeometry(0.006, 0.06, 0.4), M.hivis, s * 0.331, 0.86, 0)
  part(g, tint(pole(0.02, 1.02, 1.18, 8), COL.black), M.gloss, 0, 0, -0.08)
  const mon = new Group()
  mon.position.set(0, 1.27, -0.1)
  mon.rotation.x = 0.3
  g.add(mon)
  part(mon, tint(rbox(0.36, 0.24, 0.035, 0.015, 1), COL.black), M.gloss, 0, 0, 0)
  part(mon, new PlaneGeometry(0.32, 0.2), M.screen, 0, 0, -0.019, 0, Math.PI, 0)
  part(g, tint(rbox(0.18, 0.02, 0.14, 0.008, 1), COL.black), M.gloss, 0.2, 1.035, 0.12)
  part(g, new BoxGeometry(0.12, 0.004, 0.012), M.red, 0.2, 1.047, 0.12)
  const b = bake(g, true)
  b.position.set(L.x, Y, L.z)
  b.rotation.y = L.face
  scene.add(b)
  solidBox(0.36, 0.55, 0.27, L.x, Y + 0.55, L.z, L.face)
}

// --- Gameplay ------------------------------------------------------------------------------------------------
export function createGuards({ scene, crowd, fx, hud, store, queue, security, boarding, flight, trolls, isPlaying }) {
  const M = mats()
  const timers = [] // game-time callbacks (setTimeout stalls in a throttled tab)
  const later = (sec, fn) => timers.push({ t: sec, fn })
  let time = 0
  let lastToast = -99
  let camRef = null
  const v1 = new Vector3()
  const vol = (x, z, base) => (camRef ? Math.max(0, base - camRef.position.distanceTo(v1.set(x, 1.5, z)) * 0.012) : base * 0.5)

  // Screen overlays: a red vignette (warnings, shoves) and a black fade (escorts). Self-contained CSS.
  if (!document.getElementById('guards-css')) {
    const st = document.createElement('style')
    st.id = 'guards-css'
    st.textContent = `.big.red{color:#ff4b4b}
.guard-vignette,.guard-fade{position:fixed;inset:0;pointer-events:none;opacity:0;z-index:4}
.guard-vignette{background:radial-gradient(ellipse at center,rgba(255,0,0,0) 42%,rgba(255,24,40,.6) 100%)}
.guard-fade{background:#05070c}`
    document.head.appendChild(st)
  }
  const vignette = document.createElement('div')
  vignette.className = 'guard-vignette'
  document.body.appendChild(vignette)
  const fade = document.createElement('div')
  fade.className = 'guard-fade'
  document.body.appendChild(fade)
  let vigA = 0
  const flashVignette = (a) => (vigA = Math.max(vigA, a))
  const setFade = (a, ms) => {
    fade.style.transition = `opacity ${ms}ms ease`
    fade.style.opacity = a
  }

  // --- Checkpoints, barriers, guards ---
  const cps = GUARDS.checkpoints.map((cfg, i) => {
    const barrier = cfg.gate ? buildGate(scene, cfg.gate) : buildFence(scene, cfg.fence)
    if (cfg.lectern) buildLectern(scene, cfg.lectern)
    const c = {
      cfg,
      need: NEED[cfg.need],
      zone: norm(cfg.zone),
      warn: norm(cfg.warn),
      chase: norm(cfg.chase),
      barrier,
      met: false,
      alert: 0, // 0 calm, 1 instructed, 2 last warning given
      strikes: 0,
      away: 99,
      lastInstruct: -99,
      lastWarn: -99,
      contactCd: 0,
      side: 0,
    }
    c.guard = makeGuard(cfg.guard, i, c)
    return c
  })
  // The boarding line's marshal (no barrier): posted at the VIP priority lane.
  const CUT = GUARDS.cutting
  const marshal = makeGuard(CUT.marshal, cps.length, null)
  const allGuards = [...cps.map((c) => c.guard), marshal]

  // --- Lines you could cut into: the path, its join zone, the system that runs it, its guard ---
  const BOARDING_BUSY = ['line', 'turn', 'scan', 'gate', 'bridge', 'gone']
  const lineDef = (id, points, jz, src, guard, active) => {
    const path = makePath(points)
    const jx = (jz.x0 + jz.x1) / 2
    const jzz = (jz.z0 + jz.z1) / 2
    return { id, path, jx, jz: jzz, sJoin: path.project(jx, jzz), src, guard, active, t: 0, s0: 0, warnedAt: -99, cool: 0, behind: [] }
  }
  const LINES = [
    lineDef('checkin', QUEUE.path, QUEUE.joinZone, queue, cps[0].guard, () => queue.mode === 'free'),
    lineDef('security', SECURITY.path, SECURITY.joinZone, security, cps[1].guard, () => queue.mode === 'checked' && (security.mode === 'free' || security.mode === 'off')),
    lineDef('boarding', GATES.linePath, GATES.joinZone, boarding, marshal, () => security.mode === 'cleared' && !BOARDING_BUSY.includes(boarding.mode)),
  ]
  const priority = { t: 0, warnedAt: -99, cool: 0 }

  function makeGuard(cfg, i, cp) {
    const m = buildGuardModel(cfg, i)
    m.root.position.set(cfg.x, Y, cfg.z)
    m.root.rotation.y = cfg.face
    scene.add(m.root)
    const kin = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(cfg.x, Y + 0.95, cfg.z))
    const col = world.createCollider(RAPIER.ColliderDesc.capsule(0.55, 0.36).setFriction(0), kin)
    const P = () => ({ legL: 0, legR: 0, lean: 0, twist: 0, hx: 0, hy: 0, hz: 0, bob: 0, aL: [0, 0, 0.08], aR: [0, 0, -0.08], eL: -0.15, eR: -0.15 })
    return {
      ...m,
      cp,
      post: { x: cfg.x, z: cfg.z, face: cfg.face },
      x: cfg.x,
      y: Y,
      z: cfg.z,
      yaw: cfg.face,
      speed: 0,
      phase: Math.random() * TAU,
      mode: 'post', // post | return | rush
      busy: false,
      goal: null,
      rush: null,
      gest: null, // { name, t, dur, arg }
      idle: 'rest',
      idleT: 4 + Math.random() * 5,
      watch: false,
      markT: 0,
      stepT: 0,
      dustT: 0,
      kin,
      col,
      colOn: true,
      pose: P(),
      tgt: P(),
    }
  }

  const say = (g, text, dur = 3) => crowd.say(g, text, dur)
  const gesture = (g, name, dur, arg) => (g.gest = { name, t: 0, dur, arg })
  const mark = (g, color, dur) => {
    g.mark.material.map = g.marks[color]
    g.mark.material.needsUpdate = true
    g.markT = dur
  }
  function goHome(g, delay = 0) {
    later(delay, () => {
      if (g.mode === 'rush') return
      g.busy = false
      g.mode = 'return'
      g.goal = { x: g.post.x, z: g.post.z, speed: GUARDS.walkSpeed, stop: 0.04, done: () => (g.mode = 'post') }
    })
  }
  function whistleFx(g, n = 1) {
    sfx('whistle', { vol: vol(g.x, g.z, 0.32), blasts: n })
    const fx0 = g.x + Math.sin(g.yaw) * 0.3
    const fz0 = g.z + Math.cos(g.yaw) * 0.3
    for (let k = 0; k < n; k++) later(k * 0.3, () => fx.sparkle(fx0, Y + 1.95, fz0, { count: 8, color: '#ffffff', size: 0.16, speed: 1.6, up: 0.6, life: 0.5, grav: 0 }))
  }

  // --- Escalation ---
  function instruct(c) {
    const g = c.guard
    c.alert = Math.max(c.alert, 1)
    c.lastInstruct = time
    g.watch = true
    gesture(g, 'whistle', 0.75)
    whistleFx(g)
    mark(g, 'yellow', 3.5)
    later(0.75, () => {
      if (!g.busy) gesture(g, 'point', 2.6, c.cfg.goTo)
      say(g, pick(c.cfg.instruct), 3.6)
      sfx('talk', { vol: 0.08, f: 300 })
    })
    if (time - lastToast > 12) {
      lastToast = time
      hud.toast(c.cfg.toast)
    }
  }
  function lastWarning(c) {
    const g = c.guard
    c.alert = 2
    c.lastWarn = time
    g.watch = true
    gesture(g, 'stop', 2.6)
    whistleFx(g, 2)
    later(0.55, () => sfx('radio', { vol: vol(g.x, g.z, 0.28) }))
    mark(g, 'red', 4)
    say(g, pick(GUARDS.lastWarning), 3.2)
    hud.big('LAST WARNING!', 'red', 1.6)
    c.barrier.alarm = Math.max(c.barrier.alarm, 1.6)
    flashVignette(0.45)
  }
  function force(c) {
    const g = c.guard
    g.busy = true
    mark(g, 'red', 4)
    say(g, pick(GUARDS.force), 2.6)
    sfx('hey', { vol: vol(g.x, g.z, 0.4) })
    c.barrier.alarm = Math.max(c.barrier.alarm, 2)
    rush(g, c, () => shove(c), true)
  }
  // Run at the player. atBarrier: stand between the player and the barrier (to push them away from it).
  function rush(g, c, onReach, atBarrier) {
    g.mode = 'rush'
    g.goal = null
    g.rush = { t: 0, onReach, atBarrier }
    setGuardSolid(g, false)
  }
  function shove(c) {
    const g = c.guard
    g.mode = 'post'
    g.rush = null
    gesture(g, 'shove', 0.85)
    sfx('grunt', { vol: vol(g.x, g.z, 0.4) })
    later(0.28, () => {
      const pp = player.position
      let dx = pp.x - g.x
      let dz = pp.z - g.z
      const d = Math.hypot(dx, dz)
      if (d < 2.3) {
        // Away from the guard, biased out through the barrier's outside (-X).
        dx = (d > 1e-3 ? dx / d : -1) * 0.45 - 1
        dz = d > 1e-3 ? (dz / d) * 0.45 : 0
        const n = Math.hypot(dx, dz)
        knockback(dx / n, dz / n, g)
      } else say(g, 'Hmph. And stay back!', 2)
      goHome(g, 1.1)
      later(1.3, () => say(g, pick(c.cfg.instruct), 3.2))
    })
  }
  function knockback(nx, nz, g) {
    const S = GUARDS.shove
    player.auto = null
    player.velocity.x = nx * S.speed
    player.velocity.z = nz * S.speed
    player.velocity.y = S.up
    player.stun = S.stun
    player.facing = Math.atan2(-nx, -nz) // flies back facing the guard
    const pp = player.position
    const mx = (pp.x + g.x) / 2
    const mz = (pp.z + g.z) / 2
    sfx('shove', { vol: 0.7 })
    fx.sparkle(mx, pp.y + 1.25, mz, { count: 28, color: '#fff2a0', size: 0.32, speed: 6.5, up: 2.2, life: 0.55, grav: 4 })
    fx.sparkle(mx, pp.y + 1.25, mz, { count: 10, color: '#ffffff', size: 0.5, speed: 3, up: 1, life: 0.3, grav: 0 })
    fx.puff(pp.x, pp.y + 0.1, pp.z, { count: 18, size: 0.45, grow: 3, spread: 0.6, up: 0.5, speed: 3, life: 0.9, alpha: 0.45, color: '#d2cbc0' })
    trolls?.shake?.(0.32, 0.5)
    flashVignette(0.7)
    hud.big('PUSHED BACK!', 'red', 1.3)
    dizzy = 1.8
    later(0.55, () => fx.puff(player.position.x, player.position.y + 0.08, player.position.z, { count: 14, size: 0.4, grow: 2.6, spread: 0.5, up: 0.3, speed: 2.4, life: 0.8, alpha: 0.4, color: '#d2cbc0' }))
  }

  // --- Breaches (the player inside a closed zone) ---
  let breach = null
  function startBreach(inner, outer) {
    const g = inner.guard
    breach = { inner, outer, done: false }
    inner.barrier.alarm = Math.max(inner.barrier.alarm, 3)
    sfx('siren', { vol: 0.26 })
    mark(g, 'red', 5)
    hud.big('STOP!', 'red', 1.2)
    flashVignette(0.5)
    g.busy = true
    g.watch = true
    const pp = player.position
    if (inBox(inner.chase, pp.x, pp.z)) {
      say(g, pick(GUARDS.breach), 2.6)
      sfx('hey', { vol: vol(g.x, g.z, 0.4) })
      rush(g, inner, () => {
        g.mode = 'post'
        g.rush = null
        gesture(g, 'grab', 0.9)
        sfx('grunt', { vol: 0.4 })
        player.stun = 0.9
        player.velocity.x = player.velocity.z = 0
        fx.puff(pp.x, pp.y + 0.1, pp.z, { count: 10, size: 0.4, spread: 0.4, speed: 2, life: 0.7, alpha: 0.4 })
        later(0.5, () => escort())
      }, false)
    } else {
      // Out of reach (behind a door): radio it in, the player is escorted out.
      gesture(g, 'radio', 1.6)
      say(g, pick(GUARDS.radio), 2.6)
      sfx('radio', { vol: 0.3 })
      later(1.5, () => escort())
    }
  }
  function escort() {
    if (!breach || breach.done) return
    breach.done = true
    const { inner, outer } = breach
    const pp = player.position
    // Got out on their own in the meantime: let them go.
    if (!inBox(inner.zone, pp.x, pp.z) && !inBox(outer.zone, pp.x, pp.z)) {
      say(inner.guard, 'And stay out!', 2.2)
      goHome(inner.guard, 0.4)
      breach = null
      return
    }
    player.stun = 0.6
    setFade(1, 220)
    sfx('whoosh', { vol: 0.5, dur: 0.4 })
    later(0.3, () => {
      const s = outer.cfg.safe
      const to = outer.cfg.goTo
      fx.puff(player.position.x, player.position.y + 0.8, player.position.z, { count: 14, color: '#ffffff', size: 0.5, alpha: 0.6, life: 0.7, speed: 2 })
      resetPlayer({ x: s.x, y: Y + 0.02, z: s.z }, Math.atan2(to.x - s.x, to.z - s.z))
      syncYawToPlayer()
      // The guard of the outer checkpoint is there to see you off.
      const og = outer.guard
      if (og !== inner.guard && !og.busy) {
        og.watch = true
        gesture(og, 'point', 2.4, to)
        mark(og, 'red', 3)
        later(0.6, () => say(og, pick(outer.cfg.instruct), 3.2))
      }
      later(0.15, () => {
        setFade(0, 450)
        fx.sparkle(s.x, Y + 1, s.z, { count: 24, color: '#ff6b6b', speed: 4 })
        fx.puff(s.x, Y + 0.1, s.z, { count: 12, size: 0.45, spread: 0.5, speed: 2, life: 0.8, alpha: 0.4 })
      })
      hud.big('ESCORTED OUT!', 'red', 1.8)
      hud.toast(outer.cfg.toast)
      outer.alert = 2
      outer.strikes = Math.max(outer.strikes, 2)
      goHome(inner.guard, 0.6)
      breach = null
    })
  }

  // A player who is allowed walks through: chime, green sparkles, and maybe a word from the guard.
  function passed(c) {
    const b = c.barrier
    const pp = player.position
    b.green = 0.7
    sfx('scanOk', { vol: 0.3 })
    fx.sparkle(b.x, Y + 1.2, clamp(pp.z, b.z0, b.z1), { count: 16, color: '#4dff8a', size: 0.28, speed: 3, up: 2, life: 0.7 })
    const g = c.guard
    if (!g.busy && Math.random() < 0.65 && Math.hypot(g.x - pp.x, g.z - pp.z) < 9) {
      say(g, pick(GUARDS.pass), 2.2)
      gesture(g, 'usher', 1.4)
    }
    c.alert = 0
    c.strikes = 0
  }

  function setGuardSolid(g, on) {
    if (on === g.colOn) return
    g.colOn = on
    g.col.setEnabled(on)
  }

  // --- Barrier visuals ---
  function updateBarrier(c, dt, t) {
    const b = c.barrier
    const pp = player.position
    const locked = !c.met
    b.collider.setEnabled(locked)
    b.alarm = Math.max(0, b.alarm - dt)
    b.flare = Math.max(0, b.flare - dt * 2.2)
    b.green = Math.max(0, b.green - dt)
    const flash = b.alarm > 0 && Math.floor(t * 8) % 2 === 0
    const stripMat = b.green > 0 || !locked ? M.green : flash ? M.dark : M.red
    for (const s of b.strips) s.material = stripMat
    for (const l of b.lenses) l.material = locked ? M.red : M.dark
    if (b.beacon) {
      const on = b.alarm > 0
      b.beacon.dome.material = on ? (flash ? M.red : M.amber) : M.dark
      b.beacon.fin.rotation.y += dt * (on ? 14 : 0)
      if (on && Math.random() < dt * 6) fx.sparkle(b.x, Y + 1.38, b.z1, { count: 1, color: '#ffb020', size: 0.22, speed: 1, up: 1.2, life: 0.4, grav: 1 })
    }
    // Beams: shown while locked, near the player; a passenger crossing makes them step aside.
    const dPlayer = Math.abs(pp.x - b.x)
    const pin = pp.z > b.z0 - 1 && pp.z < b.z1 + 1
    for (const seg of b.beams) {
      let npc = false
      for (const n of crowd.list) {
        if (Math.abs(n.x - b.x) < 1.1 && n.z > seg.z0 - 0.2 && n.z < seg.z1 + 0.2) {
          npc = true
          break
        }
      }
      const near = Math.hypot(dPlayer, Math.max(0, seg.z0 - pp.z, pp.z - seg.z1))
      const show = locked && (b.kind === 'gate' ? near < 16 : near < 7) && (!npc || near < 2.2)
      seg.group.visible = show
    }
    b.bm.core.opacity = 0.75 + Math.sin(t * 31) * 0.08 + b.flare * 0.25
    b.bm.halo.opacity = 0.14 + Math.sin(t * 13) * 0.03 + b.flare * 0.3
    if (b.curtain) {
      const prox = locked && pin ? clamp(1 - dPlayer / 3.4, 0, 1) : 0
      const a = Math.min(0.85, prox * 0.3 + b.flare * 0.7)
      b.cmat.opacity = a
      b.curtain.visible = a > 0.01
      b.ctex.offset.y = (b.ctex.offset.y + dt * 0.7) % 1
    }
  }
  function zap(c) {
    const b = c.barrier
    const pp = player.position
    const z = clamp(pp.z, b.z0 + 0.15, b.z1 - 0.15)
    const y = pp.y + 0.9
    b.flare = 1
    b.alarm = Math.max(b.alarm, 1)
    sfx('laserZap', { vol: 0.35 })
    later(0.08, () => sfx('deny', { vol: 0.25 }))
    fx.sparkle(b.x, y, z, { count: 18, color: '#ff3a3a', size: 0.26, speed: 3.8, up: 1.6, life: 0.45, grav: 5 })
    fx.sparkle(b.x, y, z, { count: 6, color: '#ffffff', size: 0.2, speed: 2.2, up: 1, life: 0.3, grav: 2 })
    fx.puff(b.x - 0.1, y, z, { count: 4, size: 0.25, grow: 2, spread: 0.15, up: 0.4, speed: 0.6, life: 0.6, alpha: 0.3, color: '#9a9aa6' })
  }

  // --- Approach logic: instruct -> last warning -> force ---
  function approach(c, dt) {
    const g = c.guard
    const pp = player.position
    const lineMode = c.cfg.id === 'lanes' && security.mode === 'line'
    const inWarn = inBox(c.warn, pp.x, pp.z) && !player.auto && !lineMode
    c.contactCd = Math.max(0, c.contactCd - dt)
    if (!inWarn) {
      c.away += dt
      if (c.away > 2.5 && !(g.watchT > 0)) g.watch = false
      if (c.away > GUARDS.calmAfter) {
        c.alert = 0
        c.strikes = 0
      }
      return
    }
    c.away = 0
    g.watch = true
    if (g.busy) return
    const b = c.barrier
    const out = b.x - pp.x // > 0 on the outside
    const inSpan = pp.z > b.z0 - 0.4 && pp.z < b.z1 + 0.4
    const touching = inSpan && out < GUARDS.contact && out > -0.6
    if (touching && c.contactCd <= 0) {
      c.contactCd = 1.3
      c.strikes++
      zap(c)
      if (c.alert < 1) instruct(c)
      else if (c.alert < 2) lastWarning(c)
      else if (time - c.lastWarn > 1) force(c)
      return
    }
    if (time - c.lastInstruct > GUARDS.instructEvery && c.alert < 2) instruct(c)
  }

  // --- Cutting in line ---
  const tmpP = {}
  const members = []
  // Standing in a line's lane ahead of someone waiting in it (without having joined): cutting.
  function cutCheck(L) {
    const pp = player.position
    const s = L.path.project(pp.x, pp.z)
    if (s < L.sJoin + CUT.pastJoin) return -1
    L.path.at(s, tmpP)
    if (Math.hypot(tmpP.x - pp.x, tmpP.z - pp.z) > CUT.laneHalf) return -1
    L.behind.length = 0
    members.length = 0
    L.src.lineNpcs(members)
    for (const n of members) {
      if (n.active === false) continue
      const ns = L.path.project(n.x, n.z)
      if (ns < s - 0.5) L.behind.push([s - ns, n])
    }
    return L.behind.length ? s : -1
  }
  function watchLine(L, dt) {
    if (L.cool > 0) {
      L.cool -= dt
      return
    }
    const s = L.active() && !player.auto ? cutCheck(L) : -1
    if (s < 0) {
      L.t = 0
      return
    }
    if (L.t === 0) L.s0 = s
    L.t += dt
    if (L.t > 0.25 && time - L.warnedAt > 8) complain(L)
    if (L.t > 0.9 && (L.t > CUT.loiter || s - L.s0 > CUT.forward)) {
      L.t = 0
      L.cool = 4
      sendBack(L, pick(CUT.sent))
    }
  }
  // The people you cut in front of turn and complain (bots only: real players speak for themselves),
  // the line's guard whistles and points to the back.
  function complain(L) {
    L.warnedAt = time
    const pp = player.position
    L.behind.sort((a, b) => a[0] - b[0])
    let k = 0
    for (const [, n] of L.behind) {
      if (n.slot === undefined || k >= 3) continue
      const nn = n
      n.yaw = Math.atan2(pp.x - n.x, pp.z - n.z)
      later(k * 0.45, () => crowd.say(nn, pick(CUT.complain), 2.6))
      k++
    }
    sfx('boo', { vol: 0.22 })
    hud.big('NO CUTTING!', 'red', 1.3)
    flashVignette(0.3)
    if (time - lastToast > 6) {
      lastToast = time
      hud.toast(CUT.toast)
    }
    const g = L.guard
    if (!g.busy) {
      g.watch = true
      g.watchT = 4
      whistleFx(g)
      mark(g, 'yellow', 3.5)
      gesture(g, 'whistle', 0.7)
      later(0.7, () => {
        if (!g.busy) gesture(g, 'point', 2.4, { x: L.jx, z: L.jz })
        say(g, pick(CUT.shout), 3)
      })
    }
  }
  // Escorted to the back of the line (its join zone, where the line system picks you up).
  function sendBack(L, line) {
    const g = L.guard
    const face = (L.path.at(L.sJoin + 1.5, tmpP), Math.atan2(tmpP.x - L.jx, tmpP.z - L.jz))
    if (!g.busy) {
      mark(g, 'red', 3)
      say(g, line, 3)
      whistleFx(g, 2)
    }
    relocate(L.jx, L.jz, face, 'BACK OF THE LINE!')
  }
  function relocate(x, z, face, bigText) {
    player.stun = 0.6
    player.auto = null
    setFade(1, 220)
    sfx('whoosh', { vol: 0.5, dur: 0.4 })
    later(0.3, () => {
      fx.puff(player.position.x, player.position.y + 0.8, player.position.z, { count: 14, color: '#ffffff', size: 0.5, alpha: 0.6, life: 0.7, speed: 2 })
      resetPlayer({ x, y: Y + 0.02, z }, face)
      syncYawToPlayer()
      hud.big(bigText, 'red', 1.6)
      later(0.15, () => {
        setFade(0, 450)
        fx.sparkle(x, Y + 1, z, { count: 24, color: '#ff6b6b', speed: 4 })
        fx.puff(x, Y + 0.1, z, { count: 12, size: 0.45, spread: 0.5, speed: 2, life: 0.8, alpha: 0.4 })
      })
    })
  }
  // The VIP priority lane at the gate: VIPs only.
  function watchPriority(dt) {
    if (priority.cool > 0) {
      priority.cool -= dt
      return
    }
    const pp = player.position
    const P = CUT.priority
    const inside = inBox(P, pp.x, pp.z) && !player.auto && !store.has('vip') && !BOARDING_BUSY.includes(boarding.mode)
    if (!inside) {
      priority.t = 0
      return
    }
    priority.t += dt
    const g = marshal
    if (priority.t > 0.2 && time - priority.warnedAt > 6) {
      priority.warnedAt = time
      g.watch = true
      g.watchT = 4
      whistleFx(g)
      mark(g, 'yellow', 3)
      gesture(g, 'stop', 1.6)
      say(g, pick(CUT.priorityShout), 3)
      hud.big('VIP ONLY!', 'red', 1.2)
      hud.toast(CUT.priorityToast)
    }
    if (priority.t > CUT.priorityLoiter) {
      priority.t = 0
      priority.cool = 4
      sendBack(LINES[2], pick(CUT.sent))
    }
  }

  // --- Guard motion + pose ---
  function stepGuard(g, dt, t) {
    const pp = player.position
    let moving = 0
    // Rushing the player.
    if (g.mode === 'rush' && g.rush) {
      const r = g.rush
      r.t += dt
      const c = g.cp
      let tx = pp.x
      let tz = pp.z
      if (r.atBarrier) tx = Math.min(pp.x + 0.95, c.barrier.x - 0.25)
      tx = clamp(tx, c.chase.x0, c.chase.x1)
      tz = clamp(tz, c.chase.z0, c.chase.z1)
      const dx = tx - g.x
      const dz = tz - g.z
      const d = Math.hypot(dx, dz)
      const dp = Math.hypot(pp.x - g.x, pp.z - g.z)
      if (dp < 1.3 || d < 0.2) r.onReach()
      else if (r.t > 3.6 || !inBox(c.chase, pp.x, pp.z)) {
        g.mode = 'post'
        g.rush = null
        say(g, 'Hmph. Not worth it.', 2)
        if (breach && breach.inner === c) later(0.4, () => escort())
        goHome(g, 0.3)
      } else {
        const step = Math.min(d, GUARDS.runSpeed * dt)
        g.x += (dx / d) * step
        g.z += (dz / d) * step
        moving = step / dt
        g.yaw = angTo(g.yaw, Math.atan2(dx, dz), dt * 12)
      }
    } else if (g.goal) {
      const dx = g.goal.x - g.x
      const dz = g.goal.z - g.z
      const d = Math.hypot(dx, dz)
      if (d <= g.goal.stop) {
        const done = g.goal.done
        g.goal = null
        done?.()
      } else {
        const step = Math.min(d, g.goal.speed * dt)
        g.x += (dx / d) * step
        g.z += (dz / d) * step
        moving = step / dt
        g.yaw = angTo(g.yaw, Math.atan2(dx, dz), dt * 8)
      }
    }
    // Facing when standing: the player while watching, else the post direction.
    if (!moving) {
      const face = g.watch ? Math.atan2(pp.x - g.x, pp.z - g.z) : g.post.face
      g.yaw = angTo(g.yaw, face, dt * 5)
    }
    g.speed += (moving - g.speed) * damp(10, dt)
    // Effects while running: dust + boots.
    if (g.speed > 3) {
      g.dustT -= dt
      if (g.dustT <= 0) {
        g.dustT = 0.09
        fx.puff(g.x, Y + 0.05, g.z, { count: 2, size: 0.28, grow: 2.2, spread: 0.15, up: 0.25, speed: 0.6, life: 0.5, alpha: 0.28, color: '#cfc9c0' })
      }
    }
    // Idle variety.
    g.idleT -= dt
    if (g.idleT <= 0) {
      g.idleT = 6 + Math.random() * 6
      g.idle = pick(['rest', 'rest', 'crossed', 'radio', 'scan'])
      if (g.idle === 'radio' && !g.watch && Math.random() < 0.5) sfx('radio', { vol: vol(g.x, g.z, 0.12) })
    }
    if (g.gest) {
      g.gest.t += dt
      if (g.gest.t >= g.gest.dur) g.gest = null
    }
    if (g.watchT > 0) {
      g.watchT -= dt
      if (g.watchT <= 0 && !g.cp) g.watch = false
    }
    if (g.markT > 0) g.markT -= dt
    g.mark.visible = g.markT > 0
    if (g.mark.visible) g.mark.scale.setScalar(0.42 + Math.sin(t * 9) * 0.03)
    pose(g, dt, t, moving)
    // Place the model + its body.
    g.root.position.set(g.x, Y, g.z)
    g.root.rotation.y = g.yaw
    g.kin.setNextKinematicTranslation({ x: g.x, y: Y + 0.95, z: g.z })
    const dp = Math.hypot(pp.x - g.x, pp.z - g.z)
    setGuardSolid(g, g.mode !== 'rush' && !g.busy ? dp > 1.25 || g.colOn : false)
  }

  function pose(g, dt, t, moving) {
    const T = g.tgt
    T.legL = T.legR = T.lean = T.twist = T.hx = T.hy = T.hz = 0
    T.bob = Math.sin(t * 1.7 + g.phase) * 0.006
    T.aL[0] = 0
    T.aL[1] = 0
    T.aL[2] = 0.08
    T.aR[0] = 0
    T.aR[1] = 0
    T.aR[2] = -0.08
    T.eL = T.eR = -0.15
    const sp = g.speed
    if (sp > 0.2) {
      g.phase += dt * (2.4 + sp * 1.25)
      const run = clamp((sp - 2.6) / 3, 0, 1)
      const sw = Math.sin(g.phase)
      const amp = 0.5 + run * 0.4
      T.legL = sw * amp
      T.legR = -sw * amp
      T.aL[0] = -sw * (0.45 + run * 0.55)
      T.aR[0] = sw * (0.45 + run * 0.55)
      T.eL = T.eR = -0.25 - run * 1.15
      T.lean = run * 0.24
      T.bob = Math.abs(Math.cos(g.phase)) * (0.025 + run * 0.05)
      // Boot steps on each footfall.
      const foot = Math.floor(g.phase / Math.PI)
      if (foot !== g.stepT) {
        g.stepT = foot
        sfx('bootStep', { vol: vol(g.x, g.z, 0.3) * (0.5 + run * 0.6) })
      }
    } else if (!g.gest) {
      switch (g.watch ? 'crossed' : g.idle) {
        case 'rest': // hands behind the back
          T.aL[0] = T.aR[0] = 0.5
          T.aL[2] = -0.2
          T.aR[2] = 0.2
          T.eL = T.eR = -0.4
          T.hy = Math.sin(t * 0.4 + g.phase) * 0.35
          break
        case 'crossed':
          T.aL[0] = T.aR[0] = -0.72
          T.aL[2] = -0.5
          T.aR[2] = 0.5
          T.eL = T.eR = -1.8
          break
        case 'radio':
          T.aL[0] = -0.95
          T.aL[2] = -0.55
          T.eL = -2.05
          T.hz = -0.18
          T.hx = 0.1
          break
        case 'scan':
          T.aL[0] = T.aR[0] = 0.45
          T.aL[2] = -0.2
          T.aR[2] = 0.2
          T.eL = T.eR = -0.4
          T.hy = Math.sin(t * 0.9 + g.phase) * 0.9
          break
      }
    }
    // Gestures.
    const G = g.gest
    g.whistle.visible = !!G && G.name === 'whistle'
    if (G) {
      const k = G.t
      switch (G.name) {
        case 'whistle':
          T.aR[0] = -0.75
          T.aR[2] = 0.42
          T.eR = -2.35
          T.aL[0] = -0.1
          T.aL[2] = 0.45
          T.eL = -1.6
          T.hx = -0.12
          break
        case 'stop': {
          T.aR[0] = -1.5
          T.aR[2] = 0.05
          T.eR = -0.12 + Math.sin(k * 14) * 0.08
          T.aL[0] = -0.1
          T.aL[2] = 0.5
          T.eL = -1.6
          T.lean = 0.06
          break
        }
        case 'point': {
          const to = G.arg
          const rel = to ? clamp(wrap(Math.atan2(to.x - g.x, to.z - g.z) - g.yaw), -1.4, 1.4) : 0
          T.aL[0] = -1.42
          T.aL[1] = rel
          T.aL[2] = 0
          T.eL = -0.06
          T.aR[0] = -0.1
          T.aR[2] = -0.5
          T.eR = -1.6
          T.hy = rel * 0.5
          break
        }
        case 'radio':
          T.aL[0] = -0.95
          T.aL[2] = -0.55
          T.eL = -2.05
          T.hz = -0.2
          T.aR[0] = -1.3
          T.eR = -0.2
          break
        case 'shove':
          if (k < 0.28) {
            T.aL[0] = T.aR[0] = -0.7
            T.aL[2] = -0.15
            T.aR[2] = 0.15
            T.eL = T.eR = -1.9
            T.lean = -0.14
          } else if (k < 0.6) {
            T.aL[0] = T.aR[0] = -1.55
            T.aL[2] = -0.12
            T.aR[2] = 0.12
            T.eL = T.eR = -0.05
            T.lean = 0.38
            T.legL = 0.45
            T.legR = -0.35
          }
          break
        case 'grab':
          T.aL[0] = T.aR[0] = -1.25
          T.aL[2] = -0.18
          T.aR[2] = 0.18
          T.eL = T.eR = -0.45
          T.lean = 0.2
          break
        case 'usher': {
          const sweep = Math.sin(Math.min(1, k / G.dur) * Math.PI)
          T.aR[0] = -1.25
          T.aR[1] = -0.2 - sweep * 1.0
          T.eR = -0.2
          T.hx = Math.sin(k * 8) * 0.06
          break
        }
      }
    }
    // Head tracks the player while watching (within the neck's reach).
    if (g.watch && (!G || G.name !== 'point')) {
      const pp = player.position
      const rel = wrap(Math.atan2(pp.x - g.x, pp.z - g.z) - g.yaw)
      T.hy = clamp(rel, -1.0, 1.0)
      T.hx = clamp(-(pp.y + 1.5 - (Y + 2)) / Math.max(1, Math.hypot(pp.x - g.x, pp.z - g.z)), -0.35, 0.35)
    }
    // Smooth toward the target, then apply.
    const P = g.pose
    const k = damp(G && (G.name === 'shove' || G.name === 'grab') ? 22 : 11, dt)
    for (const key of ['legL', 'legR', 'lean', 'twist', 'hx', 'hy', 'hz', 'bob', 'eL', 'eR']) P[key] += (T[key] - P[key]) * k
    for (let i = 0; i < 3; i++) {
      P.aL[i] += (T.aL[i] - P.aL[i]) * k
      P.aR[i] += (T.aR[i] - P.aR[i]) * k
    }
    g.legs[0].rotation.x = P.legL
    g.legs[1].rotation.x = P.legR
    g.hips.position.y = P.bob
    g.torso.rotation.x = P.lean
    g.torso.rotation.y = P.twist
    g.head.rotation.set(P.hx - P.lean * 0.6, P.hy, P.hz)
    g.arms[0].sh.rotation.set(P.aL[0], P.aL[1], P.aL[2])
    g.arms[1].sh.rotation.set(P.aR[0], P.aR[1], P.aR[2])
    g.arms[0].el.rotation.x = P.eL
    g.arms[1].el.rotation.x = P.eR
  }

  // --- Frame ---
  let dizzy = 0
  function stage() {
    if (flight.active) return 3
    if (security.mode === 'cleared' || (boarding.mode && boarding.mode !== 'off')) return 3
    if (SCREENING.includes(security.mode)) return 2
    if (queue.mode === 'checked') return 1
    return 0
  }

  const api = {
    checkpoints: cps,
    lines: LINES,
    marshal,
    update(dt, t, camera) {
      camRef = camera
      time += dt
      for (let i = timers.length - 1; i >= 0; i--) {
        timers[i].t -= dt
        if (timers[i].t <= 0) timers.splice(i, 1)[0].fn()
      }
      const st = stage()
      const pp = player.position
      for (const c of cps) c.met = st >= c.need
      for (const c of cps) updateBarrier(c, dt, t)
      // Walking through a barrier you're allowed through.
      for (const c of cps) {
        const b = c.barrier
        const inSpan = pp.z > b.z0 - 0.3 && pp.z < b.z1 + 0.3 && Math.abs(pp.x - b.x) < 2
        const side = inSpan ? Math.sign(pp.x - b.x) : 0
        if (c.met && c.side < 0 && side > 0) passed(c)
        if (side) c.side = side
        else if (Math.abs(pp.x - b.x) > 3) c.side = 0
      }
      const active = isPlaying() && !flight.active && !player.frozen && pp.y < 40
      if (active && !breach) {
        // Inside a closed zone: the innermost one's guard responds, out to the outermost one's safe spot.
        let inner = null
        let outer = null
        for (const c of cps) {
          if (c.met || !inBox(c.zone, pp.x, pp.z)) continue
          if (!outer) outer = c
          inner = c
        }
        if (inner) startBreach(inner, outer)
        else {
          for (const c of cps) if (!c.met) approach(c, dt)
          for (const L of LINES) watchLine(L, dt)
          watchPriority(dt)
        }
      }
      for (const g of allGuards) {
        // Cull guards far from the camera.
        const far = camera.position.distanceToSquared(v1.set(g.x, 1, g.z)) > 85 * 85
        g.root.visible = !far
        stepGuard(g, dt, t)
      }
      // Dizzy stars after a shove; vignette fade.
      if (dizzy > 0) {
        dizzy -= dt
        const p = player.renderPosition
        for (let k = 0; k < 3; k++) {
          const a = t * 7 + (k * TAU) / 3
          fx.sparkle(p.x + Math.cos(a) * 0.38, p.y + 2.05, p.z + Math.sin(a) * 0.38, { count: 1, color: '#ffe34a', size: 0.2, speed: 0.05, up: 0, life: 0.22, grav: 0, spread: 0 })
        }
      }
      if (vigA > 0.001) {
        vigA = Math.max(0, vigA - dt * 1.4)
        vignette.style.opacity = vigA.toFixed(3)
      } else if (vignette.style.opacity !== '0') vignette.style.opacity = '0'
    },
    reset() {
      breach = null
      setFade(0, 200)
      for (const c of cps) {
        c.alert = 0
        c.strikes = 0
      }
      for (const L of LINES) L.t = L.cool = 0
      priority.t = priority.cool = 0
      for (const g of allGuards) {
        g.busy = false
        g.mode = 'return'
        g.rush = null
        g.goal = { x: g.post.x, z: g.post.z, speed: GUARDS.walkSpeed, stop: 0.04, done: () => (g.mode = 'post') }
      }
    },
  }
  return api
}
