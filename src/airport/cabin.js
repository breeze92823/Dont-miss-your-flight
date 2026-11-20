// The cabin of your flight, built out of sight above the airport (FLIGHT.cabin) and shown only while
// you're on board: 30 rows of 3-3 shaped seats (rounded cushions, curved shells, blue headrest covers,
// seat-back screens, tray tables, pockets, belts, armrests, leg frames on floor tracks), a carpeted
// aisle runner, a curved hull with real window bezels and pull-down shades, curved overhead bin doors
// with latches, the passenger service units (reading lights, gaspers), a lit ceiling, a galley at the
// front (carts, ovens, drawers, coffee makers) and lavatory doors + exit doors at the ends.
// Aisle along Z, the nose toward -Z. Seats A-C on the left (-X), D-F on the right (+X).
//
// Budget: one seat is ~520 triangles and drawn as 4 InstancedMeshes (180 instances each); everything
// else is baked to one mesh per material. Most hard surfaces share one vertex-coloured material.
import {
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
  RepeatWrapping,
  Shape,
  ShapeGeometry,
  SRGBColorSpace,
} from 'three'
import { FLIGHT } from '../config.js'
import { bake } from '../bake.js'
import { neon, solidBox } from '../propkit.js'
import { lathe, rbox, roundRectShape } from '../detail.js'

