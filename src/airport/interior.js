// The check-in hall behind the entrance: glossy white tile floor, navy panel
// walls with blue glass above, a queue carpet with stanchions and belts, a
// row of check-in desks (screen, scale with a live kg read-out, conveyor belt
// into the wall), departure boards, hanging signs, seating, and the floating
// "QUEUE HERE" marker. Static parts are baked (one mesh per material); the
// repeated bits (stanchion parts, rollers, seats) share geometry before baking.
import {
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  QuadraticBezierCurve3,
  Shape,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  TubeGeometry,
  Vector3,
} from 'three'
import { AIRLINE, AIRPORT, DESTINATIONS, QUEUE } from '../config.js'
import { bake } from '../bake.js'
import { lathe, pole, rbox, roundRectShape, roundSlab } from '../detail.js'
import { neon, solidBox, solidPole } from '../propkit.js'
import { RAPIER, addFixed } from '../physics.js'
import { mulberry32 } from '../textures.js'
import { boardCanvas, drawBoard, drawScale, paintCarpet, paintGlass, paintHallFloor, paintPanels, paintSlabSign, scaleCanvas, tex } from './paint.js'

const H = AIRPORT.hall
const Y = AIRPORT.walkY
const FONT = 'Fredoka, "Arial Rounded MT Bold", Arial, sans-serif'

function box(parent, w, h, d, mat, x, y, z) {
  const m = new Mesh(new BoxGeometry(w, h, d), mat)
  m.position.set(x, y, z)
  parent.add(m)
  return m
}
function plane(parent, w, h, mat, x, y, z, ry = 0, tileX = 0, tileY = 0) {
  const g = new PlaneGeometry(w, h)
  if (tileX) {
    const uv = g.attributes.uv
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / tileX, (uv.getY(i) * h) / tileY)
  }
  g.rotateY(ry)
  const m = new Mesh(g, mat)
  m.position.set(x, y, z)
  parent.add(m)
  return m
}
// Places a (shared) geometry; bake() later merges everything per material.
export function add(parent, geo, mat, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) {
  const m = new Mesh(geo, mat)
  m.position.set(x, y, z)
  m.rotation.set(rx, ry, rz)
  parent.add(m)
  return m
}
// A picture frame / bezel: outer rounded rect minus an inner one, extruded along Z, centred.
export function frameGeo(ow, oh, or, iw, ih, ir, depth, curve = 4) {
  const s = roundRectShape(ow, oh, Math.max(0.005, or))
  s.holes.push(roundRectShape(iw, ih, Math.max(0.005, ir)))
  return new ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: curve }).translate(0, 0, -depth / 2)
}
function scaleU(g, k) {
  const uv = g.attributes.uv
  for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * k)
  return g
}

