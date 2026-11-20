// The cabin of your flight: a twin-aisle widebody, built out of sight above the airport (FLIGHT.cabin) and
// shown only while you're on board. Nose toward -Z, A seats on the left (-X), aisles at x = -/+ FLIGHT.aisle.
//
// Nose to tail (classes from FLIGHT.classes):
//   cockpit door + front galley (ovens, carts, coffee makers) | cross aisle with the L1/R1 doors and the
//   First Class bar (back-lit bottle shelf, counter, stools)
//   FIRST     1-1-1 suites: wood-veneer walls with gold trim, sliding doors, cream leather armchair with
//             wings, ottoman, big screen, side console with a lamp, a vase, minibar; starlight ceiling
//   curtain 1 BUSINESS 1-2-1 pods: shell, leather seat, pillow, ottoman, monitor on a stalk, reading lamp,
//             window consoles with a water bottle, privacy divider between the centre pair
//   curtain 2 PREMIUM  2-2-2 recliners: wider seats, teal headrests with wings, leg rests, cup holders
//   curtain 3 mid galley (carts, lavatories, L2/R2 doors) | ECONOMY 3-3-3 seats (shaped shells, blue
//             headrest covers, seat-back screens, tray tables, belts)
//   L3/R3 doors | back galley + lavatories
// Each class has its own carpet, aisle runner, bulkhead sign and accent colour. Each curtain line is a solid
// partition (hull to aisle, plus the centre block) with two aisle openings hung with animated curtains
// (cabinCrew.js decides who they open for). Overhead bins (side + centre), passenger service units with
// reading lights and seatbelt signs, cove lights in the mood colour, windows with a scrolling sky and
// light shafts, seat-back moving maps (repainted with the flight's progress).
//
// Budget: seats are instanced per class (one InstancedMesh per material); everything static is baked to one
// mesh per material. Moving parts: curtains (one InstancedMesh), carts / meal trays (made on demand).
import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  RepeatWrapping,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  Vector3,
} from 'three'
import { FLIGHT } from '../config.js'
import { bake } from '../bake.js'
import { neon, retint, solidBox } from '../propkit.js'
import { lathe, rbox, roundRectShape } from '../detail.js'

const R = 4.0 // hull radius
const HY = 1.0 // hull centre above the floor
const SY = 0.8 // hull squash
const CEIL = 3.15 // drop ceiling
const FONT = 'Fredoka, Arial, sans-serif'
// Hull half-width at height y above the floor.
export const hullX = (y) => Math.sqrt(Math.max(0, R * R - ((y - HY) / SY) ** 2))

// --- Small helpers ---------------------------------------------------------------------------------
const _c = new Color()
// Vertex colour for the shared `paint` material (clones a geometry that is already tinted).
function tint(g, hex) {
  if (g.attributes.color) g = g.clone()
  _c.set(hex)
  const n = g.attributes.position.count
  const a = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    a[i * 3] = _c.r
    a[i * 3 + 1] = _c.g
    a[i * 3 + 2] = _c.b
  }
  g.setAttribute('color', new BufferAttribute(a, 3))
  return g
}
function add(parent, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new Mesh(geo, mat)
  m.position.set(x, y, z)
  m.rotation.set(rx, ry, rz)
  parent.add(m)
  return m
}
function cv(w, h = w) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}
const canvasTex = (c, rx = 1, ry = 1) => {
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 8
  if (rx !== 1 || ry !== 1) {
    t.wrapS = t.wrapT = RepeatWrapping
    t.repeat.set(rx, ry)
  }
  return t
}
// Map a plane's 0..1 UVs into a pixel rectangle of the 512 px cabin atlas.
const ATLAS = 512
function atlasUV(g, [x0, y0, x1, y1]) {
  const uv = g.attributes.uv
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i)
    const v = uv.getY(i)
    uv.setXY(i, (x0 + u * (x1 - x0)) / ATLAS, 1 - (y0 + (1 - v) * (y1 - y0)) / ATLAS)
  }
  return g
}
// UVs stretched over a flat shape's bounding box.
function fitUV(g) {
  g.computeBoundingBox()
  const b = g.boundingBox
  const p = g.attributes.position
  const uv = g.attributes.uv
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (p.getX(i) - b.min.x) / (b.max.x - b.min.x), (p.getY(i) - b.min.y) / (b.max.y - b.min.y))
  return g
}
// A strip of hull surface (radius r) on side s between heights y0..y1 and z0..z1, facing the aisle.
function hullPatch(r, s, y0, y1, z0, z1, segs = 4) {
  const pos = []
  const nor = []
  const uv = []
  const Xr = (y) => Math.sqrt(Math.max(0, r * r - ((y - HY) / SY) ** 2))
  for (let i = 0; i < segs; i++) {
    const ya = y0 + ((y1 - y0) * i) / segs
    const yb = y0 + ((y1 - y0) * (i + 1)) / segs
    const A = [s * Xr(ya), ya, z0]
    const B = [s * Xr(ya), ya, z1]
    const C = [s * Xr(yb), yb, z0]
    const D = [s * Xr(yb), yb, z1]
    for (const p of s > 0 ? [A, B, C, B, D, C] : [A, C, B, B, C, D]) {
      pos.push(...p)
      const nx = -p[0] / (r * r)
      const ny = -(p[1] - HY) / (SY * SY * r * r)
      const l = Math.hypot(nx, ny)
      nor.push(nx / l, ny / l, 0)
      uv.push((p[2] - z0) / (z1 - z0), (p[1] - y0) / (y1 - y0))
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  g.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3))
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2))
  return g
}
// A cross-section wall that follows the hull: from x = xi out to the hull on side s, floor to y1.
function hullWall(s, xi, y1, steps = 10) {
  const sh = new Shape()
  sh.moveTo(s * xi, 0)
  for (let i = 0; i <= steps; i++) {
    const y = (y1 * i) / steps
    sh.lineTo(s * Math.max(xi + 0.02, hullX(y) - 0.04), y)
  }
  sh.lineTo(s * xi, y1)
  sh.closePath()
  return new ShapeGeometry(sh, 2)
}

