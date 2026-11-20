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
  CatmullRomCurve3,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NearestFilter,
  OctahedronGeometry,
  PlaneGeometry,
  PointLight,
  Shape,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  TorusGeometry,
  TubeGeometry,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { AIRPORT, DESTINATIONS, GATES } from '../config.js'
import { bake } from '../bake.js'
import { neon, solidBox } from '../propkit.js'
import { RAPIER, addFixed } from '../physics.js'
import { mulberry32, paintSoftDot } from '../textures.js'
import { lathe, pole, rbox, ring, roundRectShape, roundSlab } from '../detail.js'
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

// --- detail painters --------------------------------------------------------------------------------
// Palette: 16 colour swatches in one tiny texture, so hundreds of coloured items (products, bottles,
// stall goods) share one material; each geometry copy points all its UVs at one swatch (`sw`).
const PAL = ['#d6232e', '#2a8a4a', '#f2a31b', '#1d4fbf', '#7a2a8a', '#e85c1a', '#2b2f3a', '#3ab0a0', '#c8b02a', '#f4f1ea', '#8a2a22', '#5cc4ff', '#ff5fa8', '#9dff7a', '#6b3f1f', '#c9ced8']
function paletteTex() {
  const c = cv(16)
  const ctx = c.getContext('2d')
  PAL.forEach((col, i) => {
    ctx.fillStyle = col
    ctx.fillRect((i % 4) * 4, Math.floor(i / 4) * 4, 4, 4)
  })
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.magFilter = t.minFilter = NearestFilter
  t.generateMipmaps = false
  return t
}
// Book spines: 15 designs (32 px columns) + a column of page edges.
function paintSpines(seed = 11) {
  const c = cv(512, 128)
  const ctx = c.getContext('2d')
  const rand = mulberry32(seed)
  const cols = ['#b3202a', '#1f3f7a', '#2a6a3a', '#d9a32a', '#6a2a6a', '#e8e0cc', '#1b1d22', '#c8642a', '#3a8aa0', '#7a1f2a', '#2b4f6a', '#8a6a2a', '#4a6a2a', '#a83a5a', '#3a3a6a']
  for (let i = 0; i < 15; i++) {
    const x = i * 32
    ctx.fillStyle = cols[i]
    ctx.fillRect(x, 0, 32, 128)
    const g = ctx.createLinearGradient(x, 0, x + 32, 0)
    g.addColorStop(0, 'rgba(0,0,0,0.35)')
    g.addColorStop(0.3, 'rgba(255,255,255,0.12)')
    g.addColorStop(0.7, 'rgba(0,0,0,0)')
    g.addColorStop(1, 'rgba(0,0,0,0.4)')
    ctx.fillStyle = g
    ctx.fillRect(x, 0, 32, 128)
    const gold = i === 3 || i === 5 ? '#6a3a14' : '#e6b84e'
    ctx.fillStyle = gold
    const style = i % 3
    if (style !== 2) {
      ctx.fillRect(x + 2, 9, 28, 3)
      ctx.fillRect(x + 2, 116, 28, 3)
    }
    if (style === 0) ctx.fillRect(x + 2, 15, 28, 2)
    if (style === 1 || style === 2) {
      ctx.fillStyle = i === 5 ? '#c9b48a' : 'rgba(255,240,200,0.85)'
      ctx.fillRect(x + 6, 40, 20, 34)
      ctx.fillStyle = 'rgba(30,20,10,0.7)'
      for (let k = 0; k < 4; k++) ctx.fillRect(x + 9, 45 + k * 7, 8 + rand() * 6, 2)
    } else {
      ctx.fillStyle = gold
      for (let k = 0; k < 5; k++) ctx.fillRect(x + 14, 34 + k * 9, 4, 5)
    }
  }
  ctx.fillStyle = '#efe6cf'
  ctx.fillRect(480, 0, 32, 128)
  ctx.fillStyle = 'rgba(120,100,70,0.35)'
  for (let y = 2; y < 128; y += 4) ctx.fillRect(480, y, 32, 1)
  return c
}
// Corrugated metal (jet bridge + rotunda): vertical ribs, panel seams, rivets; plus its normal map.
function paintRibs() {
  const c = cv(256)
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#c9ced6'
  ctx.fillRect(0, 0, 256, 256)
  for (let x = 0; x < 256; x += 16) {
    ctx.fillStyle = 'rgba(255,255,255,0.22)'
    ctx.fillRect(x + 2, 0, 4, 256)
    ctx.fillStyle = 'rgba(20,30,50,0.13)'
    ctx.fillRect(x + 10, 0, 5, 256)
  }
  ctx.fillStyle = 'rgba(20,30,50,0.35)'
  ctx.fillRect(0, 0, 256, 3)
  ctx.fillRect(0, 127, 256, 3)
  ctx.fillRect(0, 0, 3, 256)
  ctx.fillStyle = 'rgba(40,50,70,0.45)'
  for (let x = 8; x < 256; x += 16) for (const y of [8, 120, 136, 248]) ctx.fillRect(x - 1, y - 1, 3, 3)
  return c
}
function paintRibsNormal() {
  const c = cv(256)
  const ctx = c.getContext('2d')
  const img = ctx.createImageData(256, 256)
  for (let y = 0; y < 256; y++) {
    const seam = y % 128 < 3 ? -60 : 0
    for (let x = 0; x < 256; x++) {
      const i = (y * 256 + x) * 4
      img.data[i] = 128 + Math.round(Math.sin((x / 16) * Math.PI * 2) * 95)
      img.data[i + 1] = 128 + seam
      img.data[i + 2] = 230
      img.data[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  return c
}
// Seat fabric: a fine weave.
function paintFabric(base = '#353944', seed = 5) {
  const c = cv(128)
  const ctx = c.getContext('2d')
  const rand = mulberry32(seed)
  ctx.fillStyle = base
  ctx.fillRect(0, 0, 128, 128)
  for (let y = 0; y < 128; y += 4) {
    ctx.fillStyle = 'rgba(255,255,255,0.05)'
    ctx.fillRect(0, y, 128, 2)
  }
  for (let x = 0; x < 128; x += 4) {
    ctx.fillStyle = 'rgba(0,0,0,0.12)'
    ctx.fillRect(x, 0, 1, 128)
  }
  for (let k = 0; k < 400; k++) {
    ctx.fillStyle = rand() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.08)'
    ctx.fillRect(rand() * 128, rand() * 128, 1, 1)
  }
  return c
}
// The bar's back wall: a warm, backlit mirror panel (the 3D bottles stand in front of it).
function paintBacklight() {
  const c = cv(512, 256)
  const ctx = c.getContext('2d')
  const g = ctx.createLinearGradient(0, 0, 0, 256)
  g.addColorStop(0, '#ffe2a6')
  g.addColorStop(0.5, '#fff1cf')
  g.addColorStop(1, '#f2c070')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 512, 256)
  for (let x = 0; x < 512; x += 64) {
    const s = ctx.createRadialGradient(x + 32, 128, 4, x + 32, 128, 90)
    s.addColorStop(0, 'rgba(255,255,255,0.45)')
    s.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = s
    ctx.fillRect(x, 0, 64, 256)
    ctx.fillStyle = 'rgba(120,70,20,0.35)'
    ctx.fillRect(x, 0, 3, 256)
  }
  return c
}

// --- detail geometry ----------------------------------------------------------------------------------
// An extruded side profile (points in (z, y)), `w` wide across X and centred on x = 0.
function profileX(pts, w, { bevel = 0, curve = 3 } = {}) {
  const sh = new Shape()
  sh.moveTo(pts[0][0], pts[0][1])
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i]
    if (p.length === 4) sh.quadraticCurveTo(p[0], p[1], p[2], p[3])
    else sh.lineTo(p[0], p[1])
  }
  sh.closePath()
  const g = new ExtrudeGeometry(sh, { depth: w - bevel * 2, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: curve })
  g.rotateY(-Math.PI / 2) // shape x -> +z, extrusion -> -x
  g.translate(w / 2 - bevel, 0, 0)
  return g
}
// Organic lumpy leaf blob (low-poly, flat shaded); jitter keyed on position so shared corners stay welded.
function blobGeo(r, seed = 1, squash = 0.85) {
  const g = new IcosahedronGeometry(r, 1)
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    const x = Math.round(p.getX(i) * 1000) / 1000
    const y = Math.round(p.getY(i) * 1000) / 1000
    const z = Math.round(p.getZ(i) * 1000) / 1000
    const h = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + seed * 4.1) * 43758.5453
    const k = 0.82 + (h - Math.floor(h)) * 0.36
    p.setXYZ(i, x * k, y * k * squash, z * k)
  }
  g.computeVertexNormals()
  return g
}
// A box whose UVs repeat every `tile` metres on every face.
function tiledBoxGeo(w, h, d, tile) {
  const g = new BoxGeometry(w, h, d)
  const uv = g.attributes.uv
  const n = g.attributes.normal
  for (let i = 0; i < uv.count; i++) {
    const ax = Math.abs(n.getX(i)) > 0.5 ? d : w
    const ay = Math.abs(n.getY(i)) > 0.5 ? d : h
    uv.setXY(i, (uv.getX(i) * ax) / tile, (uv.getY(i) * ay) / tile)
  }
  return g
}

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
    seatFab: new MeshStandardMaterial({ map: tex(paintFabric(), { repeatX: 4, repeatY: 4 }), roughness: 0.92 }),
    ribs: new MeshStandardMaterial({ map: tex(paintRibs()), normalMap: tex(paintRibsNormal(), { srgb: false }), roughness: 0.42, metalness: 0.45 }),
    spines: new MeshStandardMaterial({ map: tex(paintSpines()), roughness: 0.75 }),
    deskTop: new MeshStandardMaterial({ color: '#2c3446', roughness: 0.3 }),
  }
  const palT = paletteTex()
  // one palette material for every small coloured item (goods, bottles, glasses, crystals)
  M.palette = M.paletteGloss = new MeshStandardMaterial({ map: palT, roughness: 0.25, metalness: 0.1, emissive: '#3a2a10', emissiveIntensity: 0.3 })
  M.tyre = M.black
  for (const [k, m] of Object.entries(M)) m.name ||= k

  // --- shared prop kit -----------------------------------------------------------------------------
  // put: place a (shared) geometry; rotation order YXZ = tilt locally, then yaw.
  const put = (parent, geo, mat, x, y, z, ry = 0, rx = 0, rz = 0) => {
    const m = new Mesh(geo, mat)
    m.position.set(x, y, z)
    m.rotation.set(rx, ry, rz, 'YXZ')
    parent.add(m)
    return m
  }
  // sw: a copy of `geo` coloured with palette swatch i (cached, so repeats share it until baked).
  const swCache = new Map()
  const sw = (geo, i) => {
    i = ((i % 16) + 16) % 16
    const key = `${geo.uuid}:${i}`
    let g = swCache.get(key)
    if (!g) {
      g = geo.clone()
      const uv = g.attributes.uv
      const u = ((i % 4) + 0.5) / 4
      const v = 1 - (Math.floor(i / 4) + 0.5) / 4
      for (let k = 0; k < uv.count; k++) uv.setXY(k, u, v)
      swCache.set(key, g)
    }
    return g
  }
  const UNIT = new BoxGeometry(1, 1, 1)
  const UNIT_CYL = new CylinderGeometry(0.5, 0.5, 1, 8, 1)
  const tyreGeo = (r, w) => {
    const h = w / 2
    return lathe([[r * 0.56, -h], [r * 0.82, -h], [r * 0.95, -h + w * 0.14], [r, -h * 0.4], [r, h * 0.4], [r * 0.95, h - w * 0.14], [r * 0.82, h], [r * 0.56, h]], 14).rotateZ(Math.PI / 2)
  }
  // Bottles (lathe; the 4-sided one is a square spirits bottle).
  const BOTTLES = [
    lathe([[0.04, 0], [0.04, 0.2], [0.013, 0.27], [0.013, 0.345], [0, 0.345]], 6),
    lathe([[0.052, 0], [0.052, 0.2], [0.018, 0.24], [0.016, 0.285], [0, 0.285]], 4).rotateY(Math.PI / 4),
    lathe([[0.05, 0], [0.058, 0.06], [0.05, 0.15], [0.016, 0.2], [0.016, 0.25], [0, 0.25]], 6),
    lathe([[0.033, 0], [0.034, 0.26], [0.012, 0.33], [0.012, 0.385], [0, 0.385]], 5),
  ]
  // Stanchion post: weighted base + belt head (black or gold), chrome pole. ~144 tris.
  const POST_BASE = lathe([[0.19, 0], [0.2, 0.02], [0.16, 0.05], [0.05, 0.07], [0.035, 0.085]], 8)
  const POST_POLE = new CylinderGeometry(0.028, 0.028, 0.8, 8, 1, true).translate(0, 0.48, 0)
  const POST_HEAD = lathe([[0.03, 0.86], [0.052, 0.88], [0.055, 0.96], [0.035, 1.0], [0, 1.0]], 8)
  // Gate seat (local: faces +Z, its back on z = 0, floor y = 0): a moulded black shell, fabric seat +
  // back cushions, a bracket to the beam. ~300 tris. Arms (pad + chrome post) sit between seats.
  const SEAT = {
    shell: profileX([[0.62, 0.42], [0.58, 0.45], [0.22, 0.45], [0.14, 0.47], [0.1, 0.54], [0.075, 0.8], [0.05, 1.05], [0.035, 1.085], [0.01, 1.06], [0.035, 0.8], [0.06, 0.53], [0.11, 0.43], [0.22, 0.41], [0.58, 0.41], [0.63, 0.4]], 0.56, { bevel: 0.012, curve: 1 }),
    // one L-shaped fabric cushion: seat pad with a rounded front edge flowing into the back cushion
    cushion: profileX([[0.2, 0.45], [0.56, 0.45], [0.6, 0.45, 0.6, 0.475], [0.6, 0.505, 0.56, 0.505], [0.2, 0.505], [0.13, 0.505, 0.125, 0.56], [0.1, 0.99], [0.095, 1.03, 0.07, 1.03], [0.058, 1.0], [0.088, 0.56], [0.12, 0.47]], 0.5, { curve: 2 }),
    bracket: new BoxGeometry(0.05, 0.07, 0.5).translate(0, 0.375, 0.25),
    armPad: profileX([[0.18, 0.64], [0.56, 0.64], [0.6, 0.64, 0.6, 0.665], [0.6, 0.69, 0.56, 0.69], [0.18, 0.69], [0.155, 0.69, 0.155, 0.665], [0.155, 0.64, 0.18, 0.64]], 0.065, { curve: 2 }),
    armPost: new BoxGeometry(0.04, 0.32, 0.05).translate(0, 0.49, 0.5),
    leg: pole(0.04, 0.02, 0.33, 8),
    foot2: rbox(0.1, 0.04, 1.05, 0.018, 1).translate(0, 0.02, 0),
    foot1: rbox(0.1, 0.04, 0.6, 0.018, 1).translate(0, 0.02, 0),
  }
  const seatParts = [[SEAT.shell, M.seat], [SEAT.cushion, M.seatFab], [SEAT.bracket, M.black]]
  const armParts = [[SEAT.armPad, M.black], [SEAT.armPost, M.chrome]]
  const unit = (parts, x, z, ry) => {
    for (const [g, m] of parts) put(S, g, m, x, Y, z, ry)
  }
  // A seat beam with legs; `foot` reaches out under the seats (centred on footZ).
  const beam = (x0, len, zb, foot, footZ) => {
    put(S, rbox(len + 0.7, 0.07, 0.12, 0.03, 1), M.chrome, x0 + len / 2, Y + 0.32, zb)
    for (const dx of [0.2, len / 2, len - 0.2]) {
      put(S, SEAT.leg, M.chrome, x0 + dx, Y, zb)
      put(S, foot, M.chrome, x0 + dx, Y, footZ)
    }
  }
  // Potted plant: a planter, soil, a fan of long leaves.
  const POT = lathe([[0, 0], [0.3, 0], [0.34, 0.04], [0.42, 0.6], [0.46, 0.64], [0.46, 0.7], [0.41, 0.7], [0, 0.68]], 16)
  const SOIL = new CylinderGeometry(0.41, 0.41, 0.02, 14)
  const LEAF = lathe([[0, 0], [0.07, 0.16], [0.065, 0.42], [0, 0.72]], 4).scale(1, 1, 0.3)
  const leafy = (x, z, s = 1, potMat = M.white) => {
    put(S, POT, potMat, x, Y, z).scale.setScalar(s)
    put(S, SOIL, M.trunk, x, Y + 0.68 * s, z).scale.setScalar(s)
    for (let k = 0; k < 18; k++) {
      const f = k / 18
      const m = put(S, LEAF, k % 2 ? M.bush : M.bush2, x, Y + 0.66 * s, z, k * 2.399, 0.12 + f * 1.0)
      m.scale.set(s * 1.15, s * (1.5 - f * 0.55), s * 1.15)
    }
  }
  const BLOBS = [blobGeo(1, 1), blobGeo(1, 2), blobGeo(1, 3)]
  const blob = (x, y, z, r, k = 0) => put(S, BLOBS[k % 3], k % 2 ? M.bush : M.bush2, x, y, z, k * 1.3).scale.setScalar(r)

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
  const STRIP = rbox(4.2, 0.12, 0.34, 0.05, 1)
  const STRIP_LIGHT = new BoxGeometry(4.0, 0.03, 0.24)
  const WIRE = new BoxGeometry(0.02, 0.7, 0.02)
  for (let x = 96; x < C.x1 - 2; x += 6) {
    for (const z of [-26, -30]) {
      put(S, STRIP, M.white, x + 1.5, Y + CH - 0.75, z)
      put(S, STRIP_LIGHT, M.light, x + 1.5, Y + CH - 0.815, z)
      for (const dx of [-1.5, 1.5]) put(S, WIRE, M.black, x + 1.5 + dx, Y + CH - 0.35, z)
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
    const fit = sh.kind === 'cafe' ? M.woodDark : M.white
    const rand = mulberry32(70 + i * 13)
    // sales counter: rounded body, black top, a till
    put(S, rbox(w * 0.45, 1.0, 0.7, 0.05, 1), fit, cx + w * 0.18, Y + 0.5, -19.4)
    put(S, rbox(w * 0.45 + 0.1, 0.06, 0.8, 0.025, 1), M.black, cx + w * 0.18, Y + 1.03, -19.4)
    put(S, rbox(0.4, 0.12, 0.3, 0.03, 1), M.black, cx + w * 0.05, Y + 1.12, -19.5)
    put(S, rbox(0.34, 0.24, 0.03, 0.01, 1), M.screen, cx + w * 0.05, Y + 1.3, -19.6, 0, -0.3)
    // a display island on a plinth with a stepped riser of goods
    const ix = cx - w * 0.22
    put(S, rbox(2.2, 0.8, 1.2, 0.06, 1), fit, ix, Y + 0.4, -20.6)
    put(S, rbox(1.6, 0.25, 0.6, 0.04, 1), fit, ix, Y + 0.92, -20.6)
    // goods: boxes / jars / bottles in palette colours
    const good = (x, y, z, k) => {
      const c = Math.floor(rand() * 16)
      if (sh.kind === 'duty' && k % 3 === 0) return put(S, sw(BOTTLES[k % 4], c), M.paletteGloss, x, y, z)
      if (sh.kind === 'sweets' || (sh.kind === 'cafe' && k % 2)) {
        const r = 0.05 + rand() * 0.04
        const m = put(S, sw(UNIT_CYL, c), M.paletteGloss, x, y + r * 1.2, z)
        m.scale.set(r * 2, r * 2.4, r * 2)
        return m
      }
      const bw = 0.08 + rand() * 0.1
      const bh = sh.kind === 'books' ? 0.18 + rand() * 0.1 : 0.08 + rand() * 0.2
      const m = put(S, sw(UNIT, c), M.palette, x, y + bh / 2, z, rand() * 0.2 - 0.1)
      m.scale.set(bw, bh, 0.1 + rand() * 0.1)
      return m
    }
    let k = 0
    for (let gx = ix - 1.0; gx < ix + 1.0; gx += 0.2) good(gx, Y + 0.8, -20.1 - rand() * 0.1, k++)
    for (let gx = ix - 0.7; gx < ix + 0.7; gx += 0.2) good(gx, Y + 1.045, -20.6, k++)
    for (let gx = ix - 1.0; gx < ix + 1.0; gx += 0.22) good(gx, Y + 0.8, -21.1, k++)
    // wall gondolas along both side walls: back panel, plinth, four shelves of goods
    for (const s of [-1, 1]) {
      const gxw = s < 0 ? sh.x0 + 0.1 : sh.x1 - 0.1
      const gz = -19.8
      put(S, rbox(0.06, 1.9, 3.6, 0.02, 1), fit, gxw, Y + 0.95, gz)
      put(S, rbox(0.5, 0.12, 3.6, 0.03, 1), M.black, gxw - s * 0.22, Y + 0.06, gz)
      put(S, rbox(0.5, 0.14, 3.62, 0.04, 1), M.black, gxw - s * 0.22, Y + 1.97, gz)
      for (let sy = 0; sy < 4; sy++) {
        const y0 = Y + 0.12 + sy * 0.45
        if (sy) put(S, rbox(0.46, 0.03, 3.56, 0.01, 1), fit, gxw - s * 0.24, y0, gz)
        for (let gzz = gz - 1.65; gzz < gz + 1.65; gzz += 0.17 + rand() * 0.08) good(gxw - s * 0.24, y0 + 0.015, gzz, k++)
      }
    }
    if (sh.kind === 'cafe') {
      // espresso machine: chrome body, cup-warmer tray, two group heads, cups
      const ex = cx + w * 0.3
      put(S, rbox(0.7, 0.5, 0.5, 0.06, 2), M.chrome, ex, Y + 1.31, -19.4)
      put(S, rbox(0.72, 0.05, 0.52, 0.02, 1), M.black, ex, Y + 1.58, -19.4)
      for (const dx of [-0.17, 0.17]) {
        put(S, pole(0.05, 0, 0.1, 10), M.black, ex + dx, Y + 1.1, -19.18)
        put(S, lathe([[0, 0], [0.035, 0], [0.045, 0.07], [0.04, 0.07], [0, 0.01]], 10), M.white, ex + dx, Y + 1.06, -19.18)
      }
      for (const dx of [-0.2, 0, 0.2]) put(S, lathe([[0, 0], [0.04, 0], [0.05, 0.08], [0, 0.075]], 10), M.white, ex + dx, Y + 1.605, -19.45)
      // bistro tables + chairs
      const TOP = lathe([[0, 0], [0.45, 0], [0.47, 0.02], [0.47, 0.05], [0, 0.05]], 20)
      const BASE = lathe([[0, 0], [0.24, 0], [0.24, 0.02], [0.06, 0.05], [0, 0.05]], 14)
      for (const dx of [-3, -1]) {
        put(S, TOP, M.black, cx + dx, Y + 0.735, -21.6)
        put(S, pole(0.035, 0.04, 0.74, 8), M.chrome, cx + dx, Y, -21.6)
        put(S, BASE, M.black, cx + dx, Y, -21.6)
        put(S, lathe([[0, 0], [0.04, 0], [0.05, 0.08], [0, 0.075]], 10), M.white, cx + dx + 0.12, Y + 0.785, -21.5)
        for (const s of [-1, 1]) {
          const chx = cx + dx + s * 0.62
          put(S, rbox(0.42, 0.06, 0.42, 0.03, 1), M.woodDark, chx, Y + 0.46, -21.6)
          put(S, rbox(0.06, 0.42, 0.42, 0.03, 1), M.woodDark, chx + s * 0.2, Y + 0.72, -21.6, 0, 0, -s * 0.08)
          for (const lx of [-0.17, 0.17]) for (const lz of [-0.17, 0.17]) put(S, pole(0.018, 0, 0.44, 6), M.black, chx + lx, Y, -21.6 + lz)
        }
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
  // (benches = four gate seats on a beam, the same kit as the gate hall)
  for (const x of [97, 117, 136, 160, 172]) {
    const zb = C.zN + 0.42
    const P4 = G.seatPitch
    for (let i = 0; i < 4; i++) unit(seatParts, x + (i - 1.5) * P4, zb, 0)
    for (let i = 0; i <= 4; i++) unit(armParts, x + (i - 2) * P4, zb, 0)
    beam(x - 1.5 * P4, 3 * P4, zb, SEAT.foot1, zb + 0.22)
    solidBox(1.6, 0.4, 0.4, x, Y + 0.4, C.zN + 0.7)
  }
  // bins: brushed steel drum, black domed lid with a slot, a navy band
  const BIN = lathe([[0, 0], [0.26, 0], [0.28, 0.03], [0.3, 0.86], [0.31, 0.88], [0, 0.88]], 16)
  const BIN_LID = lathe([[0.325, 0.86], [0.325, 0.93], [0.24, 0.99], [0.12, 1.02], [0, 1.03]], 16)
  const BIN_BAND = new CylinderGeometry(0.303, 0.297, 0.1, 16, 1, true)
  for (const x of [107.8, 150]) {
    put(S, BIN, M.chrome, x, Y, C.zS + 0.6)
    put(S, BIN_LID, M.black, x, Y, C.zS + 0.6)
    put(S, BIN_BAND, M.navy, x, Y + 0.62, C.zS + 0.6)
    put(S, rbox(0.3, 0.06, 0.08, 0.02, 1), M.navy, x, Y + 0.98, C.zS + 0.6 - 0.15, 0, 0.5)
  }

  // --- Gate doors along the corridor (closed ones) + your gate's entrance --------------------------
  const gateSigns = []
  const gateTimers = []
  for (const fg of G.fakeGates) {
    const x = fg.x
    const z = C.zN + 0.05
    box(S, 4.4, 3.6, 0.2, M.black, x, Y + 1.8, z) // frame
    for (const s of [-1, 1]) {
      put(S, rbox(0.22, 3.6, 0.34, 0.06, 1), M.black, x + s * 2.15, Y + 1.8, z + 0.08) // jambs
      put(S, rbox(1.9, 3.2, 0.06, 0.03, 1), M.frosted, x + s * 1.0, Y + 1.7, z + 0.12)
      put(S, pole(0.025, -0.7, 0.7, 8), M.chrome, x + s * 1.0, Y + 1.15, z + 0.22, 0, 0, Math.PI / 2) // push bar
      for (const dx of [-0.65, 0.65]) put(S, rbox(0.05, 0.05, 0.1, 0.015, 1), M.chrome, x + s * 1.0 + dx, Y + 1.15, z + 0.17)
    }
    box(S, 0.06, 3.2, 0.1, M.black, x, Y + 1.7, z + 0.15)
    put(S, rbox(4.6, 0.5, 0.16, 0.05, 1), M.navy, x, Y + 3.85, z + 0.12)
    // card reader by the door with a green light
    put(S, rbox(0.16, 0.24, 0.06, 0.02, 1), M.black, x - 2.55, Y + 1.25, z - 0.02)
    put(S, new BoxGeometry(0.08, 0.02, 0.02), M.greenLed, x - 2.55, Y + 1.33, z + 0.015)
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
  // round white columns with a plinth and a collar
  const COL = pole(0.4, 0, HH, 20)
  const COL_FOOT = rbox(1.0, 0.3, 1.0, 0.08, 1)
  const COL_RING = new CylinderGeometry(0.47, 0.47, 0.16, 20)
  for (let x = HL.x0 + 4; x < HL.x1; x += 9.2) {
    put(S, COL, M.white, x, Y, gzN + 0.6)
    put(S, COL_FOOT, M.navy, x, Y + 0.15, gzN + 0.6)
    for (const y of [3.4, HH - 0.6]) put(S, COL_RING, M.chrome, x, Y + y, gzN + 0.6)
  }
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
  const HSTRIP = rbox(4, 0.12, 0.34, 0.05, 1)
  const HSTRIP_LIGHT = new BoxGeometry(3.8, 0.03, 0.22)
  const HWIRE = new BoxGeometry(0.02, 3.1, 0.02)
  for (let x = HL.x0 + 6; x < HL.x1 - 2; x += 8) for (let z = HL.zS - 5; z > HL.zN + 2; z -= 7) {
    put(S, HSTRIP, M.white, x, Y + HH - 3.2, z)
    put(S, HSTRIP_LIGHT, M.light, x, Y + HH - 3.265, z)
    for (const dx of [-1.6, 1.6]) put(S, HWIRE, M.black, x + dx, Y + HH - 1.6, z)
  }

  // --- Seats --------------------------------------------------------------------------------------------
  // One seat: pan, back, chrome legs on a shared beam; armrests between seats. Returns the sit point.
  const seats = []
  const seatAt = (x, zBack, dir) => {
    // dir = +1: faces +Z (pan south of the back), -1: faces -Z
    unit(seatParts, x, zBack, dir > 0 ? 0 : Math.PI)
    seats.push({ x, y: Y + 0.48, z: zBack + dir * 0.33, yaw: dir > 0 ? 0 : Math.PI, kind: 'gate', npc: null })
  }
  const arm = (x, zBack, dir) => unit(armParts, x, zBack, dir > 0 ? 0 : Math.PI)
  const n = G.seatsPerBlock
  const P = G.seatPitch
  for (const x0 of G.seatBlocks) {
    const len = (n - 1) * P
    for (const zb of G.seatRows) {
      for (let i = 0; i < n; i++) for (const dir of [-1, 1]) seatAt(x0 + i * P, zb, dir)
      for (let i = 0; i <= n; i++) for (const dir of [-1, 1]) arm(x0 - P / 2 + i * P, zb, dir)
      beam(x0, len, zb, SEAT.foot2, zb)
      solidBox(len / 2 + 0.35, 0.55, 0.14, x0 + len / 2, Y + 0.55, zb)
    }
    // window row, facing the glass
    const zb = G.windowRowZ + 0.33
    for (let i = 0; i < n; i++) seatAt(x0 + i * P, zb, -1)
    for (let i = 0; i <= n; i++) arm(x0 - P / 2 + i * P, zb, -1)
    beam(x0, len, zb, SEAT.foot1, zb - 0.2)
    solidBox(len / 2 + 0.35, 0.55, 0.12, x0 + len / 2, Y + 0.55, zb)
  }
  // Plants by the glass.
  const plant = (x, z, s = 1) => {
    leafy(x, z, s)
    solidBox(0.42 * s, 0.6, 0.42 * s, x, Y + 0.6, z)
  }
  plant(114, -62.6)
  plant(136.2, -62.6)
  plant(113.9, -35.2)
  plant(136.9, -62.6, 0.8)

  // --- Boarding line: stanchions + belts along the serpentine, the priority lane, desk, scanners -------
  const post = (x, z, mat = M.black) => {
    put(S, POST_BASE, mat, x, Y, z)
    put(S, POST_POLE, mat === M.black ? M.chrome : mat, x, Y, z)
    put(S, POST_HEAD, mat, x, Y, z)
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
  const PED_FOOT = rbox(0.56, 0.06, 0.5, 0.025, 1)
  const PED_BODY = rbox(0.42, 0.98, 0.34, 0.06, 2)
  const PED_HEAD = rbox(0.62, 0.13, 0.5, 0.05, 2)
  const PED_SCREEN = rbox(0.3, 0.02, 0.24, 0.008, 1)
  const PED_GLASS = rbox(0.2, 0.02, 0.26, 0.008, 1)
  const pedestal = (x, z) => {
    const tilt = 0.3 // the head faces the passenger walking up (+Z side)
    put(S, PED_FOOT, M.black, x, Y + 0.03, z)
    put(S, PED_BODY, M.black, x, Y + 0.54, z)
    put(S, PED_HEAD, M.black, x, Y + 1.08, z, 0, tilt)
    const ny = Math.cos(tilt) * 0.072
    const nz = Math.sin(tilt) * 0.072
    put(S, PED_SCREEN, M.screen, x - 0.1, Y + 1.08 + ny, z + nz, 0, tilt)
    put(S, PED_GLASS, M.frosted, x + 0.17, Y + 1.08 + ny, z + nz, 0, tilt)
    put(S, rbox(0.3, 0.025, 0.04, 0.01, 1), M.black, x, Y + 0.9, z + 0.17) // pass slot
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
  put(S, rbox(1.3, 0.1, 0.8, 0.03, 1), M.navy, deskX, Y + 0.05, sz) // recessed plinth
  put(S, rbox(1.4, 0.96, 0.9, 0.06, 2), M.white, deskX, Y + 0.57, sz)
  put(S, roundSlab(1.56, 1.04, 0.07, 0.1, 0.015, 3), M.deskTop, deskX, Y + 1.085, sz)
  put(S, rbox(0.16, 0.025, 0.4, 0.01, 1), M.black, deskX + 0.42, Y + 1.13, sz) // keyboard
  put(S, rbox(0.24, 0.12, 0.26, 0.03, 1), M.white, deskX - 0.1, Y + 1.18, sz + 0.28) // pass printer
  put(S, new BoxGeometry(0.16, 0.012, 0.02), M.black, deskX - 0.1, Y + 1.2, sz + 0.41)
  const deskBand = new Mesh(new BoxGeometry(1.42, 0.16, 0.02), new MeshBasicMaterial({ color: '#2ab0ff' }))
  deskBand.position.set(deskX, Y + 0.82, sz + 0.46)
  scene.add(deskBand)
  // monitor on a stand, facing the agent (+X side)
  put(S, rbox(0.22, 0.02, 0.18, 0.008, 1), M.black, deskX + 0.12, Y + 1.13, sz - 0.25)
  put(S, rbox(0.05, 0.36, 0.04, 0.015, 1), M.black, deskX + 0.08, Y + 1.3, sz - 0.25)
  put(S, rbox(0.04, 0.38, 0.6, 0.02, 1), M.black, deskX + 0.1, Y + 1.55, sz - 0.25, 0, 0, 0.08)
  put(S, new BoxGeometry(0.005, 0.32, 0.54), M.screen, deskX + 0.124, Y + 1.552, sz - 0.25, 0, 0, 0.08)
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
  put(S, rbox(2.84, 1.84, 0.14, 0.07, 1), M.black, bx - 5.6, Y + 2.3, gzN + 1.58) // bezel
  for (const dx of [-0.9, 0.9]) {
    put(S, pole(0.045, 0.04, 1.5, 10), M.chrome, bx - 5.6 + dx, Y, gzN + 1.55)
    put(S, rbox(0.5, 0.05, 0.5, 0.02, 1), M.black, bx - 5.6 + dx, Y + 0.025, gzN + 1.6)
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
  put(S, rbox(0.24, 3.4, 0.34, 0.05, 1), M.black, bx - 1.5, Y + 1.7, gzN)
  put(S, rbox(0.24, 3.4, 0.34, 0.05, 1), M.black, bx + 1.5, Y + 1.7, gzN)
  put(S, rbox(3.3, 0.34, 0.44, 0.06, 1), M.black, bx, Y + 3.35, gzN)
  put(S, rbox(3.1, 0.04, 0.5, 0.015, 1), M.chrome, bx, Y + 0.02, gzN) // threshold
  // each sliding panel: a black frame with a long pull handle (one mesh, moves with the panel)
  const pf = roundRectShape(1.4, 3.1, 0.08)
  pf.holes.push(roundRectShape(1.26, 2.96, 0.05))
  const frameGeo = new ExtrudeGeometry(pf, { depth: 0.08, bevelEnabled: false, curveSegments: 2 }).translate(0, 0, -0.04)
  const handleGeo = pole(0.022, -0.45, 0.45, 8)
  const dled = new Mesh(new BoxGeometry(0.4, 0.12, 0.06), new MeshBasicMaterial({ color: '#ff3b3b' }))
  dled.position.set(bx, Y + 3.35, gzN + 0.24)
  scene.add(dled)
  for (const s of [-1, 1]) {
    const p = new Mesh(new BoxGeometry(1.4, 3.1, 0.06), M.doorGlass)
    p.position.set(bx + s * 0.7, Y + 1.6, gzN)
    p.userData.s = s
    const fr = new Mesh(mergeGeometries([frameGeo, handleGeo.clone().translate(-s * 0.55, 0, 0.07), handleGeo.clone().translate(-s * 0.55, 0, -0.07)].map((g) => (g.index ? g.toNonIndexed() : g))), M.black)
    p.add(fr)
    scene.add(p)
    bdoor.panels.push(p)
  }
  bdoor.collider = addFixed(RAPIER.ColliderDesc.cuboid(1.4, 1.6, 0.15), { x: bx, y: Y + 1.6, z: gzN })

  // Rotunda + jet bridge (the bridge rises to the plane's door; only the rotunda is walkable).
  const RO = G.rotunda
  cyl(S, RO.r, RO.r, 0.06, M.bellows, RO.x, Y + 0.03, RO.z, 32)
  // corrugated outer wall (ribs texture, UVs in 2 m tiles), a pale inner wall, a skirt and a roof ring
  const arc = Math.PI * 2 - 0.7
  const rwg = new CylinderGeometry(RO.r + 0.1, RO.r + 0.1, 3.6, 32, 1, true, 0.35, arc)
  {
    const uv = rwg.attributes.uv
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * arc * (RO.r + 0.1)) / 2, (uv.getY(i) * 3.6) / 2)
  }
  const rw = new Mesh(rwg, M.ribs)
  rw.position.set(RO.x, Y + 1.8, RO.z)
  S.add(rw)
  const rwi = new Mesh(new CylinderGeometry(RO.r, RO.r, 3.4, 32, 1, true, 0.35, arc), new MeshStandardMaterial({ color: '#e9ecf1', roughness: 0.6, side: 1 }))
  rwi.position.copy(rw.position)
  S.add(rwi)
  put(S, new CylinderGeometry(RO.r + 0.16, RO.r + 0.2, 0.3, 32, 1, true, 0.35, arc), M.bellows, RO.x, Y + 0.15, RO.z)
  cyl(S, RO.r + 0.2, RO.r + 0.2, 0.3, M.jetbridge, RO.x, Y + 3.75, RO.z, 32)
  put(S, new TorusGeometry(RO.r + 0.2, 0.06, 6, 32).rotateX(Math.PI / 2), M.black, RO.x, Y + 3.6, RO.z)
  put(S, new CylinderGeometry(0.5, 0.5, 0.04, 16), M.light, RO.x, Y + 3.58, RO.z) // ceiling light
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
  // The bridge swings about its rotunda end: parked away while a plane taxis in, docked at its door.
  const bc = new Group() // built around the pivot (the rotunda's north edge)
  const tunnel = new Group()
  tunnel.position.set(0, Y + rise / 2, -tl / 2)
  tunnel.rotation.x = Math.atan2(rise, tl)
  const L = Math.hypot(tl, rise)
  // floor + carpet, a rounded roof with a light strip inside, corrugated walls with a framed window band
  box(tunnel, 2.8, 0.2, L, M.jetbridge, 0, -0.1, 0)
  put(tunnel, new BoxGeometry(2.62, 0.02, L), M.bellows, 0, 0.01, 0)
  put(tunnel, rbox(3.02, 0.26, L, 0.1, 1), M.jetbridge, 0, 2.92, 0)
  for (const s of [-1, 1]) {
    put(tunnel, tiledBoxGeo(0.12, 1.6, L, 2), M.ribs, s * 1.4, 0.7, 0)
    put(tunnel, tiledBoxGeo(0.12, 0.56, L, 2), M.ribs, s * 1.4, 2.56, 0)
    put(tunnel, new BoxGeometry(0.04, 0.8, L - 0.1), M.doorGlass, s * 1.4, 1.9, 0)
    for (const y of [1.5, 2.28]) put(tunnel, rbox(0.2, 0.06, L, 0.02, 1), M.black, s * 1.41, y, 0)
    for (let k = -L / 2 + 0.6; k < L / 2; k += 1.2) put(tunnel, new BoxGeometry(0.16, 0.74, 0.08), M.black, s * 1.42, 1.9, k)
    put(tunnel, rbox(0.06, 0.12, L, 0.02, 1), M.black, s * 1.47, 0.06, 0) // kick rail
  }
  // the cab at the plane end (a hollow shell, wider than the tunnel) and the bellows that hug the door
  const cabZ = -L / 2 + 0.6
  for (const s of [-1, 1]) {
    put(tunnel, tiledBoxGeo(0.14, 3.2, 1.8, 2), M.ribs, s * 1.62, 1.45, cabZ)
    put(tunnel, new BoxGeometry(0.03, 0.7, 0.9), M.doorGlass, s * 1.7, 2.0, cabZ)
  }
  put(tunnel, rbox(3.5, 0.3, 1.9, 0.1, 1), M.jetbridge, 0, 3.12, cabZ)
  put(tunnel, new BoxGeometry(3.24, 0.2, 1.8), M.jetbridge, 0, -0.1, cabZ)
  for (let k = 0; k < 6; k++) {
    const fs = roundRectShape(3.3 - k * 0.04, 3.4 - k * 0.04, 0.3)
    fs.holes.push(roundRectShape(2.76 - k * 0.04, 2.86 - k * 0.04, 0.2))
    put(tunnel, new ExtrudeGeometry(fs, { depth: 0.08, bevelEnabled: false, curveSegments: 3 }), M.bellows, 0, 1.45, -L / 2 - 0.36 - k * 0.11)
  }
  bc.add(tunnel)
  // the drive column under the bridge end: telescoping legs, a cross beam, a wheeled bogie
  const legZ = -tl + 1.6
  for (const s of [-1, 1]) {
    put(bc, pole(0.2, 1.15, 1.9, 12), M.jetbridge, s * 1.15, 0, legZ)
    put(bc, pole(0.13, 1.8, sill - 0.35, 10), M.jetbridge, s * 1.15, 0, legZ)
    put(bc, rbox(0.5, 0.12, 0.5, 0.03, 1), M.black, s * 1.15, 1.9, legZ)
  }
  put(bc, rbox(3.0, 0.3, 0.5, 0.08, 1), M.black, 0, sill - 0.45, legZ)
  put(bc, rbox(3.2, 0.42, 1.0, 0.1, 1), M.black, 0, 0.98, legZ)
  put(bc, rbox(2.0, 0.45, 0.8, 0.08, 1), M.black, 0, 0.6, legZ) // axle housing
  const BTYRE = tyreGeo(0.36, 0.3)
  const BHUB = new CylinderGeometry(0.2, 0.2, 0.28, 12).rotateZ(Math.PI / 2)
  for (const s of [-1, 1]) {
    for (const dz of [-0.36, 0.36]) {
      put(bc, BTYRE, M.black, s * 1.2, 0.36, legZ + dz)
      put(bc, BHUB, M.jetbridge, s * 1.2, 0.36, legZ + dz)
    }
  }
  const bridge = new Group()
  bridge.position.set(bx, 0, z0)
  const bb = bake(bc, true)
  bb.traverse((o) => o.isMesh && (o.receiveShadow = true))
  bridge.add(bb)
  scene.add(bridge)
  const bridgeLight = glowSprite('#ffb02e', 1.2)
  bridgeLight.position.set(0, sill + 3.6, -tl + 0.6)
  bridge.add(bridgeLight)
  let bridgeK = 1
  bridge.rotation.y = 0.85

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
  // Gold wall rail at dado height.
  put(S, rbox(lw, 0.07, 0.05, 0.02, 1), M.gold, lcx, Y + 1.2, LG.zN + 0.045)
  put(S, rbox(lw, 0.07, 0.05, 0.02, 1), M.gold, lcx, Y + 1.2, LG.zS - 0.045)
  put(S, rbox(0.05, 0.07, ld, 0.02, 1), M.gold, LG.x0 + 0.045, Y + 1.2, lcz)
  // Chandelier: ceiling rose + turned column, two gold rings with arms, candle cups, candles and
  // flames, crystal drops; warm glows.
  const chX = lcx + 1
  const chZ = lcz
  put(S, lathe([[0, LH - 0.12], [0.07, LH - 0.11], [0.2, LH - 0.05], [0.21, LH]], 16), M.gold, chX, Y, chZ)
  put(S, pole(0.022, LH - 1.0, LH - 0.1, 6), M.gold, chX, Y, chZ)
  put(S, lathe([[0, LH - 1.6], [0.04, LH - 1.55], [0.1, LH - 1.4], [0.06, LH - 1.3], [0.11, LH - 1.2], [0.07, LH - 1.06], [0.035, LH - 0.99], [0.03, LH - 0.95]], 12), M.gold, chX, Y, chZ)
  put(S, sw(new OctahedronGeometry(0.07).scale(1, 1.8, 1), 9), M.palette, chX, Y + LH - 1.72, chZ)
  const CUPG = lathe([[0, 0], [0.05, 0], [0.075, 0.03], [0.07, 0.042], [0.035, 0.04]], 10)
  const CANDLE = pole(0.03, 0.03, 0.2, 8)
  const FLAME = lathe([[0, 0], [0.022, 0.025], [0, 0.08]], 6)
  const DROP = new OctahedronGeometry(0.035).scale(1, 1.9, 1)
  for (const [r, y] of [[0.9, LH - 1.25], [0.55, LH - 1.0]]) {
    put(S, new TorusGeometry(r, 0.035, 8, 40), M.gold, chX, Y + y, chZ, 0, Math.PI / 2)
    const k = r > 0.7 ? 10 : 6
    for (const a of [0, Math.PI / 2]) put(S, pole(0.014, -r, r, 6), M.gold, chX, Y + y - 0.03, chZ, a, 0, Math.PI / 2) // spokes
    for (let i = 0; i < k; i++) {
      const a = (i / k) * Math.PI * 2
      const cx = chX + Math.cos(a) * r
      const cz = chZ + Math.sin(a) * r
      put(S, CUPG, M.gold, cx, Y + y + 0.01, cz)
      put(S, CANDLE, M.marble, cx, Y + y + 0.01, cz)
      put(S, FLAME, M.shade, cx, Y + y + 0.21, cz)
      const a2 = a + Math.PI / k
      put(S, sw(DROP, 9), M.palette, chX + Math.cos(a2) * r, Y + y - 0.12, chZ + Math.sin(a2) * r)
      const gl = glowSprite('#ffc76a', 0.55)
      gl.position.set(cx, Y + y + 0.25, cz)
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
  const bzc = (barZ0 + barZ1) / 2
  const blen = -bl
  // counter: recessed black plinth, dark wood body with raised panels + a gold trim, marble top,
  // a gold foot rail on brackets
  put(S, rbox(0.8, 0.12, blen - 0.1, 0.03, 1), M.black, barX - 0.04, Y + 0.06, bzc)
  put(S, rbox(0.9, 0.94, blen, 0.05, 1), M.woodDark, barX, Y + 0.58, bzc)
  for (let z = barZ0 + 0.9; z < barZ1 - 0.5; z += 1.6) put(S, rbox(0.06, 0.6, 1.3, 0.025, 1), M.wood, barX + 0.46, Y + 0.6, z)
  put(S, rbox(0.04, 0.05, blen, 0.015, 1), M.gold, barX + 0.46, Y + 0.98, bzc)
  put(S, rbox(1.15, 0.08, blen + 0.2, 0.035, 1), M.marble, barX, Y + 1.09, bzc)
  put(S, pole(0.03, -blen / 2 + 0.3, blen / 2 - 0.3, 10), M.gold, barX + 0.64, Y + 0.25, bzc, 0, Math.PI / 2)
  for (let z = barZ0 + 0.5; z < barZ1; z += 2) put(S, rbox(0.2, 0.04, 0.04, 0.012, 1), M.gold, barX + 0.54, Y + 0.25, z)
  solidBox(0.5, 0.6, -bl / 2, barX, Y + 0.6, bzc)
  // the back bar: a warm backlit mirror wall, four shelves, real bottles + glasses
  const back = new MeshStandardMaterial({ map: canvasTex(paintBacklight()), emissive: '#ffffff', emissiveIntensity: 0.55, roughness: 0.4 })
  back.emissiveMap = back.map
  panel(S, -bl, 2.4, back, LG.x0 + 0.06, Y + 2.3, bzc, Math.PI / 2)
  for (let k = 0; k < 4; k++) {
    put(S, rbox(0.38, 0.05, blen, 0.015, 1), M.woodDark, LG.x0 + 0.2, Y + 1.25 + k * 0.62, bzc)
    put(S, rbox(0.02, 0.03, blen, 0.008, 1), M.gold, LG.x0 + 0.39, Y + 1.25 + k * 0.62, bzc)
  }
  const rbot = mulberry32(21)
  const TUMBLER = lathe([[0.035, 0], [0.04, 0.1], [0.034, 0.1], [0.028, 0.012]], 6)
  for (let k = 0; k < 4; k++) {
    const y = Y + 1.275 + k * 0.62
    let n = 0
    for (let z = barZ0 + 0.3; z < barZ1 - 0.3; ) {
      if (k === 3) put(S, sw(TUMBLER, 9), M.palette, LG.x0 + 0.22, y, z)
      else {
        const v = Math.floor(rbot() * 4)
        put(S, sw(BOTTLES[v], Math.floor(rbot() * 16)), M.paletteGloss, LG.x0 + 0.22 + rbot() * 0.04, y, z, rbot() * 6)
      }
      z += k === 3 ? 0.2 : 0.13 + rbot() * 0.08
      if (++n % 9 === 0) z += 0.3 + rbot() * 0.3
    }
  }
  // on the counter: a few bottles, glasses, two beer taps
  for (let i = 0; i < 10; i++) {
    const z = barZ0 + 1.2 + i * 1.45 + rbot() * 0.4
    if (i % 3 === 0) put(S, sw(BOTTLES[i % 4], Math.floor(rbot() * 16)), M.paletteGloss, barX - 0.2, Y + 1.13, z)
    else put(S, sw(TUMBLER, 9), M.palette, barX + 0.1 - rbot() * 0.3, Y + 1.13, z)
  }
  for (const z of [bzc - 0.6, bzc + 0.6]) {
    put(S, pole(0.03, 0, 0.42, 8), M.gold, barX - 0.3, Y + 1.13, z)
    put(S, pole(0.02, 0, 0.2, 6), M.gold, barX - 0.3, Y + 1.47, z, 0, 0, Math.PI / 2)
    put(S, rbox(0.045, 0.18, 0.045, 0.015, 1), M.black, barX - 0.3, Y + 1.64, z)
  }
  // bar stools: domed leather cushion, gold cup + pole + foot ring + base
  const STOOL_SEAT = lathe([[0, 0], [0.2, 0], [0.24, 0.02], [0.25, 0.07], [0.22, 0.11], [0, 0.125]], 14)
  const STOOL_CUP = lathe([[0.04, -0.05], [0.16, -0.01], [0.18, 0.01], [0, 0.01]], 12)
  const STOOL_POLE = pole(0.035, 0.04, 0.74, 8)
  const STOOL_BASE = lathe([[0, 0], [0.24, 0], [0.24, 0.02], [0.1, 0.05], [0.04, 0.07], [0, 0.07]], 14)
  const STOOL_RING = new TorusGeometry(0.17, 0.014, 4, 16).rotateX(Math.PI / 2)
  for (let z = barZ0 + 0.8; z < barZ1; z += 1.4) {
    put(S, STOOL_BASE, M.gold, barX + 1.0, Y, z)
    put(S, STOOL_POLE, M.gold, barX + 1.0, Y, z)
    put(S, STOOL_RING, M.gold, barX + 1.0, Y + 0.32, z)
    put(S, STOOL_CUP, M.gold, barX + 1.0, Y + 0.77, z)
    put(S, STOOL_SEAT, M.leather, barX + 1.0, Y + 0.78, z)
  }
  const bartender = { x: LG.x0 + 1.05, z: (barZ0 + barZ1) / 2, yaw: Math.PI / 2 }
  // Bookshelves on the north wall.
  // Each case: side panels, a crown with a gold line, a plinth, four shelves, and ~45 individual books
  // per shelf (spine designs from one atlas), the odd leaning book, gaps and lying stacks.
  const rbk = mulberry32(4)
  const bookGeo = (w, h, d, col) => {
    const g = new BoxGeometry(w, h, d)
    const uv = g.attributes.uv
    for (let v = 0; v < uv.count; v++) {
      const face = Math.floor(v / 4) // px nx py ny pz nz
      const c = face === 2 || face === 3 ? 15 : col
      uv.setX(v, (c + 0.08 + uv.getX(v) * 0.84) / 16)
    }
    return g
  }
  const CASE_SIDE = rbox(0.12, 4.2, 0.58, 0.03, 1)
  const CASE_SHELF = rbox(3.98, 0.04, 0.54, 0.012, 1)
  const bzFront = LG.zN + 0.565
  for (const x of [LG.x0 + 6.4, LG.x0 + 10.8, LG.x0 + 15.2]) {
    for (const s of [-1, 1]) put(S, CASE_SIDE, M.woodDark, x + s * 2.04, Y + 2.1, LG.zN + 0.3)
    put(S, rbox(4.5, 0.22, 0.7, 0.05, 1), M.woodDark, x, Y + 4.19, LG.zN + 0.34)
    put(S, rbox(4.5, 0.035, 0.03, 0.01, 1), M.gold, x, Y + 4.06, LG.zN + 0.69)
    put(S, rbox(4.3, 0.2, 0.62, 0.04, 1), M.woodDark, x, Y + 0.1, LG.zN + 0.31)
    panel(S, 3.98, 3.9, M.woodDark, x, Y + 2.15, LG.zN + 0.035, 0, 1.5)
    for (let k = 1; k <= 4; k++) put(S, CASE_SHELF, M.woodDark, x, Y + 0.2 + k * 0.76, LG.zN + 0.3)
    for (let k = 0; k < 5; k++) {
      const yb = Y + 0.2 + k * 0.76 + (k ? 0.02 : 0)
      let b = x - 1.96
      while (b < x + 1.9) {
        const r = rbk()
        if (r < 0.05) {
          // a lying stack
          if (b + 0.38 > x + 1.96) break
          let sy = yb
          for (let j = 0; j < 3; j++) {
            const t = 0.05 + rbk() * 0.03
            put(S, bookGeo(0.34 - j * 0.03, t, 0.24, Math.floor(rbk() * 15)), M.spines, b + 0.19, sy + t / 2, bzFront - 0.13, rbk() * 0.2 - 0.1)
            sy += t
          }
          b += 0.42
          continue
        }
        if (r < 0.09) {
          b += 0.1 + rbk() * 0.2
          continue
        }
        const w = 0.045 + rbk() * 0.055
        const h = 0.42 + rbk() * 0.24
        const d = 0.24 + rbk() * 0.07
        if (b + w > x + 1.96) break
        const m = put(S, bookGeo(w, h, d, Math.floor(rbk() * 15)), M.spines, b + w / 2, yb + h / 2, bzFront - d / 2)
        if (rbk() < 0.05) {
          m.rotation.z = -0.2
          m.position.x += 0.05
          m.position.y += 0.005
          b += 0.1
        }
        b += w + 0.004
      }
    }
    solidBox(2.1, 2, 0.3, x, Y + 2, LG.zN + 0.3)
  }
  // Armchairs around coffee tables (sit points), a green velvet sofa, floor lamps, a tree.
  const loungeSeats = []
  // Upholstery kit (local: faces +Z, floor y = 0): rounded base, seat + back cushions, rolled arms,
  // tufting buttons, piping, turned wooden legs.
  const UP = {
    base: rbox(0.92, 0.26, 0.84, 0.05, 1).translate(0, 0.27, 0),
    seat: rbox(0.62, 0.16, 0.66, 0.07, 2).translate(0, 0.48, 0.06),
    back: rbox(0.92, 0.66, 0.22, 0.1, 1).translate(0, 0.73, -0.31),
    backCush: rbox(0.6, 0.42, 0.14, 0.06, 2).rotateX(-0.12).translate(0, 0.76, -0.17),
    arm: rbox(0.17, 0.4, 0.8, 0.07, 1).translate(0, 0.55, 0),
    roll: new CylinderGeometry(0.1, 0.1, 0.84, 12).rotateX(Math.PI / 2).translate(0, 0.74, 0.02),
    pipe: new CylinderGeometry(0.012, 0.012, 0.62, 6).rotateZ(Math.PI / 2).translate(0, 0.555, 0.39),
    button: new SphereGeometry(0.022, 6, 4),
    leg: lathe([[0, 0], [0.03, 0], [0.042, 0.05], [0.028, 0.14], [0, 0.14]], 8),
  }
  const buttonZ = (dy) => -0.17 + 0.075 - 0.12 * dy // on the tilted back cushion's face
  const TUFT = [[-0.17, 0.09], [0, 0.09], [0.17, 0.09], [-0.085, -0.09], [0.085, -0.09]] // diamond tufting
  const armchair = (x, z, yaw) => {
    const g = new Group()
    put(g, UP.base, M.leather, 0, 0, 0)
    put(g, UP.seat, M.leather, 0, 0, 0)
    put(g, UP.back, M.leather, 0, 0, 0)
    put(g, UP.backCush, M.leather, 0, 0, 0)
    put(g, UP.pipe, M.woodDark, 0, 0, 0)
    for (const s of [-1, 1]) {
      put(g, UP.arm, M.leather, s * 0.4, 0, 0)
      put(g, UP.roll, M.leather, s * 0.41, 0, 0)
    }
    for (const [dx, dy] of TUFT) put(g, UP.button, M.woodDark, dx, 0.76 + dy, buttonZ(dy))
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(g, UP.leg, M.woodDark, sx * 0.38, 0, sz * 0.34)
    g.position.set(x, Y, z)
    g.rotation.y = yaw
    S.add(g)
    loungeSeats.push({ x: x + Math.sin(yaw) * 0.06, y: Y + 0.56, z: z + Math.cos(yaw) * 0.06, yaw, kind: 'lounge', npc: null })
    solidBox(0.4, 0.3, 0.4, x - Math.sin(yaw) * 0.25, Y + 0.3, z - Math.cos(yaw) * 0.25)
  }
  const TTOP = lathe([[0, 0.47], [0.55, 0.47], [0.58, 0.49], [0.58, 0.52], [0.55, 0.535], [0, 0.535]], 24)
  const TPED = lathe([[0.05, 0.02], [0.075, 0.1], [0.045, 0.25], [0.06, 0.44], [0.09, 0.47]], 10)
  const TBASE = lathe([[0, 0], [0.3, 0], [0.3, 0.02], [0.12, 0.05], [0, 0.06]], 16)
  const CUP = lathe([[0, 0], [0.035, 0], [0.05, 0.075], [0.044, 0.075], [0, 0.012]], 10)
  const SAUCER = lathe([[0, 0], [0.07, 0], [0.09, 0.015], [0, 0.008]], 12)
  const table = (x, z) => {
    put(S, TTOP, M.woodDark, x, Y, z)
    put(S, TPED, M.gold, x, Y, z)
    put(S, TBASE, M.gold, x, Y, z)
    put(S, SAUCER, M.marble, x + 0.15, Y + 0.535, z - 0.1)
    put(S, CUP, M.marble, x + 0.15, Y + 0.545, z - 0.1)
    put(S, bookGeo(0.3, 0.04, 0.22, 1), M.spines, x - 0.18, Y + 0.555, z + 0.1, 0.4)
    put(S, bookGeo(0.26, 0.035, 0.2, 9), M.spines, x - 0.17, Y + 0.592, z + 0.1, 0.6)
    solidBox(0.5, 0.3, 0.5, x, Y + 0.3, z)
  }
  for (const [tx, tz] of [[lcx + 1.5, LG.zS - 6], [lcx + 1.5, lcz - 3], [lcx + 6, lcz + 2.4]]) {
    table(tx, tz)
    armchair(tx - 1.4, tz, Math.PI / 2)
    armchair(tx + 1.4, tz, -Math.PI / 2)
    armchair(tx, tz - 1.4, 0)
  }
  // sofa
  {
    // a tufted green velvet three-seater with gold buttons, facing north
    const g = new Group()
    put(g, rbox(3.2, 0.26, 0.88, 0.05, 1), M.velvet, 0, 0.27, 0)
    put(g, rbox(3.2, 0.68, 0.24, 0.1, 2), M.velvet, 0, 0.74, -0.32)
    const cush = rbox(0.92, 0.16, 0.66, 0.07, 2)
    const bcush = rbox(0.92, 0.4, 0.14, 0.06, 2).rotateX(-0.12)
    const pipe = new CylinderGeometry(0.012, 0.012, 0.9, 6).rotateZ(Math.PI / 2)
    for (let i = 0; i < 3; i++) {
      const cx = (i - 1) * 0.94
      put(g, cush, M.velvet, cx, 0.48, 0.07)
      put(g, pipe, M.gold, cx, 0.555, 0.4)
      put(g, bcush, M.velvet, cx, 0.78, -0.17)
      for (const [dx, dy] of TUFT) put(g, UP.button, M.gold, cx + dx * 1.45, 0.78 + dy, buttonZ(dy))
    }
    for (const s of [-1, 1]) {
      put(g, rbox(0.2, 0.42, 0.86, 0.07, 1), M.velvet, s * 1.5, 0.56, 0)
      put(g, new CylinderGeometry(0.11, 0.11, 0.9, 12).rotateX(Math.PI / 2), M.velvet, s * 1.51, 0.77, 0.02)
    }
    for (const sx of [-1.45, 0, 1.45]) for (const sz of [-0.36, 0.36]) put(g, UP.leg, M.woodDark, sx, 0, sz)
    g.position.set(lcx - 1, Y, LG.zS - 0.75)
    g.rotation.y = Math.PI
    S.add(g)
  }
  solidBox(1.7, 0.4, 0.5, lcx - 1, Y + 0.4, LG.zS - 0.7)
  for (let i = 0; i < 3; i++) loungeSeats.push({ x: lcx - 2 + i, y: Y + 0.56, z: LG.zS - 0.82, yaw: Math.PI, kind: 'lounge', npc: null })
  const LBASE = lathe([[0, 0], [0.22, 0], [0.22, 0.03], [0.12, 0.06], [0.04, 0.09], [0, 0.09]], 16)
  const LPOLE = pole(0.022, 0.08, 1.62, 8)
  const LSHADE = lathe([[0.34, 1.6], [0.22, 2.0]], 20)
  const LRIM0 = ring(0.34, 0.012, 20, 4).rotateX(Math.PI / 2).translate(0, 1.6, 0)
  const LRIM1 = ring(0.22, 0.012, 20, 4).rotateX(Math.PI / 2).translate(0, 2.0, 0)
  const lamp = (x, z) => {
    put(S, LBASE, M.gold, x, Y, z)
    put(S, LPOLE, M.gold, x, Y, z)
    put(S, LSHADE, M.shade, x, Y, z)
    put(S, LRIM0, M.gold, x, Y, z)
    put(S, LRIM1, M.gold, x, Y, z)
    put(S, UP.button, M.gold, x, Y + 2.04, z).scale.setScalar(1.4)
    const gl = glowSprite('#ffd38a', 1.1, 0.7)
    gl.position.set(x, Y + 1.72, z)
    scene.add(gl)
  }
  lamp(LG.x1 - 1, LG.zN + 1)
  lamp(lcx - 3.4, LG.zS - 0.6)
  lamp(lcx + 8.6, lcz - 4.6)
  // tree in a pot
  const TPOT = lathe([[0, 0], [0.38, 0], [0.42, 0.05], [0.5, 0.72], [0.54, 0.76], [0.54, 0.82], [0.48, 0.82], [0, 0.8]], 18)
  const TRUNK = pole(0.11, 0.7, 2.9, 8, 0.06)
  const tree = (x, z, s = 1) => {
    put(S, TPOT, M.pot, x, Y, z).scale.setScalar(s)
    put(S, new TorusGeometry(0.52, 0.025, 4, 18).rotateX(Math.PI / 2), M.gold, x, Y + 0.62 * s, z).scale.setScalar(s)
    put(S, SOIL, M.trunk, x, Y + 0.8 * s, z).scale.setScalar(s * 1.2)
    put(S, TRUNK, M.trunk, x, Y, z).scale.setScalar(s)
    let k = 0
    for (const [dx, dy, dz, r] of [[0, 2.9, 0, 0.85], [0.5, 2.55, 0.3, 0.6], [-0.45, 2.6, -0.2, 0.62], [0.1, 3.4, 0.2, 0.55], [-0.3, 3.15, 0.38, 0.5], [0.38, 3.05, -0.38, 0.52], [-0.1, 2.35, -0.45, 0.45]]) blob(x + dx * s, Y + dy * s, z + dz * s, r * s, k++)
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
    put(S, rbox(1.6, 0.7, 2.6, 0.06, 1), M.wood, fx + 1.3, Y + 0.35, pz)
    put(S, rbox(1.68, 0.06, 2.68, 0.025, 1), M.gold, fx + 1.3, Y + 0.68, pz)
    put(S, rbox(1.66, 0.1, 2.66, 0.03, 1), M.woodDark, fx + 1.3, Y + 0.05, pz)
    for (let k = 0; k < 6; k++) blob(fx + 1.12 + (k % 2) * 0.36, Y + 0.95 + (k % 3) * 0.06, pz - 1.0 + k * 0.4, 0.42 + (k % 3) * 0.08, k)
    solidBox(0.8, 0.5, 1.3, fx + 1.3, Y + 0.5, pz)
  }
  flat(S, fx + 0.1, fx + 4.6, LG.doorZ - 1.0, LG.doorZ + 1.0, Y + 0.015, M.red, 0)
  flat(S, LG.x1 - 3, LG.x1, LG.doorZ - 1.0, LG.doorZ + 1.0, Y + 0.016, M.red, 0)
  for (const s of [-1, 1]) {
    const pz = LG.doorZ + s * 1.25
    for (const x of [fx + 2.6, fx + 4.4]) post(x, pz, M.gold)
    // a sagging velvet rope between the brass posts
    const rope = new CatmullRomCurve3([[fx + 2.6, 0.93], [fx + 3.05, 0.82], [fx + 3.5, 0.78], [fx + 3.95, 0.82], [fx + 4.4, 0.93]].map(([x, y]) => new Vector3(x, Y + y, pz)))
    put(S, new TubeGeometry(rope, 16, 0.03, 6), M.red, 0, 0, 0)
    solidBox(0.95, 0.5, 0.06, fx + 3.5, Y + 0.5, pz)
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
  // The neighbours' static jet bridges (baked with everything else): corrugated tunnel, rounded roof,
  // a framed window band, a drive leg on a wheeled bogie.
  const NB_TUNNEL = tiledBoxGeo(2.8, 3, 14, 2)
  const NB_ROOF = rbox(3.0, 0.26, 14.1, 0.1, 1)
  const NB_GLASS = new BoxGeometry(0.04, 0.7, 13.4)
  const NB_TRIM = rbox(0.16, 0.06, 13.6, 0.02, 1)
  const NB_TYRE = tyreGeo(0.34, 0.28)
  for (const nx of [226, 68]) {
    const x = nx - 12.6
    const z = G.plane.z + 10
    put(S, NB_TUNNEL, M.ribs, x, Y + 2.4, z)
    put(S, NB_ROOF, M.jetbridge, x, Y + 4.0, z)
    for (const s of [-1, 1]) {
      put(S, NB_GLASS, M.doorGlass, x + s * 1.41, Y + 2.7, z)
      for (const y of [2.32, 3.08]) put(S, NB_TRIM, M.black, x + s * 1.42, Y + y, z)
      put(S, pole(0.15, 0.8, Y + 0.95, 10), M.chrome, x + s * 1.0, 0, z - 4)
      for (const dz of [-0.32, 0.32]) put(S, NB_TYRE, M.tyre, x + s * 1.15, 0.34, z - 4 + dz)
    }
    put(S, rbox(2.8, 0.4, 0.9, 0.08, 1), M.black, x, 0.75, z - 4)
    put(S, new BoxGeometry(2.82, 0.07, 0.92), M.yellow, x, 0.62, z - 4)
  }

  const baked = bake(S, false)
  const casters = [M.seat, M.black, M.white, M.chrome, M.leather, M.woodDark, M.bush, M.bush2, M.jetbridge, M.velvet, M.ribs, M.gold, M.pot]
  baked.traverse((o) => {
    if (!o.isMesh) return
    o.receiveShadow = true
    o.castShadow = casters.includes(o.material)
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
    dirSigns[0].set(n > 2 ? `gates 1 – ${n - 1}` : `gate ${Math.max(1, n - 1)}`)
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
    // Jet bridge: 0 = docked at the plane's door, 1 = swung clear.
    setBridge(k) {
      bridgeK = k
      const e = k * k * (3 - 2 * k)
      bridge.rotation.y = e * 0.85
    },
    get bridge() {
      return bridgeK
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
      bridgeLight.visible = bridgeK > 0.02 && bridgeK < 0.98 && t % 0.8 < 0.4
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
