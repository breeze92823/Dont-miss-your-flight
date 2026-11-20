// The security checkpoint hall (east of check-in, through the "security"
// doorway): queue carpet + stanchions, four checkpoint lanes (roller conveyor ->
// X-ray scanner with monitor -> walk-through metal detector -> search mat ->
// pick-up tables), railings between lanes, steel roof trusses, wall signs, the
// "checkpoint open :)" / "closed" lane signs and the doorway to the gates.
// Static parts are baked; detector lights, scanner monitors and trays stay live.
import { BoxGeometry, CanvasTexture, CylinderGeometry, Group, Mesh, MeshStandardMaterial, PlaneGeometry, PointLight, SphereGeometry, Sprite, SpriteMaterial, SRGBColorSpace } from 'three'
import { AIRPORT, SECURITY } from '../config.js'
import { bake } from '../bake.js'
import { neon, solidBox } from '../propkit.js'
import { paintCarpet, paintGlass, paintHallFloor, paintPanels, paintSlabSign, tex } from './paint.js'

const Y = AIRPORT.walkY
const H = SECURITY.hall

function box(parent, w, h, d, mat, x, y, z, ry = 0) {
  const m = new Mesh(new BoxGeometry(w, h, d), mat)
  m.position.set(x, y, z)
  m.rotation.y = ry
  parent.add(m)
  return m
}
function cyl(parent, r, h, mat, x, y, z, rz = 0, rx = 0, seg = 10) {
  const m = new Mesh(new CylinderGeometry(r, r, h, seg), mat)
  m.position.set(x, y, z)
  m.rotation.set(rx, 0, rz)
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
  // the inner mat: black with two yellow footprints
  ctx.fillStyle = '#1b1d22'
  ctx.fillRect(40, 40, 176, 176)
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
  return { c, draw(t, alarm) {
    ctx.fillStyle = '#081832'
    ctx.fillRect(0, 0, 128, 80)
    ctx.strokeStyle = 'rgba(80,180,255,0.25)'
    for (let x = 0; x < 128; x += 8) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, 80)
      ctx.stroke()
    }
    // a bag silhouette sliding across, with "items" inside
    const bx = ((t * 28) % 180) - 40
    ctx.fillStyle = 'rgba(120,200,255,0.55)'
    ctx.fillRect(bx, 22, 50, 36)
    ctx.fillStyle = alarm ? '#ff5a5a' : '#ffcf5a'
    ctx.fillRect(bx + 8, 30, 12, 8)
    ctx.fillStyle = '#7cff9b'
    ctx.fillRect(bx + 26, 40, 16, 10)
    ctx.fillStyle = '#ffffff'
    ctx.font = '600 10px Fredoka, Arial'
    ctx.fillText(alarm ? 'CHECK' : 'SCAN', 4, 12)
  } }
}
function twoLineSign(a, b) {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 256
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#0d0f14'
  ctx.fillRect(0, 0, 512, 256)
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
  ctx.fillStyle = '#ffffff'
  ctx.font = 'italic 600 112px Fredoka, Arial'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 512, 104)
  return c
}

