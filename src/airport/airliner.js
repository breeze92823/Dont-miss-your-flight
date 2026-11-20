// The gate's airliner (and its parked neighbours): a detailed narrow-body jet in the skyhop air
// livery. White fuselage with a blue belly + tail cone, the airline name and a full row of framed
// windows painted on decals bent onto the hull, door outlines, a drooped radome nose with framed
// cockpit panes, lofted (airfoil) wings with panel lines, flap-track fairings and blue winglets,
// under-wing engines (lathed nacelles with a polished intake lip, fan + spinner, core cowl and plug)
// on shaped pylons, nose + main gear with struts, braces and rounded tyres, APU exhaust, antennae,
// and nav / beacon / strobe lights.
// Local frame: nose toward +Z, up +Y, left side +X; the origin is the fuselage centre.
// The static hull is built once and baked (one mesh per material); every makeJet() shares those
// geometries + materials, only the fans and light sprites are per jet.
import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Shape,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
} from 'three'
import { bake } from '../bake.js'
import { AIRLINE } from '../config.js'
import { paintSoftDot } from '../textures.js'
import { lathe, rbox } from '../detail.js'

export const JET = { r: 2.4, front: 16, back: -16, door: 12.6, rearDoor: -13.2, wingZ: 1, span: 17.5, gearY: -3.4 }
const BLUE = '#1c8cf0'
const FONT = 'Fredoka, "Arial Rounded MT Bold", Arial, sans-serif'

const canvasTex = (c) => {
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 8
  return t
}

// Wing / stabiliser skin: x = chord (leading edge left), y = span. Panel lines, a metal leading
// edge, the slat seam, spoilers and flap segments.
// The bottom 192 rows hold the wing (v 0..0.72); the top 64 rows are plain hull white, so every white
// part of the jet shares this material (its UVs all point into that block).
const WHITE_V = 0.875
function paintWing() {
  const out = document.createElement('canvas')
  out.width = out.height = 256
  const o = out.getContext('2d')
  o.fillStyle = '#f7f9fc'
  o.fillRect(0, 0, 256, 64)
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#f4f7fb'
  ctx.fillRect(0, 0, 256, 256)
  ctx.fillStyle = '#cfd6e0' // de-iced leading edge
  ctx.fillRect(0, 0, 12, 256)
  ctx.fillStyle = '#b4bcc8'
  ctx.fillRect(30, 0, 2, 256) // slat seam
  for (let y = 0; y < 256; y += 51) ctx.fillRect(0, y, 32, 2)
  ctx.fillStyle = '#e6eaf0' // spoilers
  ctx.fillRect(160, 0, 26, 256)
  ctx.fillStyle = '#e0e5ec' // flaps
  ctx.fillRect(190, 0, 66, 256)
  ctx.fillStyle = '#aab3c0'
  ctx.fillRect(158, 0, 2, 256)
  ctx.fillRect(188, 0, 2, 256)
  for (let y = 0; y < 256; y += 32) ctx.fillRect(160, y, 26, 2)
  for (let y = 0; y < 256; y += 85) ctx.fillRect(190, y, 66, 3)
  ctx.fillStyle = 'rgba(120,132,150,0.28)' // ribs + spars
  for (let y = 12; y < 256; y += 24) ctx.fillRect(34, y, 124, 1)
  ctx.fillRect(70, 0, 1, 256)
  ctx.fillRect(130, 0, 1, 256)
  o.drawImage(c, 0, 0, 256, 256, 0, 64, 256, 192)
  return out
}

let shared = null
function mats() {
  if (shared) return shared
  shared = {
    white: new MeshStandardMaterial({ color: '#f7f9fc', roughness: 0.28, metalness: 0.12 }),
    wing: new MeshStandardMaterial({ map: canvasTex(paintWing()), roughness: 0.28, metalness: 0.12 }),
    blue: new MeshStandardMaterial({ color: BLUE, roughness: 0.3, metalness: 0.15 }),
    grey: new MeshStandardMaterial({ color: '#aab3c0', roughness: 0.35, metalness: 0.55 }),
    steel: new MeshStandardMaterial({ color: '#d7dde6', roughness: 0.2, metalness: 0.85 }),
    dark: new MeshStandardMaterial({ color: '#16191f', roughness: 0.5, metalness: 0.3 }),
    tyre: new MeshStandardMaterial({ color: '#1b1c20', roughness: 0.85 }),
    glass: new MeshStandardMaterial({ color: '#0e1a2c', roughness: 0.05, metalness: 0.6, emissive: '#1a3a6a', emissiveIntensity: 0.25 }),
    fan: new MeshStandardMaterial({ color: '#c9d0da', roughness: 0.25, metalness: 0.8, side: DoubleSide }),
  }
  return shared
}

