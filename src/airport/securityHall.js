// The security checkpoint hall (east of check-in, through the "security"
// doorway): queue carpet + stanchions, four checkpoint lanes (roller conveyor ->
// X-ray scanner with monitor -> walk-through metal detector -> search mat ->
// pick-up tables), railings between lanes, steel roof trusses, wall signs, the
// "checkpoint open :)" / "closed" lane signs and the doorway to the gates.
// Static parts are baked (one mesh per material); detector lights, scanner
// monitors, trays and the gate doors stay live.
import {
  BoxGeometry,
  CanvasTexture,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  PointLight,
  Shape,
  ShapeGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Float32BufferAttribute,
  Color,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { AIRPORT, SECURITY } from '../config.js'
import { bake } from '../bake.js'
import { lathe, nonIndexed, pole, rbox, roundRectShape, roundSlab } from '../detail.js'
import { neon, solidBox } from '../propkit.js'
import { RAPIER, addFixed } from '../physics.js'
import { add, fontTex, frameGeo, planeGlyph, stanchionKit } from './interior.js'
import { paintCarpet, paintGlass, paintHallFloor, paintPanels, paintSlabSign, tex } from './paint.js'

const Y = AIRPORT.walkY
const H = SECURITY.hall
const FONT = 'Fredoka, "Arial Rounded MT Bold", Arial, sans-serif'

function box(parent, w, h, d, mat, x, y, z, ry = 0) {
  const m = new Mesh(new BoxGeometry(w, h, d), mat)
  m.position.set(x, y, z)
  m.rotation.y = ry
  parent.add(m)
  return m
}
function plane(parent, w, h, mat, x, y, z, ry, tileX = 0, tileY = 0) {
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
function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}
// Rounded rectangle centred on (cx, cy) as a Shape (used for holes).
function rrShape(cx, cy, w, h, r) {
  const s = new Shape()
  const x = cx - w / 2
  const y = cy - h / 2
  s.moveTo(x + r, y)
  s.lineTo(x + w - r, y)
  s.quadraticCurveTo(x + w, y, x + w, y + r)
  s.lineTo(x + w, y + h - r)
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  s.lineTo(x + r, y + h)
  s.quadraticCurveTo(x, y + h, x, y + h - r)
  s.lineTo(x, y + r)
  s.quadraticCurveTo(x, y, x + r, y)
  return s
}

function paintHazard() {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#ffd21f'
  ctx.fillRect(0, 0, 256, 256)
  ctx.fillStyle = '#16171a'
  for (let i = -256; i < 512; i += 40) {
    ctx.beginPath()
    ctx.moveTo(i, 0)
    ctx.lineTo(i + 20, 0)
    ctx.lineTo(i + 20 + 256, 256)
    ctx.lineTo(i + 256, 256)
    ctx.fill()
  }
  // the inner mat: black rubber with a grip texture and two yellow footprints
  ctx.fillStyle = '#1b1d22'
  rrect(ctx, 38, 38, 180, 180, 10)
  ctx.fill()
  ctx.fillStyle = '#24272d'
  for (let y = 46; y < 212; y += 8) for (let x = 46 + ((y / 8) % 2) * 4; x < 212; x += 8) ctx.fillRect(x, y, 3, 3)
  ctx.fillStyle = '#ffd21f'
  for (const x of [104, 152]) {
    ctx.beginPath()
    ctx.ellipse(x, 140, 13, 22, 0, 0, 7)
    ctx.fill()
    ctx.beginPath()
    ctx.ellipse(x, 104, 10, 9, 0, 0, 7)
    ctx.fill()
  }
  return c
}
function paintXray() {
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 80
  const ctx = c.getContext('2d')
  ctx.font = '600 10px Fredoka, Arial'
  return { c, draw(t, alarm) {
    ctx.fillStyle = '#081832'
    ctx.fillRect(0, 0, 128, 80)
    ctx.fillStyle = 'rgba(80,180,255,0.18)'
    for (let x = 0; x < 128; x += 8) ctx.fillRect(x, 14, 1, 66)
    // a bag silhouette sliding across, with colour-coded "items" inside (organic / metal / plastic)
    const bx = ((t * 28) % 180) - 40
    ctx.fillStyle = 'rgba(120,200,255,0.32)'
    rrect(ctx, bx, 24, 54, 38, 7)
    ctx.fill()
    ctx.strokeStyle = 'rgba(170,225,255,0.9)'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.fillRect(bx + 20, 19, 14, 5)
    ctx.fillStyle = alarm ? '#ff4a4a' : '#ffa53a'
    rrect(ctx, bx + 6, 31, 15, 11, 3)
    ctx.fill()
    ctx.fillStyle = '#4d7dff'
    ctx.fillRect(bx + 26, 30, 4, 24)
    ctx.fillStyle = '#7cff9b'
    ctx.beginPath()
    ctx.ellipse(bx + 42, 48, 7, 9, 0, 0, 7)
    ctx.fill()
    ctx.fillStyle = 'rgba(160,230,255,0.5)'
    ctx.fillRect(((t * 60) % 140) - 6, 14, 2, 66) // scan line
    ctx.fillStyle = alarm ? '#d6232e' : '#17325e'
    ctx.fillRect(0, 0, 128, 14)
    ctx.fillStyle = '#ffffff'
    ctx.fillText(alarm ? 'CHECK' : 'SCAN', 4, 10)
    ctx.fillStyle = alarm ? '#ffd23d' : '#3dff7a'
    ctx.fillRect(116, 4, 7, 7)
  } }
}
function twoLineSign(a, b) {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 256
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#0d0f14'
  ctx.fillRect(0, 0, 512, 256)
  ctx.fillStyle = '#2f7bff'
  ctx.fillRect(0, 232, 512, 10)
  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'center'
  ctx.font = 'italic 600 64px Fredoka, Arial'
  ctx.fillText(a, 256, 112)
  ctx.font = 'italic 500 52px Fredoka, Arial'
  ctx.fillStyle = '#d6dcea'
  ctx.fillText(b, 256, 192)
  return c
}
function pillCanvas(text, top, bottom, edge) {
  const c = document.createElement('canvas')
  c.width = 1024
  c.height = 200
  const ctx = c.getContext('2d')
  const g = ctx.createLinearGradient(0, 0, 0, 200)
  g.addColorStop(0, top)
  g.addColorStop(1, bottom)
  ctx.fillStyle = edge
  ctx.fillRect(0, 0, 1024, 200)
  ctx.fillStyle = g
  ctx.fillRect(10, 10, 1004, 180)
  ctx.fillStyle = 'rgba(255,255,255,0.18)'
  ctx.fillRect(10, 10, 1004, 60)
  ctx.fillStyle = '#ffffff'
  ctx.font = 'italic 600 112px Fredoka, Arial'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 512, 104)
  return c
}
// Side label of the X-ray tunnel (same light grey as the housing).
function xrayDecalTex() {
  return fontTex(512, 128, (ctx, w, h) => {
    ctx.fillStyle = '#e4e8ef'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#2f6fe0'
    ctx.fillRect(0, h - 16, w, 10)
    // warning triangle
    ctx.fillStyle = '#ffc531'
    ctx.strokeStyle = '#1b1d22'
    ctx.lineWidth = 6
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(60, 14)
    ctx.lineTo(106, 96)
    ctx.lineTo(14, 96)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = '#1b1d22'
    ctx.fillRect(56, 42, 8, 30)
    ctx.fillRect(56, 78, 8, 8)
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#1e2433'
    ctx.font = `italic 700 58px ${FONT}`
    ctx.fillText('x-ray', 130, 46)
    ctx.fillStyle = '#5a6478'
    ctx.font = `500 26px ${FONT}`
    ctx.fillText('skyport security', 132, 92)
  })
}
// Metal detector pillar face: light inset panel with a walk-through pictogram and LED ticks.
function detectorPanelTex() {
  return fontTex(128, 512, (ctx, w, h) => {
    ctx.fillStyle = '#545b68'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#e9edf3'
    rrect(ctx, 10, 10, 108, 492, 14)
    ctx.fill()
    ctx.fillStyle = '#2f6fe0'
    rrect(ctx, 10, 10, 108, 70, 14)
    ctx.fill()
    ctx.fillRect(10, 50, 108, 30)
    planeGlyph(ctx, 64, 45, 48, '#ffffff')
    // walking figure
    ctx.fillStyle = '#2a3140'
    ctx.beginPath()
    ctx.arc(64, 150, 14, 0, 7)
    ctx.fill()
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#2a3140'
    ctx.lineWidth = 12
    ctx.beginPath()
    ctx.moveTo(64, 172)
    ctx.lineTo(60, 232)
    ctx.moveTo(60, 232)
    ctx.lineTo(42, 286)
    ctx.moveTo(60, 232)
    ctx.lineTo(80, 284)
    ctx.moveTo(62, 186)
    ctx.lineTo(40, 216)
    ctx.moveTo(62, 186)
    ctx.lineTo(86, 210)
    ctx.stroke()
    // arrow
    ctx.fillStyle = '#3fbf5a'
    ctx.beginPath()
    ctx.moveTo(30, 318)
    ctx.lineTo(80, 318)
    ctx.lineTo(80, 304)
    ctx.lineTo(102, 330)
    ctx.lineTo(80, 356)
    ctx.lineTo(80, 342)
    ctx.lineTo(30, 342)
    ctx.closePath()
    ctx.fill()
    // zone LEDs
    for (let i = 0; i < 9; i++) {
      ctx.fillStyle = i < 6 ? '#3a4152' : '#5a6478'
      rrect(ctx, 30, 380 + i * 12, 68, 7, 3)
      ctx.fill()
    }
  }, { aniso: 4 })
}
// Operator console: buttons, a trackball and a joystick.
function controlsTex() {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#23272f'
  ctx.fillRect(0, 0, 128, 128)
  const cols = ['#e8434f', '#3dff7a', '#ffc531', '#4fb8ff']
  for (let r = 0; r < 3; r++) for (let k = 0; k < 4; k++) {
    ctx.fillStyle = cols[(r + k) % 4]
    rrect(ctx, 10 + k * 18, 12 + r * 16, 13, 10, 3)
    ctx.fill()
  }
  ctx.fillStyle = '#0f1115'
  ctx.beginPath()
  ctx.arc(96, 32, 18, 0, 7)
  ctx.fill()
  ctx.fillStyle = '#7d8796'
  ctx.beginPath()
  ctx.arc(93, 29, 11, 0, 7)
  ctx.fill()
  ctx.fillStyle = '#3a4152'
  rrect(ctx, 10, 72, 108, 44, 6)
  ctx.fill()
  ctx.fillStyle = '#4fb8ff'
  for (let k = 0; k < 6; k++) ctx.fillRect(16 + k * 17, 80, 12, 4)
  return tex(c, { aniso: 2 })
}