// --- Canvas painters ------------------------------------------------------------------------------
function speckle(ctx, w, h, n, colors, size = 1, seed = 1) {
  let s = seed
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647)
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = colors[Math.floor(r() * colors.length)]
    ctx.fillRect(Math.floor(r() * w), Math.floor(r() * h), size, size)
  }
}
function paintHull() {
  const c = cv(128)
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#e8ebef'
  ctx.fillRect(0, 0, 128, 128)
  speckle(ctx, 128, 128, 500, ['#e2e5ea', '#eef0f3'], 2, 3)
  ctx.fillStyle = '#c3c8d1'
  ctx.fillRect(0, 0, 128, 2)
  ctx.fillStyle = '#f7f8fa'
  ctx.fillRect(0, 2, 128, 2)
  return c
}
// Carpet: a base, flecks and a small repeating motif (diamonds for First, dots elsewhere).
function paintCarpet(base, flecks, motif, diamonds = false) {
  const c = cv(128)
  const ctx = c.getContext('2d')
  ctx.fillStyle = base
  ctx.fillRect(0, 0, 128, 128)
  speckle(ctx, 128, 128, 1400, flecks, 1, 7)
  ctx.fillStyle = motif
  for (let y = 16; y < 128; y += 32) {
    for (let x = 16; x < 128; x += 32) {
      const ox = x + ((y / 32) % 2) * 16
      if (diamonds) {
        ctx.beginPath()
        ctx.moveTo(ox, y - 6)
        ctx.lineTo(ox + 6, y)
        ctx.lineTo(ox, y + 6)
        ctx.lineTo(ox - 6, y)
        ctx.closePath()
        ctx.fill()
      } else ctx.fillRect(ox, y, 3, 3)
    }
  }
  return c
}
function paintRunner(base, edge, hi, motif) {
  const c = cv(128)
  const ctx = c.getContext('2d')
  ctx.fillStyle = base
  ctx.fillRect(0, 0, 128, 128)
  speckle(ctx, 128, 128, 900, ['rgba(0,0,0,0.12)', 'rgba(255,255,255,0.06)'], 1, 11)
  ctx.fillStyle = edge
  ctx.fillRect(0, 0, 6, 128)
  ctx.fillRect(122, 0, 6, 128)
  ctx.fillStyle = hi
  ctx.fillRect(8, 0, 2, 128)
  ctx.fillRect(118, 0, 2, 128)
  ctx.fillStyle = motif
  for (const y of [32, 96]) {
    ctx.beginPath()
    ctx.moveTo(64, y - 14)
    ctx.lineTo(78, y)
    ctx.lineTo(64, y + 14)
    ctx.lineTo(50, y)
    ctx.closePath()
    ctx.fill()
  }
  return c
}
function weave(ctx, x0, y0, w, h, [a, b, c], sparkle) {
  ctx.fillStyle = a
  ctx.fillRect(x0, y0, w, h)
  for (let y = y0; y < y0 + h; y += 4) {
    for (let x = x0; x < x0 + w; x += 4) {
      ctx.fillStyle = ((x + y) / 4) % 2 ? b : c
      ctx.fillRect(x, y, 2, 2)
    }
  }
  speckle(ctx, w, h, 160, [sparkle, 'rgba(255,255,255,0.08)'], 2, 5)
}
const ECO_WEAVE = ['#2b3242', '#313a4c', '#262c3a']
const PREM_WEAVE = ['#34404a', '#3b4954', '#2e3942']
function paintFabric(pal, sparkle) {
  const c = cv(128)
  weave(c.getContext('2d'), 0, 0, 128, 128, pal, sparkle)
  return c
}
// Seat-back cushion: quilted fabric with a coloured headrest cover across the top (skyhop swoosh).
function paintBackFabric(pal, sparkle, cover, coverHi) {
  const c = cv(128, 256)
  const ctx = c.getContext('2d')
  weave(ctx, 0, 0, 128, 256, pal, sparkle)
  for (const x of [40, 88]) {
    ctx.fillStyle = '#1a1f2a'
    ctx.fillRect(x - 1, 76, 3, 180)
    ctx.fillStyle = 'rgba(255,255,255,0.12)'
    ctx.fillRect(x + 2, 76, 1, 180)
  }
  ctx.fillStyle = '#1a1f2a'
  ctx.fillRect(0, 176, 128, 3)
  ctx.fillStyle = cover
  ctx.fillRect(0, 0, 128, 74)
  ctx.fillStyle = coverHi
  ctx.fillRect(10, 8, 108, 54)
  ctx.fillStyle = '#e9f3ff'
  ctx.fillRect(0, 72, 128, 4)
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 5
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(42, 44)
  ctx.quadraticCurveTo(64, 20, 88, 30)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(52, 48)
  ctx.quadraticCurveTo(70, 34, 86, 40)
  ctx.stroke()
  return c
}
// Leather: a soft grain with stitched panel seams.
function paintLeather(base, dark, light) {
  const c = cv(128)
  const ctx = c.getContext('2d')
  ctx.fillStyle = base
  ctx.fillRect(0, 0, 128, 128)
  speckle(ctx, 128, 128, 2400, [dark, light], 1, 13)
  ctx.strokeStyle = dark
  ctx.lineWidth = 2
  for (const y of [42, 86]) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(128, y)
    ctx.stroke()
  }
  ctx.setLineDash([3, 3])
  ctx.strokeStyle = light
  ctx.lineWidth = 1
  for (const y of [38, 46, 82, 90]) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(128, y)
    ctx.stroke()
  }
  return c
}
// Wood veneer: long grain streaks with darker figure.
function paintWood() {
  const c = cv(256, 64)
  const ctx = c.getContext('2d')
  const g = ctx.createLinearGradient(0, 0, 0, 64)
  g.addColorStop(0, '#7a4a2a')
  g.addColorStop(0.5, '#8c5632')
  g.addColorStop(1, '#6e4124')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 256, 64)
  let s = 5
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647)
  for (let i = 0; i < 70; i++) {
    ctx.strokeStyle = r() < 0.5 ? 'rgba(40,20,8,0.25)' : 'rgba(255,210,160,0.12)'
    ctx.lineWidth = 1 + r() * 2
    const y = r() * 64
    ctx.beginPath()
    ctx.moveTo(0, y)
    for (let x = 0; x <= 256; x += 32) ctx.lineTo(x, y + Math.sin(x * 0.03 + i) * 3 * r())
    ctx.stroke()
  }
  return c
}
// Sky panorama (tiles horizontally): gradient, a high cirrus streak and a sea of cumulus below.
function paintSky() {
  const c = cv(512, 160)
  const ctx = c.getContext('2d')
  const g = ctx.createLinearGradient(0, 0, 0, 160)
  g.addColorStop(0, '#2e78e0')
  g.addColorStop(0.55, '#8cc6ff')
  g.addColorStop(0.8, '#dff0ff')
  g.addColorStop(1, '#ffffff')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 512, 160)
  let s = 21
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647)
  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  for (let i = 0; i < 6; i++) {
    const x = r() * 512
    const y = 20 + r() * 30
    for (const dx of [0, -512, 512]) {
      ctx.beginPath()
      ctx.ellipse(x + dx, y, 60 + r() * 40, 3 + r() * 3, 0, 0, 7)
      ctx.fill()
    }
  }
  for (let i = 0; i < 70; i++) {
    const x = r() * 512
    const y = 112 + r() * 44
    const rad = 10 + r() * 22
    for (const dx of [0, -512, 512]) {
      ctx.fillStyle = 'rgba(214,226,240,0.9)'
      ctx.beginPath()
      ctx.arc(x + dx, y + 4, rad, 0, 7)
      ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,0.95)'
      ctx.beginPath()
      ctx.arc(x + dx - rad * 0.2, y, rad * 0.9, 0, 7)
      ctx.fill()
    }
  }
  return c
}
// Starlight ceiling: dark navy with scattered stars (two seeds = two twinkle phases).
function paintStars(seed) {
  const c = cv(256)
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, 256, 256)
  let s = seed
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647)
  for (let i = 0; i < 90; i++) {
    const x = r() * 256
    const y = r() * 256
    const big = r() < 0.15
    const g = ctx.createRadialGradient(x, y, 0, x, y, big ? 5 : 2.5)
    g.addColorStop(0, '#ffffff')
    g.addColorStop(0.4, big ? '#fff1c4' : '#dfe8ff')
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(x - 6, y - 6, 12, 12)
  }
  return c
}
// Curtain cloth: vertical folds (light/dark bands), a woven fleck and an accent stripe at the hem.
function paintCurtain(base, dark, stripe) {
  const c = cv(128, 256)
  const ctx = c.getContext('2d')
  ctx.fillStyle = base
  ctx.fillRect(0, 0, 128, 256)
  for (let x = 0; x < 128; x += 16) {
    const g = ctx.createLinearGradient(x, 0, x + 16, 0)
    g.addColorStop(0, 'rgba(0,0,0,0.28)')
    g.addColorStop(0.5, 'rgba(255,255,255,0.1)')
    g.addColorStop(1, 'rgba(0,0,0,0.28)')
    ctx.fillStyle = g
    ctx.fillRect(x, 0, 16, 256)
  }
  speckle(ctx, 128, 256, 900, [dark, 'rgba(255,255,255,0.06)'], 1, 17)
  ctx.fillStyle = stripe
  ctx.fillRect(0, 222, 128, 10)
  ctx.fillRect(0, 238, 128, 3)
  return c
}
// A soft vertical light shaft (bright at the top / window end).
function paintBeam() {
  const c = cv(32, 128)
  const ctx = c.getContext('2d')
  const g = ctx.createLinearGradient(0, 0, 0, 128)
  g.addColorStop(0, 'rgba(255,255,255,0.9)')
  g.addColorStop(0.5, 'rgba(255,255,255,0.35)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 32, 128)
  const h = ctx.createLinearGradient(0, 0, 32, 0)
  h.addColorStop(0, 'rgba(0,0,0,1)')
  h.addColorStop(0.25, 'rgba(0,0,0,0)')
  h.addColorStop(0.75, 'rgba(0,0,0,0)')
  h.addColorStop(1, 'rgba(0,0,0,1)')
  ctx.globalCompositeOperation = 'destination-out'
  ctx.fillStyle = h
  ctx.fillRect(0, 0, 32, 128)
  return c
}
// Class sign: name in white on the class colour (gold leaf for First).
function paintSign(text, col, sub = '') {
  const c = cv(512, 112)
  const ctx = c.getContext('2d')
  const g = ctx.createLinearGradient(0, 0, 0, 112)
  g.addColorStop(0, '#1b2236')
  g.addColorStop(1, '#0f1424')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 512, 112)
  ctx.fillStyle = col
  ctx.fillRect(0, 100, 512, 6)
  ctx.fillRect(0, 6, 512, 2)
  ctx.font = `700 52px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = col
  ctx.fillText(text, 256, sub ? 46 : 56)
  if (sub) {
    ctx.font = `600 22px ${FONT}`
    ctx.fillStyle = '#d6dcea'
    ctx.fillText(sub, 256, 84)
  }
  return c
}
function paintExit() {
  const c = cv(128, 48)
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#0f8f3a'
  ctx.fillRect(0, 0, 128, 48)
  ctx.fillStyle = '#ffffff'
  ctx.font = `700 34px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('EXIT', 64, 26)
  return c
}
// Bottle shelf behind the First bar: glowing shelf edges and rows of bottles in silhouette.
function paintBar() {
  const c = cv(256, 128)
  const ctx = c.getContext('2d')
  const g = ctx.createLinearGradient(0, 0, 0, 128)
  g.addColorStop(0, '#3a2412')
  g.addColorStop(1, '#170e06')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 256, 128)
  const cols = ['#5ad16a', '#e8b54a', '#c43a3a', '#7ec8ff', '#f4f0e0', '#a46cff']
  for (const y of [56, 116]) {
    const glow = ctx.createLinearGradient(0, y - 40, 0, y)
    glow.addColorStop(0, 'rgba(255,190,90,0)')
    glow.addColorStop(1, 'rgba(255,190,90,0.55)')
    ctx.fillStyle = glow
    ctx.fillRect(0, y - 40, 256, 40)
    for (let x = 8; x < 250; x += 16) {
      const h = 22 + ((x * 7) % 14)
      ctx.fillStyle = cols[(x / 16 + y) % cols.length | 0]
      ctx.globalAlpha = 0.85
      ctx.fillRect(x, y - h, 9, h)
      ctx.fillRect(x + 3, y - h - 8, 3, 8)
      ctx.globalAlpha = 1
      ctx.fillStyle = 'rgba(255,255,255,0.5)'
      ctx.fillRect(x + 1, y - h + 3, 2, h - 6)
    }
    ctx.fillStyle = '#ffcf7a'
    ctx.fillRect(0, y, 256, 3)
  }
  return c
}
// Atlas regions (px): galley upper units, cart front, lav door, PSU panel, drawer stack.
const A_UPPER = [0, 0, 512, 112]
const A_CART = [0, 112, 128, 400]
const A_LAV = [128, 112, 256, 432]
const A_PSU = [256, 112, 384, 240]
const A_DRAW = [384, 112, 512, 256]
function paintAtlas() {
  const c = cv(ATLAS)
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#c9ced6'
  ctx.fillRect(0, 0, ATLAS, ATLAS)
  const rect = (col, x, y, w, h) => {
    ctx.fillStyle = col
    ctx.fillRect(x, y, w, h)
  }
  for (let k = 0; k < 2; k++) {
    const x = 6 + k * 100
    rect('#8d949f', x, 6, 94, 100)
    rect('#2a2f38', x + 5, 11, 84, 70)
    const g = ctx.createLinearGradient(0, 18, 0, 64)
    g.addColorStop(0, '#46505f')
    g.addColorStop(1, '#14181e')
    rect(g, x + 12, 18, 70, 46)
    rect('#5a6270', x + 14, 36, 66, 2)
    rect('#5a6270', x + 14, 50, 66, 2)
    rect('#eef1f4', x + 10, 86, 74, 7)
    rect('#0c0f12', x + 58, 96, 26, 7)
    rect('#3dff6a', x + 62, 98, 10, 3)
  }
  for (let r = 0; r < 2; r++) {
    for (let k = 0; k < 6; k++) {
      const x = 212 + k * 49
      const y = 6 + r * 51
      rect('#9aa1ad', x, y, 46, 48)
      rect('#d6dae1', x + 3, y + 3, 40, 42)
      rect('#e9ecf0', x + 3, y + 3, 40, 3)
      rect('#1b1d22', x + 15, y + 9, 16, 5)
      rect(k % 3 ? '#3dbb5a' : '#d64a3a', x + 36, y + 36, 4, 4)
    }
  }
  {
    const [x, y, x1, y1] = A_CART
    const w = x1 - x
    rect('#8f97a3', x, y, w, y1 - y)
    rect('#b4bbc6', x + 4, y + 4, w - 8, y1 - y - 8)
    for (let k = x + 10; k < x1 - 6; k += 12) rect('rgba(255,255,255,0.18)', k, y + 50, 2, 160)
    rect('#2a2f38', x + 14, y + 12, w - 28, 16)
    rect('#4a525e', x + 14, y + 12, w - 28, 4)
    rect('#1b1d22', x + w / 2 - 14, y + 38, 28, 10)
    rect('#1b8cff', x + 4, y + 120, w - 8, 40)
    ctx.fillStyle = '#ffffff'
    ctx.font = `600 24px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('skyhop', x + w / 2, y + 141)
    rect('#d6232e', x + 18, y1 - 26, 34, 14)
    rect('#2a9a4a', x + w - 52, y1 - 26, 34, 14)
  }
  {
    const [x, y, x1, y1] = A_LAV
    const w = x1 - x
    rect('#cfd4dc', x, y, w, y1 - y)
    rect('#e6e9ee', x + 5, y + 5, w / 2 - 7, y1 - y - 10)
    rect('#e6e9ee', x + w / 2 + 2, y + 5, w / 2 - 7, y1 - y - 10)
    rect('#b5bbc5', x + w / 2 - 1, y, 2, y1 - y)
    ctx.fillStyle = '#1d3d8a'
    ctx.beginPath()
    ctx.arc(x + w / 2, y + 70, 26, 0, 7)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    for (const [dx, tri] of [[-10, false], [10, true]]) {
      ctx.beginPath()
      ctx.arc(x + w / 2 + dx, y + 56, 5, 0, 7)
      ctx.fill()
      if (tri) {
        ctx.beginPath()
        ctx.moveTo(x + w / 2 + dx, y + 63)
        ctx.lineTo(x + w / 2 + dx + 8, y + 86)
        ctx.lineTo(x + w / 2 + dx - 8, y + 86)
        ctx.closePath()
        ctx.fill()
      } else ctx.fillRect(x + w / 2 + dx - 5, y + 63, 10, 23)
    }
    rect('#2a2f38', x + w / 2 - 22, y + 112, 44, 16)
    rect('#9aa1ad', x + w - 30, y + 170, 16, 44)
    rect('#2a2f38', x + w - 27, y + 176, 10, 32)
  }
  {
    const [x, y, x1, y1] = A_PSU
    rect('#b9bfc8', x, y, x1 - x, y1 - y)
    rect('#e6e8ec', x + 3, y + 3, x1 - x - 6, y1 - y - 6)
    for (const px of [27, 64, 101]) {
      ctx.fillStyle = '#9aa1ad'
      ctx.beginPath()
      ctx.arc(x + px, y + 40, 15, 0, 7)
      ctx.fill()
      ctx.fillStyle = '#d6dae1'
      ctx.beginPath()
      ctx.arc(x + px, y + 88, 13, 0, 7)
      ctx.fill()
      ctx.fillStyle = '#6d7380'
      ctx.beginPath()
      ctx.arc(x + px, y + 88, 8, 0, 7)
      ctx.fill()
    }
    rect('#2a2f38', x + 8, y + 108, 44, 14)
    ctx.fillStyle = '#ff9f2a'
    ctx.beginPath()
    ctx.arc(x + 110, y + 114, 6, 0, 7)
    ctx.fill()
  }
  {
    const [x, y, x1, y1] = A_DRAW
    const w = x1 - x
    const h = (y1 - y) / 4
    for (let k = 0; k < 4; k++) {
      rect('#9aa1ad', x + 2, y + k * h + 2, w - 4, h - 4)
      rect('#d3d8df', x + 5, y + k * h + 5, w - 10, h - 10)
      rect('#1b1d22', x + w / 2 - 18, y + k * h + 10, 36, 6)
    }
  }
  return c
}
// Seatbelt sign: the lit icon (amber), drawn once; the material is switched on / off.
function paintBelt() {
  const c = cv(64, 32)
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, 64, 32)
  ctx.strokeStyle = '#ffffff'
  ctx.fillStyle = '#ffffff'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.arc(32, 9, 4, 0, 7)
  ctx.fill()
  ctx.fillRect(28, 14, 8, 10)
  ctx.beginPath()
  ctx.moveTo(18, 20)
  ctx.lineTo(46, 20)
  ctx.stroke()
  ctx.fillRect(29, 17, 6, 6)
  return c
}
// The moving map (seat-back screens + bulkhead monitors), repainted with the flight's progress.
function paintMap(ctx, w, h, o) {
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, '#0e3270')
  g.addColorStop(1, '#061636')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = '#1f6a45'
  ctx.beginPath()
  ctx.ellipse(w * 0.22, h * 0.7, w * 0.22, h * 0.16, 0.3, 0, 7)
  ctx.ellipse(w * 0.8, h * 0.32, w * 0.2, h * 0.14, -0.2, 0, 7)
  ctx.ellipse(w * 0.55, h * 0.88, w * 0.1, h * 0.06, 0, 0, 7)
  ctx.fill()
  const ax = w * 0.18
  const ay = h * 0.68
  const bx = w * 0.82
  const by = h * 0.3
  const cx = w * 0.48
  const cy = h * 0.06
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'
  ctx.setLineDash([5, 4])
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(ax, ay)
  ctx.quadraticCurveTo(cx, cy, bx, by)
  ctx.stroke()
  ctx.setLineDash([])
  // flown part
  const t = Math.max(0, Math.min(1, o.progress))
  ctx.strokeStyle = o.color
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(ax, ay)
  const n = 24
  let px = ax
  let py = ay
  for (let i = 1; i <= n; i++) {
    const k = (i / n) * t
    px = (1 - k) * (1 - k) * ax + 2 * (1 - k) * k * cx + k * k * bx
    py = (1 - k) * (1 - k) * ay + 2 * (1 - k) * k * cy + k * k * by
    ctx.lineTo(px, py)
  }
  ctx.stroke()
  for (const [x, y] of [[ax, ay], [bx, by]]) {
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(x, y, 4, 0, 7)
    ctx.fill()
  }
  // the plane
  const k2 = Math.min(1, t + 0.01)
  const dx = 2 * (1 - k2) * (cx - ax) + 2 * k2 * (bx - cx)
  const dy = 2 * (1 - k2) * (cy - ay) + 2 * k2 * (by - cy)
  ctx.save()
  ctx.translate(px, py)
  ctx.rotate(Math.atan2(dy, dx))
  ctx.fillStyle = '#ffd23b'
  ctx.beginPath()
  ctx.moveTo(10, 0)
  ctx.lineTo(-6, -8)
  ctx.lineTo(-3, 0)
  ctx.lineTo(-6, 8)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
  ctx.font = `700 ${Math.round(h * 0.11)}px ${FONT}`
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'left'
  ctx.fillText(o.from, ax - 10, ay + h * 0.12)
  ctx.textAlign = 'right'
  ctx.fillText(o.to, bx + 12, by - h * 0.12)
  ctx.fillStyle = 'rgba(0,0,0,0.45)'
  ctx.fillRect(0, h - h * 0.17, w, h * 0.17)
  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'left'
  ctx.font = `600 ${Math.round(h * 0.09)}px ${FONT}`
  ctx.fillText(o.line, 8, h - h * 0.085)
}

// --- Seat models ---------------------------------------------------------------------------------------
// Seat-back shell: a side profile (depth z, height y) extruded across the seat width.
function shellGeo(W = 0.58, H = 0.9) {
  const s = new Shape()
  s.moveTo(0, 0.04)
  s.lineTo(0, H - 0.08)
  s.quadraticCurveTo(0, H, 0.06, H)
  s.quadraticCurveTo(0.11, H, 0.11, H - 0.1)
  s.lineTo(0.11, 0.24)
  s.quadraticCurveTo(0.11, 0, 0.04, 0)
  s.lineTo(0.03, 0)
  s.quadraticCurveTo(0, 0, 0, 0.04)
  const b = 0.014
  const g = new ExtrudeGeometry(s, { depth: W - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 1, curveSegments: 3 })
  g.rotateY(-Math.PI / 2)
  g.translate((W - 2 * b) / 2, 0, 0)
  return g
}
function bezelGeo() {
  const s = roundRectShape(0.5, 0.7, 0.22)
  s.holes.push(roundRectShape(0.33, 0.5, 0.14))
  return new ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: false, curveSegments: 3 })
}
function armrest(P, x, z, wide = false) {
  const w = wide ? 0.09 : 0.05
  P(new BoxGeometry(w, 0.05, 0.44), '#2a2f3a', x, 0.665, z + 0.02)
  P(new BoxGeometry(w + 0.008, 0.02, 0.34), '#3a4152', x, 0.698, z)
  P(new BoxGeometry(0.04, 0.22, 0.04), '#2a2f3a', x, 0.55, z - 0.17)
  P(new BoxGeometry(0.03, 0.03, 0.03), '#c9ced6', x, 0.672, z - 0.2)
  if (wide) P(new TorusGeometry(0.03, 0.008, 4, 10).rotateX(Math.PI / 2), '#8d949f', x, 0.71, z + 0.12) // cup holder
}
// Economy / Premium seat (local: cushion centre at the origin's x/z, facing -Z).
function seatProto(M, o) {
  const g = new Group()
  const P = (geo, hex, x, y, z, rx, ry, rz) => add(g, tint(geo, hex), M.paint, x, y, z, rx, ry, rz)
  const W = o.W
  add(g, rbox(W - 0.06, o.premium ? 0.14 : 0.12, o.premium ? 0.54 : 0.5, 0.05, 1), o.cushion, 0, 0.44, -0.01)
  P(new BoxGeometry(W - 0.02, 0.05, 0.46), '#262b36', 0, 0.36, -0.01)
  P(new BoxGeometry(0.3, 0.05, 0.12), '#3a3f4a', 0, 0.31, -0.12) // life-vest pouch
  for (const s of [-1, 1]) P(new BoxGeometry(0.045, 0.008, 0.22), '#3a3f4a', s * 0.12, 0.503 + (o.premium ? 0.02 : 0), 0.07, 0, -s * 0.45, 0)
  P(new BoxGeometry(0.08, 0.014, 0.05), '#d0d5dc', 0, 0.506 + (o.premium ? 0.02 : 0), -0.02)
  armrest(P, -(W / 2 + 0.01), 0, o.premium)
  if (o.premium) {
    armrest(P, W / 2 + 0.01, 0, true)
    P(rbox(W - 0.1, 0.3, 0.05, 0.02, 1), '#2a2f3a', 0, 0.26, -0.3, -0.32, 0, 0) // leg rest, folded
    add(g, rbox(W - 0.12, 0.26, 0.03, 0.015, 1), o.cushion, 0, 0.27, -0.33, -0.32, 0, 0)
  }
  const back = new Group()
  back.position.set(0, 0.42, o.premium ? 0.29 : 0.27)
  back.rotation.x = o.premium ? 0.16 : 0.12
  g.add(back)
  const H = o.premium ? 1.0 : 0.9
  add(back, tint(shellGeo(W, H), '#262b36'), M.paint)
  add(back, rbox(W - 0.08, H - 0.08, 0.085, 0.04, 1), o.back, 0, H / 2 + 0.02, -0.04)
  if (o.premium) for (const s of [-1, 1]) add(back, rbox(0.07, 0.24, 0.1, 0.03, 1), o.back, s * (W / 2 - 0.08), H - 0.17, -0.06, 0, s * 0.35, 0) // headrest wings
  const BP = (geo, hex, x, y, z) => add(back, tint(geo, hex), M.paint, x, y, z)
  BP(new BoxGeometry(W - 0.16, 0.12, 0.025), '#1d2129', 0, 0.3, 0.135) // pocket
  BP(new BoxGeometry(W - 0.16, 0.22, 0.022), '#5a6170', 0, 0.5, 0.135) // tray table
  BP(new BoxGeometry(0.08, 0.025, 0.02), '#16181d', 0, 0.625, 0.14) // latch
  const [sw, sh] = o.premium ? [0.3, 0.18] : [0.25, 0.15]
  BP(new BoxGeometry(sw, sh, 0.02), '#16181d', 0, H - 0.17, 0.13)
  add(back, new BoxGeometry(sw - 0.03, sh - 0.025, 0.012), M.screen, 0, H - 0.17, 0.137)
  if (o.premium) BP(new BoxGeometry(W - 0.2, 0.03, 0.06), '#8d949f', 0, 0.12, 0.13) // footrest bar
  return g
}
// Business pod (local: seat centre, facing -Z; symmetric, so it can be instanced on either side).
function podProto(M) {
  const g = new Group()
  const P = (geo, hex, x, y, z, rx = 0, ry = 0, rz = 0) => add(g, tint(geo, hex), M.paint, x, y, z, rx, ry, rz)
  const HW = 0.43
  // shell: a tall curved back + low side walls with a champagne trim
  P(rbox(HW * 2, 1.28, 0.12, 0.05, 1), '#2b303b', 0, 0.64, 0.5)
  P(rbox(HW * 2 - 0.06, 0.04, 0.16, 0.02, 1), '#c9b48a', 0, 1.29, 0.5)
  for (const s of [-1, 1]) {
    P(rbox(0.06, 1.0, 1.55, 0.03, 1), '#ece8e0', s * HW, 0.5, -0.27)
    P(rbox(0.08, 0.035, 1.55, 0.015, 1), '#c9b48a', s * HW, 1.01, -0.27)
    P(rbox(0.07, 0.06, 1.5, 0.02, 1), '#2b303b', s * HW, 0.04, -0.27)
  }
  // seat: base, leather cushion + back, pillow
  P(rbox(0.6, 0.3, 0.62, 0.04, 1), '#22262f', 0, 0.2, 0)
  add(g, rbox(0.58, 0.14, 0.6, 0.06, 2), M.leatherBiz, 0, 0.44, -0.02)
  const back = new Group()
  back.position.set(0, 0.46, 0.3)
  back.rotation.x = 0.16
  g.add(back)
  add(back, rbox(0.58, 0.9, 0.14, 0.06, 2), M.leatherBiz, 0, 0.45, 0)
  add(back, rbox(0.4, 0.2, 0.12, 0.06, 2), M.pillow, 0, 0.82, -0.08)
  // armrests with a control pad
  for (const s of [-1, 1]) {
    add(g, rbox(0.1, 0.08, 0.5, 0.03, 1), M.leatherBiz, s * 0.33, 0.66, 0.0)
    P(new BoxGeometry(0.05, 0.012, 0.09), '#16181d', s * 0.33, 0.705, -0.12)
  }
  // ottoman + footwell under the monitor
  P(rbox(0.5, 0.36, 0.46, 0.04, 1), '#2b303b', 0, 0.18, -1.0)
  add(g, rbox(0.46, 0.06, 0.42, 0.03, 1), M.leatherBiz, 0, 0.39, -1.0)
  // monitor on a stalk + its frame
  P(new BoxGeometry(0.04, 0.5, 0.04), '#8d949f', 0, 0.95, -1.22)
  P(rbox(0.52, 0.33, 0.04, 0.015, 1), '#16181d', 0, 1.18, -1.2)
  add(g, new PlaneGeometry(0.47, 0.28), M.screen, 0, 1.18, -1.178)
  // reading lamp on the back shell
  P(new CylinderGeometry(0.012, 0.012, 0.2, 6), '#8d949f', -HW + 0.08, 1.15, 0.38, 0.6, 0, 0)
  add(g, lathe([[0.0, 0], [0.05, 0.0], [0.035, 0.06], [0, 0.06]], 10), M.lamp, -HW + 0.08, 1.2, 0.3, Math.PI * 0.7, 0, 0)
  return g
}
// First Class suite (local: armchair centre, facing -Z). Walls front + back + short side returns (the
// sliding doors / window fillers are placed per suite).
function suiteProto(M) {
  const g = new Group()
  const P = (geo, hex, x, y, z, rx = 0, ry = 0, rz = 0) => add(g, tint(geo, hex), M.paint, x, y, z, rx, ry, rz)
  const HW = 0.72
  const WH = 1.35
  // back + front walls (wood veneer), with a cream inner face
  for (const [z, face] of [[0.62, -1], [-1.55, 1]]) {
    add(g, rbox(HW * 2, WH, 0.08, 0.03, 1), M.wood, 0, WH / 2, z)
    P(new BoxGeometry(HW * 2 - 0.1, WH - 0.2, 0.01), '#efe8da', 0, WH / 2 + 0.02, z + face * 0.045)
    add(g, new BoxGeometry(HW * 2, 0.025, 0.1), M.gold, 0, WH + 0.012, z)
  }
  for (const s of [-1, 1]) {
    add(g, rbox(0.07, WH, 0.7, 0.03, 1), M.wood, s * HW, WH / 2, 0.27)
    add(g, new BoxGeometry(0.09, 0.025, 0.7), M.gold, s * HW, WH + 0.012, 0.27)
  }
  // armchair: plinth, cushion, back with wings + headrest pillow, wide armrests
  P(rbox(0.82, 0.3, 0.74, 0.05, 1), '#3a2a1c', 0, 0.18, 0.02)
  add(g, rbox(0.7, 0.18, 0.7, 0.07, 2), M.leatherFirst, 0, 0.42, 0.0)
  const back = new Group()
  back.position.set(0, 0.48, 0.34)
  back.rotation.x = 0.14
  g.add(back)
  add(back, rbox(0.7, 1.02, 0.16, 0.07, 2), M.leatherFirst, 0, 0.5, 0)
  for (const s of [-1, 1]) add(back, rbox(0.12, 0.4, 0.2, 0.05, 2), M.leatherFirst, s * 0.32, 0.86, -0.06, 0, s * 0.4, 0)
  add(back, rbox(0.42, 0.2, 0.12, 0.06, 2), M.pillow, 0, 0.88, -0.1)
  for (const s of [-1, 1]) {
    add(g, rbox(0.15, 0.2, 0.66, 0.05, 2), M.leatherFirst, s * 0.42, 0.56, 0.02)
    P(new BoxGeometry(0.06, 0.012, 0.1), '#2a2018', s * 0.42, 0.665, -0.18)
  }
  // ottoman with a folded blanket
  P(rbox(0.6, 0.38, 0.52, 0.05, 1), '#3a2a1c', 0, 0.19, -0.98)
  add(g, rbox(0.56, 0.08, 0.48, 0.04, 2), M.leatherFirst, 0, 0.42, -0.98)
  P(rbox(0.4, 0.06, 0.3, 0.025, 1), '#1d2b52', 0, 0.49, -1.0)
  P(new BoxGeometry(0.4, 0.012, 0.04), '#e8b54a', 0, 0.525, -1.1)
  // big screen on the front wall
  P(rbox(0.86, 0.52, 0.04, 0.015, 1), '#16181d', 0, 1.0, -1.49)
  add(g, new PlaneGeometry(0.8, 0.46), M.screen, 0, 1.0, -1.468)
  // side console (right): wood top, lamp, vase with a flower, minibar with an amber glow
  add(g, rbox(0.3, 0.66, 0.62, 0.03, 1), M.wood, 0.53, 0.33, 0.24)
  P(rbox(0.32, 0.03, 0.64, 0.012, 1), '#efe8da', 0.53, 0.675, 0.24)
  add(g, new PlaneGeometry(0.22, 0.2), M.amber, 0.375, 0.32, 0.24, 0, -Math.PI / 2, 0)
  P(lathe([[0, 0], [0.05, 0.005], [0.03, 0.06], [0.012, 0.25], [0, 0.25]], 10), '#c9b48a', 0.56, 0.69, 0.4)
  add(g, lathe([[0.04, 0], [0.09, 0.0], [0.06, 0.12], [0.03, 0.12]], 12), M.lamp, 0.56, 0.93, 0.4)
  P(lathe([[0, 0], [0.035, 0.005], [0.04, 0.05], [0.018, 0.11], [0.022, 0.13], [0, 0.13]], 10), '#f4f5f7', 0.56, 0.69, 0.12)
  P(new CylinderGeometry(0.004, 0.004, 0.12, 4), '#3f8f3a', 0.56, 0.86, 0.12)
  P(new SphereGeometry(0.035, 8, 6), '#ff7aa8', 0.56, 0.93, 0.12)
  P(rbox(0.12, 0.012, 0.18, 0.006, 1), '#f4f0e0', 0.53, 0.692, 0.0) // menu card
  return g
}

// Instanced copies of a prototype at the given seats (one InstancedMesh per baked material).
const _m4 = new Matrix4()
function instance(proto, list, F) {
  const parts = bake(proto, false)
  const out = []
  for (const part of parts.children) {
    const im = new InstancedMesh(part.geometry, part.material, list.length)
    list.forEach((s, i) => im.setMatrixAt(i, _m4.makeTranslation(s.x, F, s.z)))
    im.computeBoundingSphere()
    im.receiveShadow = true
    out.push(im)
  }
  return out
}

// --- The cabin ------------------------------------------------------------------------------------------
export function buildCabin(scene) {
  const CB = FLIGHT.cabin
  const F = CB.y
  const X = CB.x
  const AX = FLIGHT.aisle
  const CL = FLIGHT.classes
  const S = new Group()
  let seed = 7
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)

  // --- Layout along Z (nose -> tail) -----------------------------------------------------------
  const FRONT_EXT = [1.6, 1.3, 0.85, 0.75] // first seat centre behind its zone start
  const BACK_EXT = [0.62, 0.5, 0.5, 0.45]
  const SIT_Y = [0.55, 0.52, 0.53, 0.5]
  const zFront = CB.z - 22.8
  const galleyF = { z0: zFront, z1: zFront + 2.4 }
  const doorZ = [zFront + 3.2]
  let z = zFront + 4.0
  const zones = []
  const curtainZ = []
  let midGalley = null
  for (let k = 0; k < CL.length; k++) {
    const c = CL[k]
    const zone = { index: k, id: c.id, name: c.name, short: c.short, color: c.color, cfg: c, curtain: null, z0: z, rows: [] }
    if (k > 0) {
      zone.curtain = z
      curtainZ.push(z)
      if (k === CL.length - 1) {
        midGalley = { z0: z, z1: z + 3.4 }
        doorZ.push(z + 2.5)
        z += 3.4
      } else z += 1.12 // partition + vestibule (the crew post)
    }
    const firstRow = CL.slice(0, k).reduce((n, q) => n + q.rows, 1)
    const zr = z + FRONT_EXT[k]
    for (let i = 0; i < c.rows; i++) zone.rows.push({ row: firstRow + i, z: zr + i * c.pitch })
    z = zr + (c.rows - 1) * c.pitch + BACK_EXT[k] + 0.25
    zone.z1 = z
    zones.push(zone)
  }
  doorZ.push(z + 0.8)
  const backGalley = { z0: z + 1.6, z1: z + 4.2 }
  const zBack = backGalley.z1
  const len = zBack - zFront
  const zc = (zFront + zBack) / 2
  const rowZ = new Map()
  for (const zn of zones) for (const r of zn.rows) rowZ.set(r.row, r.z)

  // --- Materials --------------------------------------------------------------------------------
  const sky = canvasTex(paintSky())
  sky.wrapS = RepeatWrapping
  sky.repeat.set(0.22, 1)
  const mapCanvas = cv(256, 160)
  const mapTex = canvasTex(mapCanvas)
  const starsA = canvasTex(paintStars(31), 3, 6)
  const starsB = canvasTex(paintStars(97), 3, 6)
  const leather = (b, d, l) => new MeshStandardMaterial({ map: canvasTex(paintLeather(b, d, l), 2, 2), roughness: 0.45 })
  const M = {
    paint: new MeshStandardMaterial({ vertexColors: true, roughness: 0.55, emissive: '#000000' }),
    hull: new MeshStandardMaterial({ map: canvasTex(paintHull(), 1, Math.round(len / 1.8)), roughness: 0.6, side: DoubleSide, emissive: '#000000' }),
    floors: [
      new MeshStandardMaterial({ map: canvasTex(paintCarpet('#1b2140', ['#161b36', '#232a4e', '#1d2445'], '#c9a14a', true), 6, Math.round(len / 1.4)), roughness: 0.95 }),
      new MeshStandardMaterial({ map: canvasTex(paintCarpet('#2c3140', ['#262b38', '#353b4c'], '#4f8dff'), 6, Math.round(len / 1.4)), roughness: 0.95 }),
      new MeshStandardMaterial({ map: canvasTex(paintCarpet('#3a4650', ['#334049', '#435059'], '#2fc4b2'), 6, Math.round(len / 1.4)), roughness: 0.95 }),
      new MeshStandardMaterial({ map: canvasTex(paintCarpet('#5b6271', ['#525968', '#666d7c', '#4d5462'], 'rgba(140,170,230,0.35)'), 6, Math.round(len / 1.3)), roughness: 0.95 }),
    ],
    galleyFloor: new MeshStandardMaterial({ map: canvasTex(paintCarpet('#c9ced6', ['#bfc4cc', '#d3d8df'], '#aab0ba'), 4, 4), roughness: 0.7 }),
    runners: [
      new MeshStandardMaterial({ map: canvasTex(paintRunner('#2a1c10', '#c9a14a', '#ffe0a0', '#7a5a2a'), 1, 12), roughness: 0.95 }),
      new MeshStandardMaterial({ map: canvasTex(paintRunner('#1f2a44', '#3a6fd8', '#9cc2ff', '#2f4a86'), 1, 12), roughness: 0.95 }),
      new MeshStandardMaterial({ map: canvasTex(paintRunner('#1d3a3c', '#2fc4b2', '#a8fff2', '#2a6a66'), 1, 12), roughness: 0.95 }),
      new MeshStandardMaterial({ map: canvasTex(paintRunner('#1f2a44', '#3a6fd8', '#9cc2ff', '#2f4a86'), 1, 12), roughness: 0.95 }),
    ],
    fabricEco: new MeshStandardMaterial({ map: canvasTex(paintFabric(ECO_WEAVE, 'rgba(80,130,230,0.35)'), 2, 2), roughness: 0.9 }),
    backEco: new MeshStandardMaterial({ map: canvasTex(paintBackFabric(ECO_WEAVE, 'rgba(80,130,230,0.35)', '#1b8cff', '#3aa2ff')), roughness: 0.85 }),
    fabricPrem: new MeshStandardMaterial({ map: canvasTex(paintFabric(PREM_WEAVE, 'rgba(47,196,178,0.35)'), 2, 2), roughness: 0.85 }),
    backPrem: new MeshStandardMaterial({ map: canvasTex(paintBackFabric(PREM_WEAVE, 'rgba(47,196,178,0.35)', '#159c8e', '#2fc4b2')), roughness: 0.8 }),
    leatherBiz: leather('#30343f', '#262a33', '#3c414e'),
    leatherFirst: leather('#e9dcc2', '#d8c8aa', '#f6ecd8'),
    pillow: new MeshStandardMaterial({ color: '#f4f5f7', roughness: 0.95 }),
    wood: new MeshStandardMaterial({ map: canvasTex(paintWood()), roughness: 0.35, metalness: 0.05 }),
    screen: new MeshStandardMaterial({ color: '#000000', emissive: '#ffffff', emissiveMap: mapTex, emissiveIntensity: 0.95, roughness: 0.2 }),
    light: neon('#f2f8ff', 2.2),
    centreLight: neon('#f2f8ff', 2.2),
    gold: neon('#ffcf7a', 1.6),
    lamp: neon('#ffd9a0', 1.8),
    amber: neon('#ff9d3a', 1.2),
    belt: neon('#3a3020', 1),
    starsA: neon('#ffffff', 1.4, { map: starsA, transparent: true, blending: AdditiveBlending, depthWrite: false }),
    starsB: neon('#ffffff', 1.4, { map: starsB, transparent: true, blending: AdditiveBlending, depthWrite: false }),
    night: new MeshStandardMaterial({ color: '#121833', roughness: 0.9 }),
    window: new MeshStandardMaterial({ map: sky, emissive: '#ffffff', emissiveMap: sky, emissiveIntensity: 0.9, roughness: 0.15 }),
    beam: new MeshBasicMaterial({ map: canvasTex(paintBeam()), color: '#fff3d6', transparent: true, opacity: 0.25, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }),
    atlas: new MeshStandardMaterial({ map: canvasTex(paintAtlas()), roughness: 0.45, metalness: 0.15 }),
    exit: new MeshBasicMaterial({ map: canvasTex(paintExit()) }),
    bar: new MeshBasicMaterial({ map: canvasTex(paintBar()) }),
    chrome: new MeshStandardMaterial({ color: '#d9dee6', roughness: 0.18, metalness: 0.9 }),
  }
  M.belt.map = canvasTex(paintBelt())
  const signMats = zones.map((zn) => {
    const t = canvasTex(paintSign(zn.cfg.name.toUpperCase(), zn.color, zn.index === 0 ? '✦ skyhop air ✦' : ''))
    return new MeshStandardMaterial({ map: t, emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 0.7 })
  })
  const P = (parent, geo, hex, x, y, z, rx, ry, rz) => add(parent, tint(geo, hex), M.paint, x, y, z, rx, ry, rz)

  // --- Floors: carpet per class, aisle runners, galley vinyl, seat tracks ---------------------------
  const floorW = hullX(0) * 2
  const plank = (mat, z0, z1, w = floorW, x = X, y = 0.002) => add(S, new PlaneGeometry(w, z1 - z0), mat, x, F + y, (z0 + z1) / 2, -Math.PI / 2)
  plank(M.galleyFloor, galleyF.z0, galleyF.z1)
  plank(M.floors[0], galleyF.z1, zones[0].z1)
  for (const zn of zones) {
    if (zn.index === 0) continue
    plank(M.floors[zn.index], zn.curtain, zn.z1)
    for (const s of [-1, 1]) plank(M.runners[zn.index], zn.index === 3 ? midGalley.z1 : zn.curtain + 0.1, zn.z1, 0.9, X + s * AX, 0.006)
  }
  for (const s of [-1, 1]) plank(M.runners[0], galleyF.z1 + 0.3, zones[0].z1, 1.0, X + s * AX, 0.006)
  plank(M.galleyFloor, midGalley.z0 + 0.12, midGalley.z1, 3.0, X, 0.004)
  plank(M.floors[3], zones[3].z1, backGalley.z0)
  plank(M.galleyFloor, backGalley.z0, zBack)
  {
    const zn = zones[3]
    const tz0 = zn.rows[0].z - 0.7
    const tz1 = zn.rows[zn.rows.length - 1].z + 0.6
    for (const x of [-3.19, -2.61, -0.29, 0.29, 2.61, 3.19]) P(S, new BoxGeometry(0.07, 0.014, tz1 - tz0), '#8d949f', X + x, F + 0.007, (tz0 + tz1) / 2)
  }

  // --- Hull + dado + return-air grille -----------------------------------------------------------------
  const hull = new Mesh(new CylinderGeometry(R, R, len, 56, 1, true), M.hull)
  hull.rotation.x = Math.PI / 2
  hull.scale.set(1, 1, SY)
  hull.position.set(X, F + HY, zc)
  S.add(hull)
  for (const s of [-1, 1]) {
    const dado = add(S, tint(hullPatch(R - 0.02, s, 0.0, 0.5, zFront, zBack, 3), '#c3c8d1'), M.paint)
    dado.position.set(X, F, 0)
    const grille = add(S, tint(hullPatch(R - 0.03, s, 0.1, 0.17, zFront + 0.8, zBack - 0.8, 1), '#5d6370'), M.paint)
    grille.position.set(X, F, 0)
  }

  // --- Ceiling, coves, bins ----------------------------------------------------------------------------
  // Drop ceiling across the cabin; First gets a starlight panel; cove lights along the bins (mood colour).
  const ceilW = hullX(CEIL) * 2
  P(S, rbox(ceilW, 0.06, len - 0.4, 0.02, 1), '#f4f5f7', X, F + CEIL + 0.03, zc)
  {
    const z0 = galleyF.z1 + 0.4
    const z1 = zones[0].z1 - 0.2
    const pl = (mat, y) => add(S, new PlaneGeometry(3.6, z1 - z0), mat, X, F + y, (z0 + z1) / 2, Math.PI / 2)
    pl(M.night, CEIL - 0.002)
    pl(M.starsA, CEIL - 0.004)
    pl(M.starsB, CEIL - 0.006)
    for (const s of [-1, 1]) add(S, new BoxGeometry(0.04, 0.03, z1 - z0), M.gold, X + s * 1.82, F + CEIL - 0.02, (z0 + z1) / 2)
  }
  // Ceiling panel seams aft of First; over Business two light strips and a row of recessed downlights.
  for (let zz = zones[1].curtain + 0.9; zz < backGalley.z0; zz += 1.8) P(S, new BoxGeometry(ceilW - 0.4, 0.008, 0.025), '#c3c8d1', X, F + CEIL - 0.004, zz)
  {
    const z0 = zones[1].curtain + 0.25
    const z1 = zones[1].z1 - 0.2
    for (const s of [-1, 1]) {
      add(S, new BoxGeometry(0.07, 0.02, z1 - z0), M.centreLight, X + s * 1.05, F + CEIL - 0.012, (z0 + z1) / 2)
      P(S, new BoxGeometry(0.16, 0.012, z1 - z0), '#d6dae1', X + s * 1.05, F + CEIL - 0.004, (z0 + z1) / 2)
    }
    for (let zz = z0 + 0.6; zz < z1; zz += 1.2) {
      P(S, new CircleGeometry(0.1, 14).rotateX(Math.PI / 2), '#b9bfc8', X, F + CEIL - 0.004, zz)
      add(S, new CircleGeometry(0.07, 14).rotateX(Math.PI / 2), M.lamp, X, F + CEIL - 0.006, zz)
    }
  }
  // Side bins from Business to the back galley; centre bins over Premium + Economy.
  const binZ0 = zones[1].curtain + 0.15
  const binZ1 = backGalley.z0 - 0.1
  const binLen = binZ1 - binZ0
  const binN = Math.round(binLen / 1.8)
  const binL = binLen / binN
  for (const s of [-1, 1]) {
    const sh = new Shape()
    const pts = [[2.5, 2.06], [hullX(2.06) - 0.05, 2.06], [hullX(2.95) - 0.05, 2.95], [hullX(CEIL) - 0.03, CEIL], [2.42, CEIL], [2.42, 2.9]]
    sh.moveTo(s * pts[0][0], pts[0][1])
    for (const [x, y] of pts.slice(1)) sh.lineTo(s * x, y)
    sh.closePath()
    P(S, new ExtrudeGeometry(sh, { depth: binLen, bevelEnabled: false }), '#c9ced6', X, F, binZ0)
    const d = new Shape()
    d.moveTo(s * 2.52, 2.05)
    d.quadraticCurveTo(s * 2.34, 2.46, s * 2.44, 2.9)
    d.lineTo(s * 2.48, 2.9)
    d.quadraticCurveTo(s * 2.38, 2.46, s * 2.56, 2.05)
    d.closePath()
    const doorGeo = tint(new ExtrudeGeometry(d, { depth: binL - 0.06, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.008, bevelSegments: 1, curveSegments: 5 }), '#f7f8fa')
    const latchGeo = tint(rbox(0.035, 0.05, 0.3, 0.012, 1), '#2a2e36')
    for (let i = 0; i < binN; i++) {
      const za = binZ0 + i * binL + 0.03
      add(S, doorGeo, M.paint, X, F, za)
      add(S, latchGeo, M.paint, X + s * 2.5, F + 2.1, za + binL / 2 - 0.03)
    }
    add(S, new BoxGeometry(0.03, 0.02, binLen), M.light, X + s * 2.44, F + CEIL - 0.04, binZ0 + binLen / 2)
    P(S, rbox(0.9, 0.06, binLen, 0.02, 1), '#dfe2e8', X + s * 2.95, F + 2.03, binZ0 + binLen / 2) // PSU strip
  }
  const cbZ0 = zones[2].curtain + 0.15
  const cbZ1 = backGalley.z0 - 0.1
  {
    const L = cbZ1 - cbZ0
    P(S, rbox(1.9, 0.78, L, 0.14, 2), '#e9ecf0', X, F + 2.62, cbZ0 + L / 2)
    const n = Math.round(L / 1.8)
    for (let i = 0; i <= n; i++) for (const s of [-1, 1]) P(S, new BoxGeometry(0.01, 0.6, 0.02), '#b9bfc8', X + s * 0.955, F + 2.6, cbZ0 + (i * L) / n)
    for (let i = 0; i < n; i++) for (const s of [-1, 1]) P(S, rbox(0.03, 0.05, 0.28, 0.01, 1), '#2a2e36', X + s * 0.96, F + 2.35, cbZ0 + ((i + 0.5) * L) / n)
    for (const s of [-1, 1]) add(S, new BoxGeometry(0.03, 0.02, L), M.centreLight, X + s * 0.86, F + 3.03, cbZ0 + L / 2)
    P(S, rbox(1.4, 0.05, L, 0.02, 1), '#dfe2e8', X, F + 2.21, cbZ0 + L / 2) // centre PSU strip
  }
  // Passenger service units per row and block: reading lights, gaspers, seatbelt sign.
  const psuGeo = atlasUV(new PlaneGeometry(0.44, 0.42), A_PSU).rotateX(Math.PI / 2)
  const lensGeo = new CircleGeometry(0.026, 10).rotateX(Math.PI / 2)
  const gasperGeo = tint(lathe([[0, -0.034], [0.016, -0.03], [0.03, 0]], 6), '#bfc5ce')
  const beltGeo = new PlaneGeometry(0.1, 0.05).rotateX(Math.PI / 2)
  for (const zn of zones.slice(1)) {
    for (const r of zn.rows) {
      const blocks = [[-2.95, 2.0], [2.95, 2.0]]
      if (zn.index >= 2) blocks.push([0, 2.18])
      for (const [bx, by] of blocks) {
        const px = X + bx
        const pz = r.z - 0.1
        add(S, psuGeo, M.atlas, px, F + by - 0.002, pz)
        for (const k of [-1, 0, 1]) {
          add(S, lensGeo, M.light, px + k * 0.128, F + by - 0.005, pz + 0.08)
          add(S, gasperGeo, M.paint, px + k * 0.128, F + by - 0.002, pz - 0.08)
        }
        add(S, beltGeo, M.belt, px - 0.17, F + by - 0.006, pz + 0.165)
      }
    }
  }

  // --- Windows: bezel with a reveal, scrolling sky glass, shades; light shafts on the sunny side ------
  const yW = 1.5
  const th = Math.asin((yW - HY) / (SY * R))
  const tilt = Math.atan(Math.tan(th) / SY)
  const bezGeo = tint(bezelGeo(), '#f3f4f6')
  const glassGeo = fitUV(new ShapeGeometry(roundRectShape(0.33, 0.5, 0.14), 3))
  const tabGeo = tint(new BoxGeometry(0.08, 0.02, 0.016), '#cfc8b4')
  const shadeGeos = [0.3, 0.55, 1].map((k) => tint(new PlaneGeometry(0.33, 0.5 * k), '#efe9da'))
  const skip = (wz) => doorZ.some((d) => Math.abs(wz - d) < 0.8) || curtainZ.some((c) => Math.abs(wz - c) < 0.35) || (wz > midGalley.z0 - 0.1 && wz < midGalley.z0 + 1.7) || wz > backGalley.z0 - 0.2 || wz < galleyF.z1 + 0.2
  const beamPos = []
  const beamUv = []
  const wx = hullX(yW) - 0.022
  for (let wz = galleyF.z1 + 0.6; wz < zBack; wz += 0.95) {
    if (skip(wz)) continue
    for (const s of [-1, 1]) {
      const w = new Group()
      w.position.set(X + s * wx, F + yW, wz)
      w.rotation.set(tilt, -s * Math.PI / 2, 0, 'YXZ')
      S.add(w)
      add(w, glassGeo, M.window, 0, 0, 0.004)
      add(w, bezGeo, M.paint)
      const k = rnd()
      const i = k < 0.6 ? -1 : k < 0.82 ? 0 : k < 0.94 ? 1 : 2
      if (i >= 0) {
        const h = 0.5 * [0.3, 0.55, 1][i]
        add(w, shadeGeos[i], M.paint, 0, 0.25 - h / 2, 0.014)
        add(w, tabGeo, M.paint, 0, 0.25 - h + 0.01, 0.02)
      } else add(w, tabGeo, M.paint, 0, 0.24, 0.02)
      // a shaft of sunlight falling inward from the open windows on the left
      if (s < 0 && i < 2) {
        const top = [X - wx + 0.05, F + yW + 0.18]
        const bot = [X - wx + 1.9, F + 0.02]
        const hw = 0.16
        const dz = 0.55
        const quad = [
          [top[0], top[1], wz - hw], [top[0], top[1], wz + hw], [bot[0], bot[1], wz + hw + dz],
          [top[0], top[1], wz - hw], [bot[0], bot[1], wz + hw + dz], [bot[0], bot[1], wz - hw + dz],
        ]
        for (const q of quad) beamPos.push(...q)
        beamUv.push(0, 1, 1, 1, 1, 0, 0, 1, 1, 0, 0, 0)
      }
    }
  }
  const beamGeo = new BufferGeometry()
  beamGeo.setAttribute('position', new BufferAttribute(new Float32Array(beamPos), 3))
  beamGeo.setAttribute('uv', new BufferAttribute(new Float32Array(beamUv), 2))
  const beams = new Mesh(beamGeo, M.beam)
  beams.renderOrder = 6
  beams.frustumCulled = false

  // --- Seats -------------------------------------------------------------------------------------------
  const seats = []
  for (const zn of zones) {
    const c = zn.cfg
    const letters = c.seats.replace(/\|/g, '')
    for (const r of zn.rows) {
      for (const L of letters) {
        const x = X + c.x[L]
        const ax = X + (c.x[L] <= 0 ? -AX : AX)
        seats.push({ cls: zn.index, row: r.row, letter: L, code: `${r.row}${L}`, x, y: F + SIT_Y[zn.index], z: r.z, yaw: Math.PI, npc: null, aisleX: ax })
      }
    }
  }
  const seatsOf = (k) => seats.filter((s) => s.cls === k)
  const instanced = [
    ...instance(suiteProto(M), seatsOf(0), F),
    ...instance(podProto(M), seatsOf(1), F),
    ...instance(seatProto(M, { W: 0.66, premium: true, cushion: M.fabricPrem, back: M.backPrem }), seatsOf(2), F),
    ...instance(seatProto(M, { W: 0.58, cushion: M.fabricEco, back: M.backEco }), seatsOf(3), F),
  ]
  // First: sliding doors (open) on the aisle sides, window-side fillers, gold accent strip at the floor.
  for (const s of seatsOf(0)) {
    const sides = Math.abs(s.x - X) < 0.5 ? [-1, 1] : [Math.sign(X - s.x)]
    for (const d of sides) {
      add(S, rbox(0.04, 1.28, 0.8, 0.02, 1), M.wood, s.x + d * 0.68, F + 0.66, s.z + 0.22)
      add(S, new BoxGeometry(0.02, 0.02, 0.8), M.gold, s.x + d * 0.66, F + 1.0, s.z + 0.22)
      P(S, new BoxGeometry(0.03, 0.14, 0.03), '#c9b48a', s.x + d * 0.65, F + 0.9, s.z - 0.15)
      add(S, new BoxGeometry(0.012, 0.012, 2.1), M.gold, s.x + d * 0.74, F + 0.03, s.z - 0.45)
    }
    if (Math.abs(s.x - X) > 0.5) {
      const w = -Math.sign(X - s.x)
      add(S, rbox(0.06, 1.1, 1.4, 0.03, 1), M.wood, s.x + w * 0.73, F + 0.55, s.z - 0.85)
    }
  }
  // Business: window consoles (water bottle, menu), the centre pair's privacy divider.
  for (const s of seatsOf(1)) {
    const off = s.x - X
    if (Math.abs(off) > 1.5) {
      const w = Math.sign(off)
      const cx = s.x + w * 0.66
      P(S, rbox(0.4, 0.62, 1.0, 0.04, 1), '#ece8e0', cx, F + 0.31, s.z - 0.2)
      P(S, rbox(0.42, 0.03, 1.02, 0.015, 1), '#c9b48a', cx, F + 0.635, s.z - 0.2)
      P(S, lathe([[0, 0], [0.03, 0.005], [0.032, 0.14], [0.012, 0.18], [0.012, 0.21], [0, 0.21]], 8), '#bfe6ff', cx, F + 0.65, s.z - 0.45)
      P(S, new CylinderGeometry(0.014, 0.014, 0.025, 8), '#1b8cff', cx, F + 0.87, s.z - 0.45)
      P(S, rbox(0.12, 0.012, 0.18, 0.006, 1), '#f4f0e0', cx, F + 0.656, s.z - 0.1)
    } else if (off > 0) {
      P(S, rbox(0.04, 0.55, 1.2, 0.02, 1), '#d6dae1', X, F + 1.28, s.z - 0.2)
      P(S, new BoxGeometry(0.05, 0.02, 1.2), '#c9b48a', X, F + 1.56, s.z - 0.2)
    }
  }
  // Premium + Economy: the armrest at the right end of each block, leg frames, cross tubes.
  for (const zn of zones.slice(2)) {
    const c = zn.cfg
    const blocks = c.seats.split('|')
    const W = zn.index === 2 ? 0.66 : 0.58
    for (const r of zn.rows) {
      for (const b of blocks) {
        const xs = [...b].map((L) => c.x[L])
        const right = xs[xs.length - 1] + W / 2 + 0.01
        if (zn.index === 3) {
          const g = new Group()
          g.position.set(X + right, F, r.z)
          armrest((geo, hex, x, y, z2, rx, ry, rz) => add(g, tint(geo, hex), M.paint, x, y, z2, rx, ry, rz), 0, 0)
          S.add(g)
        }
        const x0 = X + xs[0] - W / 2 + 0.08
        const x1 = X + xs[xs.length - 1] + W / 2 - 0.08
        for (const lx of [x0, x1]) {
          P(S, new BoxGeometry(0.04, 0.34, 0.05), '#8d949f', lx, F + 0.17, r.z - 0.17, -0.12, 0, 0)
          P(S, new BoxGeometry(0.04, 0.36, 0.05), '#8d949f', lx, F + 0.17, r.z + 0.17, 0.32, 0, 0)
          P(S, new BoxGeometry(0.05, 0.03, 0.5), '#6d7380', lx, F + 0.025, r.z + 0.01)
        }
        for (const dz of [-0.16, 0.12]) P(S, new CylinderGeometry(0.022, 0.022, x1 - x0, 6, 1, true), '#9aa1ad', (x0 + x1) / 2, F + 0.31, r.z + dz, 0, 0, Math.PI / 2)
      }
    }
  }

  // --- Partitions: one per curtain line, hull to aisle + the centre block, a header with the sign ------
  const OPEN = 0.86 // half-width of an aisle opening (the player's capsule is 1.5 m across)
  const curtains = []
  for (const zn of zones.slice(1)) {
    const cz = zn.curtain
    const fwd = zones[zn.index - 1]
    const fwdCol = fwd.index === 0 ? '#3a2a1c' : '#d6dae1'
    for (const s of [-1, 1]) {
      // side wall: hull to the aisle opening (aft face, and a forward face in the forward class's colour)
      add(S, tint(hullWall(s, AX + OPEN, CEIL), '#d6dae1'), M.paint, X, F, cz + 0.06)
      add(S, tint(hullWall(-s, AX + OPEN, CEIL).rotateY(Math.PI), fwdCol), M.paint, X, F, cz - 0.06)
      add(S, new BoxGeometry(0.04, CEIL - 0.1, 0.14), M.chrome, X + s * (AX + OPEN), F + (CEIL - 0.1) / 2, cz)
      add(S, new BoxGeometry(0.04, CEIL - 0.1, 0.14), M.chrome, X + s * (AX - OPEN), F + (CEIL - 0.1) / 2, cz)
      solidBox((hullX(1) - AX - OPEN) / 2, 1.6, 0.08, X + s * (AX + OPEN + (hullX(1) - AX - OPEN) / 2), F + 1.6, cz)
      // header over the opening with the forward class's sign (facing aft)
      P(S, rbox(OPEN * 2 + 0.08, CEIL - 2.32, 0.14, 0.02, 1), '#e3e6eb', X + s * AX, F + (CEIL + 2.32) / 2, cz)
      add(S, new PlaneGeometry(1.3, 0.285), signMats[fwd.index], X + s * AX, F + 2.62, cz + 0.075)
      add(S, new BoxGeometry(OPEN * 2, 0.02, 0.02), M.chrome, X + s * AX, F + 2.32, cz + 0.02) // curtain rod
      for (const side of [-1, 1]) curtains.push({ cz, k: zn.index, ax: X + s * AX, x: X + s * AX + side * OPEN, dir: -side, open: 0, target: 0, sway: rnd() * 6 })
    }
    // centre block between the aisles: wall + a moving-map monitor facing aft
    const cw = (AX - OPEN) * 2
    P(S, rbox(cw, CEIL - 0.06, 0.14, 0.02, 1), zn.index === 1 ? '#3a2a1c' : '#d6dae1', X, F + (CEIL - 0.06) / 2, cz)
    P(S, rbox(cw - 0.1, CEIL - 0.3, 0.01, 0.005, 1), '#e3e6eb', X, F + (CEIL - 0.06) / 2, cz + 0.075)
    solidBox(cw / 2, 1.6, 0.08, X, F + 1.6, cz)
    P(S, rbox(0.9, 0.55, 0.05, 0.02, 1), '#16181d', X, F + 1.75, cz + 0.1)
    add(S, new PlaneGeometry(0.84, 0.5), M.screen, X, F + 1.75, cz + 0.128)
    add(S, new PlaneGeometry(0.62, 0.135), signMats[zn.index], X, F + 2.35, cz + 0.08)
    add(S, new BoxGeometry(cw - 0.1, 0.02, 0.02), M.light, X, F + 0.06, cz + 0.08)
  }

  // --- Front: cockpit wall + door, front galley, the First Class bar --------------------------------
  {
    const gz = galleyF.z0
    const gw = hullX(1.0) * 2
    P(S, new PlaneGeometry(gw, CEIL), '#c4c9d1', X, F + CEIL / 2, gz + 0.01)
    // galley block along the cockpit wall (two halves either side of the cockpit door)
    for (const s of [-1, 1]) {
      const cx = X + s * 2.0
      P(S, new BoxGeometry(2.6, 0.96, 0.7), '#b4bbc6', cx, F + 0.48, gz + 0.38)
      add(S, atlasUV(new PlaneGeometry(0.8, 0.92), A_DRAW), M.atlas, cx + s * 0.8, F + 0.48, gz + 0.735)
      const cartGeo = tint(rbox(0.36, 0.94, 0.62, 0.03, 1), '#aab2bd')
      const cartFront = atlasUV(new PlaneGeometry(0.33, 0.9), A_CART)
      for (let k = -1; k <= 1; k++) {
        add(S, cartGeo, M.paint, cx - s * 0.35 + k * 0.42, F + 0.49, gz + 0.36)
        add(S, cartFront, M.atlas, cx - s * 0.35 + k * 0.42, F + 0.49, gz + 0.675)
      }
      P(S, rbox(2.6, 0.05, 0.74, 0.02, 1), '#b8bec8', cx, F + 1.0, gz + 0.38)
      P(S, new BoxGeometry(2.6, 0.8, 0.42), '#c9ced6', cx, F + 1.95, gz + 0.22)
      add(S, atlasUV(new PlaneGeometry(2.56, 0.78), A_UPPER), M.atlas, cx, F + 1.95, gz + 0.432)
      add(S, new BoxGeometry(2.4, 0.015, 0.04), M.lamp, cx, F + 1.535, gz + 0.4)
      P(S, rbox(0.34, 0.4, 0.3, 0.03, 1), '#24282f', cx - s * 0.6, F + 1.225, gz + 0.17)
      P(S, lathe([[0, 0], [0.07, 0.005], [0.08, 0.08], [0.06, 0.15], [0.03, 0.17], [0, 0.17]], 10), '#3a3f48', cx - s * 0.6, F + 1.03, gz + 0.4)
      solidBox(1.3, 1.13, 0.4, cx, F + 1.13, gz + 0.4)
    }
    // cockpit door: reinforced panel, keypad, peephole, CREW ONLY plate
    P(S, rbox(0.95, 2.1, 0.08, 0.03, 1), '#e6e8ec', X, F + 1.05, gz + 0.05)
    P(S, rbox(0.85, 2.0, 0.02, 0.02, 1), '#d0d5dc', X, F + 1.04, gz + 0.1)
    P(S, rbox(0.1, 0.16, 0.03, 0.01, 1), '#2a2f38', X + 0.34, F + 1.15, gz + 0.11)
    add(S, new PlaneGeometry(0.03, 0.03), M.light, X + 0.34, F + 1.2, gz + 0.127)
    P(S, new CylinderGeometry(0.025, 0.025, 0.02, 10).rotateX(Math.PI / 2), '#16181d', X, F + 1.6, gz + 0.11)
    P(S, new BoxGeometry(0.32, 0.08, 0.01), '#d6232e', X, F + 1.85, gz + 0.11)
    // the bar: counter with a gold edge + footrail, back-lit bottle shelf on the galley's aft face
    const bz = galleyF.z1 + 0.55
    add(S, rbox(1.9, 1.05, 0.5, 0.05, 1), M.wood, X, F + 0.525, bz)
    P(S, rbox(2.0, 0.05, 0.62, 0.02, 1), '#efe8da', X, F + 1.075, bz)
    add(S, new BoxGeometry(1.92, 0.02, 0.02), M.gold, X, F + 1.05, bz + 0.31)
    add(S, new CylinderGeometry(0.018, 0.018, 1.8, 8).rotateZ(Math.PI / 2), M.chrome, X, F + 0.2, bz + 0.32)
    for (const s of [-1, 1]) {
      add(S, new CylinderGeometry(0.02, 0.03, 0.72, 8), M.chrome, X + s * 0.5, F + 0.36, bz + 0.62)
      add(S, rbox(0.34, 0.08, 0.34, 0.04, 2), M.leatherFirst, X + s * 0.5, F + 0.76, bz + 0.62)
      add(S, new TorusGeometry(0.14, 0.012, 4, 14).rotateX(Math.PI / 2), M.chrome, X + s * 0.5, F + 0.3, bz + 0.62)
    }
    // the wall behind the bar (galley workspace behind it, crew walk round the ends)
    add(S, rbox(2.2, CEIL, 0.1, 0.02, 1), M.wood, X, F + CEIL / 2, galleyF.z1 - 0.06)
    solidBox(1.1, 1.6, 0.06, X, F + 1.6, galleyF.z1 - 0.06)
    add(S, new PlaneGeometry(1.9, 0.9), M.bar, X, F + 1.6, galleyF.z1 - 0.005)
    add(S, new BoxGeometry(2.1, 0.02, 0.03), M.gold, X, F + 2.1, galleyF.z1 - 0.0)
    for (let i = 0; i < 4; i++) P(S, lathe([[0, 0], [0.03, 0.0], [0.035, 0.07], [0.01, 0.1], [0, 0.1]], 8), '#f2f6ff', X - 0.45 + i * 0.3, F + 1.1, bz - 0.05) // glasses
    solidBox(0.95, 0.55, 0.25, X, F + 0.55, bz)
    // welcome sign over the cross aisle
    add(S, new PlaneGeometry(1.6, 0.35), signMats[0], X, F + CEIL - 0.3, galleyF.z1 + 0.02)
  }

  // --- Mid galley (behind Premium): carts, lavatories, the crew jump seats -------------------------
  const lavGeo = atlasUV(new PlaneGeometry(0.76, 1.94), A_LAV)
  const lavSigns = []
  {
    const gz = midGalley.z0 + 0.12
    const cw = (AX - OPEN) * 2
    P(S, new BoxGeometry(cw, 0.96, 1.0), '#b4bbc6', X, F + 0.48, gz + 0.5)
    const cartGeo = tint(rbox(0.36, 0.94, 0.62, 0.03, 1), '#aab2bd')
    const cartFront = atlasUV(new PlaneGeometry(0.33, 0.9), A_CART)
    for (const k of [-1, 0, 1]) {
      add(S, cartGeo, M.paint, X + k * 0.4, F + 0.49, gz + 0.68)
      add(S, cartFront, M.atlas, X + k * 0.4, F + 0.49, gz + 0.995)
    }
    P(S, rbox(cw, 0.05, 1.02, 0.02, 1), '#b8bec8', X, F + 1.0, gz + 0.5)
    P(S, new BoxGeometry(cw, 0.8, 0.4), '#c9ced6', X, F + 1.95, gz + 0.2)
    add(S, atlasUV(new PlaneGeometry(cw - 0.04, 0.78), A_UPPER), M.atlas, X, F + 1.95, gz + 0.402)
    add(S, new BoxGeometry(cw - 0.1, 0.015, 0.04), M.lamp, X, F + 1.535, gz + 0.38)
    solidBox(cw / 2, 1.13, 0.55, X, F + 1.13, gz + 0.5)
    // lavatories against the side walls, doors facing the aisles
    for (const s of [-1, 1]) {
      const lx = X + s * (AX + OPEN + 0.62)
      P(S, rbox(1.2, CEIL - 0.1, 1.5, 0.03, 1), '#e3e6eb', lx + s * 0.05, F + (CEIL - 0.1) / 2, gz + 0.75)
      add(S, lavGeo, M.atlas, lx - s * 0.56, F + 1.0, gz + 0.8, 0, -s * Math.PI / 2, 0)
      const sign = new MeshBasicMaterial({ color: '#2ecc5a' })
      lavSigns.push(sign)
      add(S, new PlaneGeometry(0.16, 0.06), sign, lx - s * 0.565, F + 1.62, gz + 0.8, 0, -s * Math.PI / 2, 0)
      add(S, new BoxGeometry(0.02, 0.02, 1.4), M.light, lx - s * 0.6, F + CEIL - 0.12, gz + 0.75)
      solidBox(0.6, 1.5, 0.75, lx + s * 0.05, F + 1.5, gz + 0.75)
      // crew jump seat folded against the lav wall
      P(S, rbox(0.42, 0.62, 0.08, 0.03, 1), '#2b303b', lx - s * 0.2, F + 0.95, gz + 1.54)
    }
  }

  // --- Back: galley across the tail + two lavatories -------------------------------------------------
  {
    const gz = backGalley.z1
    const gw = hullX(1.0) * 2
    const backWall = add(S, tint(new PlaneGeometry(gw, CEIL), '#c9ced6'), M.paint, X, F + CEIL / 2, gz - 0.02)
    backWall.rotation.y = Math.PI
    P(S, new BoxGeometry(3.4, 0.96, 0.7), '#b4bbc6', X, F + 0.48, gz - 0.4)
    const cartGeo = tint(rbox(0.36, 0.94, 0.62, 0.03, 1), '#aab2bd')
    const cartFront = atlasUV(new PlaneGeometry(0.33, 0.9), A_CART)
    for (let k = -3; k <= 3; k++) {
      add(S, cartGeo, M.paint, X + k * 0.42, F + 0.49, gz - 0.4)
      add(S, cartFront, M.atlas, X + k * 0.42, F + 0.49, gz - 0.715, 0, Math.PI, 0)
    }
    P(S, rbox(3.4, 0.05, 0.74, 0.02, 1), '#b8bec8', X, F + 1.0, gz - 0.4)
    P(S, new BoxGeometry(3.4, 0.8, 0.42), '#c9ced6', X, F + 1.95, gz - 0.22)
    add(S, atlasUV(new PlaneGeometry(3.36, 0.78), A_UPPER), M.atlas, X, F + 1.95, gz - 0.432, 0, Math.PI, 0)
    add(S, new BoxGeometry(3.2, 0.015, 0.04), M.lamp, X, F + 1.535, gz - 0.42)
    solidBox(1.7, 1.13, 0.4, X, F + 1.13, gz - 0.4)
    for (const s of [-1, 1]) {
      const lx = X + s * 2.75
      P(S, rbox(1.4, CEIL - 0.1, 1.6, 0.03, 1), '#e3e6eb', lx, F + (CEIL - 0.1) / 2, gz - 0.85)
      add(S, lavGeo, M.atlas, lx, F + 1.0, gz - 1.66, 0, Math.PI, 0)
      const sign = new MeshBasicMaterial({ color: '#2ecc5a' })
      lavSigns.push(sign)
      add(S, new PlaneGeometry(0.16, 0.06), sign, lx, F + 1.62, gz - 1.665, 0, Math.PI, 0)
      solidBox(0.7, 1.5, 0.8, lx, F + 1.5, gz - 0.85)
    }
  }

  // --- Exit doors (curved panels on the hull) + EXIT signs ------------------------------------------
  const exitPlane = new PlaneGeometry(0.3, 0.12)
  for (const dz of doorZ) {
    for (const s of [-1, 1]) {
      const fr = add(S, tint(hullPatch(R - 0.035, s, 0.0, 2.1, dz - 0.6, dz + 0.6, 6), '#9aa1ad'), M.paint)
      fr.position.set(X, F, 0)
      const door = add(S, tint(hullPatch(R - 0.05, s, 0.05, 2.04, dz - 0.55, dz + 0.55, 6), '#eef0f3'), M.paint)
      door.position.set(X, F, 0)
      P(S, rbox(0.06, 0.08, 0.44, 0.02, 1), '#5a6170', X + s * (hullX(1.05) - 0.075), F + 1.05, dz)
      P(S, new BoxGeometry(0.03, 0.03, 0.8), '#d0d5dc', X + s * (hullX(1.6) - 0.08), F + 1.6, dz)
      const sx = X + s * (hullX(2.3) - 0.3)
      P(S, new BoxGeometry(0.32, 0.14, 0.03), '#e6e8ec', sx, F + 2.3, dz - 0.62)
      add(S, exitPlane, M.exit, sx, F + 2.3, dz - 0.6)
      // floor path lights toward the door
      for (let k = 1; k <= 4; k++) add(S, new BoxGeometry(0.06, 0.01, 0.06), M.light, X + s * (AX + 0.55 + k * 0.4), F + 0.012, dz)
    }
  }

  // Colliders: floor, walls, ends, ceiling. The bins (side, full length; centre, Premium + Economy) are
  // solid too, so the chase camera stops at them instead of swinging into the hull.
  solidBox(4, 0.25, len / 2 + 0.5, X, F - 0.25, zc)
  for (const s of [-1, 1]) solidBox(0.25, 1.8, len / 2, X + s * 3.95, F + 1.8, zc)
  for (const s of [-1, 1]) solidBox(0.75, 0.6, len / 2, X + s * 3.2, F + 2.65, zc)
  solidBox(0.95, 0.4, (cbZ1 - cbZ0) / 2, X, F + 2.62, (cbZ0 + cbZ1) / 2)
  solidBox(4, 1.8, 0.25, X, F + 1.8, zFront - 0.2)
  solidBox(4, 1.8, 0.25, X, F + 1.8, zBack + 0.2)
  solidBox(4, 0.25, len / 2, X, F + CEIL + 0.3, zc)

  const baked = bake(S, false)
  for (const im of instanced) baked.add(im)
  baked.traverse((o) => {
    if (o.isMesh) o.receiveShadow = true
  })
  baked.add(beams)

  // --- Curtains: two halves per aisle opening, one InstancedMesh; they part when told to ---------------
  const cGeo = (() => {
    const g = new PlaneGeometry(OPEN, 2.2, 10, 1)
    const p = g.attributes.position
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) + OPEN / 2
      p.setX(i, x)
      p.setZ(i, Math.sin(x * 26) * 0.035)
      p.setY(i, p.getY(i) - 1.1)
    }
    g.computeVertexNormals()
    return g
  })()
  const curtainMat = new MeshStandardMaterial({ map: canvasTex(paintCurtain('#1d2b52', 'rgba(255,255,255,0.05)', '#e8b54a'), 2, 1), roughness: 0.9, side: DoubleSide })
  const curtainMesh = new InstancedMesh(cGeo, curtainMat, curtains.length)
  curtainMesh.frustumCulled = false
  baked.add(curtainMesh)
  const cq = new Quaternion()
  const cs = new Vector3()
  const cp = new Vector3()
  const yAxis = new Vector3(0, 1, 0)
  function drawCurtains(dt, t) {
    curtains.forEach((c, i) => {
      c.open += (c.target - c.open) * Math.min(1, dt * (c.target > c.open ? 7 : 3))
      const o = c.open
      cs.set(c.dir * (1 - 0.78 * o), 1, 1)
      cq.setFromAxisAngle(yAxis, Math.sin(t * 1.3 + c.sway) * 0.03 + o * 0.25 * c.dir)
      cp.set(c.x, F + 2.31, c.cz + Math.sin(t * 0.9 + c.sway) * 0.01)
      curtainMesh.setMatrixAt(i, _m4.compose(cp, cq, cs))
    })
    curtainMesh.instanceMatrix.needsUpdate = true
  }
  drawCurtains(1, 0)

  baked.visible = false
  scene.add(baked)

  // --- Moods, sky, moving map ---------------------------------------------------------------------
  const MOODS = {
    board: { cove: '#f4f8ff', wash: 0.05, beam: 0.22, sky: '#ffffff', stars: 0.6 },
    dim: { cove: '#ff9a52', wash: 0.025, beam: 0.12, sky: '#ffffff', stars: 1 },
    cruise: { cove: '#8a74ff', wash: 0.04, beam: 0.3, sky: '#ffffff', stars: 1 },
    meal: { cove: '#ffe2b0', wash: 0.06, beam: 0.34, sky: '#ffffff', stars: 0.8 },
    night: { cove: '#3f5bff', wash: 0.018, beam: 0.06, sky: '#7a86c8', stars: 1.4 },
    landing: { cove: '#ffd0a0', wash: 0.055, beam: 0.36, sky: '#ffc49a', stars: 0.6 },
  }
  const cur = { cove: new Color(MOODS.board.cove), wash: 0.05, beam: 0.22, sky: new Color('#ffffff'), stars: 0.6 }
  let mood = MOODS.board
  const tgt = new Color()
  const route = { from: 'SKY', to: '---', color: '#ffd23b', progress: 0, line: '' }
  let mapDirty = true
  let mapT = 0
  let scroll = 0.02
  let belt = false
  let clock = 0
  const mapCtx = mapCanvas.getContext('2d')

  return {
    root: baked,
    seats,
    zones,
    curtains,
    floorY: F,
    zFront,
    zBack,
    aisle: AX,
    // Crew spots: behind the First bar, aft of the mid galley block, in front of the back galley.
    galley: { front: { x: X, z: galleyF.z1 + 0.16 }, mid: { x: X, z: midGalley.z0 + 1.75 }, back: { x: X, z: backGalley.z0 + 0.3 } },
    // Where each class's crew member stands: just aft of the curtain in front of that class.
    posts: zones.map((zn) => (zn.curtain == null ? null : { x: X, z: zn.curtain + (zn.index === 3 ? 1.75 : 0.62), yaw: 0 })),
    rowZ: (row) => rowZ.get(row) ?? zc,
    seatsOf,
    // The class zone at z (the mid galley belongs to Economy; the front galley + bar to First).
    classAt(zq) {
      for (let k = zones.length - 1; k > 0; k--) if (zq >= zones[k].curtain) return k
      return 0
    },
    seatFor(code) {
      const m = /^(\d+)([A-K])$/.exec(code ?? '')
      return seats.find((s) => m && s.row === +m[1] && s.letter === m[2]) ?? null
    },
    setVisible(v) {
      baked.visible = v
    },
    setMood(name) {
      mood = MOODS[name] ?? MOODS.cruise
    },
    setSky(speed) {
      scroll = speed
    },
    setSeatbelt(on) {
      belt = on
      retint(M.belt, on ? '#ffb02e' : '#3a3020', on ? 1.8 : 1)
    },
    get seatbelt() {
      return belt
    },
    setRoute(from, to, color) {
      route.from = from
      route.to = to
      route.color = color
      mapDirty = true
    },
    setProgress(p, line) {
      if (Math.abs(p - route.progress) > 0.004 || line !== route.line) mapDirty = true
      route.progress = p
      route.line = line
    },
    setLav(i, busy) {
      lavSigns[i]?.color.set(busy ? '#e0413a' : '#2ecc5a')
    },
    update(dt) {
      if (!baked.visible) return
      clock += dt
      // mood lerp: coves, a faint wash on the walls, light shafts, sky tint, starlight twinkle
      const k = Math.min(1, dt * 1.2)
      cur.cove.lerp(tgt.set(mood.cove), k)
      cur.wash += (mood.wash - cur.wash) * k
      cur.beam += (mood.beam - cur.beam) * k
      cur.sky.lerp(tgt.set(mood.sky), k)
      cur.stars += (mood.stars - cur.stars) * k
      retint(M.light, cur.cove)
      retint(M.centreLight, cur.cove)
      M.paint.emissive.copy(cur.cove).multiplyScalar(cur.wash)
      M.hull.emissive.copy(cur.cove).multiplyScalar(cur.wash)
      M.beam.opacity = cur.beam * (0.85 + Math.sin(clock * 0.7) * 0.15)
      M.window.color.copy(cur.sky)
      M.window.emissive.copy(cur.sky)
      retint(M.starsA, '#ffffff', cur.stars * (0.6 + 0.4 * Math.sin(clock * 1.7)))
      retint(M.starsB, '#ffffff', cur.stars * (0.6 + 0.4 * Math.sin(clock * 1.3 + 2)))
      sky.offset.x = (sky.offset.x + dt * scroll) % 1
      drawCurtains(dt, clock)
      mapT -= dt
      if (mapDirty && mapT <= 0) {
        mapT = 0.5
        mapDirty = false
        paintMap(mapCtx, 256, 160, route)
        mapTex.needsUpdate = true
      }
    },
  }
}

// --- Props made on demand (cabinCrew.js) -------------------------------------------------------------
const cartMats = {}
function cartMat(key, make) {
  return (cartMats[key] ??= make())
}
// The trolley: brushed body with skyhop fronts at both ends, a top tray of cups, bottles and a coffee pot,
// four castors and a push bar at the back (+Z). Local origin: floor, centre.
export function makeCart() {
  const g = new Group()
  const paint = cartMat('paint', () => new MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.35 }))
  const atlas = cartMat('atlas', () => new MeshStandardMaterial({ map: canvasTex(paintAtlas()), roughness: 0.45, metalness: 0.2 }))
  const P = (geo, hex, x, y, z, rx = 0, ry = 0, rz = 0) => add(g, tint(geo, hex), paint, x, y, z, rx, ry, rz)
  P(rbox(0.38, 0.92, 0.74, 0.03, 1), '#aab2bd', 0, 0.54, 0)
  for (const s of [-1, 1]) add(g, atlasUV(new PlaneGeometry(0.34, 0.88), A_CART), atlas, 0, 0.54, s * 0.372, 0, s < 0 ? Math.PI : 0, 0)
  P(rbox(0.44, 0.03, 0.8, 0.012, 1), '#5a6170', 0, 1.02, 0)
  P(new BoxGeometry(0.46, 0.06, 0.02), '#2a2f38', 0, 1.06, -0.4)
  P(new CylinderGeometry(0.018, 0.018, 0.44, 8).rotateZ(Math.PI / 2), '#2a2f38', 0, 1.0, 0.43)
  for (const [x, z] of [[-0.15, -0.3], [0.15, -0.3], [-0.15, 0.3], [0.15, 0.3]]) P(new CylinderGeometry(0.045, 0.045, 0.03, 10).rotateZ(Math.PI / 2), '#1b1c1f', x, 0.045, z)
  for (let i = 0; i < 6; i++) P(new CylinderGeometry(0.03, 0.024, 0.08, 8), '#f4f5f7', -0.12 + (i % 3) * 0.08, 1.075, -0.25 + Math.floor(i / 3) * 0.08)
  P(lathe([[0, 0], [0.04, 0.0], [0.042, 0.18], [0.015, 0.24], [0.015, 0.28], [0, 0.28]], 8), '#3f8f5a', 0.12, 1.035, -0.25)
  P(lathe([[0, 0], [0.04, 0.0], [0.042, 0.18], [0.015, 0.24], [0.015, 0.28], [0, 0.28]], 8), '#d64a3a', 0.12, 1.035, -0.12)
  P(lathe([[0, 0], [0.07, 0.005], [0.08, 0.08], [0.06, 0.15], [0.03, 0.17], [0, 0.17]], 10), '#3a3f48', -0.08, 1.035, 0.1)
  P(rbox(0.3, 0.08, 0.22, 0.01, 1), '#e7e2d8', 0.05, 1.075, 0.28)
  g.traverse((o) => {
    if (o.isMesh) o.castShadow = true
  })
  return g
}
// A meal on its tray: kind = chicken | pasta | first | business (+ a drink). Local origin: tray centre.
// `steam` / `fizz` are the points (local) where cabinCrew puffs steam / champagne bubbles.
// table > 0: a fold-out table leaf on a pedestal that tall under the tray (no seat back in reach).
export function makeMeal(kind, table = 0) {
  const g = new Group()
  const paint = cartMat('meal', () => new MeshStandardMaterial({ vertexColors: true, roughness: 0.5 }))
  const glass = cartMat('glass', () => new MeshStandardMaterial({ color: '#e8f4ff', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.45 }))
  const P = (geo, hex, x, y, z, rx = 0, ry = 0, rz = 0) => add(g, tint(geo, hex), paint, x, y, z, rx, ry, rz)
  const fancy = kind === 'first' || kind === 'business'
  if (table > 0) {
    P(rbox(0.56, 0.03, 0.42, 0.012, 1), fancy ? '#7a4a2a' : '#5a6170', 0, -0.016, 0)
    P(new CylinderGeometry(0.025, 0.04, table - 0.03, 8), '#8d949f', 0, -0.03 - (table - 0.03) / 2, 0.12)
  }
  P(rbox(0.44, 0.022, 0.32, 0.01, 1), fancy ? '#f4f0e6' : '#d9d2c3', 0, 0.011, 0)
  if (fancy) P(new BoxGeometry(0.42, 0.003, 0.3), '#fbfaf6', 0, 0.023, 0) // linen
  P(new CylinderGeometry(0.11, 0.09, 0.02, 18), '#ffffff', -0.04, 0.034, 0)
  if (kind === 'chicken') {
    for (const [x, z, r] of [[-0.07, -0.02, 0.4], [-0.01, 0.03, -0.3]]) {
      P(new SphereGeometry(0.035, 10, 8).scale(1.4, 0.8, 1), '#b0652a', x, 0.06, z, 0, r, 0)
      P(new CylinderGeometry(0.01, 0.012, 0.06, 6).rotateZ(Math.PI / 2), '#f2e6cf', x + 0.06, 0.055, z, 0, r, 0)
    }
    for (let i = 0; i < 7; i++) P(new SphereGeometry(0.012, 6, 4), '#5cb84a', -0.11 + (i % 4) * 0.02, 0.05, 0.05 - Math.floor(i / 4) * 0.02)
  } else if (kind === 'pasta') {
    P(lathe([[0, 0], [0.06, 0.0], [0.085, 0.05], [0.08, 0.055], [0, 0.02]], 14), '#f4f5f7', -0.04, 0.044, 0)
    for (let i = 0; i < 5; i++) P(new TorusGeometry(0.03 + i * 0.006, 0.006, 4, 12).rotateX(Math.PI / 2), '#f1c75a', -0.04, 0.08 + i * 0.004, 0)
    P(new SphereGeometry(0.022, 8, 6), '#c8402a', -0.03, 0.1, 0.01)
  } else {
    P(rbox(0.11, 0.03, 0.07, 0.012, 1), '#6b3a22', -0.05, 0.06, 0)
    for (let i = 0; i < 4; i++) P(new CylinderGeometry(0.006, 0.006, 0.07, 5).rotateZ(Math.PI / 2), '#4c9a3a', -0.02, 0.05, 0.05 - i * 0.012)
    P(new SphereGeometry(0.016, 8, 6), '#ff7a3a', -0.1, 0.055, 0.04)
  }
  P(new SphereGeometry(0.03, 8, 6).scale(1.2, 0.8, 1), '#d9a35a', 0.13, 0.04, -0.09) // bread roll
  P(new BoxGeometry(0.008, 0.004, 0.16), '#c9ced6', 0.09, 0.026, 0.05) // fork
  P(new BoxGeometry(0.008, 0.004, 0.16), '#c9ced6', 0.105, 0.026, 0.05) // knife
  if (fancy) {
    // champagne flute / wine glass
    add(g, lathe([[0.025, 0], [0.03, 0.004], [0.004, 0.012], [0.004, 0.09], [0.022, 0.1], [0.026, 0.18], [0.024, 0.18]], 12), glass, 0.15, 0.022, 0.06)
    P(lathe([[0, 0], [0.02, 0.0], [0.022, 0.06], [0, 0.06]], 10), kind === 'first' ? '#f6d77a' : '#8a1e2e', 0.15, 0.13, 0.06)
  } else {
    P(new CylinderGeometry(0.03, 0.024, 0.08, 10), '#f4f5f7', 0.15, 0.062, 0.06)
    P(new CylinderGeometry(0.026, 0.026, 0.004, 10), '#6b3a1f', 0.15, 0.1, 0.06)
  }
  g.userData.steam = new Vector3(-0.04, 0.1, 0)
  g.userData.fizz = new Vector3(0.15, 0.2, 0.06)
  g.userData.fancy = fancy
  return g
}
// The serving tray an attendant carries (glasses on it). Local origin: tray centre.
export function makeServingTray() {
  const g = new Group()
  const paint = cartMat('meal', () => new MeshStandardMaterial({ vertexColors: true, roughness: 0.5 }))
  const glass = cartMat('glass', () => new MeshStandardMaterial({ color: '#e8f4ff', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.45 }))
  add(g, tint(new CylinderGeometry(0.18, 0.18, 0.015, 20), '#c9ced6'), paint, 0, 0, 0)
  for (const [x, z] of [[-0.07, 0.03], [0.04, -0.06], [0.07, 0.07]]) {
    add(g, lathe([[0.025, 0], [0.03, 0.004], [0.004, 0.012], [0.004, 0.09], [0.022, 0.1], [0.026, 0.18], [0.024, 0.18]], 10), glass, x, 0.008, z)
    add(g, tint(lathe([[0, 0], [0.02, 0.0], [0.022, 0.06], [0, 0.06]], 8), '#f6d77a'), paint, x, 0.12, z)
  }
  return g
}
