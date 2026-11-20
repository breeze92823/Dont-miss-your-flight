// The check-in hall behind the entrance: glossy white tile floor, navy panel
// walls with blue glass above, a queue carpet with stanchions and belts, a
// row of check-in desks (screen, scale with a live kg read-out, conveyor belt
// into the wall), departure boards, hanging signs, seating, and the floating
// "QUEUE HERE" marker. Static parts are baked.
import {
  BoxGeometry,
  CanvasTexture,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Shape,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
} from 'three'
import { AIRLINE, AIRPORT, DESTINATIONS, QUEUE } from '../config.js'
import { bake } from '../bake.js'
import { neon, solidBox, solidPole } from '../propkit.js'
import { RAPIER, addFixed } from '../physics.js'
import { boardCanvas, drawBoard, drawScale, paintCarpet, paintDeskFront, paintDeskScreen, paintGlass, paintHallFloor, paintPanels, paintSlabSign, scaleCanvas, tex } from './paint.js'

const H = AIRPORT.hall
const Y = AIRPORT.walkY

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
    plant: new MeshStandardMaterial({ color: '#3f9a3c', roughness: 0.8, flatShading: true }),
  }

  // Floor, carpet, walls, ceiling lights.
  plane(S, H.x1 - H.x0, H.z0 - H.z1, M.floor, 0, Y + 0.004, (H.z0 + H.z1) / 2, 0, 3, 3).rotation.x = -Math.PI / 2
  const carpet = plane(S, 25.4, 13.2, M.carpet, 1.6, Y + 0.012, -25.3, 0, 2, 2)
  carpet.rotation.x = -Math.PI / 2
  const len = H.z0 - H.z1
  const sd = QUEUE.securityDoor
  const doorLo = sd.z - 2.6
  const doorHi = sd.z + 2.6
  for (const s of [-1, 1]) {
    const x = s > 0 ? H.x1 : H.x0
    // The east wall has the doorway to security cut into its lower panels.
    const spans = s > 0 ? [[doorHi, H.z0], [H.z1, doorLo]] : [[H.z1, H.z0]]
    for (const [z0, z1] of spans) {
      plane(S, z1 - z0, 6, M.panels, x - s * 0.01, Y + 3, (z0 + z1) / 2, -s * Math.PI / 2, 6, 6)
      solidBox(0.5, 8, (z1 - z0) / 2, x + s * 0.4, 8, (z0 + z1) / 2)
    }
    if (s > 0) {
      plane(S, doorHi - doorLo, 6 - 4.6, M.panels, x - 0.01, Y + 5.3, sd.z, -Math.PI / 2, 6, 6)
      solidBox(0.5, 3, 2.6, x + 0.4, Y + 4.6 + 3, sd.z)
    }
    plane(S, len, H.height - 6, M.glass, x - s * 0.01, Y + 6 + (H.height - 6) / 2, (H.z0 + H.z1) / 2, -s * Math.PI / 2, 4, 4.4)
    for (let z = H.z0 - 6; z > H.z1; z -= 8) if (s < 0 || z > doorHi + 0.5 || z < doorLo - 0.5) box(S, 0.9, H.height, 0.9, M.white, x - s * 0.45, Y + H.height / 2, z)
    for (let z = H.z0 - 2; z > H.z1; z -= 4) box(S, 0.15, H.height - 6, 0.2, M.black, x - s * 0.08, Y + 6 + (H.height - 6) / 2, z)
    box(S, 0.3, 0.25, len, M.black, x - s * 0.1, Y + 6, (H.z0 + H.z1) / 2)
  }
  plane(S, H.x1 - H.x0, H.height, M.panels, 0, Y + H.height / 2, H.z1 + 0.01, 0, 6, 6)
  solidBox(H.x1, 8, 0.5, 0, 8, H.z1 - 0.4)
  // Hanging light bars (long, angled like the reference).
  for (let x = -24; x <= 24; x += 8) for (let z = -16; z > -44; z -= 9) {
    const b = box(S, 0.22, 0.08, 6, M.light, x, Y + 11.2, z)
    b.rotation.y = 0.35
  }

  // --- Queue stanchions + belts -----------------------------------------------------------
  const post = (x, z) => {
    box(S, 0.34, 0.04, 0.34, M.black, x, Y + 0.02, z)
    const p = new Mesh(new CylinderGeometry(0.035, 0.035, 0.95, 8), M.black)
    p.position.set(x, Y + 0.5, z)
    S.add(p)
    const c = new Mesh(new SphereGeometry(0.06, 8, 6), M.black)
    c.position.set(x, Y + 0.98, z)
    S.add(c)
  }
  const belt = (x0, z0, x1, z1) => {
    const L = Math.hypot(x1 - x0, z1 - z0)
    const n = Math.max(1, Math.ceil(L / 2.3))
    for (let i = 0; i <= n; i++) post(x0 + ((x1 - x0) * i) / n, z0 + ((z1 - z0) * i) / n)
    const b = box(S, Math.abs(x1 - x0) + 0.02, 0.06, Math.abs(z1 - z0) + 0.02, M.black, (x0 + x1) / 2, Y + 0.9, (z0 + z1) / 2)
    b.scale.set(1, 1, 1)
    solidBox(Math.abs(x1 - x0) / 2 + 0.05, 0.6, Math.abs(z1 - z0) / 2 + 0.05, (x0 + x1) / 2, Y + 0.6, (z0 + z1) / 2)
  }
  for (const [z, x0, x1] of STANCHION_ROWS) belt(x0, z, x1, z)
  for (const [x, z0, z1] of STANCHION_COLS) belt(x, z0, x, z1)

  // --- Check-in desks ------------------------------------------------------------------------
  const deskFront = tex(paintDeskFront(AIRLINE))
  const frontMat = new MeshStandardMaterial({ map: deskFront, roughness: 0.4 })
  const beltCanvas = document.createElement('canvas')
  beltCanvas.width = 64
  beltCanvas.height = 64
  {
    const ctx = beltCanvas.getContext('2d')
    ctx.fillStyle = '#25272d'
    ctx.fillRect(0, 0, 64, 64)
    ctx.fillStyle = '#34373f'
    for (let y = 0; y < 64; y += 16) ctx.fillRect(0, y, 64, 3)
  }
  const beltTex = tex(beltCanvas, { repeatX: 1, repeatY: 6 })
  const beltMat = new MeshStandardMaterial({ map: beltTex, roughness: 0.8 })
  const desks = []
  const dz = QUEUE.deskZ
  QUEUE.counters.forEach((cx, i) => {
    const x = cx - 0.4
    const front = new Mesh(new BoxGeometry(3.4, 1.05, 0.75), [M.slate, M.slate, M.slate, M.slate, frontMat, M.slate])
    front.position.set(x, Y + 0.525, dz)
    S.add(front)
    box(S, 3.6, 0.07, 1.0, M.white, x, Y + 1.09, dz - 0.05)
    box(S, 0.55, 0.36, 0.05, M.black, x - 0.6, Y + 1.38, dz - 0.25)
    box(S, 0.06, 0.2, 0.06, M.black, x - 0.6, Y + 1.18, dz - 0.25)
    box(S, 0.5, 0.03, 0.2, M.black, x + 0.3, Y + 1.14, dz - 0.25) // keyboard
    solidBox(1.8, 0.6, 0.45, x, Y + 0.6, dz)
    // Scale + belt into the wall.
    const sx = cx + 1.9
    box(S, 1.2, 0.42, 0.95, M.slate, sx, Y + 0.21, dz + 0.1)
    box(S, 1.1, 0.04, 0.85, M.steel, sx, Y + 0.44, dz + 0.1)
    const beltLen = dz - 0.4 - H.z1
    box(S, 1.2, 0.55, beltLen, M.slate, sx, Y + 0.27, dz - 0.4 - beltLen / 2)
    const top = plane(S, 1.0, beltLen, beltMat, sx, Y + 0.56, dz - 0.4 - beltLen / 2)
    top.rotation.x = -Math.PI / 2
    for (const s of [-1, 1]) box(S, 0.06, 0.14, beltLen, M.steel, sx + s * 0.56, Y + 0.6, dz - 0.4 - beltLen / 2)
    box(S, 1.4, 1.3, 0.08, M.black, sx, Y + 0.95, H.z1 + 0.05) // belt hole
    for (let k = 0; k < 6; k++) box(S, 0.18, 0.9, 0.02, M.rubber, sx - 0.45 + k * 0.18, Y + 1.0, H.z1 + 0.12)
    solidBox(0.6, 0.4, beltLen / 2 + 0.5, sx, Y + 0.4, dz - beltLen / 2)
    // Desk screen on a post.
    box(S, 0.08, 1.5, 0.08, M.black, x, Y + 1.85, dz - 0.4)
    const screen = tex(paintDeskScreen(i + 1, AIRLINE))
    const sm = new MeshStandardMaterial({ map: screen, emissiveMap: screen, emissive: '#ffffff', emissiveIntensity: 1.1 })
    const scr = new Mesh(new BoxGeometry(1.7, 0.64, 0.08), [M.black, M.black, M.black, M.black, sm, M.black])
    scr.position.set(x, Y + 2.85, dz - 0.4)
    scene.add(scr)
    // Live scale read-out on the desk side.
    const sc = scaleCanvas()
    drawScale(sc, 0)
    const st = new CanvasTexture(sc)
    st.colorSpace = SRGBColorSpace
    const readout = new Mesh(new PlaneGeometry(0.5, 0.19), new MeshStandardMaterial({ map: st, emissiveMap: st, emissive: '#ffffff', emissiveIntensity: 1.3 }))
    readout.position.set(cx + 1.15, Y + 0.85, dz + 0.385)
    scene.add(readout)
    desks.push({
      index: i,
      x,
      cust: { x, z: dz + 1.15 },
      agent: { x, z: dz - 1.2 },
      scale: { x: sx, y: Y + 0.46, z: dz + 0.1 },
      beltEnd: { x: sx, y: Y + 0.58, z: H.z1 + 0.2 },
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
    box(S, w + 0.3, h + 0.3, 0.12, M.black, x - Math.sin(ry) * 0.08, y, z - Math.cos(ry) * 0.08).rotation.y = ry
    boards.push({ c, t })
  }
  const slab = (text, w, h, x, y, z, ry) => {
    const t = tex(paintSlabSign(text))
    const mat = new MeshStandardMaterial({ map: t, emissiveMap: t, emissive: '#ffffff', emissiveIntensity: 0.45, roughness: 0.4 })
    for (const flip of [0, Math.PI]) {
      // Two single-sided faces back to back, so the word reads correctly from both sides.
      const m = new Mesh(new PlaneGeometry(w, h), mat)
      m.position.set(x - Math.sin(ry) * (flip ? 0.02 : 0), y, z - Math.cos(ry) * (flip ? 0.02 : 0))
      m.rotation.y = ry + flip
      scene.add(m)
    }
    for (const s of [-1, 1]) box(S, 0.03, H.height - y + 0.2, 0.03, M.black, x + s * w * 0.4 * Math.cos(ry), (y + H.height + 0.2) / 2 + 0.5, z - s * w * 0.4 * Math.sin(ry))
  }
  slab('check-in', 8, 2, -6, Y + 9.5, -17, 0)
  slab('security', 6.4, 1.6, H.x1 - 0.6, Y + 6.2, QUEUE.securityDoor.z, -Math.PI / 2)
  // Security doorway: dark frame + sliding glass doors (security.js opens them).
  for (const s of [-1, 1]) box(S, 0.7, 4.6, 0.3, M.black, H.x1, Y + 2.3, sd.z + s * 2.6)
  box(S, 0.7, 0.4, 5.5, M.black, H.x1, Y + 4.6, sd.z)
  const secGlass = new MeshStandardMaterial({ color: '#a8d4ff', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.3, depthWrite: false })
  const secDoor = { open: 0, panels: [], colliders: [] }
  for (const s of [-1, 1]) {
    const p = new Group()
    box(p, 0.06, 4.2, 2.45, secGlass, 0, 0, 0)
    box(p, 0.1, 4.2, 0.08, M.black, 0, 0, -s * 1.2)
    box(p, 0.1, 0.12, 2.45, M.black, 0, 2.05, 0)
    box(p, 0.1, 0.12, 2.45, M.black, 0, -2.05, 0)
    p.position.set(H.x1, Y + 2.1, sd.z + s * 1.25)
    p.userData.s = s
    p.renderOrder = 3
    scene.add(p)
    secDoor.panels.push(p)
    secDoor.colliders.push(addFixed(RAPIER.ColliderDesc.cuboid(0.12, 2.1, 1.25), { x: H.x1, y: Y + 2.1, z: sd.z + s * 1.25 }))
  }
  secDoor.set = (k) => {
    secDoor.open = k
    const e = k * k * (3 - 2 * k)
    for (const p of secDoor.panels) p.position.z = sd.z + p.userData.s * (1.25 + e * 2.3)
    for (const c of secDoor.colliders) c.setEnabled(k < 0.6)
  }

  // Seating rows by the left windows, trolleys, plants, bins.
  for (let r = 0; r < 4; r++) {
    const z = -17 - r * 3.4
    for (let k = 0; k < 6; k++) {
      const x = -27 + k * 0.95
      box(S, 0.8, 0.08, 0.7, M.seat, x, Y + 0.48, z)
      box(S, 0.8, 0.7, 0.08, M.seat, x, Y + 0.85, z - 0.33)
    }
    box(S, 5.8, 0.06, 0.12, M.steel, -24.6, Y + 0.3, z)
    for (const x of [-27.2, -22]) box(S, 0.08, 0.3, 0.6, M.steel, x, Y + 0.15, z)
    solidBox(2.9, 0.6, 0.45, -24.6, Y + 0.6, z - 0.1)
  }
  for (const [x, z] of [[-20, -14], [20, -14], [-28.5, -42], [27, -42]]) {
    const pot = new Mesh(new CylinderGeometry(0.5, 0.4, 0.8, 12), M.white)
    pot.position.set(x, Y + 0.4, z)
    S.add(pot)
    for (const [bx, by, bz, r] of [[0, 1.4, 0, 0.7], [0.3, 1.9, 0.1, 0.5], [-0.2, 2.2, -0.1, 0.45]]) {
      const b = new Mesh(new SphereGeometry(r, 6, 5), M.plant)
      b.position.set(x + bx, Y + by, z + bz)
      S.add(b)
    }
    solidPole(0.5, 1, x, z)
  }
  for (const [x, z] of [[18, -14.5], [-15, -34]]) {
    const bin = new Mesh(new CylinderGeometry(0.35, 0.32, 1.0, 12), M.black)
    bin.position.set(x, Y + 0.5, z)
    S.add(bin)
    solidPole(0.36, 1, x, z)
  }

  const baked = bake(S, false)
  baked.traverse((o) => {
    if (!o.isMesh) return
    o.receiveShadow = true
    o.castShadow = o.material === M.black || o.material === M.slate || o.material === M.seat || o.material === M.white
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
      for (const [m, arrow] of [[queueMarker, qa], [doorMarker, da]]) {
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