// Side band: windows, doors and the airline name, painted along the fuselage (canvas x = nose -> tail).
function paintSide(flip) {
  const L = JET.front - JET.back + 2 // metres the band covers (z from front+1 to back-1)
  const W = 2048
  const H = 192
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d')
  const px = (m) => (m / L) * W // metres along the hull -> px
  // hull z -> canvas x: nose at the left on the +X side, at the right on the -X side (text never mirrored)
  const zx = (z) => (flip ? W - px(JET.front + 1 - z) : px(JET.front + 1 - z))
  const oval = (x, y, rx, ry, fill) => {
    ctx.fillStyle = fill
    ctx.beginPath()
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  // Windows: a pale frame, a dark pane and a blue glint, one every 0.55 m.
  const wy = 62
  for (let z = JET.front - 1.6; z > JET.back + 1.4; z -= 0.55) {
    if (Math.abs(z - JET.door) < 0.8 || Math.abs(z - JET.rearDoor) < 0.8 || Math.abs(z - 4.4) < 0.5) continue
    const x = zx(z)
    oval(x, wy, 12, 17, '#b9c2cf')
    oval(x, wy, 9, 14, '#121620')
    ctx.fillStyle = 'rgba(120,180,255,0.6)'
    ctx.beginPath()
    ctx.ellipse(x - 2.5, wy - 4, 3, 5, 0.3, 0, Math.PI * 2)
    ctx.fill()
  }
  // Doors: double outline (seam + frame), a framed window and a handle.
  const door = (z, w, y0, y1, win) => {
    const x = zx(z)
    const path = (inset) => {
      const r = 14 - inset
      const a = x - w / 2 + inset
      const b = x + w / 2 - inset
      const t = y0 + inset
      const d = y1 - inset
      ctx.beginPath()
      ctx.moveTo(a + r, t)
      ctx.arcTo(b, t, b, d, r)
      ctx.arcTo(b, d, a, d, r)
      ctx.arcTo(a, d, a, t, r)
      ctx.arcTo(a, t, b, t, r)
    }
    ctx.lineWidth = 4
    ctx.strokeStyle = '#6b7586'
    path(0)
    ctx.stroke()
    ctx.lineWidth = 2
    ctx.strokeStyle = '#c3cad5'
    path(5)
    ctx.stroke()
    if (win) {
      oval(x, 62, 10, 14, '#b9c2cf')
      oval(x, 62, 7, 11, '#121620')
      ctx.fillStyle = '#8a94a3'
      ctx.fillRect(x - 9, 104, 18, 5)
      ctx.fillStyle = '#e8434f' // the slide-armed stripe
      ctx.fillRect(x - w / 2 + 8, 128, w - 16, 3)
    }
  }
  door(JET.door, 46, 30, 150, true)
  door(JET.rearDoor, 46, 30, 150, true)
  door(4.4, 26, 44, 150, false)
  // Airline name, big and slanted, ahead of the wing.
  ctx.save()
  ctx.fillStyle = '#12151c'
  ctx.font = `italic 700 132px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(AIRLINE.split(' ')[0], zx(7.6), 168)
  ctx.restore()
  // A thin blue cheat line under the windows.
  ctx.fillStyle = BLUE
  const a = zx(JET.front - 1)
  const b = zx(JET.back)
  ctx.fillRect(Math.min(a, b), 92, Math.abs(b - a), 4)
  return c
}

function paintLogo() {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const ctx = c.getContext('2d')
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 20
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.arc(128, 128, 78, -0.4, Math.PI * 1.55)
  ctx.stroke()
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.arc(128 + Math.cos(-0.4) * 78, 128 + Math.sin(-0.4) * 78, 18, 0, Math.PI * 2)
  ctx.fill()
  ctx.font = `700 96px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('s', 128, 136)
  return c
}

// A plane bent onto the hull: u along z (nose -> tail), v around the side from angle a0 to a1
// (0 = level with the centre, + = up) on the +X (side = 1) or -X (side = -1) side.
function hullBandGeo(r, zFront, zBack, a0, a1, side) {
  const g = new PlaneGeometry(1, 1, 64, 10)
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) + 0.5 // 0 = left edge of the canvas (nose)
    const v = p.getY(i) + 0.5 // 0 = bottom of the canvas
    const z = zFront + (zBack - zFront) * u
    const a = a0 + (a1 - a0) * v
    p.setXYZ(i, side * Math.cos(a) * r, Math.sin(a) * r, z)
  }
  g.computeVertexNormals()
  return g
}