// X-ray housing cross-section (Z across the conveyor, Y up): rounded top, tunnel hole for the trays.
function xrayProfile(pad) {
  const W = 0.75 + pad
  const T = 2.1 + pad
  const R = 0.4 + pad
  const s = new Shape()
  s.moveTo(-W, -pad)
  s.lineTo(W, -pad)
  s.lineTo(W, T - R)
  s.quadraticCurveTo(W, T, W - R, T)
  s.lineTo(-W + R, T)
  s.quadraticCurveTo(-W, T, -W, T - R)
  s.closePath()
  s.holes.push(rrShape(0, 1.04, 1.04, 0.72, 0.07))
  return s
}
// Extruded along X, centred on the origin.
function xrayExtrude(pad, length, bevel) {
  return new ExtrudeGeometry(xrayProfile(pad), { depth: length, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 8 })
    .translate(0, 0, -length / 2)
    .rotateY(Math.PI / 2)
}

// A security tray: tapered walls with rounded corners (so a stack nests) and a floor. Bottom at y = 0.
function trayGeometry() {
  const outer = roundRectShape(0.6, 0.42, 0.06)
  outer.holes.push(roundRectShape(0.55, 0.37, 0.04))
  const wall = new ExtrudeGeometry(outer, { depth: 0.1, bevelEnabled: false, curveSegments: 3 }).rotateX(-Math.PI / 2)
  const p = wall.attributes.position
  for (let i = 0; i < p.count; i++) {
    const k = 1 + p.getY(i) * 0.9
    p.setXYZ(i, p.getX(i) * k, p.getY(i), p.getZ(i) * k)
  }
  wall.computeVertexNormals()
  const floor = new ShapeGeometry(roundRectShape(0.56, 0.38, 0.04), 3).rotateX(-Math.PI / 2).translate(0, 0.012, 0)
  const geos = [nonIndexed(wall), nonIndexed(floor)]
  for (const g of geos) g.clearGroups()
  return mergeGeometries(geos)
}
// The bits in a tray (a pouch, a phone, a water bottle), merged into one vertex-coloured mesh.
const ITEM_COLORS = ['#2b2f3a', '#e8434f', '#5cc4ff', '#ffc531', '#7cff6b']
function trayItems(floorY) {
  const tint = (g, hex) => {
    g = nonIndexed(g)
    const c = new Color(hex)
    const a = new Float32Array(g.attributes.position.count * 3)
    for (let i = 0; i < a.length; i += 3) {
      a[i] = c.r
      a[i + 1] = c.g
      a[i + 2] = c.b
    }
    g.setAttribute('color', new Float32BufferAttribute(a, 3))
    g.clearGroups()
    return g
  }
  const pick = () => ITEM_COLORS[Math.floor(Math.random() * ITEM_COLORS.length)]
  const z = () => (Math.random() - 0.5) * 0.12
  return mergeGeometries([
    tint(rbox(0.15, 0.07, 0.12, 0.025, 1).translate(-0.16, floorY + 0.035, z()), pick()),
    tint(rbox(0.08, 0.016, 0.15, 0.006, 1).rotateY(0.3).translate(0, floorY + 0.008, z()), '#1b1d22'),
    tint(new CylinderGeometry(0.032, 0.032, 0.17, 8).rotateZ(Math.PI / 2).rotateY(0.4).translate(0.16, floorY + 0.032, z()), pick()),
  ])
}