// --- Small canvas painters (all <= 512 px) ------------------------------------------------------
function cv(w, h = w) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}
function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}
// A texture whose painter uses text: painted now, repainted once Fredoka has loaded.
export function fontTex(w, h, draw, opts) {
  const c = cv(w, h)
  const ctx = c.getContext('2d')
  draw(ctx, w, h)
  const t = tex(c, opts)
  document.fonts?.load?.(`600 40px Fredoka`).then(() => {
    ctx.clearRect(0, 0, w, h)
    draw(ctx, w, h)
    t.needsUpdate = true
  }).catch(() => {})
  return t
}
// Little airliner glyph (nose to +x), centred on (x, y).
export function planeGlyph(ctx, x, y, s, color) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(s / 40, s / 40)
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(20, 0)
  ctx.quadraticCurveTo(18, -3, 12, -3)
  ctx.lineTo(4, -3)
  ctx.lineTo(-6, -18)
  ctx.lineTo(-11, -18)
  ctx.lineTo(-5, -3)
  ctx.lineTo(-14, -3)
  ctx.lineTo(-18, -9)
  ctx.lineTo(-21, -9)
  ctx.lineTo(-19, 0)
  ctx.lineTo(-21, 9)
  ctx.lineTo(-18, 9)
  ctx.lineTo(-14, 3)
  ctx.lineTo(-5, 3)
  ctx.lineTo(-11, 18)
  ctx.lineTo(-6, 18)
  ctx.lineTo(4, 3)
  ctx.lineTo(12, 3)
  ctx.quadraticCurveTo(18, 3, 20, 0)
  ctx.fill()
  ctx.restore()
}
// Retractable queue belt: airline blue webbing with light edges and the airline name.
function strapTex() {
  return fontTex(512, 32, (ctx, w, h) => {
    ctx.fillStyle = '#1d4fc4'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#4c86f2'
    ctx.fillRect(0, 0, w, 3)
    ctx.fillRect(0, h - 3, w, 3)
    ctx.fillStyle = 'rgba(0,0,0,0.12)'
    for (let x = 0; x < w; x += 4) ctx.fillRect(x, 3, 1, h - 6) // weave
    planeGlyph(ctx, 120, h / 2, 22, '#ffffff')
    ctx.font = `italic 600 19px ${FONT}`
    ctx.fillStyle = '#ffffff'
    ctx.textBaseline = 'middle'
    ctx.fillText(AIRLINE, 140, h / 2 + 1)
  })
}
// Check-in desk fascia: slate panels with seams, a cyan light line and the airline logo.
function fasciaTex() {
  return fontTex(512, 160, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h)
    g.addColorStop(0, '#4a5673')
    g.addColorStop(1, '#2a3245')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
    for (const x of [128, 384]) {
      ctx.fillStyle = '#1b2131'
      ctx.fillRect(x - 2, 0, 3, h)
      ctx.fillStyle = 'rgba(255,255,255,0.08)'
      ctx.fillRect(x + 1, 0, 1, h)
    }
    ctx.fillStyle = '#5fd0ff'
    ctx.fillRect(0, 12, w, 5)
    ctx.fillStyle = 'rgba(95,208,255,0.25)'
    ctx.fillRect(0, 8, w, 13)
    ctx.fillStyle = 'rgba(0,0,0,0.25)'
    ctx.fillRect(0, h - 14, w, 14)
    ctx.font = `italic 600 46px ${FONT}`
    const tw = ctx.measureText(AIRLINE).width
    const x0 = (w - tw - 62) / 2
    ctx.fillStyle = '#2f7bff'
    rrect(ctx, x0, 60, 48, 48, 12)
    ctx.fill()
    planeGlyph(ctx, x0 + 24, 84, 38, '#ffffff')
    ctx.fillStyle = '#e9f0ff'
    ctx.textBaseline = 'middle'
    ctx.fillText(AIRLINE, x0 + 62, 86)
  })
}
// The agent's monitor: booking UI with a seat map.
function agentScreenTex() {
  return fontTex(256, 160, (ctx, w, h) => {
    ctx.fillStyle = '#0c1a33'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#2f7bff'
    ctx.fillRect(0, 0, w, 26)
    ctx.fillStyle = '#ffffff'
    ctx.font = `italic 600 17px ${FONT}`
    ctx.textBaseline = 'middle'
    ctx.fillText(AIRLINE, 10, 14)
    const rand = mulberry32(12)
    ctx.fillStyle = 'rgba(200,220,255,0.55)'
    for (let i = 0; i < 7; i++) ctx.fillRect(10, 38 + i * 15, 30 + rand() * 70, 6)
    for (let r = 0; r < 6; r++) for (let k = 0; k < 4; k++) {
      ctx.fillStyle = rand() < 0.35 ? '#5a6478' : rand() < 0.5 ? '#3dff7a' : '#4fb8ff'
      ctx.fillRect(150 + k * 22 + (k > 1 ? 8 : 0), 36 + r * 17, 16, 12)
    }
    ctx.fillStyle = '#3dff7a'
    rrect(ctx, 10, 138, 80, 16, 5)
    ctx.fill()
  }, { aniso: 4 })
}
function keysTex() {
  const c = cv(128, 48)
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#16181d'
  ctx.fillRect(0, 0, 128, 48)
  for (let r = 0; r < 4; r++) for (let k = 0; k < 14; k++) {
    ctx.fillStyle = '#3b3f48'
    ctx.fillRect(3 + k * 8.9 + (r % 2) * 3, 3 + r * 10.5, 7, 8)
    ctx.fillStyle = '#4c515c'
    ctx.fillRect(3 + k * 8.9 + (r % 2) * 3, 3 + r * 10.5, 7, 2)
  }
  return tex(c, { aniso: 2 })
}
// Diamond tread plate (scale tops), tiled.
function treadTex() {
  const c = cv(128, 128)
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#9ca5b1'
  ctx.fillRect(0, 0, 128, 128)
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    ctx.save()
    ctx.translate(x * 16 + 8, y * 16 + 8)
    ctx.rotate((x + y) % 2 ? 0.8 : -0.8)
    ctx.fillStyle = '#6f7884'
    ctx.fillRect(-6, -1, 12, 3)
    ctx.fillStyle = '#d3d9e2'
    ctx.fillRect(-6, -2, 12, 2)
    ctx.restore()
  }
  return tex(c, { repeatX: 2.5, repeatY: 2.5 })
}
// Baggage belt: rubber slats with grip treads (scrolls along V).
function beltCanvasPaint() {
  const c = cv(128, 128)
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#25272d'
  ctx.fillRect(0, 0, 128, 128)
  for (let y = 0; y < 128; y += 16) {
    ctx.fillStyle = '#121317'
    ctx.fillRect(0, y, 128, 2)
    ctx.fillStyle = '#3c3f48'
    ctx.fillRect(0, y + 2, 128, 2)
    ctx.fillStyle = '#2d3037'
    for (let x = 4 + ((y / 16) % 2) * 6; x < 124; x += 12) ctx.fillRect(x, y + 7, 6, 4)
  }
  ctx.fillStyle = '#4a4d55'
  ctx.fillRect(0, 0, 4, 128)
  ctx.fillRect(124, 0, 4, 128)
  return c
}
function woodTex() {
  const c = cv(256, 64)
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#c08a52'
  ctx.fillRect(0, 0, 256, 64)
  const rand = mulberry32(7)
  for (let i = 0; i < 46; i++) {
    ctx.strokeStyle = `rgba(${rand() < 0.5 ? '96,52,20' : '230,180,120'},${0.08 + rand() * 0.18})`
    ctx.lineWidth = 0.6 + rand() * 1.6
    const y = rand() * 64
    ctx.beginPath()
    ctx.moveTo(0, y)
    for (let x = 0; x <= 256; x += 32) ctx.lineTo(x, y + Math.sin(x * 0.03 + i) * 2.2)
    ctx.stroke()
  }
  return tex(c, { repeatX: 1, repeatY: 2 })
}