export function buildSecurityHall(scene, { makeArrow, pillSign }) {
  const S = new Group()
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
    steel: new MeshStandardMaterial({ color: '#c3c9d3', roughness: 0.22, metalness: 0.9 }),
    roller: new MeshStandardMaterial({ color: '#e8ebf0', roughness: 0.3, metalness: 0.6 }),
    rubber: new MeshStandardMaterial({ color: '#202227', roughness: 0.9 }),
    hazard: new MeshStandardMaterial({ map: tex(paintHazard()), roughness: 0.8 }),
    light: neon('#f4fbff', 2.4),
    tray: new MeshStandardMaterial({ color: '#7d8796', roughness: 0.5 }),
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
  // Doorway frames.
  for (const [x, z] of [[H.x0, door.z], [H.x1, g.z]]) {
    for (const s of [-1, 1]) box(S, 0.6, 4.6, 0.3, M.black, x, Y + 2.3, z + s * 2.6)
    box(S, 0.6, 0.4, 5.5, M.black, x, Y + 4.6, z)
  }
  // Gates doors (closed until boarding is built): glass doors + a sign.
  const gateGlass = new MeshStandardMaterial({ color: '#7fb6ff', roughness: 0.05, transparent: true, opacity: 0.5, depthWrite: false })
  box(scene, 0.08, 4.2, 5, gateGlass, H.x1 - 0.1, Y + 2.1, g.z)
  solidBox(0.3, 3, 2.6, H.x1 - 0.2, 3, g.z)
  // Columns + steel trusses + hanging lights.
  for (let x = H.x0 + 8; x < H.x1; x += 10) {
    for (const z of [H.z0 - 1, H.z1 + 0.6]) box(S, 0.8, 13, 0.8, M.white, x, Y + 6.5, z)
    box(S, 0.35, 0.5, d, M.white, x, Y + 12.4, cz)
    box(S, 0.25, 0.25, d, M.white, x, Y + 10.9, cz)
    for (let z = H.z1 + 2; z < H.z0 - 2; z += 3.2) {
      const diag = box(S, 0.14, 1.9, 0.14, M.white, x, Y + 11.65, z)
      diag.rotation.x = (Math.round((z - H.z1) / 3.2) % 2 ? 1 : -1) * 0.75
    }
  }
  for (let z = H.z1 + 3; z < H.z0; z += 6) box(S, w, 0.2, 0.2, M.white, cx, Y + 12.6, z)
  for (let x = H.x0 + 4; x < H.x1 - 2; x += 9) for (let z = -16; z > H.z1; z -= 8) {
    const b = box(S, 0.2, 0.08, 5, M.light, x, Y + 10.6, z)
    b.rotation.y = 0.5
  }

  // --- Queue stanchions (match SECURITY.path) -----------------------------------------------------
  const post = (x, z) => {
    box(S, 0.34, 0.04, 0.34, M.black, x, Y + 0.02, z)
    cyl(S, 0.035, 0.95, M.black, x, Y + 0.5, z, 0, 0, 8)
    const c = new Mesh(new SphereGeometry(0.06, 8, 6), M.black)
    c.position.set(x, Y + 0.98, z)
    S.add(c)
  }
  const belt = (x0, z0, x1, z1) => {
    const L = Math.hypot(x1 - x0, z1 - z0)
    const n = Math.max(1, Math.ceil(L / 2.3))
    for (let i = 0; i <= n; i++) post(x0 + ((x1 - x0) * i) / n, z0 + ((z1 - z0) * i) / n)
    box(S, Math.abs(x1 - x0) + 0.02, 0.06, Math.abs(z1 - z0) + 0.02, M.black, (x0 + x1) / 2, Y + 0.9, (z0 + z1) / 2)
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

  // --- Checkpoint lanes ------------------------------------------------------------------------
  const wallSignLater = []
  const lanes = []
  const X = SECURITY
  for (const cp of SECURITY.checkpoints) {
    const z = cp.z
    const bz = z + 2.1 // conveyor line beside the walkway
    // Roller conveyor (feed + exit), stainless frames.
    for (const [x0, x1] of [[59.6, 64.2], [69.4, X.trayEndX + 0.4]]) {
      box(S, x1 - x0, 0.08, 0.1, M.steel, (x0 + x1) / 2, Y + 0.82, bz - 0.42)
      box(S, x1 - x0, 0.08, 0.1, M.steel, (x0 + x1) / 2, Y + 0.82, bz + 0.42)
      for (let x = x0 + 0.2; x < x1; x += 0.28) cyl(S, 0.05, 0.82, M.roller, x, Y + 0.84, bz, 0, Math.PI / 2, 8)
      for (const x of [x0 + 0.2, x1 - 0.2]) for (const s of [-1, 1]) box(S, 0.06, 0.82, 0.06, M.steel, x, Y + 0.41, bz + s * 0.42)
      solidBox((x1 - x0) / 2, 0.45, 0.5, (x0 + x1) / 2, Y + 0.45, bz)
    }
    // A stack of spare trays at the start of the rollers.
    for (let k = 0; k < 6; k++) box(S, 0.6, 0.05, 0.42, M.tray, 59.95, Y + 0.92 + k * 0.055, bz)
    // X-ray scanner body with a tunnel, flaps and a beacon.
    box(S, 4.6, 1.15, 1.5, M.machine, 66.8, Y + 1.1 + 0.575 - 0.2, bz)
    box(S, 4.6, 0.65, 1.5, M.machine, 66.8, Y + 0.33, bz)
    box(S, 4.62, 0.62, 1.0, M.black, 66.8, Y + 0.98, bz)
    box(S, 4.8, 0.12, 1.62, M.machineDark, 66.8, Y + 2.2, bz)
    for (const ex of [64.48, 69.12]) for (let k = 0; k < 5; k++) box(S, 0.02, 0.55, 0.18, M.rubber, ex, Y + 1.0, bz - 0.4 + k * 0.2)
    solidBox(2.4, 1.2, 0.8, 66.8, Y + 1.1, bz)
    // Operator monitor on a stand (live screen).
    box(S, 0.08, 1.4, 0.08, M.black, 65.2, Y + 0.7, bz + 1.1)
    const xr = paintXray()
    xr.draw(0, false)
    const xt = new CanvasTexture(xr.c)
    xt.colorSpace = SRGBColorSpace
    const screen = new Mesh(new BoxGeometry(0.06, 0.5, 0.75), [new MeshStandardMaterial({ map: xt, emissiveMap: xt, emissive: '#ffffff', emissiveIntensity: 1.2 }), M.black, M.black, M.black, M.black, M.black])
    screen.position.set(65.2, Y + 1.6, bz + 1.1)
    screen.rotation.y = Math.PI
    scene.add(screen)
    // Walk-through metal detector: two pillars and a header with a status light.
    for (const s of [-1, 1]) box(S, 0.22, 2.35, 0.55, M.machine, X.detectorX, Y + 1.175, z + s * 1.0)
    box(S, 0.5, 0.32, 2.3, M.machine, X.detectorX, Y + 2.5, z)
    for (const s of [-1, 1]) solidBox(0.14, 1.2, 0.15, X.detectorX, Y + 1.2, z + s * 1.0)
    const lightMat = new MeshStandardMaterial({ color: '#0a2a10', emissive: cp.open ? '#2aff5a' : '#ff2a2a', emissiveIntensity: cp.open ? 1.6 : 0.6 })
    const lamp = new Mesh(new BoxGeometry(0.52, 0.16, 0.6), lightMat)
    lamp.position.set(X.detectorX - 0.02, Y + 2.5, z - 0.5)
    scene.add(lamp)
    const lamp2 = new Mesh(new BoxGeometry(0.52, 0.16, 0.4), new MeshStandardMaterial({ color: '#2a0a0a', emissive: '#ff2a2a', emissiveIntensity: 0.25 }))
    lamp2.position.set(X.detectorX - 0.02, Y + 2.5, z + 0.5)
    scene.add(lamp2)
    // Lane railings (black metal fence) on both sides, from the trays to the search zone.
    const rl = X.laneEndX - 61.5
    for (const s of [-1, 1]) {
      const rz = z + s * 3.6
      box(S, rl, 0.08, 0.08, M.black, 61.5 + rl / 2, Y + 1.05, rz)
      box(S, rl, 0.06, 0.06, M.black, 61.5 + rl / 2, Y + 0.55, rz)
      for (let x = 61.5; x <= X.laneEndX + 0.01; x += rl / 5) box(S, 0.08, 1.05, 0.08, M.black, x, Y + 0.52, rz)
      solidBox(rl / 2, 0.6, 0.08, 61.5 + rl / 2, Y + 0.6, rz)
    }
    if (!cp.open) {
      // Closed lane: red rope across the entrance.
      box(S, 0.05, 0.06, 3, new MeshStandardMaterial({ color: '#d6232e', roughness: 0.6 }), 61.2, Y + 0.9, z - 0.4)
      for (const s of [-1, 1]) post(61.2, z - 0.4 + s * 1.5)
      solidBox(0.1, 0.6, 1.6, 61.2, Y + 0.6, z - 0.4)
    }
    // Lane sign above: "checkpoint open :)" (green) or "closed" (red), facing the queue (-X).
    const pc = cp.open ? pillCanvas('checkpoint open :)', '#5cf06a', '#22b52c', '#0e5a12') : pillCanvas('closed', '#ff5a5a', '#d6232e', '#6a0a10')
    const pt = new CanvasTexture(pc)
    pt.colorSpace = SRGBColorSpace
    const sign = new Mesh(new BoxGeometry(0.2, 1.4, 7), [new MeshStandardMaterial({ color: '#111' }), new MeshStandardMaterial({ map: pt, emissiveMap: pt, emissive: '#ffffff', emissiveIntensity: 0.55 }), M.black, M.black, M.black, M.black])
    sign.position.set(62, Y + 8.4, z)
    sign.rotation.z = 0.12
    scene.add(sign)
    lanes.push({ ...cp, bz, lightMat, lamp2: lamp2.material, xr, xt, busy: false, alarmT: 0 })
  }

  // --- Body search area: mats with hazard borders, a table for your bag, a bin, railings between rows.
  const mats = []
  for (const [mx, mz] of X.mats) {
    box(S, 2.8, 0.06, 2.8, M.black, mx, Y + 0.03, mz)
    const mat = plane(S, 2.7, 2.7, M.hazard, mx, Y + 0.065, mz, 0)
    mat.rotation.x = -Math.PI / 2
    const tz = mz + 2.35
    box(S, 2.2, 0.06, 1.0, M.white, mx, Y + 0.86, tz)
    box(S, 2.1, 0.04, 0.9, M.white, mx, Y + 0.3, tz)
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(S, 0.06, 0.86, 0.06, M.steel, mx + sx * 1.0, Y + 0.43, tz + sz * 0.42)
    solidBox(1.1, 0.45, 0.5, mx, Y + 0.45, tz)
    cyl(S, 0.32, 0.75, M.machineDark, mx + 1.75, Y + 0.375, tz + 0.1, 0, 0, 12)
    solidBox(0.32, 0.4, 0.32, mx + 1.75, Y + 0.4, tz + 0.1)
    mats.push({ x: mx, z: mz, table: { x: mx, y: Y + 0.9, z: tz }, bin: { x: mx + 1.75, y: Y + 0.8, z: tz + 0.1 }, post: { x: mx + 1.9, z: mz }, busy: false })
  }
  const rows = [...new Set(X.mats.map((m) => m[1]))].sort((a, b) => b - a)
  const rx0 = 76.4 // leaves the walkway at x ~75 clear
  const rx1 = 88.2
  for (let i = 0; i < rows.length; i++) {
    // A railing between this row and the next (and one behind the last row).
    const rz = i < rows.length - 1 ? (rows[i] + rows[i + 1]) / 2 : rows[i] - 4
    box(S, rx1 - rx0, 0.08, 0.08, M.black, (rx0 + rx1) / 2, Y + 1.05, rz)
    box(S, rx1 - rx0, 0.06, 0.06, M.black, (rx0 + rx1) / 2, Y + 0.55, rz)
    for (let x = rx0; x <= rx1 + 0.01; x += (rx1 - rx0) / 7) box(S, 0.08, 1.05, 0.08, M.black, x, Y + 0.52, rz)
    solidBox((rx1 - rx0) / 2, 0.6, 0.08, (rx0 + rx1) / 2, Y + 0.6, rz)
  }
  wallSignLater.push(['random checks', 'happen to everyone', 81, Y + 4.4, H.z0 - 0.45, Math.PI])

  // Wall signs.
  function wallSign(a, b, x, y, z, ry, w = 4.2) {
    const t = new CanvasTexture(twoLineSign(a, b))
    t.colorSpace = SRGBColorSpace
    const m = new Mesh(new PlaneGeometry(w, w / 2), new MeshStandardMaterial({ map: t, emissiveMap: t, emissive: '#ffffff', emissiveIntensity: 0.35 }))
    m.position.set(x, y, z)
    m.rotation.y = ry
    scene.add(m)
  }
  for (const w of wallSignLater) wallSign(...w)
  wallSign('liquids over 100ml?', 'not today :)', 44, Y + 4.4, H.z1 + 0.05, 0)
  wallSign('random checks', 'happen to everyone', 62, Y + 4.4, H.z1 + 0.05, 0)
  wallSign('boarding soon', 'keep moving :)', 82, Y + 4.4, H.z1 + 0.05, 0)
  wallSign('security', 'have your pass ready', 40, Y + 4.4, H.z0 - 0.45, Math.PI)
  const slab = (text, w, h, x, y, z, ry) => {
    const t = tex(paintSlabSign(text))
    const m = new Mesh(new PlaneGeometry(w, h), new MeshStandardMaterial({ map: t, emissiveMap: t, emissive: '#ffffff', emissiveIntensity: 0.45 }))
    m.position.set(x, y, z)
    m.rotation.y = ry
    scene.add(m)
  }
  slab('gates', 5, 1.25, H.x1 - 0.5, Y + 6, g.z, -Math.PI / 2)
  slab('security', 5, 1.25, H.x0 + 0.5, Y + 6, door.z, Math.PI / 2)

  const baked = bake(S, false)
  baked.traverse((o) => {
    if (!o.isMesh) return
    o.receiveShadow = true
    o.castShadow = o.material === M.machine || o.material === M.black || o.material === M.white || o.material === M.steel
  })
  scene.add(baked)

  // --- Live bits: trays, queue marker, wait timer --------------------------------------------------
  const trayGeo = new BoxGeometry(0.6, 0.1, 0.42)
  const trays = Array.from({ length: 10 }, () => {
    const t = new Group()
    t.add(new Mesh(trayGeo, M.tray))
    const items = []
    for (let k = 0; k < 3; k++) {
      const it = new Mesh(new BoxGeometry(0.14, 0.08, 0.12), new MeshStandardMaterial({ color: ['#2b2f3a', '#e8434f', '#5cc4ff', '#ffc531', '#7cff6b'][Math.floor(Math.random() * 5)], roughness: 0.5 }))
      it.position.set(-0.16 + k * 0.16, 0.08, (Math.random() - 0.5) * 0.15)
      t.add(it)
      items.push(it)
    }
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