export function buildSecurityHall(scene, { makeArrow, pillSign }) {
  const S = new Group()
  const kit = stanchionKit()
  const floorTex = paintHallFloor()
  const M = {
    floor: new MeshStandardMaterial({ map: tex(floorTex.color), normalMap: tex(floorTex.normal, { srgb: false }), roughness: 0.18 }),
    carpet: new MeshStandardMaterial({ map: tex(paintCarpet()), roughness: 0.95 }),
    panels: new MeshStandardMaterial({ map: tex(paintPanels()), roughness: 0.55, metalness: 0.15 }),
    glass: new MeshStandardMaterial({ map: tex(paintGlass(23)), emissiveMap: tex(paintGlass(23)), emissive: '#ffffff', emissiveIntensity: 0.6, roughness: 0.1 }),
    white: new MeshStandardMaterial({ color: '#f6f7fa', roughness: 0.4 }),
    black: new MeshStandardMaterial({ color: '#15171c', roughness: 0.3, metalness: 0.5 }),
    machine: new MeshStandardMaterial({ color: '#4a505c', roughness: 0.45, metalness: 0.4 }),
    machineDark: new MeshStandardMaterial({ color: '#2a2e36', roughness: 0.5, metalness: 0.3 }),
    housing: new MeshStandardMaterial({ color: '#e4e8ef', roughness: 0.35, metalness: 0.05 }),
    accent: new MeshStandardMaterial({ color: '#2f6fe0', roughness: 0.3, metalness: 0.15 }),
    yellow: new MeshStandardMaterial({ color: '#ffc531', roughness: 0.5 }),
    steel: new MeshStandardMaterial({ color: '#c3c9d3', roughness: 0.22, metalness: 0.9 }),
    roller: new MeshStandardMaterial({ color: '#e8ebf0', roughness: 0.3, metalness: 0.6 }),
    rubber: new MeshStandardMaterial({ color: '#202227', roughness: 0.9 }),
    hazard: new MeshStandardMaterial({ map: tex(paintHazard()), roughness: 0.8 }),
    light: neon('#f4fbff', 2.4),
    beaconOn: neon('#3dff7a', 2.2),
    beaconOff: neon('#ff3b3b', 2.2),
    tray: new MeshStandardMaterial({ color: '#7d8796', roughness: 0.5 }),
    items: new MeshStandardMaterial({ vertexColors: true, roughness: 0.5 }),
    decal: new MeshStandardMaterial({ map: xrayDecalTex(), roughness: 0.35 }),
    detPanel: new MeshStandardMaterial({ map: detectorPanelTex(), roughness: 0.4 }),
    controls: new MeshStandardMaterial({ map: controlsTex(), roughness: 0.5 }),
    frame: new MeshStandardMaterial({ color: '#111318', roughness: 0.35, metalness: 0.4 }),
  }

  // --- Shell -------------------------------------------------------------------------------------
  const w = H.x1 - H.x0
  const d = H.z0 - H.z1
  const cx = (H.x0 + H.x1) / 2
  const cz = (H.z0 + H.z1) / 2
  plane(S, w, d, M.floor, cx, Y + 0.004, cz, 0, 3, 3).rotation.x = -Math.PI / 2
  const carpet = plane(S, 25.6, 15.2, M.carpet, 46, Y + 0.012, -24.2, 0, 2, 2)
  carpet.rotation.x = -Math.PI / 2
  const door = SECURITY.door
  const g = SECURITY.gates
  // Walls: lower navy panels, blue glass above (front wall too, so the hall reads as indoors).
  const wallZ = (x0, x1, z, ry) => {
    plane(S, x1 - x0, 6, M.panels, (x0 + x1) / 2, Y + 3, z, ry, 6, 6)
    plane(S, x1 - x0, 7, M.glass, (x0 + x1) / 2, Y + 9.5, z, ry, 4, 4.4)
    box(S, x1 - x0, 0.16, 0.05, M.black, (x0 + x1) / 2, Y + 0.08, z + Math.cos(ry) * 0.025) // skirting
  }
  wallZ(H.x0, H.x1, H.z0 - 0.4, Math.PI)
  wallZ(H.x0, H.x1, H.z1 + 0.01, 0)
  solidBox(w / 2, 8, 0.4, cx, 8, H.z1 - 0.3)
  solidBox(w / 2, 8, 0.4, cx, 8, H.z0 - 0.6)
  // West wall (shared with check-in): its security-side face, around the doorway.
  const wallX = (x, ry, holeZ) => {
    const a = H.z0
    const b = H.z1
    const lo = holeZ - 2.6
    const hi = holeZ + 2.6
    for (const [z0, z1] of [[hi, a], [b, lo]]) {
      plane(S, z1 - z0, 6, M.panels, x, Y + 3, (z0 + z1) / 2, ry, 6, 6)
      if (ry < 0) solidBox(0.5, 8, (z1 - z0) / 2, x + 0.5, 8, (z0 + z1) / 2)
    }
    plane(S, 5.2, 6 - 4.6, M.panels, x, Y + 4.6 + 0.7, holeZ, ry, 6, 6)
    plane(S, a - b, 7, M.glass, x, Y + 9.5, (a + b) / 2, ry, 4, 4.4)
  }
  wallX(H.x0 + 0.02, Math.PI / 2, door.z)
  wallX(H.x1 - 0.02, -Math.PI / 2, g.z)
  // Doorway frames (rounded) with a sensor over each.
  const jamb = rbox(0.6, 4.6, 0.3, 0.06, 1)
  const header = rbox(0.6, 0.4, 5.5, 0.06, 1)
  for (const [x, z] of [[H.x0, door.z], [H.x1, g.z]]) {
    for (const s of [-1, 1]) add(S, jamb, M.black, x, Y + 2.3, z + s * 2.6)
    add(S, header, M.black, x, Y + 4.6, z)
  }
  add(S, rbox(0.12, 0.1, 0.5, 0.03, 1), M.machine, H.x1 - 0.36, Y + 4.32, g.z)
  // Gates doors: two framed sliding glass panels (boarding.js opens them once you've cleared security).
  const gateGlass = new MeshStandardMaterial({ color: '#7fb6ff', roughness: 0.05, transparent: true, opacity: 0.5, depthWrite: false })
  const gateDoor = { panels: [], collider: addFixed(RAPIER.ColliderDesc.cuboid(0.15, 2.1, 2.6), { x: H.x1 - 0.2, y: Y + 2.1, z: g.z }) }
  {
    const stile = rbox(0.1, 4.2, 0.08, 0.03, 1)
    const rail = rbox(0.1, 0.12, 2.5, 0.03, 1)
    const pull = pole(0.018, -0.45, 0.45, 8)
    for (const s of [-1, 1]) {
      const p = new Group()
      box(p, 0.06, 4.2, 2.5, gateGlass, 0, 0, 0)
      for (const e of [-1, 1]) add(p, stile, M.frame, 0, 0, e * 1.21)
      add(p, rail, M.frame, 0, 2.04, 0)
      add(p, rail, M.frame, 0, -2.04, 0)
      for (const e of [-1, 1]) add(p, pull, kit.mats.chrome, e * 0.07, 0, -s * 1.0)
      const panel = bake(p, false)
      panel.position.set(H.x1 - 0.1, Y + 2.1, g.z + s * 1.25)
      panel.userData.s = s
      scene.add(panel)
      gateDoor.panels.push(panel)
    }
  }
  // Columns + steel trusses + hanging lights.
  const column = rbox(0.8, 13, 0.8, 0.1, 1)
  const plinth = rbox(0.98, 0.26, 0.98, 0.04, 1)
  for (let x = H.x0 + 8; x < H.x1; x += 10) {
    for (const z of [H.z0 - 1, H.z1 + 0.6]) {
      add(S, column, M.white, x, Y + 6.5, z)
      add(S, plinth, M.machineDark, x, Y + 0.13, z)
    }
    box(S, 0.35, 0.5, d, M.white, x, Y + 12.4, cz)
    box(S, 0.25, 0.25, d, M.white, x, Y + 10.9, cz)
    for (let z = H.z1 + 2; z < H.z0 - 2; z += 3.2) {
      const diag = box(S, 0.14, 1.9, 0.14, M.white, x, Y + 11.65, z)
      diag.rotation.x = (Math.round((z - H.z1) / 3.2) % 2 ? 1 : -1) * 0.75
    }
  }
  for (let z = H.z1 + 3; z < H.z0; z += 6) box(S, w, 0.2, 0.2, M.white, cx, Y + 12.6, z)
  const barHousing = rbox(0.34, 0.12, 5.1, 0.045, 1)
  const barLight = new BoxGeometry(0.22, 0.03, 4.9)
  const wire = pole(0.008, 0, 1.75, 4)
  for (let x = H.x0 + 4; x < H.x1 - 2; x += 9) for (let z = -16; z > H.z1; z -= 8) {
    const b = new Group()
    b.position.set(x, Y + 10.6, z)
    b.rotation.y = 0.5
    S.add(b)
    add(b, barHousing, M.white, 0, 0.07, 0)
    add(b, barLight, M.light, 0, 0, 0)
    for (const s of [-1, 1]) add(b, wire, kit.mats.chrome, 0, 0.13, s * 2)
  }

  // --- Queue stanchions (match SECURITY.path) -----------------------------------------------------
  const seen = new Set()
  const belt = (x0, z0, x1, z1) => {
    kit.run(S, x0, z0, x1, z1, Y, seen)
    solidBox(Math.abs(x1 - x0) / 2 + 0.05, 0.6, Math.abs(z1 - z0) / 2 + 0.05, (x0 + x1) / 2, Y + 0.6, (z0 + z1) / 2)
  }
  const { W, E, z: lz } = SECURITY.lanes
  const mid = (i) => (lz[i] + lz[i + 1]) / 2
  // Outer south boundary (gap at the west end to walk in), north boundary (gap at the east end to leave).
  belt(W + 1.3, lz[0] - 1.25, E + 1.5, lz[0] - 1.25)
  belt(W - 1.5, lz[4] + 1.25, E - 1.3, lz[4] + 1.25)
  for (let i = 0; i < 4; i++) {
    const turnEast = i % 2 === 0
    if (turnEast) belt(W - 1.5, mid(i), E - 1.25, mid(i))
    else belt(W + 1.25, mid(i), E + 1.5, mid(i))
  }
  belt(W - 1.5, mid(0), W - 1.5, lz[4] + 1.25)
  belt(E + 1.5, lz[0] - 1.25, E + 1.5, mid(3))

  // Black tube railing from x0 to x1 at z: top + mid rail, round posts on foot discs.
  const postG = pole(0.03, 0.02, 1.05, 8)
  const footG = new CylinderGeometry(0.07, 0.085, 0.03, 10).translate(0, 0.015, 0)
  const capG = new CylinderGeometry(0.042, 0.042, 0.03, 8)
  const railing = (x0, x1, z, n) => {
    const L = x1 - x0
    add(S, new CylinderGeometry(0.032, 0.032, L, 8, 1, true).rotateZ(Math.PI / 2), M.black, (x0 + x1) / 2, Y + 1.05, z)
    add(S, new CylinderGeometry(0.022, 0.022, L, 6, 1, true).rotateZ(Math.PI / 2), M.black, (x0 + x1) / 2, Y + 0.55, z)
    for (let k = 0; k <= n; k++) {
      const x = x0 + (L * k) / n
      add(S, postG, M.black, x, Y, z)
      add(S, footG, M.machineDark, x, Y, z)
      add(S, capG, M.black, x, Y + 1.06, z)
    }
    solidBox(L / 2, 0.6, 0.08, (x0 + x1) / 2, Y + 0.6, z)
  }

  // --- Checkpoint lanes ------------------------------------------------------------------------
  const wallSignLater = []
  const lanes = []
  const X = SECURITY
  const DX = X.detectorX
  // Shared lane parts.
  const rollerG = new CylinderGeometry(0.045, 0.045, 0.8, 10, 1, true).rotateX(Math.PI / 2)
  const legG = new BoxGeometry(0.06, 0.8, 0.06)
  const braceG = new BoxGeometry(0.04, 0.04, 0.84)
  const padG = rbox(0.12, 0.03, 0.12, 0.012, 1)
  const stopG = rbox(0.06, 0.1, 0.84, 0.02, 1)
  const sections = [[59.6, 64.2], [69.4, X.trayEndX + 0.4]].map(([x0, x1]) => ({ x0, x1, chan: rbox(x1 - x0, 0.12, 0.08, 0.025, 1) }))
  const trayG = trayGeometry()
  const xBody = xrayExtrude(0, 4.6, 0.03)
  const xCollar = xrayExtrude(0.06, 0.16, 0.02)
  const xSkirt = rbox(4.5, 0.12, 1.62, 0.03, 1)
  const xBelt = new BoxGeometry(4.6, 0.19, 0.96)
  const xLinerTop = new PlaneGeometry(4.6, 0.98).rotateX(Math.PI / 2)
  const xLinerSide = new PlaneGeometry(4.6, 0.66)
  const xDecal = new PlaneGeometry(2.6, 0.65)
  const xCurtain = new BoxGeometry(0.015, 0.6, 0.15)
  const beaconG = lathe([[0.09, 0], [0.09, 0.04], [0.07, 0.1], [0.035, 0.13], [0, 0.14]], 10)
  const consoleBase = roundSlab(0.5, 0.5, 0.04, 0.08, 0.01)
  const consoleCol = rbox(0.14, 0.95, 0.14, 0.03, 1)
  const consolePanel = rbox(0.36, 0.05, 0.5, 0.015, 1)
  const consoleKeys = new PlaneGeometry(0.32, 0.46).rotateX(-Math.PI / 2)
  const monNeck = pole(0.022, 1.0, 1.36, 8)
  const monBody = rbox(0.08, 0.56, 0.82, 0.02, 1)
  const pillarG = rbox(0.24, 2.3, 0.55, 0.05, 1)
  const pillarFoot = rbox(0.5, 0.06, 0.72, 0.02, 1)
  const pillarFace = new PlaneGeometry(0.4, 1.7)
  const headerG = rbox(0.5, 0.36, 2.34, 0.07, 1)
  for (const cp of SECURITY.checkpoints) {
    const z = cp.z
    const bz = z + 2.1 // conveyor line beside the walkway
    // Roller conveyor (feed + exit): C-channel frames, individual rollers, braced legs, an end stop.
    for (const sct of sections) {
      const { x0, x1 } = sct
      const mx = (x0 + x1) / 2
      for (const s of [-1, 1]) add(S, sct.chan, M.steel, mx, Y + 0.84, bz + s * 0.44)
      for (let x = x0 + 0.2; x < x1; x += 0.28) add(S, rollerG, M.roller, x, Y + 0.845, bz)
      for (const x of [x0 + 0.2, mx, x1 - 0.2]) {
        for (const s of [-1, 1]) {
          add(S, legG, M.steel, x, Y + 0.4, bz + s * 0.42)
          add(S, padG, M.machineDark, x, Y + 0.015, bz + s * 0.42)
        }
        add(S, braceG, M.steel, x, Y + 0.25, bz)
      }
      if (x0 > 66) add(S, stopG, M.yellow, x1 - 0.04, Y + 0.93, bz)
      solidBox((x1 - x0) / 2, 0.45, 0.5, mx, Y + 0.45, bz)
    }
    // A stack of spare trays at the start of the rollers (tapered, so they nest).
    for (let k = 0; k < 6; k++) add(S, trayG, M.tray, 59.95, Y + 0.895 + k * 0.055, bz)
    // X-ray scanner: curved housing with a tunnel, blue collars, lead curtains, belt, side labels, beacon.
    add(S, xBody, M.housing, 66.8, Y, bz)
    for (const ex of [64.5, 69.1]) {
      add(S, xCollar, M.accent, ex, Y, bz)
      for (let k = 0; k < 6; k++) add(S, xCurtain, M.rubber, ex, Y + 1.04, bz - 0.4 + k * 0.16)
    }
    add(S, xSkirt, M.machineDark, 66.8, Y + 0.06, bz)
    add(S, xBelt, M.rubber, 66.8, Y + 0.805, bz)
    add(S, xLinerTop, M.black, 66.8, Y + 1.365, bz)
    for (const s of [-1, 1]) {
      add(S, xLinerSide, M.black, 66.8, Y + 1.04, bz + s * 0.485, s > 0 ? Math.PI : 0)
      add(S, xDecal, M.decal, 66.8, Y + 1.55, bz + s * 0.786, s > 0 ? 0 : Math.PI)
    }
    add(S, beaconG, cp.open ? M.beaconOn : M.beaconOff, 68.7, Y + 2.13, bz)
    solidBox(2.4, 1.2, 0.8, 66.8, Y + 1.1, bz)
    // Operator console with a control panel and the live monitor on a neck.
    const oz = bz + 1.15
    add(S, consoleBase, M.machineDark, 65.2, Y + 0.02, oz)
    add(S, consoleCol, M.machine, 65.2, Y + 0.5, oz)
    const cg = new Group()
    cg.position.set(65.2, Y + 1.0, oz)
    cg.rotation.z = 0.35
    S.add(cg)
    add(cg, consolePanel, M.machineDark)
    add(cg, consoleKeys, M.controls, 0, 0.026, 0)
    add(S, monNeck, M.black, 65.3, Y, oz)
    add(S, monBody, M.black, 65.25, Y + 1.6, oz)
    const xr = paintXray()
    xr.draw(0, false)
    const xt = new CanvasTexture(xr.c)
    xt.colorSpace = SRGBColorSpace
    const screen = new Mesh(new PlaneGeometry(0.74, 0.5).rotateY(-Math.PI / 2), new MeshStandardMaterial({ map: xt, emissiveMap: xt, emissive: '#ffffff', emissiveIntensity: 1.2 }))
    screen.position.set(65.25 - 0.041, Y + 1.6, oz)
    scene.add(screen)
    // Walk-through metal detector: two pillars on feet with printed panels, a header with the status lights.
    for (const s of [-1, 1]) {
      add(S, pillarG, M.machine, DX, Y + 1.17, z + s * 1.0)
      add(S, pillarFoot, M.machineDark, DX, Y + 0.03, z + s * 1.0)
      add(S, pillarFace, M.detPanel, DX - 0.121, Y + 1.25, z + s * 1.0, -Math.PI / 2)
      add(S, pillarFace, M.detPanel, DX + 0.121, Y + 1.25, z + s * 1.0, Math.PI / 2)
    }
    add(S, headerG, M.housing, DX, Y + 2.5, z)
    for (const s of [-1, 1]) solidBox(0.14, 1.2, 0.15, DX, Y + 1.2, z + s * 1.0)
    // Status lamp + LED strips down the inside of both pillars share one live material (green / dim).
    const lightMat = new MeshStandardMaterial({ color: '#0a2a10', emissive: cp.open ? '#2aff5a' : '#ff2a2a', emissiveIntensity: cp.open ? 1.6 : 0.6 })
    const lampGeo = mergeGeometries([
      new BoxGeometry(0.52, 0.16, 0.6).translate(0, 0, -0.5),
      new BoxGeometry(0.06, 1.7, 0.02).translate(0.02, -1.3, -0.72),
      new BoxGeometry(0.06, 1.7, 0.02).translate(0.02, -1.3, 0.72),
    ])
    const lamp = new Mesh(lampGeo, lightMat)
    lamp.position.set(DX - 0.02, Y + 2.5, z)
    scene.add(lamp)
    const lamp2 = new Mesh(new BoxGeometry(0.52, 0.16, 0.4), new MeshStandardMaterial({ color: '#2a0a0a', emissive: '#ff2a2a', emissiveIntensity: 0.25 }))
    lamp2.position.set(DX - 0.02, Y + 2.5, z + 0.5)
    scene.add(lamp2)
    // Lane railings (black tube fence) on both sides, from the trays to the search zone.
    for (const s of [-1, 1]) railing(61.5, X.laneEndX, z + s * 3.6, 5)
    if (!cp.open) {
      // Closed lane: red rope across the entrance.
      for (const s of [-1, 1]) kit.post(S, 61.2, Y, z - 0.4 + s * 1.5)
      kit.rope(S, 61.2, z - 1.9, 61.2, z + 1.1, Y)
      solidBox(0.1, 0.6, 1.6, 61.2, Y + 0.6, z - 0.4)
    }
    // Lane sign above: "checkpoint open :)" (green) or "closed" (red), facing the queue (-X), on two rods.
    const pc = cp.open ? pillCanvas('checkpoint open :)', '#5cf06a', '#22b52c', '#0e5a12') : pillCanvas('closed', '#ff5a5a', '#d6232e', '#6a0a10')
    const pt = new CanvasTexture(pc)
    pt.colorSpace = SRGBColorSpace
    const sg = new Group()
    sg.position.set(62, Y + 8.4, z)
    sg.rotation.z = 0.12
    S.add(sg)
    add(sg, rbox(0.18, 1.56, 7.16, 0.08, 1), M.frame)
    add(sg, new PlaneGeometry(7, 1.4).rotateY(-Math.PI / 2), new MeshStandardMaterial({ map: pt, emissiveMap: pt, emissive: '#ffffff', emissiveIntensity: 0.55 }), -0.091, 0, 0)
    const rod = pole(0.02, Y + 9.1, Y + 12.3, 6)
    for (const s of [-1, 1]) add(S, rod, kit.mats.chrome, 61.92, 0, z + s * 2.8)
    lanes.push({ ...cp, bz, lightMat, lamp2: lamp2.material, xr, xt, busy: false, alarmT: 0 })
  }

  // --- Body search area: mats with hazard borders, a table for your bag, a bin, railings between rows.
  const mats = []
  const matBase = roundSlab(2.8, 2.8, 0.06, 0.16, 0.015)
  const matTop = new PlaneGeometry(2.7, 2.7).rotateX(-Math.PI / 2)
  const tableTop = roundSlab(2.2, 1.0, 0.06, 0.08, 0.015)
  const tableShelf = roundSlab(2.1, 0.9, 0.03, 0.06, 0.008)
  const tableLeg = pole(0.03, 0.02, 0.84, 8)
  const binG = lathe([[0, 0], [0.28, 0], [0.31, 0.03], [0.33, 0.68], [0.35, 0.7], [0.35, 0.76], [0.31, 0.76], [0.3, 0.72], [0, 0.72]], 14)
  const binBand = new CylinderGeometry(0.334, 0.334, 0.08, 14, 1, true)
  for (const [mx, mz] of X.mats) {
    add(S, matBase, M.rubber, mx, Y + 0.03, mz)
    add(S, matTop, M.hazard, mx, Y + 0.062, mz)
    const tz = mz + 2.35
    add(S, tableTop, M.white, mx, Y + 0.86, tz)
    add(S, tableShelf, M.white, mx, Y + 0.3, tz)
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      add(S, tableLeg, M.steel, mx + sx * 1.0, Y, tz + sz * 0.42)
      add(S, padG, M.machineDark, mx + sx * 1.0, Y + 0.015, tz + sz * 0.42)
    }
    solidBox(1.1, 0.45, 0.5, mx, Y + 0.45, tz)
    add(S, binG, M.machineDark, mx + 1.75, Y, tz + 0.1)
    add(S, binBand, M.yellow, mx + 1.75, Y + 0.5, tz + 0.1)
    solidBox(0.32, 0.4, 0.32, mx + 1.75, Y + 0.4, tz + 0.1)
    mats.push({ x: mx, z: mz, table: { x: mx, y: Y + 0.9, z: tz }, bin: { x: mx + 1.75, y: Y + 0.8, z: tz + 0.1 }, post: { x: mx + 1.9, z: mz }, busy: false })
  }
  const rows = [...new Set(X.mats.map((m) => m[1]))].sort((a, b) => b - a)
  const rx0 = 76.4 // leaves the walkway at x ~75 clear
  const rx1 = 88.2
  for (let i = 0; i < rows.length; i++) {
    // A railing between this row and the next (and one behind the last row).
    const rz = i < rows.length - 1 ? (rows[i] + rows[i + 1]) / 2 : rows[i] - 4
    railing(rx0, rx1, rz, 7)
  }
  wallSignLater.push(['random checks', 'happen to everyone', 81, Y + 4.4, H.z0 - 0.45, Math.PI])

  // Wall signs: printed face in a rounded black frame.
  function wallSign(a, b, x, y, z, ry, sw = 4.2) {
    const t = new CanvasTexture(twoLineSign(a, b))
    t.colorSpace = SRGBColorSpace
    const nx = Math.sin(ry)
    const nz = Math.cos(ry)
    add(S, rbox(sw + 0.16, sw / 2 + 0.16, 0.05, 0.07, 1), M.frame, x - nx * 0.022, y, z - nz * 0.022, ry)
    add(S, new PlaneGeometry(sw, sw / 2), new MeshStandardMaterial({ map: t, emissiveMap: t, emissive: '#ffffff', emissiveIntensity: 0.35 }), x + nx * 0.006, y, z + nz * 0.006, ry)
  }
  for (const ws of wallSignLater) wallSign(...ws)
  wallSign('liquids over 100ml?', 'not today :)', 44, Y + 4.4, H.z1 + 0.05, 0)
  wallSign('random checks', 'happen to everyone', 62, Y + 4.4, H.z1 + 0.05, 0)
  wallSign('boarding soon', 'keep moving :)', 82, Y + 4.4, H.z1 + 0.05, 0)
  wallSign('security', 'have your pass ready', 40, Y + 4.4, H.z0 - 0.45, Math.PI)
  const slab = (text, sw, sh, x, y, z, ry) => {
    const t = tex(paintSlabSign(text))
    const nx = Math.sin(ry)
    const nz = Math.cos(ry)
    add(S, rbox(sw + 0.14, sh + 0.14, 0.05, 0.07, 1), M.frame, x - nx * 0.022, y, z - nz * 0.022, ry)
    add(S, new PlaneGeometry(sw, sh), new MeshStandardMaterial({ map: t, emissiveMap: t, emissive: '#ffffff', emissiveIntensity: 0.45 }), x + nx * 0.006, y, z + nz * 0.006, ry)
  }
  slab('gates', 5, 1.25, H.x1 - 0.5, Y + 6, g.z, -Math.PI / 2)
  slab('security', 5, 1.25, H.x0 + 0.5, Y + 6, door.z, Math.PI / 2)

  const baked = bake(S, false)
  const shadowMats = new Set([M.machine, M.black, M.white, M.steel, M.housing, M.machineDark, M.tray, kit.mats.base, kit.mats.head])
  baked.traverse((o) => {
    if (!o.isMesh) return
    o.receiveShadow = true
    o.castShadow = shadowMats.has(o.material)
  })
  scene.add(baked)

  // --- Live bits: trays, queue marker, wait timer --------------------------------------------------
  const trays = Array.from({ length: 10 }, () => {
    const t = new Group()
    const body = new Mesh(trayG, M.tray)
    body.position.y = -0.05 // bottom on the rollers when the group sits at the tray line
    t.add(body)
    // `items` keeps its array shape (security.js hides them when your bag rides instead): one merged mesh.
    const it = new Mesh(trayItems(-0.038), M.items)
    t.add(it)
    const items = [it]
    const bagSlot = new Group()
    bagSlot.position.set(0, 0.28, 0)
    t.add(bagSlot)
    t.visible = false
    t.traverse((o) => o.isMesh && (o.castShadow = true))
    scene.add(t)
    return { g: t, lane: null, phase: 'off', t: 0, bagSlot, items }
  })

  // Search time left, floating over each busy mat.
  const timerSprite = (w = 1.6) => {
    const c = document.createElement('canvas')
    c.width = 256
    c.height = 96
    const tx = new CanvasTexture(c)
    tx.colorSpace = SRGBColorSpace
    const sp = new Sprite(new SpriteMaterial({ map: tx, transparent: true, depthWrite: false }))
    sp.scale.set(w, w * 0.375, 1)
    sp.renderOrder = 12
    sp.visible = false
    scene.add(sp)
    let last = ''
    return {
      sp,
      set(sec) {
        if (sec == null) {
          sp.visible = false
          return
        }
        sp.visible = true
        const txt = `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`
        if (txt === last) return
        last = txt
        const ctx = c.getContext('2d')
        ctx.clearRect(0, 0, 256, 96)
        ctx.font = '700 72px Fredoka, Arial'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.lineWidth = 12
        ctx.strokeStyle = '#14213d'
        ctx.strokeText(txt, 128, 52)
        ctx.fillStyle = '#ffffff'
        ctx.fillText(txt, 128, 52)
        tx.needsUpdate = true
      },
    }
  }
  for (const m of mats) {
    m.timer = timerSprite()
    m.timer.sp.position.set(m.x, Y + 3.3, m.z)
  }

  // One red light that pulses over whichever detector is alarming (always in the scene, so no shader rebuilds).
  const alarmLight = new PointLight('#ff2020', 0, 14, 2)
  alarmLight.position.set(X.detectorX, Y + 3, -24)
  scene.add(alarmLight)

  const marker = new Group()
  const arrow = makeArrow()
  arrow.position.y = 2.3
  const ms = pillSign('QUEUE HERE')
  ms.position.y = 4.3
  marker.add(arrow, ms)
  const jz = SECURITY.joinZone
  marker.position.set((jz.x0 + jz.x1) / 2, Y, (jz.z0 + jz.z1) / 2)
  marker.visible = false
  scene.add(marker)

  const timerCanvas = document.createElement('canvas')
  timerCanvas.width = 256
  timerCanvas.height = 96
  const timerTex = new CanvasTexture(timerCanvas)
  timerTex.colorSpace = SRGBColorSpace
  const timer = new Sprite(new SpriteMaterial({ map: timerTex, transparent: true, depthWrite: false }))
  timer.scale.set(2.4, 0.9, 1)
  timer.position.set(56, Y + 3.2, -18.5)
  timer.renderOrder = 12
  scene.add(timer)
  let lastTimer = ''
  function setTimer(sec) {
    const txt = `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`
    if (txt === lastTimer) return
    lastTimer = txt
    const ctx = timerCanvas.getContext('2d')
    ctx.clearRect(0, 0, 256, 96)
    ctx.font = '700 72px Fredoka, Arial'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineWidth = 12
    ctx.strokeStyle = '#14213d'
    ctx.strokeText(txt, 128, 52)
    ctx.fillStyle = '#ffffff'
    ctx.fillText(txt, 128, 52)
    timerTex.needsUpdate = true
  }

  let screenT = 0
  return {
    lanes,
    mats,
    trays,
    alarmLight,
    marker,
    setTimer,
    // 0 = shut .. 1 = open
    setGateDoor(k) {
      const e = k * k * (3 - 2 * k)
      for (const p of gateDoor.panels) p.position.z = g.z + p.userData.s * (1.25 + e * 2.3)
      gateDoor.collider.setEnabled(k < 0.6)
    },
    update(dt, t) {
      screenT += dt
      const redraw = screenT > 0.1
      if (redraw) screenT = 0
      for (const l of lanes) {
        if (redraw && l.open) {
          l.xr.draw(t, l.alarmT > 0)
          l.xt.needsUpdate = true
        }
        if (l.alarmT > 0) {
          l.alarmT -= dt
          const on = Math.floor(l.alarmT * 8) % 2 === 0
          alarmLight.position.set(X.detectorX + 0.5, Y + 2.8, l.z)
          alarmLight.intensity = on ? 40 : 6
          l.lamp2.emissiveIntensity = on ? 3 : 0.3
          l.lightMat.emissiveIntensity = 0.3
        } else if (l.clearT > 0) {
          l.clearT -= dt
          l.lightMat.emissiveIntensity = 3.2
          l.lamp2.emissiveIntensity = 0.25
        } else {
          l.lightMat.emissiveIntensity = l.open ? 1.4 : 0.15
          l.lamp2.emissiveIntensity = l.open ? 0.25 : 1.2
        }
      }
      if (!lanes.some((l) => l.alarmT > 0)) alarmLight.intensity = 0
      if (marker.visible) {
        arrow.position.y = 2.3 + Math.sin(t * 3) * 0.3
        arrow.rotation.y = Math.sin(t * 1.4) * 0.6
      }
    },
  }
}