// --- Shared queue stanchion kit (also used by the security hall) ---------------------------------
// Weighted round base, chrome post, belt cassette head (<= ~240 triangles per post), airline belts
// between posts and a sagging red rope for closed lanes. Geometry and materials are made once.
let KIT = null
export function stanchionKit() {
  if (KIT) return KIT
  const mats = {
    base: new MeshStandardMaterial({ color: '#1b1e25', roughness: 0.4, metalness: 0.6 }),
    chrome: new MeshStandardMaterial({ color: '#e3e8f0', roughness: 0.12, metalness: 1 }),
    head: new MeshStandardMaterial({ color: '#262a33', roughness: 0.3, metalness: 0.35 }),
    strap: new MeshStandardMaterial({ map: strapTex(), roughness: 0.65 }),
    rope: new MeshStandardMaterial({ color: '#d6232e', roughness: 0.55 }),
  }
  mats.base.userData.k = 'kit-base'
  mats.chrome.userData.k = 'kit-chrome'
  mats.head.userData.k = 'kit-head'
  const geo = {
    base: lathe([[0, 0], [0.165, 0], [0.172, 0.012], [0.162, 0.03], [0.1, 0.047], [0.034, 0.056]], 12),
    stem: new CylinderGeometry(0.028, 0.028, 0.8, 8, 1, true).translate(0, 0.45, 0),
    head: lathe([[0.028, 0.84], [0.05, 0.852], [0.053, 0.94], [0.046, 0.966], [0.022, 0.984], [0, 0.99]], 10),
  }
  const post = (parent, x, y, z) => {
    add(parent, geo.base, mats.base, x, y, z)
    add(parent, geo.stem, mats.chrome, x, y, z)
    add(parent, geo.head, mats.head, x, y, z)
  }
  // Posts every <= 2.3 m from (x0, z0) to (x1, z1), belts between them. `seen` skips shared corner posts.
  const run = (parent, x0, z0, x1, z1, y, seen) => {
    const dx = x1 - x0
    const dz = z1 - z0
    const L = Math.hypot(dx, dz)
    const n = Math.max(1, Math.ceil(L / 2.3))
    for (let i = 0; i <= n; i++) {
      const x = x0 + (dx * i) / n
      const z = z0 + (dz * i) / n
      const key = `${x.toFixed(2)},${z.toFixed(2)}`
      if (seen?.has(key)) continue
      seen?.add(key)
      post(parent, x, y, z)
    }
    const len = L / n - 0.1
    const g = scaleU(new BoxGeometry(len, 0.05, 0.012), len / 0.9)
    const ry = Math.atan2(-dz, dx)
    for (let i = 0; i < n; i++) add(parent, g, mats.strap, x0 + (dx * (i + 0.5)) / n, y + 0.9, z0 + (dz * (i + 0.5)) / n, ry)
  }
  // A velvet rope hanging between two points (at post-head height).
  const rope = (parent, xa, za, xb, zb, y) => {
    const a = new Vector3(xa, y + 0.92, za)
    const b = new Vector3(xb, y + 0.92, zb)
    const m = a.clone().lerp(b, 0.5)
    m.y -= 0.24
    add(parent, new TubeGeometry(new QuadraticBezierCurve3(a, m, b), 14, 0.022, 6), mats.rope)
  }
  KIT = { mats, geo, post, run, rope }
  return KIT
}

// The stanchion layout: rows (z, x0, x1) and the left/right end posts, matching QUEUE.path.
export const STANCHION_ROWS = [
  [-19.75, -10, 10.75],
  [-22.25, -7.25, 13],
  [-24.75, -10, 7.25],
  [-27.25, -7.25, 10],
  [-29.75, -10, 10.75],
]
const STANCHION_COLS = [
  [-10, -19.75, -29.75],
  [10, -22.25, -27.25],
]

function makeArrow(color = '#e9f4ff') {
  const s = new Shape()
  s.moveTo(-0.45, 1.4)
  s.lineTo(0.45, 1.4)
  s.lineTo(0.45, 0.6)
  s.lineTo(0.95, 0.6)
  s.lineTo(0, -0.5)
  s.lineTo(-0.95, 0.6)
  s.lineTo(-0.45, 0.6)
  s.closePath()
  const g = new ExtrudeGeometry(s, { depth: 0.3, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 3 })
  g.translate(0, 0, -0.15)
  const arrow = new Mesh(g, new MeshStandardMaterial({ color, emissive: '#5fb8ff', emissiveIntensity: 0.35, roughness: 0.25, metalness: 0.1 }))
  const outline = new Mesh(g, new MeshStandardMaterial({ color: '#1557c9', side: 1 }))
  outline.scale.setScalar(1.08)
  arrow.add(outline)
  return arrow
}

function pillSign(text, bg = '#3fd04a', edge = '#1b7a22') {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 144
  const draw = () => {
    const ctx = c.getContext('2d')
    ctx.clearRect(0, 0, 512, 144)
    const r = 40
    const path = (x, y, w, h) => {
      ctx.beginPath()
      ctx.moveTo(x + r, y)
      ctx.arcTo(x + w, y, x + w, y + h, r)
      ctx.arcTo(x + w, y + h, x, y + h, r)
      ctx.arcTo(x, y + h, x, y, r)
      ctx.arcTo(x, y, x + w, y, r)
      ctx.closePath()
    }
    ctx.fillStyle = edge
    path(8, 14, 496, 124)
    ctx.fill()
    const g = ctx.createLinearGradient(0, 8, 0, 128)
    g.addColorStop(0, '#8cf56a')
    g.addColorStop(1, bg)
    ctx.fillStyle = g
    path(8, 6, 496, 118)
    ctx.fill()
    ctx.font = '700 70px Fredoka, Arial, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineWidth = 12
    ctx.strokeStyle = '#155e1a'
    ctx.lineJoin = 'round'
    ctx.strokeText(text, 256, 68)
    ctx.fillStyle = '#ffffff'
    ctx.fillText(text, 256, 68)
  }
  draw()
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  document.fonts?.load?.('700 70px Fredoka').then(() => {
    draw()
    t.needsUpdate = true
  })
  const sp = new Sprite(new SpriteMaterial({ map: t, transparent: true, depthWrite: false }))
  sp.scale.set(4.2, 1.18, 1)
  sp.renderOrder = 10
  return sp
}