export const SEAT_X = { A: -1.98, B: -1.36, C: -0.74, D: 0.74, E: 1.36, F: 1.98 }
const R = 2.75 // hull radius
const HY = 0.95 // hull centre above the floor
const SY = 0.92 // hull squash

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
  const X = (y) => Math.sqrt(Math.max(0, r * r - ((y - HY) / SY) ** 2))
  for (let i = 0; i < segs; i++) {
    const ya = y0 + ((y1 - y0) * i) / segs
    const yb = y0 + ((y1 - y0) * (i + 1)) / segs
    const A = [s * X(ya), ya, z0]
    const B = [s * X(ya), ya, z1]
    const C = [s * X(yb), yb, z0]
    const D = [s * X(yb), yb, z1]
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
  // a panel seam ring at every frame (two rows)
  ctx.fillStyle = '#c3c8d1'
  ctx.fillRect(0, 0, 128, 2)
  ctx.fillStyle = '#f7f8fa'
  ctx.fillRect(0, 2, 128, 2)
  return c
}
function paintCarpet() {
  const c = cv(128)
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#5b6271'
  ctx.fillRect(0, 0, 128, 128)
  speckle(ctx, 128, 128, 1400, ['#525968', '#666d7c', '#4d5462', '#6f7686'], 1, 7)
  ctx.fillStyle = 'rgba(140,170,230,0.25)'
  for (let y = 8; y < 128; y += 32) for (let x = 8; x < 128; x += 32) ctx.fillRect(x + ((y / 32) % 2) * 16, y, 3, 3)
  return c
}
function paintRunner() {
  const c = cv(128)
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#1f2a44'
  ctx.fillRect(0, 0, 128, 128)
  speckle(ctx, 128, 128, 900, ['#1a2440', '#24314f', '#1c2741'], 1, 11)
  ctx.fillStyle = '#3a6fd8'
  ctx.fillRect(0, 0, 6, 128)
  ctx.fillRect(122, 0, 6, 128)
  ctx.fillStyle = '#9cc2ff'
  ctx.fillRect(8, 0, 2, 128)
  ctx.fillRect(118, 0, 2, 128)
  ctx.fillStyle = '#2f4a86'
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
function weave(ctx, x0, y0, w, h) {
  ctx.fillStyle = '#2b3242'
  ctx.fillRect(x0, y0, w, h)
  for (let y = y0; y < y0 + h; y += 4) for (let x = x0; x < x0 + w; x += 4) {
    ctx.fillStyle = ((x + y) / 4) % 2 ? '#313a4c' : '#262c3a'
    ctx.fillRect(x, y, 2, 2)
  }
  speckle(ctx, w, h, 160, ['rgba(80,130,230,0.35)', 'rgba(255,255,255,0.08)'], 2, 5)
}
function paintFabric() {
  const c = cv(128)
  weave(c.getContext('2d'), 0, 0, 128, 128)
  return c
}
// Seat-back cushion: quilted fabric with a blue headrest cover across the top.
function paintBackFabric() {
  const c = cv(128, 256)
  const ctx = c.getContext('2d')
  weave(ctx, 0, 0, 128, 256)
  for (const x of [40, 88]) {
    ctx.fillStyle = '#1a1f2a'
    ctx.fillRect(x - 1, 76, 3, 180)
    ctx.fillStyle = '#3c4559'
    ctx.fillRect(x + 2, 76, 1, 180)
  }
  ctx.fillStyle = '#1a1f2a'
  ctx.fillRect(0, 176, 128, 3) // lumbar seam
  // headrest cover
  ctx.fillStyle = '#1b8cff'
  ctx.fillRect(0, 0, 128, 74)
  ctx.fillStyle = '#3aa2ff'
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
function paintScreen() {
  const c = cv(128, 96)
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#0c0f14'
  ctx.fillRect(0, 0, 128, 96)
  const g = ctx.createLinearGradient(0, 8, 0, 88)
  g.addColorStop(0, '#12397a')
  g.addColorStop(1, '#071a38')
  ctx.fillStyle = g
  ctx.fillRect(8, 8, 112, 80)
  ctx.fillStyle = '#1f6a45'
  ctx.beginPath()
  ctx.ellipse(34, 64, 26, 14, 0.3, 0, 7)
  ctx.ellipse(96, 30, 22, 12, -0.2, 0, 7)
  ctx.fill()
  ctx.strokeStyle = '#ffffff'
  ctx.setLineDash([5, 4])
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(26, 66)
  ctx.quadraticCurveTo(60, 14, 100, 32)
  ctx.stroke()
  ctx.fillStyle = '#ffd23b'
  ctx.beginPath()
  ctx.arc(62, 34, 4, 0, 7)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.8)'
  ctx.fillRect(8, 80, 112, 8)
  return c
}
function paintSky() {
  const c = cv(128, 192)
  const ctx = c.getContext('2d')
  const g = ctx.createLinearGradient(0, 0, 0, 192)
  g.addColorStop(0, '#3f8ff0')
  g.addColorStop(0.65, '#9fd2ff')
  g.addColorStop(1, '#e6f4ff')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 128, 192)
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  for (const [x, y, r] of [[30, 140, 22], [52, 132, 18], [72, 142, 20], [96, 150, 16], [20, 160, 16], [110, 120, 10]]) {
    ctx.beginPath()
    ctx.arc(x, y, r, 0, 7)
    ctx.fill()
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
  // galley upper: two ovens, then 2 x 6 standard units with latches
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
  for (let r = 0; r < 2; r++) for (let k = 0; k < 6; k++) {
    const x = 212 + k * 49
    const y = 6 + r * 51
    rect('#9aa1ad', x, y, 46, 48)
    rect('#d6dae1', x + 3, y + 3, 40, 42)
    rect('#e9ecf0', x + 3, y + 3, 40, 3)
    rect('#1b1d22', x + 15, y + 9, 16, 5)
    rect(k % 3 ? '#3dbb5a' : '#d64a3a', x + 36, y + 36, 4, 4)
  }
  // cart: brushed panel, handle recess, latch, blue skyhop band, brake pedals
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
  // lavatory door: bi-fold line, sign, vacant flag, handle
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
    rect('#2ecc5a', x + w / 2 - 18, y + 115, 36, 10)
    rect('#9aa1ad', x + w - 30, y + 170, 16, 44)
    rect('#2a2f38', x + w - 27, y + 176, 10, 32)
  }
  // passenger service unit: reading-light rims, gasper rims, call button, seatbelt sign
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
    ctx.fillStyle = '#ffd23b'
    ctx.fillRect(x + 14, y + 112, 12, 6)
    ctx.fillRect(x + 32, y + 112, 12, 6)
    ctx.fillStyle = '#ff9f2a'
    ctx.beginPath()
    ctx.arc(x + 110, y + 114, 6, 0, 7)
    ctx.fill()
  }
  // drawer stack
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
function paintBulkhead(text) {
  const c = cv(512, 96)
  const ctx = c.getContext('2d')
  const g = ctx.createLinearGradient(0, 0, 0, 96)
  g.addColorStop(0, '#2652b0')
  g.addColorStop(1, '#16306e')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 512, 96)
  ctx.fillStyle = '#8fc4ff'
  ctx.fillRect(0, 88, 512, 4)
  ctx.fillStyle = '#ffffff'
  ctx.font = `600 44px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 270, 50)
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 6
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(100, 62)
  ctx.quadraticCurveTo(122, 30, 150, 38)
  ctx.stroke()
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

// --- Shapes ----------------------------------------------------------------------------------------
// Seat-back shell: a side profile (depth z, height y) with a rounded top and a tapered lower back,
// extruded across the seat width.
function shellGeo(W = 0.58) {
  const s = new Shape()
  s.moveTo(0, 0.04)
  s.lineTo(0, 0.82)
  s.quadraticCurveTo(0, 0.9, 0.06, 0.9)
  s.quadraticCurveTo(0.11, 0.9, 0.11, 0.8)
  s.lineTo(0.11, 0.24)
  s.quadraticCurveTo(0.11, 0, 0.04, 0)
  s.lineTo(0.03, 0)
  s.quadraticCurveTo(0, 0, 0, 0.04)
  const b = 0.014
  const g = new ExtrudeGeometry(s, { depth: W - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 1, curveSegments: 3 })
  g.rotateY(-Math.PI / 2) // profile x -> +Z, extrusion -> -X
  g.translate((W - 2 * b) / 2, 0, 0)
  return g
}
function bezelGeo() {
  const s = roundRectShape(0.46, 0.64, 0.2)
  s.holes.push(roundRectShape(0.3, 0.46, 0.13))
  return new ExtrudeGeometry(s, { depth: 0.045, bevelEnabled: false, curveSegments: 3 })
}

export function buildCabin(scene) {
  const CB = FLIGHT.cabin
  const F = CB.y
  const rows = FLIGHT.rows
  const pitch = FLIGHT.rowPitch
  const z0 = CB.z - 12.5 // row 1
  const rowZ = (r) => z0 + (r - 1) * pitch
  const zFront = CB.z - 16
  const zBack = rowZ(rows) + 2.6
  const len = zBack - zFront
  const zc = (zFront + zBack) / 2
  const X = CB.x
  const S = new Group()
  const sky = canvasTex(paintSky())
  const scr = canvasTex(paintScreen())
  const M = {
    paint: new MeshStandardMaterial({ vertexColors: true, roughness: 0.55 }),
    hull: new MeshStandardMaterial({ map: canvasTex(paintHull(), 1, Math.round(len / (pitch * 2))), roughness: 0.6, side: DoubleSide }),
    floor: new MeshStandardMaterial({ map: canvasTex(paintCarpet(), 4, Math.round(len / 1.3)), roughness: 0.95 }),
    aisle: new MeshStandardMaterial({ map: canvasTex(paintRunner(), 1, Math.round(len / 0.9)), roughness: 0.95 }),
    fabric: new MeshStandardMaterial({ map: canvasTex(paintFabric(), 2, 2), roughness: 0.9 }),
    backFabric: new MeshStandardMaterial({ map: canvasTex(paintBackFabric()), roughness: 0.85 }),
    screen: new MeshStandardMaterial({ color: '#000000', emissive: '#ffffff', emissiveMap: scr, emissiveIntensity: 0.9, roughness: 0.2 }),
    light: neon('#f2f8ff', 2.2),
    window: new MeshStandardMaterial({ map: sky, emissive: '#ffffff', emissiveMap: sky, emissiveIntensity: 0.85, roughness: 0.15 }),
    atlas: new MeshStandardMaterial({ map: canvasTex(paintAtlas()), roughness: 0.45, metalness: 0.15 }),
    exit: new MeshBasicMaterial({ map: canvasTex(paintExit()) }),
  }
  const P = (parent, geo, hex, x, y, z, rx, ry, rz) => add(parent, tint(geo, hex), M.paint, x, y, z, rx, ry, rz)
  let seed = 7
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)

  // --- Floor: grey carpet, a patterned runner down the aisle, seat tracks ---------------------------
  add(S, new PlaneGeometry(5.2, len), M.floor, X, F + 0.002, zc, -Math.PI / 2)
  add(S, new PlaneGeometry(0.9, len), M.aisle, X, F + 0.006, zc, -Math.PI / 2)
  const trackL = rowZ(rows) - rowZ(1) + 1.4
  for (const x of [-1.67, -1.05, 1.05, 1.67]) P(S, new BoxGeometry(0.07, 0.014, trackL), '#8d949f', X + x, F + 0.007, (rowZ(1) + rowZ(rows)) / 2)

  // --- Hull: an open, squashed cylinder seen from inside, panel seams; a darker dado + return grille --
  const hull = new Mesh(new CylinderGeometry(R, R, len, 48, 1, true), M.hull)
  hull.rotation.x = Math.PI / 2
  hull.scale.set(1, 1, SY) // after the rotation, local z (the old radius in z) is world y
  hull.position.set(X, F + HY, zc)
  S.add(hull)
  for (const s of [-1, 1]) {
    const dado = add(S, tint(hullPatch(R - 0.02, s, 0.0, 0.52, zFront, zBack, 3), '#c3c8d1'), M.paint)
    dado.position.set(X, F, 0)
    const grille = add(S, tint(hullPatch(R - 0.03, s, 0.1, 0.17, zFront + 0.8, zBack - 0.8, 1), '#5d6370'), M.paint)
    grille.position.set(X, F, 0)
  }

  // --- Overhead bins: a body along each wall + curved doors every ~2 rows with latches ------------
  const binN = Math.round((len - 4) / 1.84)
  const binL = (len - 4) / binN
  for (const s of [-1, 1]) {
    const sh = new Shape()
    const pts = [[1.3, 1.84], [hullX(1.84) - 0.05, 1.84], [hullX(2.5) - 0.05, 2.5], [1.62, 2.66], [1.25, 2.42]]
    sh.moveTo(s * pts[0][0], pts[0][1])
    for (const [x, y] of pts.slice(1)) sh.lineTo(s * x, y)
    sh.closePath()
    P(S, new ExtrudeGeometry(sh, { depth: len - 4, bevelEnabled: false }), '#c9ced6', X, F, zFront + 2)
    const d = new Shape()
    d.moveTo(s * 1.27, 1.83)
    d.quadraticCurveTo(s * 1.13, 2.12, s * 1.215, 2.41)
    d.lineTo(s * 1.255, 2.41)
    d.quadraticCurveTo(s * 1.17, 2.12, s * 1.305, 1.83)
    d.closePath()
    const doorGeo = tint(new ExtrudeGeometry(d, { depth: binL - 0.06, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.008, bevelSegments: 1, curveSegments: 5 }), '#f7f8fa')
    const latchGeo = tint(rbox(0.035, 0.05, 0.3, 0.012, 1), '#2a2e36')
    const barGeo = tint(new BoxGeometry(0.014, 0.018, 0.2), '#e3e7ec')
    for (let i = 0; i < binN; i++) {
      const za = zFront + 2 + i * binL + 0.04
      add(S, doorGeo, M.paint, X, F, za)
      add(S, latchGeo, M.paint, X + s * 1.252, F + 1.885, za + binL / 2 - 0.04)
      add(S, barGeo, M.paint, X + s * 1.232, F + 1.885, za + binL / 2 - 0.04)
    }
    // cove light along the bin tops
    add(S, new BoxGeometry(0.03, 0.02, len - 4), M.light, X + s * 1.27, F + 2.43, zc)
    // passenger service strip under the bins: per row a panel with reading lights + gaspers
    P(S, rbox(0.5, 0.06, len - 4, 0.02, 1), '#dfe2e8', X + s * 1.55, F + 1.8, zc)
  }
  const psuGeo = atlasUV(new PlaneGeometry(0.44, 0.42), A_PSU).rotateX(Math.PI / 2)
  const lensGeo = new CircleGeometry(0.026, 10).rotateX(Math.PI / 2)
  const gasperGeo = tint(lathe([[0, -0.034], [0.016, -0.03], [0.03, 0]], 6), '#bfc5ce')
  for (let r = 1; r <= rows; r++) {
    const pz = rowZ(r) - 0.1
    for (const s of [-1, 1]) {
      const px = X + s * 1.55
      add(S, psuGeo, M.atlas, px, F + 1.768, pz)
      for (const k of [-1, 0, 1]) {
        add(S, lensGeo, M.light, px + k * 0.128, F + 1.765, pz + 0.08)
        add(S, gasperGeo, M.paint, px + k * 0.128, F + 1.768, pz - 0.08)
      }
    }
  }
  // Ceiling panel, light coves, air vents + speaker grilles.
  P(S, rbox(1.6, 0.05, len - 4, 0.02, 1), '#f4f5f7', X, F + 2.62, zc)
  for (const s of [-1, 1]) add(S, new BoxGeometry(0.08, 0.03, len - 4), M.light, X + s * 0.75, F + 2.6, zc)
  const ventGeo = tint(rbox(0.5, 0.02, 0.14, 0.008, 1), '#2a2e36')
  const spkGeo = tint(new CircleGeometry(0.06, 10).rotateX(Math.PI / 2), '#3a3f48')
  for (let r = 2; r <= rows; r += 4) {
    add(S, ventGeo, M.paint, X, F + 2.59, rowZ(r))
    add(S, spkGeo, M.paint, X, F + 2.592, rowZ(r) + 0.9)
  }

  // --- Windows: bezel with a reveal, sky glass, pull-down shades at random heights ------------------
  const yW = 1.5
  const th = Math.asin((yW - HY) / (SY * R))
  const tilt = Math.atan(Math.tan(th) / SY) // the wall leans in this much at window height
  const bezGeo = tint(bezelGeo(), '#f3f4f6')
  const glassGeo = fitUV(new ShapeGeometry(roundRectShape(0.3, 0.46, 0.13), 3))
  const tabGeo = tint(new BoxGeometry(0.07, 0.018, 0.016), '#cfc8b4')
  const shadeGeos = [0.3, 0.55, 1].map((k) => tint(new PlaneGeometry(0.3, 0.46 * k), '#efe9da'))
  for (let r = 1; r <= rows; r++) {
    for (const s of [-1, 1]) {
      const w = new Group()
      w.position.set(X + s * (hullX(yW) - 0.022), F + yW, rowZ(r) - 0.15)
      w.rotation.set(tilt, -s * Math.PI / 2, 0, 'YXZ')
      S.add(w)
      add(w, glassGeo, M.window, 0, 0, 0.004)
      add(w, bezGeo, M.paint)
      const k = rnd()
      const i = k < 0.55 ? -1 : k < 0.8 ? 0 : k < 0.93 ? 1 : 2
      if (i >= 0) {
        const h = 0.46 * [0.3, 0.55, 1][i]
        add(w, shadeGeos[i], M.paint, 0, 0.23 - h / 2, 0.014)
        add(w, tabGeo, M.paint, 0, 0.23 - h + 0.01, 0.02)
      } else add(w, tabGeo, M.paint, 0, 0.22, 0.02)
    }
  }

  // --- Seats: one shaped seat, instanced (one InstancedMesh per material) ----------------------------
  const proto = new Group()
  const armrest = (parent, x, z) => {
    P(parent, new BoxGeometry(0.05, 0.05, 0.44), '#2a2f3a', x, 0.665, z + 0.02)
    P(parent, new BoxGeometry(0.058, 0.02, 0.34), '#3a4152', x, 0.698, z)
    P(parent, new BoxGeometry(0.04, 0.22, 0.04), '#2a2f3a', x, 0.55, z - 0.17)
    P(parent, new BoxGeometry(0.03, 0.03, 0.03), '#c9ced6', x, 0.672, z - 0.2)
  }
  // seat pan: a rounded cushion on a shell base, with belts + buckle
  add(proto, rbox(0.52, 0.12, 0.5, 0.05, 1), M.fabric, 0, 0.44, -0.01)
  P(proto, new BoxGeometry(0.56, 0.05, 0.46), '#262b36', 0, 0.36, -0.01)
  P(proto, new BoxGeometry(0.3, 0.05, 0.12), '#3a3f4a', 0, 0.31, -0.12) // life-vest pouch
  for (const s of [-1, 1]) P(proto, new BoxGeometry(0.045, 0.008, 0.22), '#3a3f4a', s * 0.12, 0.503, 0.07, 0, -s * 0.45, 0)
  P(proto, new BoxGeometry(0.08, 0.014, 0.05), '#d0d5dc', 0, 0.506, -0.02)
  armrest(proto, -0.31, 0)
  // back: curved shell, quilted cushion with headrest cover; behind: pocket, tray + latch, screen
  const back = new Group()
  back.position.set(0, 0.42, 0.27)
  back.rotation.x = 0.12
  proto.add(back)
  P(back, shellGeo(), '#262b36')
  add(back, rbox(0.5, 0.82, 0.085, 0.04, 1), M.backFabric, 0, 0.47, -0.04)
  P(back, new BoxGeometry(0.42, 0.12, 0.025), '#1d2129', 0, 0.3, 0.135)
  P(back, new BoxGeometry(0.42, 0.22, 0.022), '#5a6170', 0, 0.5, 0.135)
  P(back, new BoxGeometry(0.08, 0.025, 0.02), '#16181d', 0, 0.625, 0.14)
  P(back, new BoxGeometry(0.25, 0.15, 0.02), '#16181d', 0, 0.73, 0.13)
  add(back, new BoxGeometry(0.22, 0.125, 0.012), M.screen, 0, 0.73, 0.137)
  const seatParts = bake(proto, false)

  const seats = []
  for (let r = 1; r <= rows; r++) {
    const z = rowZ(r)
    for (const [L, x] of Object.entries(SEAT_X)) {
      seats.push({ row: r, letter: L, x: X + x, y: F + 0.5, z, yaw: Math.PI, npc: null, aisleX: X + (x < 0 ? -0.05 : 0.05) })
    }
    // the armrests the instanced seats don't carry (aisle side of C, window side of F)
    for (const ax of [-0.43, 2.29]) {
      const g = new Group()
      g.position.set(X + ax, F, z)
      armrest(g, 0, 0)
      S.add(g)
    }
    // leg frames between the seats, cross tubes under each block
    for (const lx of [-1.67, -1.05, 1.05, 1.67]) {
      const x = X + lx
      P(S, new BoxGeometry(0.04, 0.34, 0.05), '#8d949f', x, F + 0.17, z - 0.17, -0.12, 0, 0)
      P(S, new BoxGeometry(0.04, 0.36, 0.05), '#8d949f', x, F + 0.17, z + 0.17, 0.32, 0, 0)
      P(S, new BoxGeometry(0.05, 0.03, 0.5), '#6d7380', x, F + 0.025, z + 0.01)
      P(S, new BoxGeometry(0.04, 0.04, 0.44), '#8d949f', x, F + 0.33, z - 0.01)
    }
    for (const s of [-1, 1]) {
      for (const dz of [-0.16, 0.12]) P(S, new CylinderGeometry(0.022, 0.022, 1.86, 6, 1, true), '#9aa1ad', X + s * 1.36, F + 0.31, z + dz, 0, 0, Math.PI / 2)
    }
  }
  const instanced = []
  const mtx = new Matrix4()
  for (const part of seatParts.children) {
    const im = new InstancedMesh(part.geometry, part.material, seats.length)
    seats.forEach((s, i) => im.setMatrixAt(i, mtx.makeTranslation(s.x, F, s.z)))
    im.computeBoundingSphere()
    im.receiveShadow = true
    instanced.push(im)
  }

  // --- Galley at the front: drawers, carts, worktop, ovens + units, coffee makers -------------------
  const gw = hullX(1.0) * 2
  const gz = zFront
  P(S, new PlaneGeometry(gw - 0.4, 2.5), '#c4c9d1', X, F + 1.25, gz + 0.02)
  for (const s of [-1, 1]) P(S, rbox(0.06, 2.3, 0.78, 0.02, 1), '#d6dae2', X + s * 1.98, F + 1.15, gz + 0.39)
  for (const s of [-1, 1]) {
    P(S, new BoxGeometry(0.83, 0.96, 0.7), '#b4bbc6', X + s * 1.52, F + 0.48, gz + 0.35)
    add(S, atlasUV(new PlaneGeometry(0.8, 0.92), A_DRAW), M.atlas, X + s * 1.52, F + 0.48, gz + 0.702)
  }
  P(S, new BoxGeometry(2.2, 0.96, 0.1), '#2e333c', X, F + 0.48, gz + 0.05) // dark cart bay
  const cartGeo = tint(rbox(0.36, 0.94, 0.62, 0.03, 1), '#aab2bd')
  const cartFront = atlasUV(new PlaneGeometry(0.33, 0.9), A_CART)
  for (let k = -2; k <= 2; k++) {
    add(S, cartGeo, M.paint, X + k * 0.42, F + 0.49, gz + 0.33)
    add(S, cartFront, M.atlas, X + k * 0.42, F + 0.49, gz + 0.643)
  }
  P(S, rbox(3.9, 0.05, 0.74, 0.02, 1), '#b8bec8', X, F + 1.0, gz + 0.37) // worktop
  P(S, new BoxGeometry(3.9, 0.8, 0.42), '#c9ced6', X, F + 1.85, gz + 0.21) // upper units
  add(S, atlasUV(new PlaneGeometry(3.86, 0.78), A_UPPER), M.atlas, X, F + 1.85, gz + 0.422)
  add(S, new BoxGeometry(3.6, 0.015, 0.04), M.light, X, F + 1.443, gz + 0.38) // work light
  for (const s of [-1, 1]) {
    const cx = X + s * 0.55
    P(S, rbox(0.34, 0.4, 0.3, 0.03, 1), '#24282f', cx, F + 1.225, gz + 0.17) // coffee maker
    P(S, lathe([[0, 0], [0.07, 0.005], [0.08, 0.08], [0.06, 0.15], [0.03, 0.17], [0, 0.17]], 10), '#3a3f48', cx, F + 1.03, gz + 0.38)
    P(S, new BoxGeometry(0.03, 0.06, 0.08), '#1b1d22', cx + 0.09, F + 1.15, gz + 0.38)
  }
  for (let k = 0; k < 6; k++) P(S, new CylinderGeometry(0.032, 0.026, 0.08, 8), '#f4f5f7', X - 0.2 + (k % 3) * 0.09, F + 1.065, gz + 0.5 + Math.floor(k / 3) * 0.09)
  P(S, rbox(0.34, 0.02, 0.24, 0.008, 1), '#5a6170', X - 0.11, F + 1.035, gz + 0.545) // tray
  const bh = canvasTex(paintBulkhead('skyhop air'))
  const bulk = new Mesh(new PlaneGeometry(1.4, 0.26), new MeshStandardMaterial({ map: bh, emissiveMap: bh, emissive: '#ffffff', emissiveIntensity: 0.6 }))
  bulk.position.set(X, F + 2.42, gz + 0.44)
  S.add(bulk)
  P(S, new BoxGeometry(1.48, 0.32, 0.03), '#e6e8ec', X, F + 2.42, gz + 0.42)
  solidBox(1.95, 1.13, 0.38, X, F + 1.13, gz + 0.38) // galley block (the aisle ends here)

  // --- Back: wall, two lavatory doors with frames, handles + vacant flags -----------------------------
  const backWall = add(S, tint(new PlaneGeometry(gw, 2.6), '#c9ced6'), M.paint, X, F + 1.3, zBack - 0.02)
  backWall.rotation.y = Math.PI
  const lavFront = atlasUV(new PlaneGeometry(0.76, 1.94), A_LAV)
  for (const s of [-1, 1]) {
    const lx = X + s * 0.7
    P(S, rbox(0.9, 2.1, 0.08, 0.02, 1), '#e6e8ec', lx, F + 1.05, zBack - 0.05)
    add(S, lavFront, M.atlas, lx, F + 1.0, zBack - 0.095, 0, Math.PI, 0)
    P(S, new BoxGeometry(0.04, 0.16, 0.04), '#d0d5dc', lx - s * 0.3, F + 1.0, zBack - 0.12)
  }

  // --- Exit doors near both ends (curved panels on the hull) + EXIT signs ---------------------------
  const exitPlane = new PlaneGeometry(0.3, 0.12)
  for (const [dz, face] of [[zFront + 1.45, 0], [zBack - 1.45, Math.PI]]) {
    for (const s of [-1, 1]) {
      const fr = add(S, tint(hullPatch(R - 0.035, s, 0.0, 1.98, dz - 0.53, dz + 0.53, 6), '#9aa1ad'), M.paint)
      fr.position.set(X, F, 0)
      const door = add(S, tint(hullPatch(R - 0.05, s, 0.05, 1.92, dz - 0.48, dz + 0.48, 6), '#eef0f3'), M.paint)
      door.position.set(X, F, 0)
      P(S, rbox(0.06, 0.08, 0.4, 0.02, 1), '#5a6170', X + s * (hullX(1.05) - 0.075), F + 1.05, dz)
      P(S, new BoxGeometry(0.03, 0.03, 0.7), '#d0d5dc', X + s * (hullX(1.6) - 0.08), F + 1.6, dz)
      P(S, new BoxGeometry(0.32, 0.14, 0.03), '#e6e8ec', X + s * 1.9, F + 2.05, dz)
      add(S, exitPlane, M.exit, X + s * 1.9, F + 2.05, dz + (face ? -0.016 : 0.016), 0, face, 0)
    }
  }

  // Colliders: floor, walls, ends, ceiling.
  solidBox(3, 0.25, len / 2 + 0.5, X, F - 0.25, zc)
  for (const s of [-1, 1]) solidBox(0.25, 1.6, len / 2, X + s * 2.6, F + 1.6, zc)
  solidBox(3, 1.6, 0.25, X, F + 1.6, zFront - 0.2)
  solidBox(3, 1.6, 0.25, X, F + 1.6, zBack + 0.2)
  solidBox(3, 0.25, len / 2, X, F + 2.95, zc)

  const baked = bake(S, false)
  for (const im of instanced) baked.add(im)
  baked.traverse((o) => {
    if (o.isMesh) o.receiveShadow = true
  })
  baked.visible = false
  scene.add(baked)

  return {
    root: baked,
    seats,
    rowZ,
    floorY: F,
    zFront,
    zBack,
    crewSpot: { x: X, z: rowZ(2) - 0.6, yaw: 0 },
    seatFor(code) {
      const m = /^(\d+)([A-F])$/.exec(code ?? '')
      let row = m ? Math.min(rows, Math.max(1, +m[1])) : 13
      const letter = m ? m[2] : 'A'
      return seats.find((s) => s.row === row && s.letter === letter) ?? seats[0]
    },
    setVisible(v) {
      baked.visible = v
    },
  }
}
