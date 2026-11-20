// Past security: the concourse (shops on one side, gate doors on the other, hanging gate signs,
// strip lights), your gate hall (rows of black seats, the boarding line with stanchions and a
// cyan priority lane, the gate desk with boarding-pass scanners, a floor-to-ceiling glass wall
// with the apron and your plane behind it, the jet bridge) and the Sky Lounge next door (wood
// panels, coffered ceiling, chandelier, bar with bottles, bookshelves, leather armchairs).
// Static parts are baked (one mesh per material); signs, doors, timers and the jets stay live.
import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  PointLight,
  Quaternion,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  TorusGeometry,
  Vector3,
} from 'three'
import { AIRPORT, DESTINATIONS, GATES } from '../config.js'
import { bake } from '../bake.js'
import { neon, solidBox } from '../propkit.js'
import { RAPIER, addFixed } from '../physics.js'
import { mulberry32, paintSoftDot } from '../textures.js'
import { paintCarpet, paintHallFloor, paintPanels, tex } from './paint.js'
import { makeJet, JET } from './airliner.js'

const Y = AIRPORT.walkY
const G = GATES
const C = G.corridor
const HL = G.hall
const LG = G.lounge
const FONT = 'Fredoka, "Arial Rounded MT Bold", Arial, sans-serif'

// --- small builders ----------------------------------------------------------------------------
function box(parent, w, h, d, mat, x, y, z, ry = 0) {
  const m = new Mesh(new BoxGeometry(w, h, d), mat)
  m.position.set(x, y, z)
  m.rotation.y = ry
  parent.add(m)
  return m
}
function cyl(parent, rt, rb, h, mat, x, y, z, seg = 12) {
  const m = new Mesh(new CylinderGeometry(rt, rb, h, seg), mat)
  m.position.set(x, y, z)
  parent.add(m)
  return m
}
// Horizontal rectangle with UVs in metres / tile.
function flat(parent, x0, x1, z0, z1, y, mat, tile = 0) {
  const w = Math.abs(x1 - x0)
  const d = Math.abs(z1 - z0)
  const g = new PlaneGeometry(w, d)
  g.rotateX(-Math.PI / 2)
  if (tile) {
    const uv = g.attributes.uv
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / tile, (uv.getY(i) * d) / tile)
  }
  const m = new Mesh(g, mat)
  m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2)
  parent.add(m)
  return m
}
// Vertical rectangle facing `ry` (0 = +Z) with UVs in metres / tile.
function panel(parent, w, h, mat, x, y, z, ry, tile = 0) {
  const g = new PlaneGeometry(w, h)
  if (tile) {
    const uv = g.attributes.uv
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / tile, (uv.getY(i) * h) / tile)
  }
  const m = new Mesh(g, mat)
  m.position.set(x, y, z)
  m.rotation.y = ry
  parent.add(m)
  return m
}
// A box whose UVs repeat every `tile` metres on its big faces (walls).
function tiledBox(parent, w, h, d, mat, x, y, z, tile) {
  const g = new BoxGeometry(w, h, d)
  const uv = g.attributes.uv
  const n = g.attributes.normal
  for (let i = 0; i < uv.count; i++) {
    const ax = Math.abs(n.getX(i)) > 0.5 ? d : w
    const ay = Math.abs(n.getY(i)) > 0.5 ? d : h
    uv.setXY(i, (uv.getX(i) * ax) / tile, (uv.getY(i) * ay) / tile)
  }
  const m = new Mesh(g, mat)
  m.position.set(x, y, z)
  parent.add(m)
  return m
}

function cv(w, h = w) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}
const canvasTex = (c) => {
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 8
  return t
}
const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

// --- painters ---------------------------------------------------------------------------------------
function paintWood(base = '#8a5a32', dark = '#5e3a1e', seed = 3) {
  const c = cv(256)
  const ctx = c.getContext('2d')
  const rand = mulberry32(seed)
  ctx.fillStyle = base
  ctx.fillRect(0, 0, 256, 256)
  // vertical planks with grain
  for (let i = 0; i < 4; i++) {
    const x = i * 64
    ctx.fillStyle = `rgba(0,0,0,${0.04 + rand() * 0.08})`
    ctx.fillRect(x, 0, 64, 256)
    for (let k = 0; k < 14; k++) {
      ctx.strokeStyle = `rgba(40,20,5,${0.08 + rand() * 0.12})`
      ctx.lineWidth = 1 + rand() * 2
      ctx.beginPath()
      const gx = x + 4 + rand() * 56
      ctx.moveTo(gx, 0)
      ctx.bezierCurveTo(gx + rand() * 8 - 4, 80, gx + rand() * 8 - 4, 170, gx + rand() * 6 - 3, 256)
      ctx.stroke()
    }
    ctx.fillStyle = dark
    ctx.fillRect(x, 0, 3, 256)
  }
  return c
}
function paintLoungeCarpet() {
  const c = cv(256)
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#efe2c4'
  ctx.fillRect(0, 0, 256, 256)
  ctx.strokeStyle = 'rgba(176,132,70,0.45)'
  ctx.lineWidth = 6
  for (const [x, y] of [[0, 0], [128, 128], [256, 0], [0, 256], [256, 256]]) {
    ctx.beginPath()
    ctx.moveTo(x, y - 52)
    ctx.lineTo(x + 52, y)
    ctx.lineTo(x, y + 52)
    ctx.lineTo(x - 52, y)
    ctx.closePath()
    ctx.stroke()
  }
  ctx.fillStyle = 'rgba(176,132,70,0.35)'
  for (const [x, y] of [[128, 0], [0, 128], [256, 128], [128, 256]]) {
    ctx.beginPath()
    ctx.arc(x, y, 9, 0, 7)
    ctx.fill()
  }
  return c
}
function paintPriority() {
  const c = cv(128, 512)
  const ctx = c.getContext('2d')
  const g = ctx.createLinearGradient(0, 0, 128, 0)
  g.addColorStop(0, '#22d4ff')
  g.addColorStop(0.5, '#3ee4ff')
  g.addColorStop(1, '#22d4ff')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 128, 512)
  ctx.save()
  ctx.translate(64, 256)
  ctx.rotate(-Math.PI / 2)
  ctx.fillStyle = 'rgba(10,70,120,0.5)'
  ctx.font = `italic 600 54px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('priority', 0, 0)
  ctx.restore()
  return c
}
function paintJoinPad() {
  const c = cv(256, 192)
  const ctx = c.getContext('2d')
  rr(ctx, 10, 10, 236, 172, 34)
  ctx.fillStyle = 'rgba(80,220,255,0.38)'
  ctx.fill()
  ctx.lineWidth = 10
  ctx.strokeStyle = 'rgba(150,240,255,0.95)'
  ctx.stroke()
  return c
}
function paintCoffer() {
  const c = cv(256)
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#3a2412'
  ctx.fillRect(0, 0, 256, 256)
  const g = ctx.createRadialGradient(128, 128, 10, 128, 128, 120)
  g.addColorStop(0, '#fff3d6')
  g.addColorStop(0.7, '#f6dfae')
  g.addColorStop(1, '#d9b277')
  ctx.fillStyle = '#6b4424'
  ctx.fillRect(18, 18, 220, 220)
  ctx.fillStyle = g
  ctx.fillRect(34, 34, 188, 188)
  return c
}
function paintBottles(seed = 9) {
  // The bar's back shelves: three tiers of bottles in front of a warm backlight.
  const c = cv(512, 256)
  const ctx = c.getContext('2d')
  const rand = mulberry32(seed)
  const g = ctx.createLinearGradient(0, 0, 0, 256)
  g.addColorStop(0, '#ffe9b8')
  g.addColorStop(1, '#f2c76e')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 512, 256)
  const cols = ['#d6232e', '#2a8a4a', '#f2a31b', '#1d4fbf', '#7a2a8a', '#e85c1a', '#2b2f3a', '#3ab0a0', '#c8b02a']
  for (let tier = 0; tier < 3; tier++) {
    const base = 80 + tier * 84
    ctx.fillStyle = '#5a361a'
    ctx.fillRect(0, base, 512, 8)
    for (let x = 6; x < 506; ) {
      const w = 9 + rand() * 7
      const h = 34 + rand() * 32
      ctx.fillStyle = cols[Math.floor(rand() * cols.length)]
      rr(ctx, x, base - h, w, h, 3)
      ctx.fill()
      ctx.fillRect(x + w * 0.32, base - h - 10, w * 0.36, 12)
      ctx.fillStyle = 'rgba(255,255,255,0.45)'
      ctx.fillRect(x + 2, base - h + 4, 2, h - 10)
      x += w + 3 + rand() * 4
    }
  }
  return c
}
function paintBooks(seed = 4) {
  const c = cv(512, 512)
  const ctx = c.getContext('2d')
  const rand = mulberry32(seed)
  ctx.fillStyle = '#4a2c14'
  ctx.fillRect(0, 0, 512, 512)
  const cols = ['#b3202a', '#1f3f7a', '#2a6a3a', '#d9a32a', '#6a2a6a', '#e8e0cc', '#1b1d22', '#c8642a', '#3a8aa0']
  for (let shelf = 0; shelf < 5; shelf++) {
    const y1 = 96 + shelf * 100
    ctx.fillStyle = '#2e1a0a'
    ctx.fillRect(0, y1 - 96, 512, 6)
    for (let x = 8; x < 504; ) {
      const w = 10 + rand() * 12
      const h = 54 + rand() * 30
      const lean = rand() < 0.06
      ctx.fillStyle = cols[Math.floor(rand() * cols.length)]
      ctx.save()
      if (lean) {
        ctx.translate(x, y1)
        ctx.rotate(-0.25)
        ctx.fillRect(0, -h, w, h)
      } else ctx.fillRect(x, y1 - h, w, h)
      ctx.fillStyle = 'rgba(255,215,120,0.6)'
      if (!lean) {
        ctx.fillRect(x + 2, y1 - h + 8, w - 4, 3)
        ctx.fillRect(x + 2, y1 - 16, w - 4, 3)
      }
      ctx.restore()
      x += w + (lean ? 14 : 1)
    }
    ctx.fillStyle = '#2e1a0a'
    ctx.fillRect(0, y1, 512, 8)
  }
  return c
}
function paintGalleyLike(kind, seed) {
  // Shop interiors: a back wall full of products that reads well through the glass.
  const c = cv(512, 256)
  const ctx = c.getContext('2d')
  const rand = mulberry32(seed)
  const bg = { duty: '#f3eee6', cafe: '#3b2a20', books: '#e9e1d2', travel: '#e8f0f7', sweets: '#ffe3ef' }[kind]
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, 512, 256)
  const pal = {
    duty: ['#f2c94c', '#d6a3c6', '#7fc4e8', '#e8434f', '#1b1d22', '#c9a227', '#ffffff'],
    cafe: ['#f2e6d0', '#c8782a', '#6b3f1f', '#ffffff', '#e8434f'],
    books: ['#b3202a', '#1f3f7a', '#2a6a3a', '#d9a32a', '#6a2a6a', '#1b1d22', '#3a8aa0'],
    travel: ['#e8434f', '#5cc4ff', '#ffc531', '#5fe0a8', '#a98ae6', '#2b2f3a'],
    sweets: ['#ff5fa8', '#ffc531', '#7cdcff', '#9dff7a', '#ff8a3d', '#a98ae6', '#ffffff'],
  }[kind]
  const shelfC = kind === 'cafe' ? '#1b120c' : '#c9ced8'
  for (let s = 0; s < 4; s++) {
    const y = 60 + s * 58
    ctx.fillStyle = shelfC
    ctx.fillRect(0, y, 512, 6)
    for (let x = 6; x < 506; ) {
      const w = kind === 'books' ? 8 + rand() * 8 : 14 + rand() * 16
      const h = kind === 'books' ? 30 + rand() * 18 : 18 + rand() * 26
      ctx.fillStyle = pal[Math.floor(rand() * pal.length)]
      if (kind === 'duty' && rand() < 0.5) {
        rr(ctx, x, y - h, w, h, 4)
        ctx.fill()
        ctx.fillStyle = '#c9a227'
        ctx.fillRect(x + w * 0.3, y - h - 6, w * 0.4, 7)
      } else if (kind === 'sweets') {
        ctx.beginPath()
        ctx.arc(x + w / 2, y - w / 2, w / 2, 0, 7)
        ctx.fill()
      } else ctx.fillRect(x, y - h, w, h)
      x += w + 2 + rand() * 3
    }
  }
  if (kind === 'cafe') {
    ctx.fillStyle = '#1b120c'
    ctx.fillRect(140, 10, 232, 44)
    ctx.fillStyle = '#f2e6d0'
    ctx.font = `600 26px ${FONT}`
    ctx.textAlign = 'center'
    ctx.fillText('coffee · tea · cocoa', 256, 42)
  }
  return c
}
// Black fascia with a white italic name (the shops and gate doors).
function paintFascia(text, { w = 1024, h = 128, size = 0.56, bg = '#0e1016', color = '#ffffff' } = {}) {
  const c = cv(w, h)
  const ctx = c.getContext('2d')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = color
  ctx.font = `italic 500 ${h * size}px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, w / 2, h * 0.54)
  return c
}