export function buildInterior(scene) {
  const S = new Group()
  const kit = stanchionKit()
  const floorTex = paintHallFloor()
  const M = {
    floor: new MeshStandardMaterial({ map: tex(floorTex.color), normalMap: tex(floorTex.normal, { srgb: false }), roughness: 0.18, metalness: 0.05 }),
    carpet: new MeshStandardMaterial({ map: tex(paintCarpet()), roughness: 0.95 }),
    panels: new MeshStandardMaterial({ map: tex(paintPanels()), roughness: 0.55, metalness: 0.15 }),
    glass: new MeshStandardMaterial({ map: tex(paintGlass(17)), emissiveMap: tex(paintGlass(17)), emissive: '#ffffff', emissiveIntensity: 0.55, roughness: 0.1 }),
    white: new MeshStandardMaterial({ color: '#f6f7fa', roughness: 0.4 }),
    black: new MeshStandardMaterial({ color: '#15171c', roughness: 0.25, metalness: 0.5 }),
    slate: new MeshStandardMaterial({ color: '#3a4357', roughness: 0.4 }),
    steel: new MeshStandardMaterial({ color: '#b9c0cc', roughness: 0.25, metalness: 0.85 }),
    rubber: new MeshStandardMaterial({ color: '#202227', roughness: 0.9 }),
    light: neon('#f4fbff', 2.4),
    seat: new MeshStandardMaterial({ color: '#1d2027', roughness: 0.5, metalness: 0.2 }),
    cushion: new MeshStandardMaterial({ color: '#2f62d8', roughness: 0.55 }),
    plant: new MeshStandardMaterial({ color: '#3f9a3c', roughness: 0.8, flatShading: true }),
    plantLight: new MeshStandardMaterial({ color: '#62c24a', roughness: 0.8, flatShading: true }),
    soil: new MeshStandardMaterial({ color: '#4a3424', roughness: 1 }),
    wood: new MeshStandardMaterial({ map: woodTex(), roughness: 0.5 }),
    plastic: new MeshStandardMaterial({ color: '#d9dde5', roughness: 0.45 }),
    accent: new MeshStandardMaterial({ color: '#2f7bff', roughness: 0.35, metalness: 0.1 }),
    yellow: new MeshStandardMaterial({ color: '#ffc531', roughness: 0.5 }),
    green: new MeshStandardMaterial({ color: '#3fbf5a', roughness: 0.5 }),
    tread: new MeshStandardMaterial({ map: treadTex(), color: '#dfe4ea', roughness: 0.35, metalness: 0.75 }),
    keys: new MeshStandardMaterial({ map: keysTex(), roughness: 0.6 }),
    agentScreen: (() => {
      const t = agentScreenTex()
      return new MeshStandardMaterial({ map: t, emissiveMap: t, emissive: '#ffffff', emissiveIntensity: 0.9, roughness: 0.25 })
    })(),
  }

  // Floor, carpet, walls, ceiling lights.
  plane(S, H.x1 - H.x0, H.z0 - H.z1, M.floor, 0, Y + 0.004, (H.z0 + H.z1) / 2, 0, 3, 3).rotation.x = -Math.PI / 2
  const carpet = plane(S, 25.4, 13.2, M.carpet, 1.6, Y + 0.012, -25.3, 0, 2, 2)
  carpet.rotation.x = -Math.PI / 2
  const len = H.z0 - H.z1
  const sd = QUEUE.securityDoor
  const doorLo = sd.z - 2.6
  const doorHi = sd.z + 2.6
  const column = rbox(0.9, H.height, 0.9, 0.1, 1)
  const plinth = rbox(1.08, 0.26, 1.08, 0.04, 1)
  for (const s of [-1, 1]) {
    const x = s > 0 ? H.x1 : H.x0
    // The east wall has the doorway to security cut into its lower panels.
    const spans = s > 0 ? [[doorHi, H.z0], [H.z1, doorLo]] : [[H.z1, H.z0]]
    for (const [z0, z1] of spans) {
      plane(S, z1 - z0, 6, M.panels, x - s * 0.01, Y + 3, (z0 + z1) / 2, -s * Math.PI / 2, 6, 6)
      box(S, 0.05, 0.16, z1 - z0, M.black, x - s * 0.03, Y + 0.08, (z0 + z1) / 2) // skirting
      solidBox(0.5, 8, (z1 - z0) / 2, x + s * 0.4, 8, (z0 + z1) / 2)
    }
    if (s > 0) {
      plane(S, doorHi - doorLo, 6 - 4.6, M.panels, x - 0.01, Y + 5.3, sd.z, -Math.PI / 2, 6, 6)
      solidBox(0.5, 3, 2.6, x + 0.4, Y + 4.6 + 3, sd.z)
    }
    plane(S, len, H.height - 6, M.glass, x - s * 0.01, Y + 6 + (H.height - 6) / 2, (H.z0 + H.z1) / 2, -s * Math.PI / 2, 4, 4.4)
    for (let z = H.z0 - 6; z > H.z1; z -= 8) {
      if (s > 0 && z <= doorHi + 0.5 && z >= doorLo - 0.5) continue
      add(S, column, M.white, x - s * 0.45, Y + H.height / 2, z)
      add(S, plinth, M.slate, x - s * 0.45, Y + 0.13, z)
    }
    for (let z = H.z0 - 2; z > H.z1; z -= 4) box(S, 0.15, H.height - 6, 0.2, M.black, x - s * 0.08, Y + 6 + (H.height - 6) / 2, z)
    box(S, 0.3, 0.25, len, M.black, x - s * 0.1, Y + 6, (H.z0 + H.z1) / 2)
  }
  plane(S, H.x1 - H.x0, H.height, M.panels, 0, Y + H.height / 2, H.z1 + 0.01, 0, 6, 6)
  box(S, H.x1 - H.x0, 0.16, 0.05, M.black, 0, Y + 0.08, H.z1 + 0.03)
  solidBox(H.x1, 8, 0.5, 0, 8, H.z1 - 0.4)
  // Hanging light bars (long, angled like the reference): a white housing, the glowing diffuser, two wires.
  const barHousing = rbox(0.38, 0.12, 6.1, 0.045, 1)
  const barLight = new BoxGeometry(0.26, 0.03, 5.9)
  const wire = pole(0.008, 0, 1.75, 4)
  for (let x = -24; x <= 24; x += 8) for (let z = -16; z > -44; z -= 9) {
    const g = new Group()
    g.position.set(x, Y + 11.2, z)
    g.rotation.y = 0.35
    S.add(g)
    add(g, barHousing, M.white, 0, 0.07, 0)
    add(g, barLight, M.light, 0, 0, 0)
    for (const s of [-1, 1]) add(g, wire, kit.mats.chrome, 0, 0.13, s * 2.4)
  }

  // --- Queue stanchions + belts -----------------------------------------------------------
  const seen = new Set()
  const belt = (x0, z0, x1, z1) => {
    kit.run(S, x0, z0, x1, z1, Y, seen)
    solidBox(Math.abs(x1 - x0) / 2 + 0.05, 0.6, Math.abs(z1 - z0) / 2 + 0.05, (x0 + x1) / 2, Y + 0.6, (z0 + z1) / 2)
  }
  for (const [z, x0, x1] of STANCHION_ROWS) belt(x0, z, x1, z)
  for (const [x, z0, z1] of STANCHION_COLS) belt(x, z0, x, z1)

  // --- Check-in desks ------------------------------------------------------------------------
  const frontMat = new MeshStandardMaterial({ map: fasciaTex(), roughness: 0.35, metalness: 0.1 })
  const beltTex = tex(beltCanvasPaint(), { repeatX: 1, repeatY: 6 })
  const beltMat = new MeshStandardMaterial({ map: beltTex, roughness: 0.8 })
  const desks = []
  const dz = QUEUE.deskZ
  // Shared desk parts (geometry is cloned by bake, so one copy serves all six desks).
  const beltLen = dz - 0.4 - H.z1
  const G = {
    cabinet: rbox(3.4, 1.06, 0.75, 0.045, 1),
    fascia: rbox(2.7, 0.78, 0.03, 0.012, 1),
    kick: new BoxGeometry(3.3, 0.1, 0.02),
    bezel: rbox(0.6, 0.28, 0.03, 0.02, 1),
    top: roundSlab(3.7, 1.0, 0.07, 0.1, 0.02),
    ledge: roundSlab(3.3, 0.3, 0.05, 0.08, 0.012),
    standoff: pole(0.02, 1.125, 1.245, 8),
    monBase: roundSlab(0.26, 0.18, 0.02, 0.06, 0.005),
    monNeck: pole(0.022, 1.14, 1.34, 8),
    monBody: rbox(0.62, 0.4, 0.045, 0.02, 1),
    monScreen: new PlaneGeometry(0.56, 0.34).rotateY(Math.PI),
    kb: rbox(0.5, 0.025, 0.17, 0.008, 1),
    kbKeys: new PlaneGeometry(0.46, 0.13).rotateX(-Math.PI / 2),
    mouse: rbox(0.06, 0.03, 0.1, 0.014, 1),
    printer: rbox(0.32, 0.16, 0.26, 0.03, 1),
    slot: new BoxGeometry(0.22, 0.012, 0.02),
    scaleBody: rbox(1.2, 0.4, 0.95, 0.05, 1),
    scalePlate: roundSlab(1.1, 0.85, 0.04, 0.05, 0.008),
    bumper: new BoxGeometry(1.1, 0.05, 0.012),
    beltBody: rbox(1.2, 0.5, beltLen, 0.04, 1),
    beltBed: new BoxGeometry(1.04, 0.06, beltLen),
    beltTop: new PlaneGeometry(1.0, beltLen).rotateX(-Math.PI / 2),
    rail: rbox(0.07, 0.17, beltLen, 0.03, 1),
    stripe: new BoxGeometry(0.012, 0.06, beltLen - 0.2),
    drum: new CylinderGeometry(0.06, 0.06, 1.0, 12).rotateZ(Math.PI / 2),
    hole: new BoxGeometry(1.4, 1.3, 0.08),
    holeFrame: frameGeo(1.75, 1.62, 0.16, 1.4, 1.3, 0.06, 0.1),
    flap: new BoxGeometry(0.165, 0.9, 0.015),
    scrPost: pole(0.035, 1.12, 2.55, 10),
    scrBody: rbox(1.82, 0.76, 0.1, 0.04, 1),
    scrMount: rbox(0.24, 0.24, 0.06, 0.02, 1),
    scrFace: new PlaneGeometry(1.7, 0.64),
  }
  QUEUE.counters.forEach((cx, i) => {
    const x = cx - 0.4
    // Everything below is placed in desk-local space: origin = desk centre on the floor, customers at +Z.
    const D = new Group()
    D.position.set(x, Y, dz)
    S.add(D)
    add(D, G.cabinet, M.slate, 0, 0.53, 0)
    add(D, G.kick, M.black, 0, 0.05, 0.38)
    add(D, G.fascia, frontMat, -0.3, 0.56, 0.39)
    add(D, G.bezel, M.black, 1.4, 0.85, 0.385)
    add(D, G.top, M.white, 0, 1.09, -0.05)
    add(D, G.ledge, M.wood, -0.05, 1.27, 0.3)
    for (const s of [-1, 1]) add(D, G.standoff, kit.mats.chrome, s * 1.3, 0, 0.3)
    // Agent side (-Z): monitor on a stand, keyboard + mouse, boarding pass printer.
    add(D, G.monBase, M.black, -0.6, 1.135, -0.17)
    add(D, G.monNeck, M.black, -0.6, 0, -0.16)
    const mon = new Group()
    mon.position.set(-0.6, 1.47, -0.19)
    mon.rotation.x = 0.1
    D.add(mon)
    add(mon, G.monBody, M.black)
    add(mon, G.monScreen, M.agentScreen, 0, 0, -0.0235)
    add(D, G.kb, M.black, 0.25, 1.138, -0.32)
    add(D, G.kbKeys, M.keys, 0.25, 1.152, -0.32)
    add(D, G.mouse, M.black, 0.64, 1.14, -0.3)
    add(D, G.printer, M.plastic, 1.2, 1.205, -0.22)
    add(D, G.slot, M.black, 1.2, 1.28, -0.12)
    solidBox(1.8, 0.6, 0.45, x, Y + 0.6, dz)
    // Scale + belt into the wall (scale at local x 2.3 = world cx + 1.9).
    const sx = 2.3
    add(D, G.scaleBody, M.slate, sx, 0.2, 0.1)
    add(D, G.scalePlate, M.tread, sx, 0.44, 0.1)
    add(D, G.bumper, M.yellow, sx, 0.33, 0.581)
    const bz = -0.4 - beltLen / 2
    add(D, G.beltBody, M.slate, sx, 0.25, bz)
    add(D, G.beltBed, M.rubber, sx, 0.53, bz)
    add(D, G.beltTop, beltMat, sx, 0.561, bz)
    for (const s of [-1, 1]) {
      add(D, G.rail, M.steel, sx + s * 0.56, 0.6, bz)
      add(D, G.stripe, M.accent, sx + s * 0.605, 0.32, bz)
    }
    add(D, G.drum, M.rubber, sx, 0.5, -0.4)
    const wz = H.z1 - dz // the back wall, desk-local
    add(D, G.hole, M.black, sx, 0.95, wz + 0.05)
    add(D, G.holeFrame, M.steel, sx, 0.95, wz + 0.11)
    for (let k = 0; k < 8; k++) add(D, G.flap, M.rubber, sx - 0.6 + k * 0.171, 1.0, wz + 0.13)
    solidBox(0.6, 0.4, beltLen / 2 + 0.5, cx + 1.9, Y + 0.4, dz - beltLen / 2)
    // Desk screen on a post (airline, desk number, open).
    add(D, G.scrPost, kit.mats.chrome, 0, 0, -0.4)
    add(D, G.scrBody, M.black, 0, 2.85, -0.4)
    add(D, G.scrMount, M.black, 0, 2.85, -0.47)
    const screen = fontTex(256, 96, (ctx) => {
      ctx.fillStyle = '#0b0f18'
      ctx.fillRect(0, 0, 256, 96)
      ctx.fillStyle = '#2f7bff'
      rrect(ctx, 10, 10, 34, 34, 8)
      ctx.fill()
      planeGlyph(ctx, 27, 27, 26, '#ffffff')
      ctx.font = `italic 600 28px ${FONT}`
      ctx.fillStyle = '#4fb8ff'
      ctx.textBaseline = 'middle'
      ctx.fillText(AIRLINE, 52, 28)
      ctx.font = `500 22px ${FONT}`
      ctx.fillStyle = '#ffffff'
      ctx.fillText(`check-in ${i + 1}`, 14, 70)
      ctx.fillStyle = '#3dff7a'
      ctx.beginPath()
      ctx.arc(190, 70, 5, 0, 7)
      ctx.fill()
      ctx.font = `600 22px ${FONT}`
      ctx.fillText('open', 200, 70)
    })
    const sm = new MeshStandardMaterial({ map: screen, emissiveMap: screen, emissive: '#ffffff', emissiveIntensity: 1.1 })
    add(D, G.scrFace, sm, 0, 2.85, -0.4 + 0.052)
    // Live scale read-out in a bezel on the desk front, beside the scale.
    const sc = scaleCanvas()
    drawScale(sc, 0)
    const st = new CanvasTexture(sc)
    st.colorSpace = SRGBColorSpace
    const readout = new Mesh(new PlaneGeometry(0.5, 0.19), new MeshStandardMaterial({ map: st, emissiveMap: st, emissive: '#ffffff', emissiveIntensity: 1.3 }))
    readout.position.set(x + 1.4, Y + 0.85, dz + 0.402)
    scene.add(readout)
    desks.push({
      index: i,
      x,
      cust: { x, z: dz + 1.15 },
      agent: { x, z: dz - 1.2 },
      scale: { x: cx + 1.9, y: Y + 0.46, z: dz + 0.1 },
      beltEnd: { x: cx + 1.9, y: Y + 0.58, z: H.z1 + 0.2 },
      setKg(kg) {
        drawScale(sc, kg)
        st.needsUpdate = true
      },
      busy: false,
    })
  })

  // --- Boards and signs ------------------------------------------------------------------------
  const rows = DESTINATIONS.slice(0, 6).map((d, i) => [d.time, d.city, d.flight, d.gate, ['boarding', 'gate closing', 'on time', 'delayed', 'on time', 'on time'][i]])
  const boards = []
  const ceilingPlate = new CylinderGeometry(0.12, 0.14, 0.04, 12)
  for (const [x, y, z, ry, w, h] of [[-14, Y + 8.6, H.z1 + 0.3, 0, 10, 5], [0, Y + 8.6, H.z1 + 0.3, 0, 10, 5], [14, Y + 8.6, H.z1 + 0.3, 0, 10, 5], [-H.x1 + 0.3, Y + 8.4, -24, Math.PI / 2, 8, 4]]) {
    const c = boardCanvas()
    drawBoard(c, rows)
    const t = new CanvasTexture(c)
    t.colorSpace = SRGBColorSpace
    t.anisotropy = 8
    const m = new Mesh(new PlaneGeometry(w, h), new MeshStandardMaterial({ map: t, emissiveMap: t, emissive: '#ffffff', emissiveIntensity: 1.0, roughness: 0.3 }))
    m.position.set(x, y, z)
    m.rotation.y = ry
    scene.add(m)
    // Housing with rounded edges, a brushed bezel around the screen, two rods up to the ceiling.
    const bg = new Group()
    bg.position.set(x, y, z)
    bg.rotation.y = ry
    S.add(bg)
    add(bg, rbox(w + 0.5, h + 0.6, 0.3, 0.12, 1), M.black, 0, -0.05, -0.17)
    add(bg, frameGeo(w + 0.26, h + 0.26, 0.08, w, h, 0.02, 0.05), M.steel, 0, 0, -0.01)
    add(bg, new BoxGeometry(w * 0.5, 0.06, 0.02), M.accent, 0, -h / 2 - 0.2, -0.015)
    const top = Y + H.height - y
    const rod = pole(0.03, h / 2 + 0.2, top, 8)
    for (const s of [-1, 1]) {
      add(bg, rod, kit.mats.chrome, s * w * 0.32, 0, -0.17)
      add(bg, ceilingPlate, kit.mats.chrome, s * w * 0.32, top - 0.02, -0.17)
    }
    boards.push({ c, t })
  }
  const slab = (text, w, h, x, y, z, ry) => {
    const t = tex(paintSlabSign(text))
    const mat = new MeshStandardMaterial({ map: t, emissiveMap: t, emissive: '#ffffff', emissiveIntensity: 0.45, roughness: 0.4 })
    const g = new Group()
    g.position.set(x, y, z)
    g.rotation.y = ry
    S.add(g)
    add(g, rbox(w + 0.16, h + 0.16, 0.05, 0.08, 1), M.black)
    // Two single-sided faces back to back, so the word reads correctly from both sides.
    const face = new PlaneGeometry(w, h)
    add(g, face, mat, 0, 0, 0.027)
    add(g, face, mat, 0, 0, -0.027, Math.PI)
    const top = Y + H.height - y
    const rod = pole(0.018, h / 2 + 0.08, top, 6)
    for (const s of [-1, 1]) {
      add(g, rod, kit.mats.chrome, s * w * 0.4, 0, 0)
      add(g, ceilingPlate, kit.mats.chrome, s * w * 0.4, top - 0.02, 0)
    }
  }
  slab('check-in', 8, 2, -6, Y + 9.5, -17, 0)
  slab('security', 6.4, 1.6, H.x1 - 0.6, Y + 6.2, QUEUE.securityDoor.z, -Math.PI / 2)
  // Security doorway: rounded dark frame + sliding glass doors (security.js opens them).
  for (const s of [-1, 1]) add(S, rbox(0.7, 4.6, 0.3, 0.06, 1), M.black, H.x1, Y + 2.3, sd.z + s * 2.6)
  add(S, rbox(0.7, 0.4, 5.5, 0.06, 1), M.black, H.x1, Y + 4.6, sd.z)
  add(S, rbox(0.12, 0.1, 0.5, 0.03, 1), M.slate, H.x1 - 0.38, Y + 4.32, sd.z) // door sensor
  const secGlass = new MeshStandardMaterial({ color: '#a8d4ff', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.3, depthWrite: false })
  const secDoor = { open: 0, panels: [], colliders: [] }
  const stile = rbox(0.1, 4.2, 0.09, 0.03, 1)
  const railG = rbox(0.1, 0.12, 2.45, 0.03, 1)
  const pull = pole(0.018, -0.45, 0.45, 8)
  for (const s of [-1, 1]) {
    const p = new Group()
    box(p, 0.06, 4.2, 2.45, secGlass, 0, 0, 0)
    for (const e of [-1, 1]) add(p, stile, M.black, 0, 0, e * 1.18)
    add(p, railG, M.black, 0, 2.05, 0)
    add(p, railG, M.black, 0, -2.05, 0)
    for (const e of [-1, 1]) add(p, pull, kit.mats.chrome, e * 0.08, 0, -s * 1.0)
    const panel = bake(p, false)
    panel.position.set(H.x1, Y + 2.1, sd.z + s * 1.25)
    panel.userData.s = s
    panel.renderOrder = 3
    scene.add(panel)
    secDoor.panels.push(panel)
    secDoor.colliders.push(addFixed(RAPIER.ColliderDesc.cuboid(0.12, 2.1, 1.25), { x: H.x1, y: Y + 2.1, z: sd.z + s * 1.25 }))
  }
  secDoor.set = (k) => {
    secDoor.open = k
    const e = k * k * (3 - 2 * k)
    for (const p of secDoor.panels) p.position.z = sd.z + p.userData.s * (1.25 + e * 2.3)
    for (const c of secDoor.colliders) c.setEnabled(k < 0.6)
  }

  // Seating rows by the left windows: cushioned seats on a steel beam, armrests, T-legs.
  const seatG = rbox(0.8, 0.1, 0.64, 0.04, 1)
  const backG = rbox(0.8, 0.68, 0.09, 0.04, 1)
  const armG = new BoxGeometry(0.07, 0.05, 0.5)
  const armPost = new BoxGeometry(0.04, 0.22, 0.04)
  const beamG = rbox(5.8, 0.08, 0.14, 0.03, 1)
  const legG = new BoxGeometry(0.08, 0.36, 0.08)
  const footG = rbox(0.12, 0.04, 0.62, 0.015, 1)
  const bracketG = new BoxGeometry(0.05, 0.05, 0.42)
  for (let r = 0; r < 4; r++) {
    const z = -17 - r * 3.4
    for (let k = 0; k < 6; k++) {
      const x = -27 + k * 0.95
      add(S, seatG, M.cushion, x, Y + 0.48, z + 0.02)
      add(S, backG, M.cushion, x, Y + 0.86, z - 0.33, 0, -0.1)
      add(S, bracketG, M.seat, x, Y + 0.41, z - 0.05)
    }
    for (let k = 0; k <= 6; k++) {
      const x = -27.475 + k * 0.95
      add(S, armG, M.seat, x, Y + 0.7, z - 0.02)
      add(S, armPost, M.steel, x, Y + 0.58, z - 0.05)
    }
    add(S, beamG, M.steel, -24.6, Y + 0.36, z - 0.05)
    for (const x of [-27.2, -22]) {
      add(S, legG, M.steel, x, Y + 0.18, z - 0.05)
      add(S, footG, M.steel, x, Y + 0.02, z - 0.05)
    }
    solidBox(2.9, 0.6, 0.45, -24.6, Y + 0.6, z - 0.1)
  }
  // Planters: turned pot with a rim, soil, a trunk and a cluster of low-poly foliage.
  const potG = lathe([[0, 0], [0.36, 0], [0.4, 0.04], [0.48, 0.7], [0.53, 0.72], [0.53, 0.8], [0.47, 0.8], [0.46, 0.74]], 16)
  const soilG = new CircleGeometry(0.465, 16).rotateX(-Math.PI / 2)
  const trunkG = pole(0.05, 0.74, 1.3, 6)
  const leafG = new IcosahedronGeometry(1, 1)
  for (const [x, z] of [[-20, -14], [20, -14], [-28.5, -42], [27, -42]]) {
    add(S, potG, M.white, x, Y, z)
    add(S, soilG, M.soil, x, Y + 0.74, z)
    add(S, trunkG, M.soil, x, Y, z)
    ;[[0, 1.4, 0, 0.62], [0.32, 1.85, 0.12, 0.46], [-0.26, 2.1, -0.1, 0.42], [0.05, 2.45, 0.05, 0.3], [-0.36, 1.6, 0.22, 0.4], [0.2, 1.55, -0.3, 0.38]].forEach(([bx, by, bz, r], k) => {
      add(S, leafG, k % 2 ? M.plantLight : M.plant, x + bx, Y + by, z + bz, k, k * 0.7).scale.setScalar(r)
    })
    solidPole(0.5, 1, x, z)
  }
  // Bins: turned body with a lid lip and a green recycling band.
  const binG = lathe([[0, 0], [0.3, 0], [0.33, 0.03], [0.35, 0.88], [0.37, 0.9], [0.37, 0.98], [0.3, 0.995], [0.12, 1.0], [0, 1.0]], 16)
  const bandG = new CylinderGeometry(0.357, 0.357, 0.12, 16, 1, true)
  for (const [x, z] of [[18, -14.5], [-15, -34]]) {
    add(S, binG, M.black, x, Y, z)
    add(S, bandG, M.green, x, Y + 0.62, z)
    solidPole(0.36, 1, x, z)
  }

  const baked = bake(S, false)
  const shadowMats = new Set([M.black, M.slate, M.seat, M.white, M.cushion, M.wood, M.plastic, kit.mats.base, kit.mats.head, frontMat])
  baked.traverse((o) => {
    if (!o.isMesh) return
    o.receiveShadow = true
    o.castShadow = shadowMats.has(o.material)
  })
  scene.add(baked)

  // --- Markers: QUEUE HERE (inside) + CHECK IN arrow over the entrance (outside) ------------------
  const qz = QUEUE.joinZone
  const queueMarker = new Group()
  const qa = makeArrow()
  qa.position.y = 2.3
  const qs = pillSign('QUEUE HERE')
  qs.position.y = 4.3
  queueMarker.add(qa, qs)
  queueMarker.position.set((qz.x0 + qz.x1) / 2, Y, (qz.z0 + qz.z1) / 2)
  scene.add(queueMarker)

  const doorMarker = new Group()
  const da = makeArrow()
  da.position.y = 2.6
  const ds = pillSign('CHECK IN')
  ds.position.y = 4.6
  doorMarker.add(da, ds)
  doorMarker.position.set(0, Y + 4.5, AIRPORT.facadeZ + 1.6)
  scene.add(doorMarker)

  const markers = [[queueMarker, qa], [doorMarker, da]]
  let blink = 0
  let highlightIndex = 0
  let status = null
  function redrawBoards(on) {
    const r = rows.map((row, i) => (i === highlightIndex && status ? [row[0], row[1], row[2], row[3], status] : row))
    for (const b of boards) {
      drawBoard(b.c, r, { highlight: highlightIndex, blinkOn: on })
      b.t.needsUpdate = true
    }
  }
  redrawBoards(true)

  return {
    desks,
    secDoor,
    makeArrow,
    pillSign,
    queueMarker,
    doorMarker,
    setFlight(index, newStatus = null) {
      highlightIndex = index
      status = newStatus
      if (index >= rows.length) {
        const d = DESTINATIONS[index]
        rows[rows.length - 1] = [d.time, d.city, d.flight, d.gate, 'boarding']
        highlightIndex = rows.length - 1
      }
      redrawBoards(true)
    },
    update(dt, t) {
      beltTex.offset.y -= dt * 0.35
      const pulse = 1 + Math.sin(t * 4) * 0.06
      for (const [m, arrow] of markers) {
        if (!m.visible) continue
        arrow.position.y = (m === queueMarker ? 2.3 : 2.6) + Math.sin(t * 3) * 0.3
        arrow.rotation.y = Math.sin(t * 1.4) * 0.6
        m.children[1].scale.set(4.2 * pulse, 1.18 * pulse, 1)
      }
      blink += dt
      if (blink > 0.6) {
        blink = 0
        redrawBoards(Math.floor(t / 0.6) % 2 === 0)
      }
    },
  }
}