// Lofted airfoil surface through spanwise sections {x, zLE, zTE, yc, th} on side s (+1 / -1),
// with a cap on the outer end. UV: u = chord (0 at the leading edge), v = span.
const UPPER = [1, 0.85, 0.66, 0.46, 0.28, 0.14, 0.06, 0.018, 0]
const LOWER = [0.018, 0.06, 0.14, 0.28, 0.46, 0.66, 0.85, 1]
const thick = (u) => (Math.sqrt(u) * (1 - u)) / 0.385
function loft(sections, s, up = 0.62, lo = 0.38) {
  const pos = []
  const uv = []
  const idx = []
  const n = UPPER.length + LOWER.length
  sections.forEach((sec, i) => {
    const v = (i / (sections.length - 1)) * 0.72
    const pt = (u, sign, k) => {
      pos.push(s * sec.x, sec.yc + sign * sec.th * k * thick(u), sec.zLE + (sec.zTE - sec.zLE) * u)
      uv.push(u, v)
    }
    for (const u of UPPER) pt(u, 1, up)
    for (const u of LOWER) pt(u, -1, lo)
  })
  const flip = s < 0
  for (let i = 0; i < sections.length - 1; i++) {
    for (let j = 0; j < n - 1; j++) {
      const a = i * n + j
      const b = a + 1
      const c = a + n + 1
      const d = a + n
      if (flip) idx.push(a, c, b, a, d, c)
      else idx.push(a, b, c, a, c, d)
    }
  }
  // tip cap: a fan around the last ring's centre
  const base = pos.length / 3
  const last = (sections.length - 1) * n
  let cx = 0
  let cy = 0
  let cz = 0
  for (let j = 0; j < n; j++) {
    cx += pos[(last + j) * 3] / n
    cy += pos[(last + j) * 3 + 1] / n
    cz += pos[(last + j) * 3 + 2] / n
  }
  for (let j = 0; j < n; j++) {
    pos.push(pos[(last + j) * 3], pos[(last + j) * 3 + 1], pos[(last + j) * 3 + 2])
    uv.push(UPPER.concat(LOWER)[j], 0.72)
  }
  pos.push(cx, cy, cz)
  uv.push(0.5, 0.72)
  for (let j = 0; j < n - 1; j++) {
    if (flip) idx.push(base + n, base + j + 1, base + j)
    else idx.push(base + n, base + j, base + j + 1)
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

// The nose: a drooped radome lathe that meets the fuselage cylinder at z = front.
const NL = 5.2
const DROOP = 0.6
const noseR = (t) => JET.r * Math.sqrt(Math.max(0, 1 - Math.pow(t, 2.2)))
const noseDy = (t) => -DROOP * t * t
function noseGeo(seg) {
  const ts = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.68, 0.76, 0.83, 0.89, 0.94, 0.975, 1]
  const g = lathe(ts.map((t) => [noseR(t), t * NL]), seg)
  g.rotateX(Math.PI / 2) // lathe axis (+Y) -> +Z
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + noseDy(p.getZ(i) / NL))
  g.translate(0, 0, JET.front)
  g.computeVertexNormals()
  // weld the seam normals (first and last meridian share positions)
  const nrm = g.attributes.normal
  const k = ts.length
  for (let j = 0; j < k; j++) {
    const a = j
    const b = seg * k + j
    const x = nrm.getX(a) + nrm.getX(b)
    const y = nrm.getY(a) + nrm.getY(b)
    const z = nrm.getZ(a) + nrm.getZ(b)
    const l = Math.hypot(x, y, z) || 1
    nrm.setXYZ(a, x / l, y / l, z / l)
    nrm.setXYZ(b, x / l, y / l, z / l)
  }
  return g
}
// A patch of the nose surface (t along the nose, a around it from the top), lifted by `off`.
function nosePatch(t0, t1, a0, a1, off, nu = 3, nv = 3) {
  const pos = []
  const uv = []
  const idx = []
  for (let i = 0; i <= nu; i++) {
    for (let j = 0; j <= nv; j++) {
      const t = t0 + ((t1 - t0) * i) / nu
      const a = a0 + ((a1 - a0) * j) / nv
      const r = noseR(t) + off
      pos.push(Math.sin(a) * r, Math.cos(a) * r + noseDy(t), JET.front + t * NL)
      uv.push(i / nu, j / nv)
    }
  }
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      const a = i * (nv + 1) + j
      const b = a + nv + 1
      idx.push(a, a + 1, b, a + 1, b + 1, b)
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  // face outward: compare the middle normal with the radial direction
  const m = Math.floor(pos.length / 6)
  const nx = g.attributes.normal.getX(m)
  const ny = g.attributes.normal.getY(m)
  const am = (a0 + a1) / 2
  if (nx * Math.sin(am) + ny * Math.cos(am) < 0) {
    for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]]
    g.setIndex(idx)
    g.computeVertexNormals()
  }
  return g
}