// A sign whose text can change (gate number + city follow your booking).
function dynSign(w, h, cw, ch, draw, parent, { emissive = 0.45, both = false } = {}) {
  const c = cv(cw, ch)
  const t = canvasTex(c)
  const mat = new MeshStandardMaterial({ map: t, emissiveMap: t, emissive: '#ffffff', emissiveIntensity: emissive, roughness: 0.5 })
  const side = new MeshStandardMaterial({ color: '#0e1016', roughness: 0.4 })
  const m = new Mesh(new BoxGeometry(w, h, 0.18), [side, side, side, side, mat, both ? mat : side])
  parent.add(m)
  let last = null
  const set = (...args) => {
    const key = JSON.stringify(args)
    if (key === last) return
    last = key
    const ctx = c.getContext('2d')
    ctx.clearRect(0, 0, cw, ch)
    draw(ctx, cw, ch, ...args)
    t.needsUpdate = true
  }
  return { mesh: m, set }
}
// Floating text (white, dark outline) that faces the camera: "boarding opens in / 2:15".
export function floatText(scene, w, { lines = 2, renderOrder = 12 } = {}) {
  const c = cv(512, lines === 2 ? 256 : 128)
  const t = canvasTex(c)
  const sp = new Sprite(new SpriteMaterial({ map: t, transparent: true, depthWrite: false }))
  sp.scale.set(w, (w * c.height) / c.width, 1)
  sp.renderOrder = renderOrder
  scene.add(sp)
  let last = ''
  return {
    sp,
    set(top, big) {
      const key = `${top}|${big}`
      if (key === last) return
      last = key
      const ctx = c.getContext('2d')
      ctx.clearRect(0, 0, c.width, c.height)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.lineJoin = 'round'
      const line = (txt, y, px, weight = 600) => {
        if (!txt) return
        ctx.font = `${weight} ${px}px ${FONT}`
        ctx.lineWidth = px * 0.16
        ctx.strokeStyle = 'rgba(10,16,32,0.85)'
        ctx.strokeText(txt, 256, y)
        ctx.fillStyle = '#ffffff'
        ctx.fillText(txt, 256, y)
      }
      if (lines === 2) {
        line(top, 64, 52, 500)
        line(big, 170, 108, 700)
      } else line(big ?? top, 66, 84, 700)
      t.needsUpdate = true
    },
  }
}

function glowSprite(color, size, opacity = 0.9) {
  const s = new Sprite(new SpriteMaterial({ map: dotTex(), color, transparent: true, opacity, depthWrite: false, blending: AdditiveBlending }))
  s.scale.set(size, size, 1)
  return s
}
let dot = null
const dotTex = () => (dot ??= new CanvasTexture(paintSoftDot(64)))

