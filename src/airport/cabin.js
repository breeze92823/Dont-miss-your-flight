// The cabin of your flight, built out of sight above the airport (FLIGHT.cabin) and shown only while
// you're on board: 30 rows of 3-3 seats (black shells, blue headrests, grey tray tables), a navy aisle
// runner, a curved white hull with oval windows, overhead bins with latches, a lit ceiling, the
// passenger service strips, and a galley at the front with cart bays and green indicator lights.
// Aisle along Z, the nose toward -Z. Seats A-C on the left (-X), D-F on the right (+X).
import { BoxGeometry, CanvasTexture, CircleGeometry, CylinderGeometry, DoubleSide, ExtrudeGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, RingGeometry, Shape, SRGBColorSpace } from 'three'
import { FLIGHT } from '../config.js'
import { bake } from '../bake.js'
import { neon, solidBox } from '../propkit.js'

export const SEAT_X = { A: -1.98, B: -1.36, C: -0.74, D: 0.74, E: 1.36, F: 1.98 }
const R = 2.75 // hull radius
const HY = 0.95 // hull centre above the floor
const SY = 0.92 // hull squash

const FONT = 'Fredoka, Arial, sans-serif'
function box(parent, w, h, d, mat, x, y, z) {
  const m = new Mesh(new BoxGeometry(w, h, d), mat)
  m.position.set(x, y, z)
  parent.add(m)
  return m
}
const canvasTex = (c) => {
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 8
  return t
}
// Hull half-width at height y above the floor.
export const hullX = (y) => Math.sqrt(Math.max(0, R * R - ((y - HY) / SY) ** 2))