// A rounded tyre around the X axis, centred on the origin.
function tyreGeo(r, w) {
  const h = w / 2
  return lathe([[r * 0.56, -h], [r * 0.82, -h], [r * 0.95, -h + w * 0.14], [r, -h * 0.4], [r, h * 0.4], [r * 0.95, h - w * 0.14], [r * 0.82, h], [r * 0.56, h]], 16).rotateZ(Math.PI / 2)
}

function glowSprite(color, size) {
  const s = new Sprite(new SpriteMaterial({ map: dotTex(), color, transparent: true, depthWrite: false, blending: AdditiveBlending, fog: false }))
  s.scale.set(size, size, 1)
  return s
}
let dot = null
const dotTex = () => (dot ??= new CanvasTexture(paintSoftDot(64)))

// --- the shared hull (built once) ------------------------------------------------------------------
let proto = null
function buildProto() {
  const M = mats()
  const g = new Group()
  const add = (geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    const m = new Mesh(geo, mat)
    m.position.set(x, y, z)
    m.rotation.set(rx, ry, rz)
    g.add(m)
    return m
  }
  const UP = new Vector3(0, 1, 0)
  const dir = new Vector3()
  const strut = (a, b, r, mat, seg = 10) => {
    dir.set(b[0] - a[0], b[1] - a[1], b[2] - a[2])
    const L = dir.length()
    const m = add(new CylinderGeometry(r, r, L, seg), mat, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2)
    m.quaternion.setFromUnitVectors(UP, dir.normalize())
    return m
  }
  const R = JET.r
  const len = JET.front - JET.back
  const wz = JET.wingZ

  // Fuselage: white body, blue belly band, drooped nose with framed cockpit panes.
  add(new CylinderGeometry(R, R, len, 40, 1, true), M.white, 0, 0, (JET.front + JET.back) / 2, Math.PI / 2)
  add(new CylinderGeometry(R + 0.012, R + 0.012, len, 24, 1, true, -Math.PI * 0.32, Math.PI * 0.64), M.blue, 0, 0, (JET.front + JET.back) / 2, Math.PI / 2)
  add(noseGeo(40), M.white)
  const panes = [
    [0.665, 0.79, 0.035, 0.4],
    [0.585, 0.705, 0.47, 0.84],
    [0.505, 0.605, 0.91, 1.17],
  ]
  for (const [t0, t1, a0, a1] of panes) {
    for (const s of [-1, 1]) {
      const [b0, b1] = s > 0 ? [a0, a1] : [-a1, -a0]
      add(nosePatch(t0 - 0.014, t1 + 0.014, b0 - 0.035, b1 + 0.035, 0.012), M.dark)
      add(nosePatch(t0, t1, b0, b1, 0.026), M.glass)
    }
  }
  // pitot probes ahead of the cockpit
  for (const s of [-1, 1]) add(new CylinderGeometry(0.018, 0.03, 0.32, 6), M.steel, s * noseR(0.3) * 0.94, -0.55, JET.front + 0.3 * NL, Math.PI / 2, 0, 0)

  // Tail cone: tapers and rises; blue. APU exhaust nozzle at the tip.
  const tail = new CylinderGeometry(R, 0.42, 9.5, 32, 6, true)
  tail.rotateX(Math.PI / 2) // the wide end (radiusTop) toward +Z, where it meets the fuselage
  {
    const p = tail.attributes.position
    for (let i = 0; i < p.count; i++) {
      const z = p.getZ(i)
      const t = Math.max(0, Math.min(1, (4.75 - z) / 9.5)) // 0 at the joint, 1 at the tip
      p.setY(i, p.getY(i) + t * t * 1.5)
    }
    tail.computeVertexNormals()
  }
  add(tail, M.blue, 0, 0, JET.back - 4.75)
  const apu = lathe([[0.26, -0.05], [0.28, -0.29], [0.35, -0.3], [0.41, -0.18], [0.43, 0]], 16).rotateX(Math.PI / 2)
  add(apu, M.steel, 0, 1.5, JET.back - 9.5)
  add(new CircleGeometry(0.27, 14).rotateY(Math.PI), M.dark, 0, 1.5, JET.back - 9.56)

  // Wings: lofted airfoils (thick root, thin tip) with dihedral, flap-track fairings, blue winglets.
  const teAt = (x) => (x < 7 ? wz - 4.4 - ((x - 1.6) / 5.4) * 0.8 : wz - 5.2 - ((x - 7) / (JET.span - 7)) * 1.0)
  const leAt = (x) => wz + 4.2 - ((x - 1.6) / (JET.span - 1.6)) * 8.8
  const thAt = (x) => 0.66 - ((x - 1.6) / (JET.span - 1.6)) * 0.5
  const ycAt = (x) => -1.45 + 0.07 * x
  const wingSecs = [1.6, 4, 7, 12, JET.span].map((x) => ({ x, zLE: leAt(x), zTE: teAt(x), yc: ycAt(x), th: thAt(x) }))
  const fairing = lathe([[0, 0], [0.1, 0.25], [0.17, 0.8], [0.16, 1.8], [0.08, 2.4], [0, 2.6]], 8).rotateX(-Math.PI / 2)
  const winglet = new Shape()
  winglet.moveTo(0, 0)
  winglet.lineTo(1.6, 0)
  winglet.lineTo(2.3, 2.4)
  winglet.lineTo(1.7, 2.4)
  winglet.closePath()
  const wg = new ExtrudeGeometry(winglet, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.025, bevelSegments: 1, curveSegments: 1 })
  wg.rotateY(Math.PI / 2)
  wg.translate(-0.05, 0, 0)
  for (const s of [-1, 1]) {
    add(loft(wingSecs, s), M.wing)
    for (const x of [4.2, 8.8, 12.6]) add(fairing, M.white, s * x, ycAt(x) - 0.13, teAt(x) + 1.7)
    add(wg, M.blue, s * (JET.span - 0.02), ycAt(JET.span) - 0.06, leAt(JET.span))
    // Horizontal stabilisers.
    const stab = [
      { x: 0.4, zLE: JET.back - 2.6, zTE: JET.back - 7.6, yc: 0.92, th: 0.38 },
      { x: 6.6, zLE: JET.back - 7.2, zTE: JET.back - 8.4, yc: 0.92 + 0.06 * 6.2, th: 0.12 },
    ]
    add(loft(stab, s, 0.5, 0.5), M.wing)
  }
  // Wing-to-body fairing.
  const fair = add(new SphereGeometry(1, 24, 12), M.white, 0, -1.7, wz - 0.8)
  fair.scale.set(2.35, 1.0, 5.4)
  // Fin: blue, swept, a dorsal fillet in front of it, the logo on both sides.
  const fin = new Shape()
  fin.moveTo(JET.back - 2.4, 1.6)
  fin.lineTo(JET.back - 7.6, 9.2)
  fin.lineTo(JET.back - 10.2, 9.2)
  fin.lineTo(JET.back - 9.4, 1.6)
  fin.closePath()
  const fg = new ExtrudeGeometry(fin, { depth: 0.36, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 2 })
  fg.rotateY(-Math.PI / 2)
  fg.translate(0.18, 0, 0)
  add(fg, M.blue)
  const fil = new Shape()
  fil.moveTo(JET.back + 1.2, 2.25)
  fil.lineTo(JET.back - 3.6, 3.4)
  fil.lineTo(JET.back - 3.6, 1.7)
  fil.closePath()
  const fl = new ExtrudeGeometry(fil, { depth: 0.22, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 1 })
  fl.rotateY(-Math.PI / 2)
  fl.translate(0.11, 0, 0)
  add(fl, M.blue)
  const logoMat = new MeshStandardMaterial({ map: canvasTex(paintLogo()), transparent: true, roughness: 0.3, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })
  for (const s of [-1, 1]) add(new PlaneGeometry(3, 3), logoMat, s * 0.32, 5.6, JET.back - 7.4, 0, (s * Math.PI) / 2).renderOrder = 2

  // Engines: lathed blue nacelles with a polished lip, dark intake + fan face, bypass + core nozzles,
  // an exhaust plug, on a shaped white pylon. Fans are separate (they spin).
  const cowl = lathe([[0.92, -1.9], [1.02, -1.4], [1.14, -0.6], [1.18, 0.2], [1.17, 1.0], [1.13, 1.6], [1.1, 1.82]], 28).rotateX(Math.PI / 2)
  const lip = lathe([[1.1, 1.82], [1.09, 1.92], [1.03, 1.98], [0.97, 1.95], [0.94, 1.85]], 28).rotateX(Math.PI / 2)
  const duct = lathe([[0.94, 1.85], [0.95, 1.45], [0.96, 1.25]], 28).rotateX(Math.PI / 2)
  const liner = lathe([[0.89, -1.3], [0.92, -1.9]], 28).rotateX(Math.PI / 2)
  const core = lathe([[0.5, -2.5], [0.72, -2.6], [0.8, -2.1], [0.86, -1.4]], 24).rotateX(Math.PI / 2)
  const plug = lathe([[0, -3.25], [0.18, -3.05], [0.38, -2.75], [0.5, -2.5]], 16).rotateX(Math.PI / 2)
  const face = new CylinderGeometry(0.96, 0.96, 0.08, 28).rotateX(Math.PI / 2)
  const py = new Shape()
  py.moveTo(1.3, 1.08)
  py.lineTo(0.2, 1.38)
  py.lineTo(-1.1, 1.62)
  py.lineTo(-3.1, 1.85)
  py.lineTo(-3.0, 1.2)
  py.lineTo(-2.1, 0.9)
  py.closePath()
  const pylon = new ExtrudeGeometry(py, { depth: 0.3, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 1 })
  pylon.rotateY(-Math.PI / 2)
  pylon.translate(0.15, 0, 0)
  const fanPos = []
  const engines = []
  for (const s of [-1, 1]) {
    const ex = s * 6.4
    const ey = -2.65
    const ez = wz + 3.4
    add(cowl, M.blue, ex, ey, ez)
    add(lip, M.steel, ex, ey, ez)
    add(duct, M.dark, ex, ey, ez)
    add(liner, M.dark, ex, ey, ez)
    add(core, M.grey, ex, ey, ez)
    add(plug, M.steel, ex, ey, ez)
    add(face, M.dark, ex, ey, ez + 1.28)
    add(pylon, M.white, ex, ey, ez)
    fanPos.push([ex, ey, ez + 1.45])
    engines.push([ex, ey, ez - 3])
  }

  // Landing gear: nose (2 wheels) + mains (4 wheels each), oleo struts, braces, axles, doors.
  const gy = JET.gearY
  const tyreN = tyreGeo(0.42, 0.24)
  const tyreM = tyreGeo(0.5, 0.36)
  const hubN = new CylinderGeometry(0.24, 0.24, 0.22, 12).rotateZ(Math.PI / 2)
  const hubM = new CylinderGeometry(0.28, 0.28, 0.34, 12).rotateZ(Math.PI / 2)
  const capN = new CylinderGeometry(0.1, 0.1, 0.26, 10).rotateZ(Math.PI / 2)
  const capM = new CylinderGeometry(0.12, 0.12, 0.38, 10).rotateZ(Math.PI / 2)
  const zn = JET.front + 0.4
  strut([0, -2.15, zn], [0, gy + 1.2, zn], 0.13, M.grey)
  strut([0, gy + 1.3, zn], [0, gy + 0.42, zn], 0.085, M.steel)
  strut([0, gy + 1.55, zn], [0, -2.2, zn + 1.3], 0.06, M.grey, 8)
  add(new BoxGeometry(0.06, 0.34, 0.2), M.grey, 0, gy + 0.85, zn + 0.12, 0.4, 0, 0) // torque link
  add(new CylinderGeometry(0.05, 0.05, 0.62, 8).rotateZ(Math.PI / 2), M.steel, 0, gy + 0.42, zn)
  for (const s of [-1, 1]) {
    add(tyreN, M.tyre, s * 0.26, gy + 0.42, zn)
    add(hubN, M.grey, s * 0.26, gy + 0.42, zn)
    add(capN, M.steel, s * 0.26, gy + 0.42, zn)
    add(rbox(0.04, 0.9, 1.6, 0.02, 1), M.white, s * 0.52, -2.65, zn + 0.3) // nose gear doors
  }
  add(rbox(0.16, 0.12, 0.12, 0.03, 1), M.steel, 0, gy + 1.0, zn + 0.16) // taxi light housing
  for (const s of [-1, 1]) {
    const x0 = s * 2.6
    const z0 = wz - 2.4
    strut([x0, gy + 1.3, z0], [x0, -1.3, z0], 0.17, M.grey, 12)
    strut([x0, gy + 0.55, z0], [x0, gy + 1.45, z0], 0.11, M.steel, 12)
    strut([x0, gy + 1.9, z0], [s * 1.5, -1.9, z0 + 0.2], 0.07, M.grey, 8) // side brace
    add(new BoxGeometry(0.07, 0.36, 0.24), M.grey, x0, gy + 1.05, z0 + 0.16, 0.35, 0, 0) // torque link
    add(rbox(0.18, 0.16, 1.5, 0.05, 1), M.grey, x0, gy + 0.5, z0) // bogie beam
    for (const dz of [-0.55, 0.55]) {
      add(new CylinderGeometry(0.06, 0.06, 0.95, 8).rotateZ(Math.PI / 2), M.steel, x0, gy + 0.5, z0 + dz)
      for (const dx of [-0.32, 0.32]) {
        add(tyreM, M.tyre, x0 + dx, gy + 0.5, z0 + dz)
        add(hubM, M.grey, x0 + dx, gy + 0.5, z0 + dz)
        add(capM, M.steel, x0 + dx, gy + 0.5, z0 + dz)
      }
    }
    add(rbox(0.06, 1.3, 1.5, 0.03, 1), M.white, s * 2.05, gy + 1.6, z0) // gear door
  }

  // Antennae (swept blades, top + belly).
  const blade = new Shape()
  blade.moveTo(0, 0)
  blade.lineTo(0.42, 0)
  blade.lineTo(0.12, 0.42)
  blade.lineTo(0.02, 0.42)
  blade.closePath()
  const bg = new ExtrudeGeometry(blade, { depth: 0.04, bevelEnabled: false })
  bg.rotateY(Math.PI / 2)
  bg.translate(-0.02, 0, 0)
  for (const z of [5, -4.5]) add(bg, M.dark, 0, R - 0.03, z + 0.2)
  for (const z of [7, -1]) add(bg, M.dark, 0, -R + 0.03, z + 0.2, Math.PI, 0, 0)

  // Painted side bands (windows, doors, name) on both sides.
  const sideL = new MeshStandardMaterial({ map: canvasTex(paintSide(false)), transparent: true, roughness: 0.3, metalness: 0.1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })
  const sideR = new MeshStandardMaterial({ map: canvasTex(paintSide(true)), transparent: true, roughness: 0.3, metalness: 0.1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })
  const bands = [
    [hullBandGeo(R + 0.02, JET.front + 1, JET.back - 1, -0.95, 0.75, 1), sideL],
    [hullBandGeo(R + 0.02, JET.back - 1, JET.front + 1, -0.95, 0.75, -1), sideR],
  ]

  // One fan (spinner + spiral + blades), baked; every jet instances it.
  const fan = new Group()
  const spinner = new Mesh(lathe([[0.35, 0], [0.34, 0.08], [0.27, 0.35], [0.14, 0.62], [0, 0.78]], 16).rotateX(Math.PI / 2), M.steel)
  spinner.position.z = -0.35
  fan.add(spinner)
  const spiral = new Mesh(new BoxGeometry(0.04, 0.3, 0.02), M.white)
  spiral.position.set(0.12, 0.08, 0.32)
  spiral.rotation.x = -0.6
  fan.add(spiral)
  const bladeGeo = new BoxGeometry(0.17, 0.62, 0.025)
  for (let i = 0; i < 20; i++) {
    const b = new Mesh(bladeGeo, M.fan)
    const a = (i / 20) * Math.PI * 2
    b.position.set(Math.sin(a) * 0.64, Math.cos(a) * 0.64, 0)
    b.rotation.set(0, 0.45, -a)
    fan.add(b)
  }

  // white parts -> the wing material's white block (one draw call for all white + wing skin)
  const whiteGeos = new Set()
  g.traverse((o) => {
    if (!o.isMesh || o.material !== M.white) return
    o.material = M.wing
    if (whiteGeos.has(o.geometry)) return
    whiteGeos.add(o.geometry)
    const uv = o.geometry.attributes.uv
    for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.5, WHITE_V)
  })
  return { body: bake(g, true), bands, fan: bake(fan, false), fanPos, engines }
}