// =====================================================================================================
export function buildGates(scene, { makeArrow, pillSign }) {
  const S = new Group() // static, baked at the end
  const floorTex = paintHallFloor()
  const M = {
    floor: new MeshStandardMaterial({ map: tex(floorTex.color), normalMap: tex(floorTex.normal, { srgb: false }), roughness: 0.16 }),
    carpet: new MeshStandardMaterial({ map: tex(paintCarpet()), roughness: 0.95 }),
    panels: new MeshStandardMaterial({ map: tex(paintPanels()), roughness: 0.5, metalness: 0.15, color: '#5f6b86' }),
    navy: new MeshStandardMaterial({ color: '#141a2b', roughness: 0.45, metalness: 0.2 }),
    ceiling: new MeshStandardMaterial({ color: '#dfe3ea', roughness: 0.8 }),
    white: new MeshStandardMaterial({ color: '#f5f7fa', roughness: 0.35 }),
    black: new MeshStandardMaterial({ color: '#15171c', roughness: 0.3, metalness: 0.5 }),
    seat: new MeshStandardMaterial({ color: '#1a1c22', roughness: 0.32, metalness: 0.15 }),
    seatEdge: new MeshStandardMaterial({ color: '#2a2d35', roughness: 0.4 }),
    chrome: new MeshStandardMaterial({ color: '#dfe4ec', roughness: 0.18, metalness: 0.9 }),
    glass: new MeshStandardMaterial({ color: '#6fb6ff', roughness: 0.04, metalness: 0.3, transparent: true, opacity: 0.2, depthWrite: false, side: DoubleSide }),
    doorGlass: new MeshStandardMaterial({ color: '#9fd0ff', roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.45, depthWrite: false }),
    frosted: new MeshStandardMaterial({ color: '#cfe6fb', roughness: 0.2, metalness: 0.1, emissive: '#5a7fa8', emissiveIntensity: 0.25 }),
    light: neon('#f4fbff', 2.4),
    cyan: new MeshStandardMaterial({ map: tex(paintPriority()), roughness: 0.9 }),
    wood: new MeshStandardMaterial({ map: tex(paintWood()), roughness: 0.55 }),
    woodDark: new MeshStandardMaterial({ map: tex(paintWood('#4a2c16', '#2a170a', 7)), roughness: 0.5 }),
    gold: new MeshStandardMaterial({ color: '#d9a83a', roughness: 0.25, metalness: 0.9 }),
    leather: new MeshStandardMaterial({ color: '#8a2a22', roughness: 0.45 }),
    velvet: new MeshStandardMaterial({ color: '#1f5a3e', roughness: 0.85 }),
    marble: new MeshStandardMaterial({ color: '#f3f0ea', roughness: 0.15, metalness: 0.1 }),
    loungeCarpet: new MeshStandardMaterial({ map: tex(paintLoungeCarpet()), roughness: 0.95 }),
    coffer: new MeshStandardMaterial({ map: tex(paintCoffer()), emissiveMap: tex(paintCoffer()), emissive: '#ffffff', emissiveIntensity: 0.5, roughness: 0.6 }),
    bush: new MeshStandardMaterial({ color: '#5cbf4a', roughness: 0.8, flatShading: true }),
    bush2: new MeshStandardMaterial({ color: '#45a43a', roughness: 0.8, flatShading: true }),
    pot: new MeshStandardMaterial({ color: '#c9a06a', roughness: 0.7 }),
    trunk: new MeshStandardMaterial({ color: '#7a5a3a', roughness: 0.9 }),
    red: new MeshStandardMaterial({ color: '#c41f2a', roughness: 0.7 }),
    apron: new MeshStandardMaterial({ color: '#c9ccd2', roughness: 0.92 }),
    asphalt: new MeshStandardMaterial({ color: '#5a5e66', roughness: 0.95 }),
    yellow: new MeshStandardMaterial({ color: '#ffd21f', roughness: 0.7 }),
    paintWhite: new MeshStandardMaterial({ color: '#f4f4f4', roughness: 0.8 }),
    jetbridge: new MeshStandardMaterial({ color: '#c3c8d0', roughness: 0.4, metalness: 0.5 }),
    bellows: new MeshStandardMaterial({ color: '#22252c', roughness: 0.8 }),
    screen: new MeshStandardMaterial({ color: '#0e1a2c', roughness: 0.1, emissive: '#1d3d7a', emissiveIntensity: 0.6 }),
    greenLed: neon('#3dff6a', 3),
    shade: new MeshStandardMaterial({ color: '#fff3d8', roughness: 0.6, emissive: '#ffcf80', emissiveIntensity: 0.6, side: DoubleSide }),
  }

  // --- Floors ---------------------------------------------------------------------------------------
  flat(S, C.x0, C.x1, C.zN, C.zS, Y + 0.004, M.floor, 4)
  flat(S, HL.x0, HL.x1, HL.zN, HL.zS, Y + 0.004, M.floor, 4)
  flat(S, 114.6, 135.4, -61.6, -37.4, Y + 0.012, M.carpet, 3) // seating carpet
  flat(S, 138.3, 153.9, -56.8, -37.2, Y + 0.012, M.carpet, 3) // queue carpet
  flat(S, LG.x0, LG.x1, LG.zN, LG.zS, Y + 0.006, M.loungeCarpet, 3.5)
  // the floor collider: the curb slab already covers z > -72; this keeps the gates solid regardless
  solidBox((C.x1 - 92) / 2, 0.5, (72 - 17) / 2, (C.x1 + 92) / 2, Y - 0.5, (-17 - 72) / 2)

  // --- Corridor shell -----------------------------------------------------------------------------
  const CH = C.height
  // North wall (gate side) from the security wall to the end, with the opening into your gate hall.
  const hx0 = G.hallDoor.x - G.hallDoor.w / 2
  const hx1 = G.hallDoor.x + G.hallDoor.w / 2
  for (const [x0, x1] of [[92, hx0], [hx1, C.x1]]) {
    tiledBox(S, x1 - x0, HL.height, 0.4, M.panels, (x0 + x1) / 2, Y + HL.height / 2, C.zN - 0.2, 2.2)
    solidBox((x1 - x0) / 2, 6, 0.2, (x0 + x1) / 2, Y + 6, C.zN - 0.2)
  }
  tiledBox(S, G.hallDoor.w, HL.height - 4.6, 0.4, M.panels, G.hallDoor.x, Y + 4.6 + (HL.height - 4.6) / 2, C.zN - 0.2, 2.2)
  for (const s of [-1, 1]) box(S, 0.5, 4.6, 0.6, M.black, G.hallDoor.x + s * (G.hallDoor.w / 2 + 0.05), Y + 2.3, C.zN - 0.2)
  box(S, G.hallDoor.w + 0.6, 0.4, 0.6, M.black, G.hallDoor.x, Y + 4.6, C.zN - 0.2)
  // East end wall + ceiling + outer shell (the building seen from the street).
  tiledBox(S, 0.4, CH + 0.6, C.zS - C.zN + 6.4, M.panels, C.x1 + 0.2, Y + (CH + 0.6) / 2, (C.zS + C.zN) / 2 + 3, 2.2)
  solidBox(0.2, 6, 8, C.x1 + 0.2, Y + 6, (C.zS + C.zN) / 2)
  flat(S, 92, C.x1, C.zN, -17, Y + CH, M.ceiling, 0).rotation.x = Math.PI
  solidBox((C.x1 - 92) / 2, 0.3, 8, (C.x1 + 92) / 2, Y + CH + 0.3, -25)
  box(S, C.x1 - 92 + 0.8, 0.6, 16.4, M.navy, (C.x1 + 92) / 2, Y + CH + 0.6, -25) // roof slab
  tiledBox(S, C.x1 - 92, CH + 0.9, 0.4, M.panels, (C.x1 + 92) / 2, Y + (CH + 0.9) / 2, -16.8, 2.2) // street side
  // the corridor face of the security hall's east wall (around the "gates" doorway)
  const gz = -28
  for (const [z0, z1] of [[C.zN, gz - 2.6], [gz + 2.6, C.zS]]) panel(S, z1 - z0, CH, M.panels, 92.05, Y + CH / 2, (z0 + z1) / 2, Math.PI / 2, 2.2)
  panel(S, 5.2, CH - 4.6, M.panels, 92.05, Y + 4.6 + (CH - 4.6) / 2, gz, Math.PI / 2, 2.2)
  // Hanging strip lights on wires, two lines down the corridor.
  for (let x = 96; x < C.x1 - 2; x += 6) {
    for (const z of [-26, -30]) {
      box(S, 4.2, 0.12, 0.34, M.white, x + 1.5, Y + CH - 0.75, z)
      box(S, 4.0, 0.03, 0.22, M.light, x + 1.5, Y + CH - 0.82, z)
      for (const dx of [-1.5, 1.5]) box(S, 0.02, 0.7, 0.02, M.black, x + 1.5 + dx, Y + CH - 0.35, z)
    }
  }

  // --- Shops (south side): storefront glass, door, fascia sign, a lit interior full of products ----
  for (const [i, sh] of G.shops.entries()) {
    const w = sh.x1 - sh.x0
    const cx = (sh.x0 + sh.x1) / 2
    const zf = C.zS // storefront line
    // interior: floor, bright ceiling, back wall of products, side walls, a counter
    flat(S, sh.x0, sh.x1, zf, -17.2, Y + 0.008, sh.kind === 'cafe' ? M.woodDark : M.white, 2)
    flat(S, sh.x0, sh.x1, zf, -17.2, Y + 4.4, M.light, 0).rotation.x = Math.PI
    const back = new MeshStandardMaterial({ map: canvasTex(paintGalleyLike(sh.kind, 30 + i)), roughness: 0.6, emissive: '#ffffff', emissiveIntensity: 0.18 })
    back.emissiveMap = back.map
    panel(S, w, 4.4, back, cx, Y + 2.2, -17.25, 0)
    for (const x of [sh.x0, sh.x1]) panel(S, 6, 4.4, M.white, x, Y + 2.2, (zf - 17.2) / 2, x === sh.x0 ? Math.PI / 2 : -Math.PI / 2)
    box(S, w * 0.45, 1.0, 0.7, sh.kind === 'cafe' ? M.woodDark : M.white, cx + w * 0.18, Y + 0.5, -19.4)
    box(S, w * 0.45 + 0.1, 0.06, 0.8, M.black, cx + w * 0.18, Y + 1.03, -19.4)
    // a display table / shelf island
    box(S, 2.2, 0.8, 1.2, sh.kind === 'cafe' ? M.woodDark : M.white, cx - w * 0.22, Y + 0.4, -20.6)
    if (sh.kind === 'cafe') {
      box(S, 0.7, 0.6, 0.5, M.chrome, cx + w * 0.3, Y + 1.36, -19.4) // espresso machine
      for (const dx of [-3, -1]) {
        cyl(S, 0.45, 0.45, 0.05, M.black, cx + dx, Y + 0.76, -21.6, 16)
        cyl(S, 0.05, 0.05, 0.74, M.black, cx + dx, Y + 0.38, -21.6, 6)
      }
    }
    // storefront: black mullions, glass, a doorway on one side
    const doorX = sh.x0 + 2
    for (let x = sh.x0; x <= sh.x1 + 0.01; x += w / 4) box(S, 0.12, 4.0, 0.14, M.black, x, Y + 2.0, zf)
    box(S, w, 0.12, 0.14, M.black, cx, Y + 0.06, zf)
    panel(S, w - 2.4, 3.9, M.glass, cx + 1.2, Y + 2.0, zf + 0.02, 0)
    // fascia
    const ft = canvasTex(paintFascia(sh.name))
    const fm = new MeshStandardMaterial({ map: ft, emissiveMap: ft, emissive: '#ffffff', emissiveIntensity: 0.5, roughness: 0.5 })
    const fascia = new Mesh(new BoxGeometry(w, 1.1, 0.3), [M.black, M.black, M.black, M.black, fm, M.black])
    fascia.position.set(cx, Y + 4.6, zf + 0.12)
    scene.add(fascia)
    void doorX
  }
  solidBox((C.x1 - 92) / 2, 3, 0.2, (C.x1 + 92) / 2, Y + 3, C.zS + 0.1)
  // bins + benches along the gate side
  for (const x of [97, 117, 136, 160, 172]) {
    box(S, 3.2, 0.1, 0.6, M.black, x, Y + 0.46, C.zN + 0.8)
    box(S, 3.2, 0.5, 0.08, M.black, x, Y + 0.75, C.zN + 0.52)
    for (const dx of [-1.4, 1.4]) box(S, 0.08, 0.46, 0.5, M.chrome, x + dx, Y + 0.23, C.zN + 0.8)
    solidBox(1.6, 0.4, 0.4, x, Y + 0.4, C.zN + 0.7)
  }
  for (const x of [107.8, 150]) {
    cyl(S, 0.3, 0.26, 0.9, M.chrome, x, Y + 0.45, C.zS + 0.6, 14)
    cyl(S, 0.31, 0.31, 0.05, M.black, x, Y + 0.92, C.zS + 0.6, 14)
  }

  // --- Gate doors along the corridor (closed ones) + your gate's entrance --------------------------
  const gateSigns = []
  const gateTimers = []
  for (const fg of G.fakeGates) {
    const x = fg.x
    const z = C.zN + 0.05
    box(S, 4.4, 3.6, 0.2, M.black, x, Y + 1.8, z) // frame
    for (const s of [-1, 1]) box(S, 1.9, 3.2, 0.06, M.frosted, x + s * 1.0, Y + 1.7, z + 0.12)
    box(S, 0.06, 3.2, 0.1, M.black, x, Y + 1.7, z + 0.15)
    box(S, 4.4, 0.5, 0.1, M.navy, x, Y + 3.85, z + 0.12)
    const sign = dynSign(5.6, 0.9, 1024, 160, (ctx, w, h, text) => {
      ctx.fillStyle = '#0e1016'
      ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = '#ffffff'
      ctx.font = `italic 500 ${h * 0.56}px ${FONT}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(text, w / 2, h * 0.54)
    }, scene)
    sign.mesh.position.set(x, Y + 4.6, z + 0.2)
    gateSigns.push({ ...fg, sign })
    const ft = floatText(scene, 2.6)
    ft.sp.position.set(x, Y + 2.1, z + 1.2)
    gateTimers.push({ ft, left: 60 + Math.random() * 240, x })
  }
  // Your gate: a hanging sign over the entrance on the corridor side + one inside the hall.
  const hallSign = dynSign(7, 1.2, 1024, 176, (ctx, w, h, text) => {
    ctx.fillStyle = '#0e1016'
    rr(ctx, 0, 0, w, h, 26)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.font = `italic 500 ${h * 0.56}px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, w / 2, h * 0.54)
  }, scene, { both: true })
  hallSign.mesh.position.set(G.hallDoor.x, Y + 5.2, C.zN + 0.35)
  const entranceTimer = floatText(scene, 2.6)
  entranceTimer.sp.position.set(G.hallDoor.x, Y + 3.2, C.zN + 1.4)
  // Big hanging direction signs across the corridor ("gates 1 - 11" / "gates 13 - 24").
  const dirSigns = []
  for (const x of [110, 150]) {
    const s = dynSign(7.4, 1.5, 1024, 208, (ctx, w, h, text) => {
      ctx.fillStyle = '#0c0e14'
      rr(ctx, 0, 0, w, h, 30)
      ctx.fill()
      ctx.fillStyle = '#ffffff'
      ctx.font = `500 ${h * 0.5}px ${FONT}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(text, w / 2, h * 0.53)
    }, scene, { both: true })
    s.mesh.position.set(x, Y + CH - 1.55, -28)
    s.mesh.rotation.y = Math.PI / 2
    for (const dz of [-2.6, 2.6]) box(S, 0.03, 0.8, 0.03, M.black, x, Y + CH - 0.4, -28 + dz)
    dirSigns.push(s)
  }
  // The far end: a closed door to more gates.
  box(S, 0.2, 3.6, 4.4, M.black, C.x1 - 0.05, Y + 1.8, -28)
  for (const s of [-1, 1]) box(S, 0.06, 3.2, 1.9, M.frosted, C.x1 - 0.18, Y + 1.7, -28 + s * 1.0)
  const endSign = dynSign(5.6, 0.9, 1024, 160, (ctx, w, h, text) => {
    ctx.fillStyle = '#0e1016'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#ffffff'
    ctx.font = `italic 500 ${h * 0.5}px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, w / 2, h * 0.54)
  }, scene)
  endSign.mesh.position.set(C.x1 - 0.25, Y + 4.4, -28)
  endSign.mesh.rotation.y = -Math.PI / 2

  // --- Gate hall shell -------------------------------------------------------------------------------
  const HH = HL.height
  // East wall.
  tiledBox(S, 0.4, HH, HL.zS - HL.zN, M.panels, HL.x1 + 0.2, Y + HH / 2, (HL.zS + HL.zN) / 2, 2.2)
  solidBox(0.2, 6, (HL.zS - HL.zN) / 2, HL.x1 + 0.2, Y + 6, (HL.zS + HL.zN) / 2)
  // West wall bits around the lounge front (the lounge facade fills the middle).
  for (const [z0, z1] of [[HL.zS, LG.zS], [LG.zN, HL.zN]]) {
    tiledBox(S, 0.4, HH, z0 - z1, M.panels, HL.x0 - 0.2, Y + HH / 2, (z0 + z1) / 2, 2.2)
    solidBox(0.2, 6, (z0 - z1) / 2, HL.x0 - 0.2, Y + 6, (z0 + z1) / 2)
  }
  tiledBox(S, 0.4, HH - LG.height, LG.zS - LG.zN, M.panels, HL.x0 - 0.2, Y + LG.height + (HH - LG.height) / 2, (LG.zS + LG.zN) / 2, 2.2)
  // North: the glass curtain wall (black mullions, white columns), the boarding door in it.
  const gzN = HL.zN
  const bx = G.boardX
  panel(S, HL.x1 - HL.x0, HH, M.glass, (HL.x0 + HL.x1) / 2, Y + HH / 2, gzN, 0)
  for (let x = HL.x0; x <= HL.x1 + 0.01; x += 2.3) box(S, 0.12, HH, 0.16, M.black, x, Y + HH / 2, gzN)
  for (const y of [0.08, 3.4, 7.2, HH - 0.1]) box(S, HL.x1 - HL.x0, 0.14, 0.2, M.black, (HL.x0 + HL.x1) / 2, Y + y, gzN)
  for (let x = HL.x0 + 4; x < HL.x1; x += 9.2) box(S, 0.8, HH, 0.8, M.white, x, Y + HH / 2, gzN + 0.6)
  for (const [x0, x1] of [[HL.x0, bx - 1.4], [bx + 1.4, HL.x1]]) solidBox((x1 - x0) / 2, 6, 0.2, (x0 + x1) / 2, Y + 6, gzN)
  solidBox(1.4, 3, 0.2, bx, Y + 3.2 + 3, gzN)
  // Roof: trusses, light fittings, a pale ceiling.
  flat(S, HL.x0, HL.x1, HL.zN, HL.zS, Y + HH, M.ceiling, 0).rotation.x = Math.PI
  solidBox((HL.x1 - HL.x0) / 2, 0.3, (HL.zS - HL.zN) / 2, (HL.x0 + HL.x1) / 2, Y + HH + 0.3, (HL.zS + HL.zN) / 2)
  box(S, HL.x1 - HL.x0 + 0.8, 0.6, HL.zS - HL.zN + 0.8, M.navy, (HL.x0 + HL.x1) / 2, Y + HH + 0.6, (HL.zS + HL.zN) / 2)
  for (let x = HL.x0 + 4; x < HL.x1; x += 9.2) {
    box(S, 0.35, 0.5, HL.zS - HL.zN, M.white, x, Y + HH - 0.6, (HL.zS + HL.zN) / 2)
    box(S, 0.22, 0.22, HL.zS - HL.zN, M.white, x, Y + HH - 2.2, (HL.zS + HL.zN) / 2)
    for (let z = HL.zN + 1.6; z < HL.zS - 1; z += 3) {
      const d = box(S, 0.12, 1.9, 0.12, M.white, x, Y + HH - 1.4, z)
      d.rotation.x = (Math.round((z - HL.zN) / 3) % 2 ? 1 : -1) * 0.75
    }
  }
  for (let z = HL.zN + 2; z < HL.zS; z += 5) box(S, HL.x1 - HL.x0, 0.16, 0.16, M.white, (HL.x0 + HL.x1) / 2, Y + HH - 0.4, z)
  for (let x = HL.x0 + 6; x < HL.x1 - 2; x += 8) for (let z = HL.zS - 5; z > HL.zN + 2; z -= 7) {
    box(S, 4, 0.1, 0.32, M.white, x, Y + HH - 3.2, z)
    box(S, 3.8, 0.03, 0.2, M.light, x, Y + HH - 3.26, z)
    for (const dx of [-1.6, 1.6]) box(S, 0.02, 3.1, 0.02, M.black, x + dx, Y + HH - 1.6, z)
  }

  // --- Seats --------------------------------------------------------------------------------------------
  // One seat: pan, back, chrome legs on a shared beam; armrests between seats. Returns the sit point.
  const seats = []
  const seatAt = (x, zBack, dir) => {
    // dir = +1: faces +Z (pan south of the back), -1: faces -Z
    const pz = zBack + dir * 0.33
    box(S, 0.6, 0.09, 0.5, M.seat, x, Y + 0.44, pz)
    const b = box(S, 0.6, 0.62, 0.08, M.seat, x, Y + 0.8, zBack + dir * 0.06)
    b.rotation.x = -dir * 0.12
    box(S, 0.58, 0.04, 0.46, M.seatEdge, x, Y + 0.49, pz)
    seats.push({ x, y: Y + 0.48, z: pz, yaw: dir > 0 ? 0 : Math.PI, kind: 'gate', npc: null })
  }
  const arm = (x, zBack, dir) => {
    box(S, 0.06, 0.05, 0.46, M.black, x, Y + 0.68, zBack + dir * 0.3)
    box(S, 0.04, 0.22, 0.04, M.black, x, Y + 0.56, zBack + dir * 0.48)
  }
  const n = G.seatsPerBlock
  const P = G.seatPitch
  for (const x0 of G.seatBlocks) {
    const len = (n - 1) * P
    for (const zb of G.seatRows) {
      for (let i = 0; i < n; i++) for (const dir of [-1, 1]) seatAt(x0 + i * P, zb, dir)
      for (let i = 0; i <= n; i++) for (const dir of [-1, 1]) arm(x0 - P / 2 + i * P, zb, dir)
      box(S, len + 0.7, 0.08, 0.16, M.chrome, x0 + len / 2, Y + 0.32, zb)
      for (const dx of [0.2, len - 0.2]) {
        box(S, 0.08, 0.32, 0.08, M.chrome, x0 + dx, Y + 0.16, zb)
        box(S, 0.08, 0.04, 1.0, M.chrome, x0 + dx, Y + 0.02, zb)
      }
      solidBox(len / 2 + 0.35, 0.55, 0.14, x0 + len / 2, Y + 0.55, zb)
    }
    // window row, facing the glass
    const zb = G.windowRowZ + 0.33
    for (let i = 0; i < n; i++) seatAt(x0 + i * P, zb, -1)
    for (let i = 0; i <= n; i++) arm(x0 - P / 2 + i * P, zb, -1)
    box(S, len + 0.7, 0.08, 0.16, M.chrome, x0 + len / 2, Y + 0.32, zb)
    for (const dx of [0.2, len - 0.2]) box(S, 0.08, 0.32, 0.08, M.chrome, x0 + dx, Y + 0.16, zb)
    solidBox(len / 2 + 0.35, 0.55, 0.12, x0 + len / 2, Y + 0.55, zb)
  }
  // Plants by the glass.
  const plant = (x, z, s = 1) => {
    cyl(S, 0.42 * s, 0.32 * s, 0.7 * s, M.pot, x, Y + 0.35 * s, z, 14)
    const b1 = new Mesh(new IcosahedronGeometry(0.75 * s, 0), M.bush)
    b1.position.set(x, Y + 1.1 * s, z)
    S.add(b1)
    const b2 = new Mesh(new IcosahedronGeometry(0.55 * s, 0), M.bush2)
    b2.position.set(x + 0.3 * s, Y + 1.5 * s, z - 0.2 * s)
    S.add(b2)
    solidBox(0.42 * s, 0.6, 0.42 * s, x, Y + 0.6, z)
  }
  plant(114, -62.6)
  plant(136.2, -62.6)
  plant(124.8, -36)

  // --- Boarding line: stanchions + belts along the serpentine, the priority lane, desk, scanners -------
  const post = (x, z, mat = M.black) => {
    cyl(S, 0.2, 0.22, 0.05, mat, x, Y + 0.025, z, 14)
    cyl(S, 0.035, 0.035, 0.95, mat, x, Y + 0.5, z, 8)
    const c = new Mesh(new SphereGeometry(0.06, 8, 6), mat)
    c.position.set(x, Y + 0.98, z)
    S.add(c)
  }
  const belt = (x0, z0, x1, z1, mat = M.black) => {
    const L = Math.hypot(x1 - x0, z1 - z0)
    const k = Math.max(1, Math.ceil(L / 2.3))
    for (let i = 0; i <= k; i++) post(x0 + ((x1 - x0) * i) / k, z0 + ((z1 - z0) * i) / k, mat)
    box(S, Math.abs(x1 - x0) + 0.02, 0.06, Math.abs(z1 - z0) + 0.02, mat === M.black ? M.black : M.red, (x0 + x1) / 2, Y + 0.9, (z0 + z1) / 2)
    solidBox(Math.abs(x1 - x0) / 2 + 0.05, 0.6, Math.abs(z1 - z0) / 2 + 0.05, (x0 + x1) / 2, Y + 0.6, (z0 + z1) / 2)
  }
  const rows = [-40, -43, -46, -49, -52, -55]
  for (let i = 0; i < rows.length - 1; i++) {
    const z = (rows[i] + rows[i + 1]) / 2
    if (i % 2 === 0) belt(138.8, z, 151.0, z)
    else belt(141.4, z, 153.6, z)
  }
  belt(141.6, -38.4, 153.6, -38.4) // south edge (the way in is at its west end)
  belt(153.6, -38.4, 153.6, -56.6) // east edge
  belt(138.8, -41.5, 138.8, -56.6) // west edge
  belt(138.8, -56.6, 146.9, -56.6) // north edge, the exit gap at x = 148
  belt(149.1, -56.6, 153.6, -56.6)
  // Priority lane: a cyan carpet with stanchions on both sides, straight to the desk.
  const pc = flat(S, 154.4, 156.8, -59.4, -37.2, Y + 0.014, M.cyan, 0)
  pc.scale.set(1, 1, 1)
  const pc2 = flat(S, 149.8, 156.8, -59.4, -57.6, Y + 0.013, new MeshStandardMaterial({ color: '#2ad8ff', roughness: 0.9 }), 0)
  void pc2
  belt(157.1, -37.6, 157.1, -59.8)
  belt(154.1, -37.6, 154.1, -56.9)
  // Gate desk (podium with a scanner + monitor) and two pedestal scanners with green light strips.
  const sz = G.scanZ
  const scanners = []
  const pedestal = (x, z) => {
    box(S, 0.42, 1.0, 0.42, M.black, x, Y + 0.5, z)
    const top = box(S, 0.62, 0.12, 0.5, M.black, x, Y + 1.08, z)
    top.rotation.x = -0.3
    box(S, 0.44, 0.03, 0.34, M.screen, x, Y + 1.15, z + 0.02).rotation.x = -0.3
    const led = new Mesh(new BoxGeometry(0.03, 0.04, 0.44), new MeshBasicMaterial({ color: '#3dff6a' }))
    led.position.set(x + 0.23, Y + 0.72, z)
    scene.add(led)
    const led2 = led.clone()
    led2.material = led.material
    led2.position.x = x - 0.23
    scene.add(led2)
    solidBox(0.25, 0.6, 0.25, x, Y + 0.6, z)
    scanners.push({ x, z, mat: led.material })
  }
  pedestal(bx - 1.35, sz)
  pedestal(bx + 1.35, sz)
  const deskX = bx + 2.75
  box(S, 1.4, 1.05, 0.9, M.white, deskX, Y + 0.525, sz)
  box(S, 1.5, 0.08, 1.0, new MeshStandardMaterial({ color: '#2c3446', roughness: 0.3 }), deskX, Y + 1.09, sz)
  const deskBand = new Mesh(new BoxGeometry(1.42, 0.16, 0.02), new MeshBasicMaterial({ color: '#2ab0ff' }))
  deskBand.position.set(deskX, Y + 0.82, sz + 0.46)
  scene.add(deskBand)
  box(S, 0.06, 0.4, 0.06, M.black, deskX + 0.2, Y + 1.3, sz - 0.25)
  box(S, 0.56, 0.36, 0.05, M.screen, deskX + 0.2, Y + 1.55, sz - 0.25)
  solidBox(0.75, 0.6, 0.5, deskX, Y + 0.6, sz)
  // The agent's spot behind the desk (boarding.js puts an NPC there).
  const agentSpot = { x: deskX + 1.05, z: sz - 0.15, yaw: -Math.PI / 2 }

  // Info screen on a stand by the door: "sh 311 | new york | gate 12" + the countdown / "boarding".
  const info = dynSign(2.6, 1.6, 640, 400, (ctx, w, h, head, big, small, green) => {
    ctx.fillStyle = '#0a0c12'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#18a8ff'
    ctx.fillRect(0, 0, w, 68)
    ctx.fillStyle = '#ffffff'
    ctx.font = `500 34px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(head, w / 2, 36)
    ctx.fillStyle = green ? '#3dff6a' : '#ffffff'
    ctx.font = `700 ${green ? 120 : 140}px ${FONT}`
    ctx.fillText(big, w / 2, 200)
    ctx.fillStyle = '#e8ecf4'
    ctx.font = `500 34px ${FONT}`
    ctx.fillText(small, w / 2, 330)
  }, scene, { emissive: 0.9 })
  info.mesh.position.set(bx - 5.6, Y + 2.3, gzN + 1.6)
  for (const dx of [-0.9, 0.9]) {
    box(S, 0.08, 1.6, 0.08, M.black, bx - 5.6 + dx, Y + 0.8, gzN + 1.6)
    box(S, 0.5, 0.05, 0.5, M.black, bx - 5.6 + dx, Y + 0.03, gzN + 1.6)
  }
  solidBox(1.3, 1, 0.3, bx - 5.6, Y + 1, gzN + 1.6)
  // "boarding · gate 12" over the door + the floating countdown.
  const doorSign = dynSign(5.4, 0.9, 1024, 168, (ctx, w, h, text) => {
    ctx.fillStyle = '#0e1016'
    rr(ctx, 0, 0, w, h, 20)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.font = `italic 500 ${h * 0.54}px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, w / 2, h * 0.54)
  }, scene)
  doorSign.mesh.position.set(bx, Y + 4.3, gzN + 0.3)
  const doorTimer = floatText(scene, 2.8)
  doorTimer.sp.position.set(bx, Y + 2.6, gzN + 1.6)
  // A second big hanging sign inside the hall ("gate 12 · new york").
  const hallSign2 = dynSign(9, 1.5, 1024, 168, (ctx, w, h, text) => {
    ctx.fillStyle = '#0e1016'
    rr(ctx, 0, 0, w, h, 24)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.font = `italic 500 ${h * 0.56}px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, w / 2, h * 0.54)
  }, scene, { both: true })
  hallSign2.mesh.position.set(146, Y + 7.2, -46)
  for (const dx of [-3.6, 3.6]) box(S, 0.03, HH - 7.9, 0.03, M.black, 146 + dx, Y + 7.95 + (HH - 7.95) / 2, -46)
  const boardingSlab = dynSign(5, 1.3, 768, 200, (ctx, w, h, text) => {
    ctx.fillStyle = '#0e1016'
    rr(ctx, 0, 0, w, h, 26)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.font = `500 ${h * 0.5}px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, w / 2, h * 0.53)
  }, scene, { both: true })
  boardingSlab.mesh.position.set(140, Y + 7.6, -40)
  boardingSlab.mesh.rotation.y = 0.35
  boardingSlab.set('boarding')

  // Boarding door: two sliding glass panels.
  const bdoor = { k: 0, panels: [], collider: null }
  box(S, 0.2, 3.4, 0.3, M.black, bx - 1.5, Y + 1.7, gzN)
  box(S, 0.2, 3.4, 0.3, M.black, bx + 1.5, Y + 1.7, gzN)
  box(S, 3.2, 0.3, 0.4, M.black, bx, Y + 3.35, gzN)
  const dled = new Mesh(new BoxGeometry(0.4, 0.12, 0.06), new MeshBasicMaterial({ color: '#ff3b3b' }))
  dled.position.set(bx, Y + 3.35, gzN + 0.24)
  scene.add(dled)
  for (const s of [-1, 1]) {
    const p = new Mesh(new BoxGeometry(1.4, 3.1, 0.06), M.doorGlass)
    p.position.set(bx + s * 0.7, Y + 1.6, gzN)
    p.userData.s = s
    scene.add(p)
    bdoor.panels.push(p)
  }
  bdoor.collider = addFixed(RAPIER.ColliderDesc.cuboid(1.4, 1.6, 0.15), { x: bx, y: Y + 1.6, z: gzN })

  // Rotunda + jet bridge (the bridge rises to the plane's door; only the rotunda is walkable).
  const RO = G.rotunda
  cyl(S, RO.r, RO.r, 0.06, M.bellows, RO.x, Y + 0.03, RO.z, 32)
  const rw = new Mesh(new CylinderGeometry(RO.r + 0.1, RO.r + 0.1, 3.6, 32, 1, true, 0.35, Math.PI * 2 - 0.7), M.jetbridge)
  rw.position.set(RO.x, Y + 1.8, RO.z)
  rw.rotation.y = 0
  S.add(rw)
  const rwi = new Mesh(new CylinderGeometry(RO.r, RO.r, 3.4, 32, 1, true, 0.35, Math.PI * 2 - 0.7), new MeshStandardMaterial({ color: '#e9ecf1', roughness: 0.6, side: 1 }))
  rwi.position.copy(rw.position)
  S.add(rwi)
  cyl(S, RO.r + 0.2, RO.r + 0.2, 0.3, M.jetbridge, RO.x, Y + 3.75, RO.z, 32)
  for (let a = 0; a < 16; a++) {
    const ang = (a / 16) * Math.PI * 2
    if (Math.abs(Math.sin(ang / 2)) < 0.2) continue
    solidBox(0.5, 2, 0.3, RO.x + Math.sin(ang) * (RO.r + 0.35), Y + 2, RO.z + Math.cos(ang) * (RO.r + 0.35), ang)
  }
  solidBox(1.6, 2, 0.2, RO.x, Y + 2, RO.z - RO.r - 0.3)
  // Tunnel: from the rotunda (north side) to the plane's front door, rising to its sill.
  const PL = G.plane
  const sill = PL.y + Y - 1.05
  const z0 = RO.z - RO.r + 0.2
  const z1 = PL.z + JET.r + 0.5
  const tl = z0 - z1
  const rise = sill - Y
  const tunnel = new Group()
  tunnel.position.set(bx, Y + rise / 2, (z0 + z1) / 2)
  tunnel.rotation.x = Math.atan2(rise, tl)
  const L = Math.hypot(tl, rise)
  box(tunnel, 2.8, 0.2, L, M.jetbridge, 0, -0.1, 0)
  box(tunnel, 2.8, 0.2, L, M.jetbridge, 0, 2.9, 0)
  for (const s of [-1, 1]) {
    box(tunnel, 0.12, 3.0, L, M.jetbridge, s * 1.4, 1.4, 0)
    box(tunnel, 0.13, 0.7, L - 0.6, M.doorGlass, s * 1.42, 1.9, 0)
    for (let k = -L / 2 + 0.6; k < L / 2; k += 1.2) box(tunnel, 0.16, 0.74, 0.08, M.black, s * 1.44, 1.9, k)
  }
  box(tunnel, 2.82, 0.08, L, M.bellows, 0, 0.02, 0)
  // bellows (the accordion that hugs the plane)
  for (let k = 0; k < 5; k++) box(tunnel, 3.2 - k * 0.04, 3.4 - k * 0.04, 0.12, M.bellows, 0, 1.45, -L / 2 - 0.1 - k * 0.12)
  S.add(tunnel)
  // a leg with a wheeled bogie under the bridge end
  cyl(S, 0.18, 0.18, sill - 0.4, M.jetbridge, bx + 1.2, (sill - 0.4) / 2, z1 + 1.6, 10)
  cyl(S, 0.18, 0.18, sill - 0.4, M.jetbridge, bx - 1.2, (sill - 0.4) / 2, z1 + 1.6, 10)
  box(S, 3.2, 0.5, 1.2, M.black, bx, 0.6, z1 + 1.6)
  for (const s of [-1, 1]) {
    const w = cyl(S, 0.42, 0.42, 0.34, M.black, bx + s * 1.1, 0.42, z1 + 1.6, 16)
    w.rotation.z = Math.PI / 2
  }

  // --- Sky Lounge -------------------------------------------------------------------------------------
  const LH = LG.height
  const lcx = (LG.x0 + LG.x1) / 2
  const lcz = (LG.zS + LG.zN) / 2
  // Walls: dark wood wainscot, warm wood panels above; a wooden facade toward the gate hall.
  const lw = LG.x1 - LG.x0
  const ld = LG.zS - LG.zN
  for (const [w, x, z, ry] of [[lw, lcx, LG.zN + 0.02, 0], [lw, lcx, LG.zS - 0.02, Math.PI]]) {
    panel(S, w, 1.2, M.woodDark, x, Y + 0.6, z, ry, 1.5)
    panel(S, w, LH - 1.2, M.wood, x, Y + 1.2 + (LH - 1.2) / 2, z, ry, 1.5)
  }
  panel(S, ld, 1.2, M.woodDark, LG.x0 + 0.02, Y + 0.6, lcz, Math.PI / 2, 1.5)
  panel(S, ld, LH - 1.2, M.wood, LG.x0 + 0.02, Y + 1.2 + (LH - 1.2) / 2, lcz, Math.PI / 2, 1.5)
  for (const [z0, z1] of [[LG.zS, LG.doorZ + LG.doorW / 2], [LG.doorZ - LG.doorW / 2, LG.zN]]) {
    panel(S, z0 - z1, 1.2, M.woodDark, LG.x1 - 0.02, Y + 0.6, (z0 + z1) / 2, -Math.PI / 2, 1.5)
    panel(S, z0 - z1, LH - 1.2, M.wood, LG.x1 - 0.02, Y + 1.2 + (LH - 1.2) / 2, (z0 + z1) / 2, -Math.PI / 2, 1.5)
  }
  panel(S, LG.doorW, LH - 3.6, M.wood, LG.x1 - 0.02, Y + 3.6 + (LH - 3.6) / 2, LG.doorZ, -Math.PI / 2, 1.5)
  solidBox(lw / 2, 4, 0.2, lcx, Y + 4, LG.zN - 0.2)
  solidBox(lw / 2, 4, 0.2, lcx, Y + 4, LG.zS + 0.2)
  solidBox(0.2, 4, ld / 2, LG.x0 - 0.2, Y + 4, lcz)
  for (const [z0, z1] of [[LG.zS, LG.doorZ + LG.doorW / 2], [LG.doorZ - LG.doorW / 2, LG.zN]]) solidBox(0.2, 4, (z0 - z1) / 2, LG.x1 + 0.2, Y + 4, (z0 + z1) / 2)
  // Coffered ceiling.
  const cof = flat(S, LG.x0, LG.x1, LG.zN, LG.zS, Y + LH, M.coffer, 2.2)
  cof.rotation.x = Math.PI
  for (let x = LG.x0 + 2.2; x < LG.x1; x += 2.2) box(S, 0.22, 0.3, ld, M.woodDark, x, Y + LH - 0.15, lcz)
  for (let z = LG.zN + 2.2; z < LG.zS; z += 2.2) box(S, lw, 0.3, 0.22, M.woodDark, lcx, Y + LH - 0.15, z)
  solidBox(lw / 2, 0.3, ld / 2, lcx, Y + LH + 0.3, lcz)
  box(S, lw + 0.8, 0.5, ld + 0.8, M.navy, lcx, Y + LH + 0.4, lcz)
  // Chandelier: gold rings, candles, warm glows.
  const chX = lcx + 1
  const chZ = lcz
  box(S, 0.04, 0.9, 0.04, M.gold, chX, Y + LH - 0.45, chZ)
  for (const [r, y] of [[0.9, LH - 1.25], [0.55, LH - 1.0]]) {
    const ring = new Mesh(new TorusGeometry(r, 0.04, 8, 32), M.gold)
    ring.rotation.x = Math.PI / 2
    ring.position.set(chX, Y + y, chZ)
    S.add(ring)
    const k = r > 0.7 ? 10 : 6
    for (let i = 0; i < k; i++) {
      const a = (i / k) * Math.PI * 2
      cyl(S, 0.035, 0.035, 0.18, M.marble, chX + Math.cos(a) * r, Y + y + 0.11, chZ + Math.sin(a) * r, 6)
      const gl = glowSprite('#ffc76a', 0.55)
      gl.position.set(chX + Math.cos(a) * r, Y + y + 0.25, chZ + Math.sin(a) * r)
      scene.add(gl)
    }
  }
  const chLight = new PointLight('#ffcf8a', 18, 14, 2)
  chLight.position.set(chX, Y + LH - 1.6, chZ)
  scene.add(chLight)
  // Bar along the west wall: counter, gold rail, marble top, backlit bottle shelves, stools.
  const barX = LG.x0 + 2.2
  const barZ0 = LG.zN + 4
  const barZ1 = LG.zS - 4
  const bl = barZ0 - barZ1
  box(S, 0.9, 1.05, -bl, M.woodDark, barX, Y + 0.525, (barZ0 + barZ1) / 2)
  box(S, 1.1, 0.07, -bl + 0.2, M.marble, barX, Y + 1.09, (barZ0 + barZ1) / 2)
  box(S, 0.05, 0.05, -bl, M.gold, barX + 0.5, Y + 0.25, (barZ0 + barZ1) / 2)
  solidBox(0.5, 0.6, -bl / 2, barX, Y + 0.6, (barZ0 + barZ1) / 2)
  const bottles = new MeshStandardMaterial({ map: canvasTex(paintBottles()), emissive: '#ffffff', emissiveIntensity: 0.55, roughness: 0.4 })
  bottles.emissiveMap = bottles.map
  panel(S, -bl, 2.4, bottles, LG.x0 + 0.06, Y + 2.3, (barZ0 + barZ1) / 2, Math.PI / 2)
  for (let k = 0; k < 4; k++) box(S, 0.36, 0.05, -bl, M.woodDark, LG.x0 + 0.2, Y + 1.25 + k * 0.62, (barZ0 + barZ1) / 2)
  for (let z = barZ0 + 0.8; z < barZ1; z += 1.4) {
    cyl(S, 0.04, 0.04, 0.78, M.gold, barX + 1.0, Y + 0.39, z, 8)
    cyl(S, 0.24, 0.24, 0.02, M.gold, barX + 1.0, Y + 0.01, z, 14)
    cyl(S, 0.24, 0.22, 0.12, M.leather, barX + 1.0, Y + 0.84, z, 14)
  }
  const bartender = { x: LG.x0 + 1.05, z: (barZ0 + barZ1) / 2, yaw: Math.PI / 2 }
  // Bookshelves on the north wall.
  const books = new MeshStandardMaterial({ map: canvasTex(paintBooks()), roughness: 0.7 })
  for (const x of [LG.x0 + 6.4, LG.x0 + 10.8, LG.x0 + 15.2]) {
    box(S, 4.2, 4.2, 0.55, M.woodDark, x, Y + 2.1, LG.zN + 0.3)
    panel(S, 3.9, 3.9, books, x, Y + 2.1, LG.zN + 0.59, 0)
    solidBox(2.1, 2, 0.3, x, Y + 2, LG.zN + 0.3)
  }
  // Armchairs around coffee tables (sit points), a green velvet sofa, floor lamps, a tree.
  const loungeSeats = []
  const armchair = (x, z, yaw) => {
    const g = new Group()
    box(g, 0.95, 0.42, 0.9, M.leather, 0, 0.36, 0)
    box(g, 0.95, 0.8, 0.22, M.leather, 0, 0.7, -0.38)
    for (const s of [-1, 1]) box(g, 0.2, 0.62, 0.9, M.leather, s * 0.48, 0.46, 0)
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, 0.06, 0.15, 0.06, M.woodDark, sx * 0.4, 0.075, sz * 0.36)
    g.position.set(x, Y, z)
    g.rotation.y = yaw
    S.add(g)
    loungeSeats.push({ x: x + Math.sin(yaw) * 0.06, y: Y + 0.56, z: z + Math.cos(yaw) * 0.06, yaw, kind: 'lounge', npc: null })
    solidBox(0.4, 0.3, 0.4, x - Math.sin(yaw) * 0.25, Y + 0.3, z - Math.cos(yaw) * 0.25)
  }
  const table = (x, z) => {
    cyl(S, 0.55, 0.55, 0.06, M.woodDark, x, Y + 0.5, z, 20)
    cyl(S, 0.06, 0.08, 0.48, M.gold, x, Y + 0.25, z, 8)
    cyl(S, 0.3, 0.3, 0.03, M.gold, x, Y + 0.015, z, 14)
    cyl(S, 0.05, 0.04, 0.12, M.marble, x + 0.15, Y + 0.6, z - 0.1, 10) // a cup
    solidBox(0.5, 0.3, 0.5, x, Y + 0.3, z)
  }
  for (const [tx, tz] of [[lcx + 1.5, LG.zS - 6], [lcx + 1.5, lcz - 3], [lcx + 6, lcz + 2.4]]) {
    table(tx, tz)
    armchair(tx - 1.4, tz, Math.PI / 2)
    armchair(tx + 1.4, tz, -Math.PI / 2)
    armchair(tx, tz - 1.4, 0)
  }
  // sofa
  box(S, 3.2, 0.42, 0.9, M.velvet, lcx - 1, Y + 0.36, LG.zS - 0.8)
  box(S, 3.2, 0.7, 0.24, M.velvet, lcx - 1, Y + 0.75, LG.zS - 0.3)
  for (const s of [-1, 1]) box(S, 0.24, 0.6, 0.9, M.velvet, lcx - 1 + s * 1.6, Y + 0.45, LG.zS - 0.8)
  solidBox(1.7, 0.4, 0.5, lcx - 1, Y + 0.4, LG.zS - 0.7)
  for (let i = 0; i < 3; i++) loungeSeats.push({ x: lcx - 2 + i, y: Y + 0.56, z: LG.zS - 0.82, yaw: Math.PI, kind: 'lounge', npc: null })
  const lamp = (x, z) => {
    cyl(S, 0.22, 0.22, 0.04, M.gold, x, Y + 0.02, z, 14)
    cyl(S, 0.025, 0.025, 1.7, M.gold, x, Y + 0.87, z, 6)
    const sh = new Mesh(new CylinderGeometry(0.22, 0.34, 0.4, 16, 1, true), M.shade)
    sh.position.set(x, Y + 1.8, z)
    S.add(sh)
    const gl = glowSprite('#ffd38a', 1.1, 0.7)
    gl.position.set(x, Y + 1.72, z)
    scene.add(gl)
  }
  lamp(LG.x1 - 1, LG.zN + 1)
  lamp(lcx - 3.4, LG.zS - 0.6)
  lamp(lcx + 8.6, lcz - 4.6)
  // tree in a pot
  const tree = (x, z, s = 1) => {
    cyl(S, 0.5 * s, 0.4 * s, 0.8 * s, M.pot, x, Y + 0.4 * s, z, 16)
    cyl(S, 0.08 * s, 0.12 * s, 2.2 * s, M.trunk, x, Y + 1.6 * s, z, 8)
    for (const [dx, dy, dz, r] of [[0, 2.9, 0, 0.9], [0.5, 2.5, 0.3, 0.6], [-0.45, 2.6, -0.2, 0.65], [0.1, 3.4, 0.2, 0.55]]) {
      const b = new Mesh(new IcosahedronGeometry(r * s, 0), r > 0.7 ? M.bush : M.bush2)
      b.position.set(x + dx * s, Y + dy * s, z + dz * s)
      S.add(b)
    }
    solidBox(0.5 * s, 0.6, 0.5 * s, x, Y + 0.6, z)
  }
  tree(LG.x1 - 1.4, LG.zS - 1.6)
  tree(LG.x1 - 1.2, LG.zN + 4, 0.9)
  // Facade toward the gate hall: wood frame, sign, planters with bushes, red carpet + gold ropes.
  const fx = LG.x1 + 0.05
  for (const [z0, z1] of [[LG.zS + 0.3, LG.doorZ + LG.doorW / 2], [LG.doorZ - LG.doorW / 2, LG.zN - 0.3]]) box(S, 0.3, LH + 1, z0 - z1, M.woodDark, fx + 0.12, Y + (LH + 1) / 2, (z0 + z1) / 2)
  box(S, 0.3, LH + 1 - 3.6, LG.doorW, M.woodDark, fx + 0.12, Y + 3.6 + (LH + 1 - 3.6) / 2, LG.doorZ)
  for (const s of [-1, 1]) {
    box(S, 0.5, LH, 0.5, M.wood, fx + 0.35, Y + LH / 2, LG.doorZ + s * (LG.doorW / 2 + 0.25))
    // glass side lights beside the door
    panel(S, 2.2, 3.2, M.doorGlass, fx + 0.29, Y + 1.7, LG.doorZ + s * (LG.doorW / 2 + 1.7), Math.PI / 2)
  }
  box(S, 0.4, 0.4, LG.doorW + 1, M.wood, fx + 0.35, Y + 3.7, LG.doorZ)
  const signC = cv(1024, 256)
  {
    const ctx = signC.getContext('2d')
    ctx.fillStyle = '#0c0c0e'
    ctx.fillRect(0, 0, 1024, 256)
    ctx.strokeStyle = '#e0b04a'
    ctx.lineWidth = 10
    ctx.strokeRect(14, 14, 996, 228)
    ctx.fillStyle = '#f2c55a'
    ctx.font = `600 104px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('SKY LOUNGE', 512, 104)
    ctx.fillRect(330, 160, 364, 5)
    ctx.fillStyle = '#ffffff'
    ctx.font = `500 40px ${FONT}`
    ctx.fillText('MEMBERS  &  PASS HOLDERS', 512, 204)
  }
  const st = canvasTex(signC)
  const lsign = new Mesh(new BoxGeometry(0.2, 1.6, 6.4), [new MeshStandardMaterial({ map: st, emissiveMap: st, emissive: '#ffffff', emissiveIntensity: 0.6 }), M.black, M.black, M.black, M.black, M.black])
  lsign.position.set(fx + 0.6, Y + 4.9, LG.doorZ)
  scene.add(lsign)
  for (const s of [-1, 1]) {
    const pz = LG.doorZ + s * (LG.doorW / 2 + 1.9)
    box(S, 1.6, 0.7, 2.6, M.wood, fx + 1.3, Y + 0.35, pz)
    for (let k = 0; k < 4; k++) {
      const b = new Mesh(new IcosahedronGeometry(0.5 + (k % 2) * 0.12, 0), k % 2 ? M.bush : M.bush2)
      b.position.set(fx + 1.2 + (k % 2) * 0.2, Y + 0.95, pz - 0.9 + k * 0.6)
      S.add(b)
    }
    solidBox(0.8, 0.5, 1.3, fx + 1.3, Y + 0.5, pz)
  }
  flat(S, fx + 0.1, fx + 4.6, LG.doorZ - 1.0, LG.doorZ + 1.0, Y + 0.015, M.red, 0)
  flat(S, LG.x1 - 3, LG.x1, LG.doorZ - 1.0, LG.doorZ + 1.0, Y + 0.016, M.red, 0)
  for (const s of [-1, 1]) {
    for (const x of [fx + 2.6, fx + 4.4]) post(x, LG.doorZ + s * 1.25, M.gold)
    box(S, 1.8, 0.05, 0.05, M.red, fx + 3.5, Y + 0.86, LG.doorZ + s * 1.25)
    solidBox(0.95, 0.5, 0.06, fx + 3.5, Y + 0.5, LG.doorZ + s * 1.25)
  }
  const loungeDoor = addFixed(RAPIER.ColliderDesc.cuboid(0.15, 1.8, LG.doorW / 2), { x: LG.x1 + 0.1, y: Y + 1.8, z: LG.doorZ })
  const bouncerSpot = { x: LG.x1 + 1.0, z: LG.doorZ, yaw: Math.PI / 2, aside: { x: LG.x1 + 1.1, z: LG.doorZ - 1.0 } }

  // --- Apron, markings, a taxiway + runway; neighbours' jet bridges -------------------------------------
  flat(S, 40, 320, -240, HL.zN - 0.4, Y + 0.002, M.apron, 0)
  flat(S, -60, 420, -205, -175, Y + 0.004, M.asphalt, 0) // runway
  for (let x = -40; x < 410; x += 18) flat(S, x, x + 9, -190.4, -189.6, Y + 0.006, M.paintWhite, 0)
  for (const z of [-176.2, -203.8]) flat(S, -60, 420, z - 0.25, z + 0.25, Y + 0.006, M.paintWhite, 0)
  // lead-in line to your gate + a stop bar; the taxi line along the apron
  flat(S, 40, 320, G.plane.z - 0.12, G.plane.z + 0.12, Y + 0.006, M.yellow, 0)
  flat(S, 40, 320, -118.12, -117.88, Y + 0.006, M.yellow, 0)
  flat(S, bx - 6.5, bx - 6.2, G.plane.z - 3, G.plane.z + 3, Y + 0.007, M.red, 0)
  for (const [x0, x1, z0, z1] of [[130, 190, -71.5, -71.2], [196, 256, -71.5, -71.2], [64, 124, -71.5, -71.2]]) flat(S, x0, x1, z0, z1, Y + 0.006, M.red, 0)

  const baked = bake(S, false)
  baked.traverse((o) => {
    if (!o.isMesh) return
    o.receiveShadow = true
    o.castShadow = [M.seat, M.black, M.white, M.chrome, M.leather, M.woodDark, M.bush, M.bush2, M.jetbridge, M.velvet].includes(o.material)
  })
  scene.add(baked)

  // --- Jets: yours (arrives + parks), plus two neighbours at the other gates ---------------------------
  const jet = makeJet()
  jet.root.rotation.y = -Math.PI / 2
  jet.root.position.set(G.plane.x, Y + G.plane.y, G.plane.z)
  jet.root.visible = false
  scene.add(jet.root)
  const neighbours = []
  for (const nx of [226, 68]) {
    const j = makeJet()
    j.root.rotation.y = -Math.PI / 2
    j.root.position.set(nx, Y + G.plane.y, G.plane.z)
    scene.add(j.root)
    neighbours.push(j)
    // a short static jet bridge for each
    const nb = new Mesh(new BoxGeometry(2.8, 3, 14), M.jetbridge)
    nb.position.set(nx - 12.6, Y + 2.4, G.plane.z + 10)
    nb.castShadow = true
    scene.add(nb)
    const leg = new Mesh(new CylinderGeometry(0.2, 0.2, 3.4, 8), M.jetbridge)
    leg.position.set(nx - 12.6, 1.7, G.plane.z + 6)
    scene.add(leg)
  }

  // --- Queue marker + join pad --------------------------------------------------------------------------
  const marker = new Group()
  const arrow = makeArrow()
  arrow.position.y = 2.3
  const ms = pillSign('QUEUE HERE')
  ms.position.y = 4.3
  marker.add(arrow, ms)
  const jz = G.joinZone
  marker.position.set((jz.x0 + jz.x1) / 2, Y, (jz.z0 + jz.z1) / 2)
  marker.visible = false
  scene.add(marker)
  const pad = new Mesh(new PlaneGeometry(4.4, 3.2), new MeshBasicMaterial({ map: canvasTex(paintJoinPad()), transparent: true, depthWrite: false }))
  pad.rotation.x = -Math.PI / 2
  pad.position.set(marker.position.x, Y + 0.03, marker.position.z)
  pad.visible = false
  scene.add(pad)

  // Sign text follows your booking.
  function setFlight(index) {
    const d = DESTINATIONS[index] ?? DESTINATIONS[0]
    const n = d.gate
    const city = d.name.toLowerCase()
    const other = (k) => DESTINATIONS[(index + k + DESTINATIONS.length) % DESTINATIONS.length].name.toLowerCase()
    hallSign.set(`gate ${n} · ${city}`)
    hallSign2.set(`gate ${n} · ${city}`)
    doorSign.set(`boarding · gate ${n}`)
    for (const g of gateSigns) g.sign.set(`gate ${Math.max(1, n + g.d)} · ${other(g.d * 3)}`)
    dirSigns[0].set(n > 1 ? `gates 1 – ${n}` : 'gate 1')
    dirSigns[1].set(`gates ${n + 1} – 24`)
    endSign.set(`gates ${n + 2} – 24`)
    return d
  }

  let blink = 0
  return {
    seats,
    loungeSeats,
    scanners,
    agentSpot,
    bartender,
    bouncerSpot,
    jet,
    neighbours,
    marker,
    pad,
    info,
    doorTimer,
    entranceTimer,
    setFlight,
    // Lounge door: open for pass holders.
    setLoungeOpen(open) {
      loungeDoor.setEnabled(!open)
    },
    // Boarding door: 0 shut .. 1 open.
    setBoardDoor(k) {
      bdoor.k = k
    },
    get boardDoor() {
      return bdoor.k
    },
    flashScanner(i) {
      const s = scanners[i % scanners.length]
      s.flash = 0.6
    },
    update(dt, t) {
      // door panels ease to their target
      const e = bdoor.k * bdoor.k * (3 - 2 * bdoor.k)
      for (const p of bdoor.panels) p.position.x = bx + p.userData.s * (0.7 + e * 1.3)
      bdoor.collider.setEnabled(bdoor.k < 0.7)
      dled.material.color.set(bdoor.k > 0.5 ? '#3dff6a' : '#ff3b3b')
      for (const s of scanners) {
        if (s.flash > 0) {
          s.flash -= dt
          s.mat.color.set(Math.floor(s.flash * 10) % 2 ? '#ffffff' : '#3dff6a')
        } else s.mat.color.set('#3dff6a')
      }
      // the other gates' countdowns
      blink += dt
      for (const g of gateTimers) {
        g.left -= dt
        if (g.left < -25) g.left = 120 + Math.random() * 200
        if (g.left > 0) g.ft.set('boarding opens in', clock(g.left))
        else g.ft.set('', Math.floor(blink * 2) % 2 ? 'boarding' : '')
      }
      if (marker.visible) {
        arrow.position.y = 2.3 + Math.sin(t * 3) * 0.3
        arrow.rotation.y = Math.sin(t * 1.4) * 0.6
        pad.material.opacity = 0.65 + Math.sin(t * 4) * 0.3
      }
    },
  }
}

// Seats' world helpers for boarding.js.
export const seatDir = (s) => new Vector3(Math.sin(s.yaw), 0, Math.cos(s.yaw))
export { clock as fmtClock }
// keep tree-shaking honest
void Color
void InstancedMesh
void Matrix4
void Quaternion