function paintGalley() {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 384
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#d6dae2'
  ctx.fillRect(0, 0, 512, 384)
  // top cabinets: 6 x 2 small doors with black slots, then a counter, then 3 cart bays
  for (let r = 0; r < 2; r++) for (let k = 0; k < 6; k++) {
    const x = 16 + k * 82
    const y = 16 + r * 66
    ctx.fillStyle = '#9aa1ad'
    ctx.fillRect(x, y, 74, 58)
    ctx.fillStyle = '#c4c9d2'
    ctx.fillRect(x + 4, y + 4, 66, 50)
    ctx.fillStyle = '#1b1d22'
    ctx.fillRect(x + 24, y + 12, 26, 8)
    ctx.fillStyle = '#3dff6a'
    ctx.fillRect(x + 60, y + 46, 6, 4)
  }
  ctx.fillStyle = '#7d8592'
  ctx.fillRect(0, 158, 512, 14)
  for (let k = 0; k < 4; k++) {
    const x = 16 + k * 123
    ctx.fillStyle = '#20232a'
    ctx.fillRect(x, 190, 112, 180)
    ctx.fillStyle = '#2e333c'
    ctx.fillRect(x + 6, 196, 100, 168)
    ctx.fillStyle = '#9aa1ad'
    ctx.fillRect(x + 40, 210, 32, 10)
    ctx.fillStyle = '#3dff6a'
    ctx.fillRect(x + 96, 350, 6, 6)
  }
  return c
}
function paintBulkhead(text) {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 96
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#1d3d8a'
  ctx.fillRect(0, 0, 512, 96)
  ctx.fillStyle = '#ffffff'
  ctx.font = `600 44px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 256, 50)
  return c
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
  const S = new Group()
  const M = {
    hull: new MeshStandardMaterial({ color: '#f3f4f6', roughness: 0.55, side: DoubleSide }),
    bin: new MeshStandardMaterial({ color: '#f7f8fa', roughness: 0.4 }),
    seam: new MeshStandardMaterial({ color: '#c9ced6', roughness: 0.5 }),
    latch: new MeshStandardMaterial({ color: '#16181d', roughness: 0.4 }),
    shell: new MeshStandardMaterial({ color: '#1a1f2a', roughness: 0.45 }),
    cushion: new MeshStandardMaterial({ color: '#232733', roughness: 0.85 }),
    blue: new MeshStandardMaterial({ color: '#1b8cff', roughness: 0.75 }),
    tray: new MeshStandardMaterial({ color: '#5a6170', roughness: 0.5 }),
    frame: new MeshStandardMaterial({ color: '#9aa1ad', roughness: 0.35, metalness: 0.6 }),
    aisle: new MeshStandardMaterial({ color: '#1f2a44', roughness: 0.95 }),
    floor: new MeshStandardMaterial({ color: '#6d7380', roughness: 0.95 }),
    psu: new MeshStandardMaterial({ color: '#dfe2e8', roughness: 0.5 }),
    light: neon('#f2f8ff', 2.2),
    window: new MeshStandardMaterial({ color: '#cfeaff', emissive: '#8fd0ff', emissiveIntensity: 0.85, roughness: 0.2 }),
    bezel: new MeshStandardMaterial({ color: '#ffffff', roughness: 0.4 }),
    galley: new MeshStandardMaterial({ map: canvasTex(paintGalley()), roughness: 0.5 }),
    exit: new MeshBasicMaterial({ color: '#2aff6a' }),
  }

  // Floor: grey under the seats, a navy runner down the aisle.
  const floor = new Mesh(new PlaneGeometry(5.2, len), M.floor)
  floor.rotation.x = -Math.PI / 2
  floor.position.set(CB.x, F + 0.002, zc)
  S.add(floor)
  const runner = new Mesh(new PlaneGeometry(0.9, len), M.aisle)
  runner.rotation.x = -Math.PI / 2
  runner.position.set(CB.x, F + 0.006, zc)
  S.add(runner)
  // Hull: an open, squashed cylinder seen from inside.
  const hull = new Mesh(new CylinderGeometry(R, R, len, 48, 1, true), M.hull)
  hull.rotation.x = Math.PI / 2
  hull.scale.set(1, 1, SY) // after the rotation, local z (the old radius in z) is world y
  hull.position.set(CB.x, F + HY, zc)
  S.add(hull)
  // Overhead bins: an extruded profile along each wall, seams + latches every two rows.
  for (const s of [-1, 1]) {
    const sh = new Shape()
    const pts = [[1.28, 1.84], [hullX(1.84) - 0.05, 1.84], [hullX(2.5) - 0.05, 2.5], [1.62, 2.66], [1.22, 2.38]]
    sh.moveTo(s * pts[0][0], pts[0][1])
    for (const [x, y] of pts.slice(1)) sh.lineTo(s * x, y)
    sh.closePath()
    const g = new ExtrudeGeometry(sh, { depth: len - 4, bevelEnabled: false })
    const bin = new Mesh(g, M.bin)
    bin.position.set(CB.x, F, zFront + 2)
    S.add(bin)
    for (let r = 1; r <= rows + 1; r += 2) {
      const z = rowZ(r) - pitch / 2
      const seam = box(S, 0.04, 0.6, 0.03, M.seam, CB.x + s * 1.25, F + 2.12, z)
      seam.rotation.z = s * 0.25
      box(S, 0.22, 0.04, 0.06, M.latch, CB.x + s * 1.27, F + 1.9, z + pitch)
    }
    // passenger service strip under the bins: reading lights + a vent per row
    box(S, 0.5, 0.06, len - 4, M.psu, CB.x + s * 1.55, F + 1.8, zc)
    for (let r = 1; r <= rows; r++) {
      box(S, 0.06, 0.02, 0.06, M.light, CB.x + s * 1.45, F + 1.765, rowZ(r) - 0.1)
      box(S, 0.06, 0.02, 0.06, M.latch, CB.x + s * 1.65, F + 1.765, rowZ(r) - 0.1)
    }
  }
  // Ceiling panel + light coves.
  box(S, 1.6, 0.05, len - 4, M.bin, CB.x, F + 2.62, zc)
  for (const s of [-1, 1]) box(S, 0.08, 0.03, len - 4, M.light, CB.x + s * 0.75, F + 2.6, zc)
  for (let r = 2; r <= rows; r += 4) box(S, 0.5, 0.02, 0.12, M.latch, CB.x, F + 2.595, rowZ(r)) // vents
  // Windows: one per row per side, pale blue with a white bezel.
  const winGeo = new CircleGeometry(1, 24)
  winGeo.scale(0.2, 0.3, 1)
  const bezGeo = new RingGeometry(1, 1.35, 24)
  bezGeo.scale(0.2, 0.3, 1)
  for (let r = 1; r <= rows; r++) {
    for (const s of [-1, 1]) {
      const x = CB.x + s * (hullX(1.2) - 0.03)
      const w = new Mesh(winGeo, M.window)
      w.position.set(x, F + 1.2, rowZ(r) - 0.15)
      w.rotation.y = -s * Math.PI / 2
      S.add(w)
      const b = new Mesh(bezGeo, M.bezel)
      b.position.set(x - s * 0.01, F + 1.2, rowZ(r) - 0.15)
      b.rotation.y = -s * Math.PI / 2
      S.add(b)
    }
  }
  // Seats.
  const seats = []
  const seat = (x, z) => {
    box(S, 0.56, 0.12, 0.5, M.cushion, x, F + 0.44, z)
    box(S, 0.56, 0.06, 0.06, M.blue, x, F + 0.47, z - 0.24)
    // back: shell + blue front cushion + headrest band
    const back = new Group()
    back.position.set(x, F + 0.42, z + 0.27)
    back.rotation.x = 0.12
    box(back, 0.58, 0.86, 0.1, M.shell, 0, 0.43, 0.04)
    box(back, 0.52, 0.62, 0.06, M.cushion, 0, 0.38, -0.04)
    box(back, 0.58, 0.24, 0.16, M.blue, 0, 0.8, -0.02)
    box(back, 0.42, 0.28, 0.02, M.tray, 0, 0.4, 0.1)
    box(back, 0.1, 0.03, 0.02, M.latch, 0, 0.58, 0.11)
    S.add(back)
    // frame + legs
    box(S, 0.05, 0.4, 0.05, M.frame, x - 0.2, F + 0.2, z)
    box(S, 0.05, 0.4, 0.05, M.frame, x + 0.2, F + 0.2, z)
  }
  for (let r = 1; r <= rows; r++) {
    const z = rowZ(r)
    for (const [L, x] of Object.entries(SEAT_X)) {
      seat(CB.x + x, z)
      seats.push({ row: r, letter: L, x: CB.x + x, y: F + 0.5, z, yaw: Math.PI, npc: null, aisleX: CB.x + (x < 0 ? -0.05 : 0.05) })
    }
    // armrests (4 per side block)
    for (const s of [-1, 1]) for (const a of [0.43, 1.05, 1.67, 2.29]) {
      if (a > 2.25 && hullX(0.7) < 2.3) continue
      box(S, 0.05, 0.06, 0.46, M.shell, CB.x + s * a, F + 0.68, z + 0.02)
    }
  }
  // Galley at the front, lavatories at the back.
  const gw = hullX(1.0) * 2
  const galley = new Mesh(new PlaneGeometry(gw - 0.4, 2.5), M.galley)
  galley.position.set(CB.x, F + 1.25, zFront + 0.02)
  S.add(galley)
  box(S, gw, 0.08, 0.7, M.frame, CB.x, F + 1.0, zFront + 0.4)
  const bh = canvasTex(paintBulkhead('skyhop air'))
  const bulk = new Mesh(new PlaneGeometry(1.4, 0.26), new MeshStandardMaterial({ map: bh, emissiveMap: bh, emissive: '#ffffff', emissiveIntensity: 0.6 }))
  bulk.position.set(CB.x, F + 2.4, zFront + 0.04)
  S.add(bulk)
  const back = new Mesh(new PlaneGeometry(gw, 2.6), M.seam)
  back.position.set(CB.x, F + 1.3, zBack - 0.02)
  back.rotation.y = Math.PI
  S.add(back)
  for (const s of [-1, 1]) {
    box(S, 0.8, 2.0, 0.06, M.bin, CB.x + s * 0.7, F + 1.0, zBack - 0.06)
    box(S, 0.12, 0.05, 0.03, M.exit, CB.x + s * 0.7, F + 1.85, zBack - 0.1)
    box(S, 0.3, 0.12, 0.03, M.exit, CB.x + s * 1.9, F + 2.05, zFront + 0.6) // exit signs by the doors
    box(S, 0.3, 0.12, 0.03, M.exit, CB.x + s * 1.9, F + 2.05, zBack - 0.6)
  }
  // Colliders: floor, walls, ends, ceiling.
  solidBox(3, 0.25, len / 2 + 0.5, CB.x, F - 0.25, zc)
  for (const s of [-1, 1]) solidBox(0.25, 1.6, len / 2, CB.x + s * 2.6, F + 1.6, zc)
  solidBox(3, 1.6, 0.25, CB.x, F + 1.6, zFront - 0.2)
  solidBox(3, 1.6, 0.25, CB.x, F + 1.6, zBack + 0.2)
  solidBox(3, 0.25, len / 2, CB.x, F + 2.95, zc)

  const baked = bake(S, false)
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
    crewSpot: { x: CB.x, z: rowZ(2) - 0.6, yaw: 0 },
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