export function makeJet() {
  proto ??= buildProto()
  const root = new Group()
  for (const m of proto.body.children) {
    const c = new Mesh(m.geometry, m.material)
    c.castShadow = true
    c.receiveShadow = true
    root.add(c)
  }
  for (const [geo, mat] of proto.bands) {
    const b = new Mesh(geo, mat)
    b.renderOrder = 2
    b.receiveShadow = true
    root.add(b)
  }
  const fans = []
  for (const [x, y, z] of proto.fanPos) {
    const f = new Group()
    for (const m of proto.fan.children) f.add(new Mesh(m.geometry, m.material))
    f.position.set(x, y, z)
    root.add(f)
    fans.push(f)
  }
  const engines = proto.engines.map((e) => [...e])

  // Lights: red beacons top + bottom, red / green wingtips, white tail strobe.
  const beacons = [glowSprite('#ff2a2a', 2.2), glowSprite('#ff2a2a', 2.2)]
  beacons[0].position.set(0, JET.r + 0.25, 2)
  beacons[1].position.set(0, -JET.r - 0.25, 1)
  const navL = glowSprite('#2aff5a', 2.4) // +X side is the left wing: green is right in real life, but
  const navR = glowSprite('#ff2a2a', 2.4) // the jet faces -X at the gate, so its +X wing is its right
  navL.position.set(JET.span, -1.25 + JET.span * 0.07, JET.wingZ - 5.2)
  navR.position.set(-JET.span, -1.25 + JET.span * 0.07, JET.wingZ - 5.2)
  const strobe = glowSprite('#ffffff', 3)
  strobe.position.set(0, 1.6, JET.back - 9.6)
  const landing = glowSprite('#fff6d8', 3.4)
  landing.position.set(0, JET.gearY + 1.6, JET.front - 0.9)
  root.add(...beacons, navL, navR, strobe, landing)

  let t = 0
  let spin = 0
  return {
    root,
    fans,
    engines,
    landing,
    // rpm 0..1 spins the fans; lights blink while powered.
    update(dt, rpm = 0, powered = true) {
      t += dt
      spin += dt * (2 + rpm * 38)
      for (const f of fans) f.rotation.z = spin * (rpm > 0.01 ? 1 : 0.05)
      const on = powered
      beacons[0].visible = beacons[1].visible = on && t % 1.1 < 0.12
      strobe.visible = on && t % 1.3 < 0.06
      navL.visible = navR.visible = on
      landing.visible = on && rpm > 0.2
    },
  }
}
