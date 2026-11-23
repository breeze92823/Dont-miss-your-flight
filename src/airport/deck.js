// The parts of the plane beyond the main cabin (luxury.js runs them):
//   COCKPIT   in front of the cockpit wall: a tapering flight deck with a raked windshield (the scrolling
//             sky), glareshield + five glowing displays (PFD / ND / EICAS painted on canvases), an
//             overhead panel of switches with tiny lights, the centre pedestal with two thrust levers, two
//             yokes, two sheepskin pilot seats and a fold-down jump seat. The door swings into the cockpit
//             (`door.open` 0..1); its collider closes the doorway while it's shut. A keypad beside it.
//   STAIR     a spiral staircase in First's stair hall (wood treads, gold edges, a helix handrail) rising
//             into a glowing opening in the starlight ceiling. You climb it on a scripted path (`climb`).
//   LOUNGE    the Sky Lounge upstairs, built out of sight at +`UP` m (luxury.js fades you between them):
//             starlight ceiling + chandelier, windows, a curved bar with a back-lit bottle wall and stools,
//             sofas by the windows, a frosted shower spa, and a curtained CREW REST with bunks and a locker.
// Everything static is baked; the door, keypad light, shower glass and the chandelier glow are live.
// The doorway and the stair are solid: you pass them on scripted paths (the player capsule is 1.5 m wide).
import { BoxGeometry, CanvasTexture, CatmullRomCurve3, CircleGeometry, CylinderGeometry, DoubleSide, ExtrudeGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, Shape, SphereGeometry, SRGBColorSpace, TorusGeometry, TubeGeometry, Vector3 } from 'three'
import { FLIGHT } from '../config.js'
import { bake } from '../bake.js'
import { RAPIER, addFixed } from '../physics.js'
import { neon, retint, solidBox } from '../propkit.js'
import { lathe, rbox } from '../detail.js'

export const UP = 40 // the Sky Lounge floor is this far above the main deck
const FONT = 'Fredoka, Arial, sans-serif'

function cv(w, h = w) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}
const tex = (c) => {
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 8
  return t
}
// --- Display painters -----------------------------------------------------------------------------
function paintPFD() {
  const c = cv(128)
  const x = c.getContext('2d')
  x.fillStyle = '#2f7de0'
  x.fillRect(0, 0, 128, 64)
  x.fillStyle = '#8a5a2a'
  x.fillRect(0, 64, 128, 64)
  x.strokeStyle = '#ffffff'
  x.lineWidth = 2
  x.beginPath()
  x.moveTo(0, 64)
  x.lineTo(128, 64)
  x.stroke()
  x.lineWidth = 1
  for (const d of [-24, -12, 12, 24]) {
    x.beginPath()
    x.moveTo(52, 64 + d)
    x.lineTo(76, 64 + d)
    x.stroke()
  }
  x.fillStyle = '#ffd23b'
  x.fillRect(40, 62, 16, 4)
  x.fillRect(72, 62, 16, 4)
  x.fillRect(62, 60, 4, 8)
  x.fillStyle = 'rgba(0,0,0,0.55)'
  x.fillRect(0, 20, 20, 88)
  x.fillRect(108, 20, 20, 88)
  x.fillStyle = '#7cff6b'
  x.font = `700 11px ${FONT}`
  x.fillText('280', 1, 68)
  x.fillText('35000', 104, 68)
  return c
}
function paintND() {
  const c = cv(128)
  const x = c.getContext('2d')
  x.fillStyle = '#050a10'
  x.fillRect(0, 0, 128, 128)
  x.strokeStyle = '#ffffff'
  x.lineWidth = 1.5
  for (const r of [40, 80]) {
    x.beginPath()
    x.arc(64, 118, r, Math.PI * 1.15, Math.PI * 1.85)
    x.stroke()
  }
  x.strokeStyle = '#ff4ad8'
  x.lineWidth = 2
  x.beginPath()
  x.moveTo(64, 118)
  x.lineTo(70, 70)
  x.lineTo(90, 20)
  x.stroke()
  x.fillStyle = '#7cff6b'
  for (const [a, b] of [[30, 60], [100, 40], [20, 30]]) {
    x.beginPath()
    x.arc(a, b, 3, 0, 7)
    x.fill()
  }
  x.fillStyle = '#ffd23b'
  x.beginPath()
  x.moveTo(64, 108)
  x.lineTo(58, 122)
  x.lineTo(70, 122)
  x.fill()
  x.fillStyle = '#7cff6b'
  x.font = `700 10px ${FONT}`
  x.fillText('GS 482', 4, 12)
  x.fillText('TAS 470', 4, 24)
  return c
}
function paintEICAS() {
  const c = cv(128)
  const x = c.getContext('2d')
  x.fillStyle = '#050a10'
  x.fillRect(0, 0, 128, 128)
  for (const [cx, cy] of [[34, 34], [94, 34], [34, 90], [94, 90]]) {
    x.strokeStyle = '#ffffff'
    x.lineWidth = 2
    x.beginPath()
    x.arc(cx, cy, 20, Math.PI * 0.75, Math.PI * 2.25)
    x.stroke()
    x.strokeStyle = '#7cff6b'
    x.lineWidth = 3
    x.beginPath()
    x.arc(cx, cy, 20, Math.PI * 0.75, Math.PI * (1.4 + Math.random() * 0.4))
    x.stroke()
  }
  x.fillStyle = '#7cff6b'
  x.font = `700 10px ${FONT}`
  x.fillText('N1 92.4', 16, 64)
  x.fillText('N1 92.1', 76, 64)
  x.fillStyle = '#4ad2ff'
  x.fillText('FUEL 41.2', 36, 124)
  return c
}
function paintSign(lines, col = '#e8b54a', w = 512, h = 128) {
  const c = cv(w, h)
  const x = c.getContext('2d')
  const g = x.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, '#1b2236')
  g.addColorStop(1, '#0f1424')
  x.fillStyle = g
  x.fillRect(0, 0, w, h)
  x.fillStyle = col
  x.fillRect(0, h - 10, w, 6)
  x.textAlign = 'center'
  x.textBaseline = 'middle'
  x.font = `700 ${Math.round(h * 0.42)}px ${FONT}`
  x.fillText(lines[0], w / 2, lines[1] ? h * 0.38 : h * 0.5)
  if (lines[1]) {
    x.font = `600 ${Math.round(h * 0.2)}px ${FONT}`
    x.fillStyle = '#d6dcea'
    x.fillText(lines[1], w / 2, h * 0.76)
  }
  return c
}
function signMat(lines, col, w, h) {
  const t = tex(paintSign(lines, col, w, h))
  return new MeshStandardMaterial({ map: t, emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 0.75 })
}

// cabin: the built cabin (floorY, zFront, zones, galleyF, ceil, hullX, mats).
export function buildDeck(scene, cabin) {
  const F = cabin.floorY
  const X = FLIGHT.cabin.x
  const zF = cabin.zFront
  const CEIL = cabin.ceil
  const CM = cabin.mats
  const S = new Group() // baked: cockpit + stair
  const L = new Group() // baked: the Sky Lounge
  const paint = new MeshStandardMaterial({ color: '#ffffff', roughness: 0.55 })
  const pm = new Map()
  const P = (parent, geo, hex, x, y, z, rx = 0, ry = 0, rz = 0) => {
    let m = pm.get(hex)
    if (!m) {
      m = paint.clone()
      m.color.set(hex)
      pm.set(hex, m)
    }
    const mesh = new Mesh(geo, m)
    mesh.position.set(x, y, z)
    mesh.rotation.set(rx, ry, rz)
    parent.add(mesh)
    return mesh
  }
  const add = (parent, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const mesh = new Mesh(geo, mat)
    mesh.position.set(x, y, z)
    mesh.rotation.set(rx, ry, rz)
    parent.add(mesh)
    return mesh
  }
  const solid = (hx, hy, hz, x, y, z, yaw = 0) => solidBox(hx, hy, hz, x, y, z, yaw)
  // The scrolling sky, shared with the cabin windows (a clone for the windshield: its own offset).
  const skyW = CM.window.map.clone()
  skyW.needsUpdate = true
  skyW.repeat.set(0.5, 1)
  const windshield = new MeshStandardMaterial({ map: skyW, emissive: '#ffffff', emissiveMap: skyW, emissiveIntensity: 0.95, roughness: 0.1 })
  const screens = [paintPFD(), paintND(), paintEICAS()].map((c) => {
    const t = tex(c)
    return new MeshStandardMaterial({ color: '#000000', emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 1.1, roughness: 0.25 })
  })
  const lights = ['#ffffff', '#7cff6b', '#ffb02e', '#4ad2ff'].map((c) => neon(c, 1.6))

  // ======================================== COCKPIT ========================================
  const zN = zF - 4.6 // the nose
  const halfW = (z) => 2.3 - ((zF - z) / 4.6) * 1.0 // tapering
  const H = 2.75
  {
    // floor (dark carpet), a raised step under the pilots
    const sh = new Shape()
    sh.moveTo(-halfW(zF), 0)
    sh.lineTo(halfW(zF), 0)
    sh.lineTo(halfW(zN), 4.6)
    sh.lineTo(-halfW(zN), 4.6)
    sh.closePath()
    P(S, new ExtrudeGeometry(sh, { depth: 0.04, bevelEnabled: false }).rotateX(Math.PI / 2), '#2b303b', X, F + 0.04, zF)
    // walls: lower dark, upper light; ceiling
    for (const s of [-1, 1]) {
      const len = Math.hypot(4.6, 1.0)
      const ang = Math.atan2(1.0, 4.6) * s
      const cz = zF - 2.3
      const cx = X + s * halfW(cz)
      P(S, new BoxGeometry(0.06, 1.2, len), '#3a3f48', cx, F + 0.6, cz, 0, ang, 0)
      P(S, new BoxGeometry(0.06, H - 1.2, len), '#d6dae1', cx, F + 1.2 + (H - 1.2) / 2, cz, 0, ang, 0)
      solid(0.15, H / 2, len / 2, cx + s * 0.12, F + H / 2, cz, ang)
      // side windows near the nose
      for (let i = 0; i < 2; i++) {
        const wz = zN + 0.9 + i * 0.75
        const wx = X + s * (halfW(wz) - 0.035)
        add(S, new PlaneGeometry(0.6, 0.55), windshield, wx, F + 1.75, wz, 0, -s * Math.PI / 2 + ang, 0)
        P(S, new BoxGeometry(0.05, 0.62, 0.68), '#2a2e36', wx + s * 0.02, F + 1.75, wz, 0, ang, 0)
      }
    }
    P(S, new BoxGeometry(4.6, 0.06, 4.7), '#c9ced6', X, F + H, zF - 2.3)
    solid(2.5, 0.2, 2.4, X, F + H + 0.2, zF - 2.3)
    solid(2.5, 0.2, 2.4, X, F - 0.2, zF - 2.3)
    // the cockpit side of the door wall (round the doorway)
    for (const s of [-1, 1]) P(S, new BoxGeometry(1.8, H, 0.05), '#9aa1ad', X + s * 1.4, F + H / 2, zF - 0.04)
    P(S, new BoxGeometry(1.0, H - 2.2, 0.05), '#9aa1ad', X, F + 2.2 + (H - 2.2) / 2, zF - 0.04)
    // windshield: two raked panes each side of a centre post, over a sill
    const sill = zN + 0.45
    P(S, rbox(2.6, 1.2, 0.5, 0.05, 1), '#2a2e36', X, F + 0.6, zN + 0.25)
    for (const [x, w, ry] of [[-0.95, 0.75, 0.35], [-0.38, 0.6, 0.08], [0.38, 0.6, -0.08], [0.95, 0.75, -0.35]]) {
      add(S, new PlaneGeometry(w, 1.0), windshield, X + x, F + 1.75, sill - 0.12 - Math.abs(x) * 0.1, -0.35, ry, 0)
    }
    for (const x of [-1.33, -0.67, 0, 0.67, 1.33]) P(S, new BoxGeometry(0.07, 1.15, 0.07), '#1d2128', X + x, F + 1.72, sill - 0.1 - Math.abs(x) * 0.1, -0.35, 0, 0)
    P(S, new BoxGeometry(2.8, 0.08, 0.6), '#1d2128', X, F + 2.3, sill - 0.15, -0.2, 0, 0)
    solid(1.4, 1.4, 0.4, X, F + 1.4, zN + 0.2)
    // glareshield + main panel with five displays
    const pz = zN + 1.25
    P(S, rbox(2.7, 0.5, 0.45, 0.05, 1), '#2a2e36', X, F + 0.95, pz - 0.2)
    P(S, rbox(2.8, 0.1, 0.5, 0.04, 1), '#1d2128', X, F + 1.24, pz - 0.18)
    P(S, rbox(1.6, 0.08, 0.12, 0.02, 1), '#3a3f48', X, F + 1.3, pz - 0.02) // MCP
    for (let i = 0; i < 9; i++) add(S, new CylinderGeometry(0.018, 0.018, 0.02, 10).rotateX(Math.PI / 2), lights[i % 4], X - 0.7 + i * 0.175, F + 1.3, pz + 0.045)
    ;[[-1.05, 0], [-0.62, 1], [0, 2], [0.62, 1], [1.05, 0]].forEach(([x, k]) => {
      P(S, rbox(0.4, 0.34, 0.04, 0.02, 1), '#121418', X + x, F + 0.98, pz + 0.03)
      add(S, new PlaneGeometry(0.34, 0.28), screens[k], X + x, F + 0.98, pz + 0.052)
    })
    solid(1.35, 0.55, 0.3, X, F + 0.55, pz - 0.2)
    // pedestal + thrust levers + radio panels
    P(S, rbox(0.42, 0.78, 1.1, 0.04, 1), '#2a2e36', X, F + 0.39, pz + 0.55)
    for (const s of [-1, 1]) {
      P(S, new BoxGeometry(0.03, 0.18, 0.03), '#9aa1ad', X + s * 0.07, F + 0.88, pz + 0.35, -0.4, 0, 0)
      P(S, rbox(0.1, 0.05, 0.05, 0.015, 1), '#e8e8e8', X + s * 0.07, F + 0.96, pz + 0.31)
    }
    for (let i = 0; i < 3; i++) add(S, new PlaneGeometry(0.34, 0.12), screens[2], X, F + 0.79, pz + 0.62 + i * 0.16, -Math.PI / 2, 0, 0)
    solid(0.22, 0.4, 0.55, X, F + 0.4, pz + 0.55)
    // overhead panel: a sloped board of switches and lights
    const ohz = zN + 1.4
    P(S, rbox(1.9, 0.08, 1.3, 0.03, 1), '#3a3f48', X, F + H - 0.15, ohz, 0.25, 0, 0)
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 10; c++) {
        const x = X - 0.8 + c * 0.178
        const z = ohz - 0.5 + r * 0.19
        const y = F + H - 0.2 - (z - ohz) * 0.25
        P(S, new BoxGeometry(0.03, 0.035, 0.05), '#cfd6e0', x, y, z)
        if ((r + c) % 3 === 0) add(S, new BoxGeometry(0.04, 0.012, 0.025), lights[(r * 3 + c) % 4], x + 0.05, y - 0.012, z)
      }
    }
    // yokes
    for (const s of [-1, 1]) {
      const yx = X + s * 0.62
      P(S, new CylinderGeometry(0.035, 0.045, 0.75, 8), '#2a2e36', yx, F + 0.4, pz + 0.35, 0.35, 0, 0)
      const h = add(S, new TorusGeometry(0.15, 0.025, 6, 14, Math.PI), new MeshStandardMaterial({ color: '#1d2128', roughness: 0.4 }), yx, F + 0.85, pz + 0.48, 0, 0, Math.PI)
      h.rotation.x = 0.35
      P(S, rbox(0.14, 0.06, 0.06, 0.02, 1), '#3a3f48', yx, F + 0.82, pz + 0.47)
    }
    // pilot seats (sheepskin), on rails
    for (const s of [-1, 1]) {
      const sx = X + s * 0.62
      const sz = zN + 2.35
      P(S, rbox(0.6, 0.12, 0.58, 0.05, 2), '#e8e2d4', sx, F + 0.5, sz)
      P(S, rbox(0.6, 0.95, 0.14, 0.06, 2), '#e8e2d4', sx, F + 1.02, sz + 0.3, -0.12, 0, 0)
      P(S, rbox(0.34, 0.24, 0.12, 0.05, 2), '#d8d0c0', sx, F + 1.6, sz + 0.36, -0.12, 0, 0)
      for (const a of [-1, 1]) P(S, rbox(0.06, 0.08, 0.42, 0.02, 1), '#2a2e36', sx + a * 0.33, F + 0.72, sz + 0.02)
      P(S, new CylinderGeometry(0.05, 0.08, 0.42, 8), '#5a6170', sx, F + 0.22, sz)
      for (const a of [-1, 1]) P(S, new BoxGeometry(0.04, 0.03, 1.0), '#8d949f', sx + a * 0.18, F + 0.05, sz)
      solid(0.32, 0.55, 0.35, sx, F + 0.55, sz + 0.05)
    }
    // jump seat (folded down) against the right wall behind the first officer
    P(S, rbox(0.5, 0.1, 0.45, 0.04, 2), '#3a4258', X + 1.55, F + 0.52, zF - 1.2)
    P(S, rbox(0.5, 0.7, 0.08, 0.04, 2), '#3a4258', X + 1.72, F + 0.95, zF - 1.2, 0, -Math.PI / 2, 0)
    // a dome light + a coffee cup on the glareshield
    add(S, new CircleGeometry(0.12, 16).rotateX(Math.PI / 2), CM.lamp, X, F + H - 0.04, zF - 1.4)
    P(S, lathe([[0, 0], [0.035, 0], [0.04, 0.08], [0, 0.08]], 10), '#ffffff', X + 1.1, F + 1.29, pz - 0.25)
  }
  // The door (live): swings into the cockpit about its left hinge. Keypad (live light) on the cabin side.
  const door = new Group()
  door.position.set(X - 0.5, F, zF + 0.02)
  {
    const m = new MeshStandardMaterial({ color: '#e6e8ec', roughness: 0.5 })
    const dk = new MeshStandardMaterial({ color: '#2a2f38', roughness: 0.4 })
    const red = new MeshBasicMaterial({ color: '#d6232e' })
    add(door, rbox(0.98, 2.18, 0.08, 0.03, 1), m, 0.49, 1.09, 0)
    add(door, rbox(0.86, 2.0, 0.02, 0.02, 1), new MeshStandardMaterial({ color: '#d0d5dc', roughness: 0.5 }), 0.49, 1.08, 0.05)
    add(door, new CylinderGeometry(0.025, 0.025, 0.02, 10).rotateX(Math.PI / 2), dk, 0.49, 1.6, 0.06)
    add(door, new BoxGeometry(0.34, 0.08, 0.01), red, 0.49, 1.85, 0.06)
    add(door, rbox(0.14, 0.04, 0.05, 0.015, 1), dk, 0.86, 1.05, 0.07)
    add(door, rbox(0.14, 0.04, 0.05, 0.015, 1), dk, 0.86, 1.05, -0.07)
  }
  scene.add(door)
  const keypad = new Group()
  keypad.position.set(X + 0.78, F + 1.25, zF + 0.06)
  const keyLight = new MeshBasicMaterial({ color: '#ff2a3a' })
  {
    add(keypad, rbox(0.14, 0.22, 0.04, 0.012, 1), new MeshStandardMaterial({ color: '#2a2f38', roughness: 0.4 }), 0, 0, 0)
    add(keypad, new PlaneGeometry(0.1, 0.04), new MeshBasicMaterial({ color: '#7cff6b' }), 0, 0.06, 0.022)
    for (let i = 0; i < 9; i++) add(keypad, new BoxGeometry(0.022, 0.022, 0.01), new MeshStandardMaterial({ color: '#cfd6e0' }), -0.03 + (i % 3) * 0.03, 0.01 - Math.floor(i / 3) * 0.03, 0.022)
    add(keypad, new CircleGeometry(0.012, 10), keyLight, 0.045, 0.085, 0.022)
  }
  scene.add(keypad)
  // A crew note pinned inside the front galley (the code hides on it; luxury.js decides which).
  const notePos = { x: X - 2.0, z: cabin.galleyF.z0 + 1.3 }

  // ======================================== SPIRAL STAIR ========================================
  const z0 = cabin.zones[0]
  const stair = { x: X, z: z0.z1 - 1.8, r: 0.95, steps: 15, rise: 0.27, turn: 0.42, a0: 0 }
  {
    const st = stair
    P(S, new CylinderGeometry(0.1, 0.1, CEIL, 12), '#c9a14a', st.x, F + CEIL / 2, st.z)
    const tread = new BoxGeometry(st.r - 0.1, 0.06, 0.42)
    const edge = new BoxGeometry(st.r - 0.1, 0.02, 0.03)
    const rail = []
    for (let i = 0; i < st.steps; i++) {
      const a = st.a0 + i * st.turn
      const y = F + (i + 1) * st.rise
      const mx = st.x + Math.cos(a) * (st.r / 2 + 0.05)
      const mz = st.z - Math.sin(a) * (st.r / 2 + 0.05)
      add(S, tread, CM.wood, mx, y, mz, 0, a, 0)
      add(S, edge, CM.gold, mx + Math.sin(a) * 0.2, y + 0.035, mz + Math.cos(a) * 0.2, 0, a, 0)
      const bx = st.x + Math.cos(a) * st.r
      const bz = st.z - Math.sin(a) * st.r
      P(S, new CylinderGeometry(0.015, 0.015, 0.9, 6), '#c9a14a', bx, y + 0.45, bz)
      rail.push(new Vector3(bx, y + 0.92, bz))
    }
    add(S, new TubeGeometry(new CatmullRomCurve3(rail), 80, 0.03, 6), CM.gold, 0, 0, 0)
    // the glowing opening in the ceiling it climbs into
    P(S, new CircleGeometry(st.r + 0.25, 28).rotateX(Math.PI / 2), '#05070f', st.x, F + CEIL - 0.012, st.z)
    add(S, new TorusGeometry(st.r + 0.25, 0.04, 6, 32).rotateX(Math.PI / 2), CM.gold, st.x, F + CEIL - 0.02, st.z)
    add(S, new CircleGeometry(st.r, 28).rotateX(Math.PI / 2), neon('#ffd9a0', 0.6), st.x, F + CEIL - 0.006, st.z)
    // the sign at its foot
    const sm = signMat(['SKY LOUNGE ↑', 'upstairs · first class'], '#e8b54a')
    P(S, new CylinderGeometry(0.03, 0.05, 1.3, 8), '#c9a14a', st.x + 1.0, F + 0.65, st.z + 1.0)
    add(S, new PlaneGeometry(0.9, 0.23), sm, st.x + 1.0, F + 1.35, st.z + 1.03)
    // solid: you walk round it, never through it (the climb is scripted)
    addFixed(RAPIER.ColliderDesc.cylinder(CEIL / 2, st.r), { x: st.x, y: F + CEIL / 2, z: st.z })
  }
  // The climb: a helix from the bottom step to the top one. t 0..1 -> position + facing.
  stair.at = (t, out = new Vector3()) => {
    const i = t * (stair.steps - 1)
    const a = stair.a0 + i * stair.turn
    out.set(stair.x + Math.cos(a) * 0.55, F + (i + 1) * stair.rise - 0.02, stair.z - Math.sin(a) * 0.55)
    out.face = Math.atan2(-Math.sin(a), -Math.cos(a)) // along the helix, climbing
    return out
  }
  stair.bottom = { x: stair.x + Math.cos(stair.a0) * (stair.r + 0.95), z: stair.z - Math.sin(stair.a0) * (stair.r + 0.95) }

  // ======================================== SKY LOUNGE ========================================
  const UY = F + UP
  const zS = stair.z
  const W2 = 3.4
  const lz0 = zS - 7
  const lz1 = zS + 6
  const lounge = { y: UY, x: X, z: zS, z0: lz0, z1: lz1, hw: W2 }
  {
    const len = lz1 - lz0
    const lc = (lz0 + lz1) / 2
    // floor (First carpet), ceiling (starlight), walls (wood dado, cream above)
    add(L, new PlaneGeometry(W2 * 2, len), CM.floors[0], X, UY + 0.003, lc, -Math.PI / 2)
    solid(W2 + 0.3, 0.25, len / 2 + 0.3, X, UY - 0.25, lc)
    const LH = 3.3
    for (const [mat, y] of [[CM.night, LH - 0.002], [CM.starsA, LH - 0.004], [CM.starsB, LH - 0.006]]) add(L, new PlaneGeometry(W2 * 2, len), mat, X, UY + y, lc, Math.PI / 2)
    solid(W2 + 0.3, 0.25, len / 2 + 0.3, X, UY + LH + 0.25, lc)
    for (const s of [-1, 1]) {
      add(L, new BoxGeometry(0.06, 1.0, len), CM.wood, X + s * W2, UY + 0.5, lc)
      P(L, new BoxGeometry(0.06, LH - 1.0, len), '#efe8da', X + s * W2, UY + 1.0 + (LH - 1.0) / 2, lc)
      add(L, new BoxGeometry(0.04, 0.03, len), CM.gold, X + s * (W2 - 0.04), UY + 1.0, lc)
      add(L, new BoxGeometry(0.03, 0.03, len), CM.light, X + s * (W2 - 0.05), UY + LH - 0.08, lc) // cove (mood)
      solid(0.2, LH / 2, len / 2, X + s * (W2 + 0.15), UY + LH / 2, lc)
      // windows
      for (let wz = lz0 + 1.6; wz < lz1 - 1; wz += 1.4) {
        if (s < 0 && wz > zS + 1.8) continue // the crew rest
        if (s > 0 && wz > zS + 3.2) continue // the spa
        add(L, new PlaneGeometry(0.5, 0.75), CM.window, X + s * (W2 - 0.035), UY + 1.65, wz, 0, -s * Math.PI / 2, 0)
        P(L, rbox(0.04, 0.85, 0.6, 0.02, 1), '#d8d0c0', X + s * (W2 - 0.02), UY + 1.65, wz)
      }
    }
    for (const z of [lz0, lz1]) {
      P(L, new BoxGeometry(W2 * 2, LH, 0.06), '#efe8da', X, UY + LH / 2, z)
      solid(W2, LH / 2, 0.2, X, UY + LH / 2, z + (z === lz0 ? -0.15 : 0.15))
    }
    // the stairwell (aft, centre-right): railing round the opening, the top of the spiral below it
    const sw = { x: X + 0.6, z: zS + 4.3 }
    lounge.well = sw
    P(L, new CircleGeometry(1.05, 28).rotateX(-Math.PI / 2), '#05070f', sw.x, UY + 0.008, sw.z)
    add(L, new TorusGeometry(1.1, 0.035, 6, 32, Math.PI * 1.5).rotateX(Math.PI / 2).rotateY(Math.PI * 0.75), CM.gold, sw.x, UY + 0.95, sw.z)
    for (let i = 0; i <= 12; i++) {
      const a = Math.PI * 0.75 + (i / 12) * Math.PI * 1.5
      P(L, new CylinderGeometry(0.015, 0.015, 0.95, 6), '#c9a14a', sw.x + Math.cos(a) * 1.1, UY + 0.47, sw.z - Math.sin(a) * 1.1)
    }
    for (let i = 0; i < 4; i++) {
      const a = i * 0.45
      add(L, new BoxGeometry(0.85, 0.06, 0.42), CM.wood, sw.x + Math.cos(a) * 0.5, UY - 0.08 - i * 0.27, sw.z - Math.sin(a) * 0.5, 0, a, 0)
    }
    addFixed(RAPIER.ColliderDesc.cylinder(LH / 2, 1.1), { x: sw.x, y: UY + LH / 2, z: sw.z })
    lounge.arrive = { x: sw.x - 0.2, z: sw.z - 2.0, face: Math.PI }
    // THE SKY BAR (front): curved counter, back-lit bottle wall, stools, a bartender spot
    const bz = zS - 4.6
    add(L, rbox(4.0, 1.1, 0.6, 0.06, 2), CM.wood, X, UY + 0.55, bz)
    P(L, rbox(4.1, 0.06, 0.75, 0.03, 1), '#f6efe2', X, UY + 1.12, bz)
    add(L, new BoxGeometry(4.0, 0.02, 0.02), CM.gold, X, UY + 1.08, bz + 0.31)
    for (const s of [-1, 1]) add(L, rbox(0.6, 1.1, 0.6, 0.06, 2), CM.wood, X + s * 2.25, UY + 0.55, bz - 0.25, 0, s * 0.6, 0)
    solid(2.3, 0.6, 0.35, X, UY + 0.6, bz)
    add(L, new PlaneGeometry(4.6, 1.6), CM.bar, X, UY + 1.7, lz0 + 0.04)
    add(L, new BoxGeometry(4.7, 0.03, 0.05), CM.gold, X, UY + 2.55, lz0 + 0.06)
    P(L, rbox(4.6, 0.9, 0.5, 0.03, 1), '#3a2a1c', X, UY + 0.45, lz0 + 0.3)
    lounge.bar = { x: X, z: bz + 0.9 } // where you stand to order
    lounge.barman = { x: X, z: bz - 0.9 }
    lounge.stools = []
    for (const x of [-1.5, -0.5, 0.5, 1.5]) {
      P(L, new CylinderGeometry(0.03, 0.05, 0.72, 8), '#c9a14a', X + x, UY + 0.36, bz + 0.75)
      add(L, rbox(0.38, 0.09, 0.38, 0.05, 2), CM.leatherFirst, X + x, UY + 0.76, bz + 0.75)
      P(L, new TorusGeometry(0.15, 0.012, 4, 14).rotateX(Math.PI / 2), '#c9a14a', X + x, UY + 0.3, bz + 0.75)
      lounge.stools.push({ x: X + x, y: UY + 0.8, z: bz + 0.75, yaw: Math.PI })
    }
    add(L, new PlaneGeometry(2.2, 0.5), signMat(['✦ SKY BAR ✦', 'complimentary for first class'], '#e8b54a'), X, UY + 2.85, lz0 + 0.05)
    // the lounge: a sofa by each window with a round table
    lounge.sofas = []
    for (const s of [-1, 1]) {
      const sx = X + s * (W2 - 0.55)
      const sz = zS - 0.6
      add(L, rbox(0.8, 0.42, 2.4, 0.12, 2), CM.leatherFirst, sx, UY + 0.21, sz)
      add(L, rbox(0.25, 0.75, 2.4, 0.1, 2), CM.leatherFirst, sx + s * 0.32, UY + 0.62, sz)
      for (const e of [-1, 1]) add(L, rbox(0.8, 0.55, 0.2, 0.08, 2), CM.leatherFirst, sx, UY + 0.32, sz + e * 1.2)
      for (const e of [-0.6, 0.6]) P(L, rbox(0.12, 0.32, 0.36, 0.06, 2), s < 0 ? '#c9a14a' : '#7a4a2a', sx + s * 0.18, UY + 0.6, sz + e)
      solid(0.42, 0.4, 1.3, sx, UY + 0.4, sz)
      const tx = X + s * (W2 - 1.6)
      P(L, new CylinderGeometry(0.42, 0.42, 0.05, 24), '#f6efe2', tx, UY + 0.55, sz)
      P(L, new CylinderGeometry(0.05, 0.12, 0.53, 10), '#c9a14a', tx, UY + 0.27, sz)
      P(L, lathe([[0, 0], [0.05, 0], [0.06, 0.12], [0.03, 0.2], [0, 0.2]], 10), '#5a8ad6', tx, UY + 0.575, sz + 0.1) // a vase
      P(L, new SphereGeometry(0.05, 8, 6), '#ff6a9a', tx, UY + 0.8, sz + 0.1)
      solid(0.4, 0.3, 0.4, tx, UY + 0.3, sz)
      for (const e of [-0.6, 0.6]) lounge.sofas.push({ x: sx - s * 0.05, y: UY + 0.45, z: sz + e, yaw: -s * Math.PI / 2 + (s < 0 ? Math.PI : 0) })
    }
    // the chandelier (live glow below)
    // THE SPA (aft right): a frosted glass shower with a rain head
    const spa = { x: X + W2 - 0.6, z: zS + 4.6 }
    lounge.spa = spa
    lounge.spaStand = { x: spa.x - 1.55, z: spa.z }
    P(L, new BoxGeometry(1.1, 0.08, 1.8), '#dfe6ee', spa.x, UY + 0.04, spa.z)
    P(L, new BoxGeometry(0.06, 2.3, 1.8), '#e8eef4', spa.x + 0.58, UY + 1.15, spa.z)
    P(L, new CylinderGeometry(0.2, 0.2, 0.03, 18), '#cfd6e0', spa.x, UY + 2.3, spa.z)
    P(L, new CylinderGeometry(0.015, 0.015, 0.45, 6), '#cfd6e0', spa.x + 0.3, UY + 2.4, spa.z, 0, 0, Math.PI / 2)
    add(L, new PlaneGeometry(1.0, 0.35), signMat(['🚿 SPA'], '#7ad8ff', 256, 96), spa.x, UY + 2.7, spa.z - 0.92)
    solid(0.6, 1.4, 0.95, spa.x, UY + 1.4, spa.z)
    // THE CREW REST (aft left): curtained alcove, two bunks, a locker
    const cr = { x0: X - W2, x1: X - 0.8, z0: zS + 2.0, z1: lz1 }
    lounge.crew = cr
    P(L, new BoxGeometry(0.06, LH, 0.6), '#d6dae1', cr.x1, UY + LH / 2, cr.z0 + 0.3)
    add(L, new PlaneGeometry(1.6, 0.4), signMat(['CREW REST', 'crew only · do not disturb'], '#d6232e', 512, 128), cr.x1 + 0.04, UY + 2.4, cr.z0 + 0.95, 0, Math.PI / 2, 0)
    const curtain = new MeshStandardMaterial({ color: '#1d2b52', roughness: 0.9, side: DoubleSide })
    add(L, new PlaneGeometry(0.9, 2.4), curtain, cr.x1, UY + 1.2, cr.z0 + 1.05, 0, Math.PI / 2, 0)
    for (const y of [0.35, 1.45]) {
      P(L, rbox(0.95, 0.12, 2.1, 0.03, 1), '#5a6170', cr.x0 + 0.5, UY + y, cr.z0 + 2.3)
      P(L, rbox(0.85, 0.12, 2.0, 0.05, 2), '#e8eef4', cr.x0 + 0.5, UY + y + 0.12, cr.z0 + 2.3)
      P(L, rbox(0.5, 0.1, 0.3, 0.05, 2), '#ffffff', cr.x0 + 0.5, UY + y + 0.24, cr.z0 + 3.1)
    }
    P(L, rbox(0.1, 2.1, 2.2, 0.03, 1), '#5a6170', cr.x0 + 1.0, UY + 1.05, cr.z0 + 2.3)
    solid(0.5, 1.0, 1.1, cr.x0 + 0.5, UY + 1.0, cr.z0 + 2.3)
    // locker (bunk end, facing the room)
    const lk = { x: cr.x0 + 0.35, z: lz1 - 0.45 }
    P(L, rbox(0.6, 2.0, 0.5, 0.03, 1), '#8d949f', lk.x + 0.1, UY + 1.0, lk.z)
    for (let i = 0; i < 4; i++) P(L, new BoxGeometry(0.4, 0.015, 0.02), '#5a6170', lk.x + 0.1, UY + 1.6 - i * 0.04, lk.z - 0.26)
    P(L, new BoxGeometry(0.03, 0.18, 0.03), '#2a2f38', lk.x + 0.33, UY + 1.05, lk.z - 0.26)
    solid(0.35, 1.0, 0.3, lk.x + 0.1, UY + 1.0, lk.z)
    lounge.locker = { x: lk.x + 0.6, z: lk.z - 0.9 }
    lounge.bunk = { x: cr.x0 + 0.5, y: UY + 0.47, z: cr.z0 + 2.3 }
    // a soft glow + plants in the corners
    for (const [x, z] of [[X - W2 + 0.4, lz0 + 1.2], [X + W2 - 0.4, lz0 + 1.2]]) {
      P(L, lathe([[0, 0], [0.18, 0], [0.22, 0.4], [0, 0.4]], 12), '#e8e2d4', x, UY, z)
      P(L, new SphereGeometry(0.35, 10, 8).scale(1, 1.3, 1), '#3f9a3a', x, UY + 0.8, z)
    }
  }
  // chandelier (live: it twinkles)
  const chand = new Group()
  chand.position.set(X, UY + 3.3, zS - 0.6)
  {
    const glow = neon('#fff1c4', 2.0)
    add(chand, new CylinderGeometry(0.01, 0.01, 0.5, 4), new MeshStandardMaterial({ color: '#c9a14a', metalness: 0.8, roughness: 0.3 }), 0, -0.25, 0)
    add(chand, new TorusGeometry(0.5, 0.025, 6, 28).rotateX(Math.PI / 2), CM.gold, 0, -0.55, 0)
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2
      add(chand, new SphereGeometry(0.05, 8, 6), glow, Math.cos(a) * 0.5, -0.62 - (i % 2) * 0.08, Math.sin(a) * 0.5)
      add(chand, new CylinderGeometry(0.004, 0.004, 0.2, 3), CM.chrome, Math.cos(a) * 0.5, -0.66, Math.sin(a) * 0.5)
    }
    add(chand, new SphereGeometry(0.12, 12, 10), glow, 0, -0.65, 0)
    chand.userData.glow = glow
  }
  // the spa's frosted glass (live: fogs up in the shower)
  const glass = new MeshStandardMaterial({ color: '#e8f4ff', roughness: 0.15, transparent: true, opacity: 0.35, depthWrite: false })
  const spaGlass = new Mesh(new BoxGeometry(0.05, 2.2, 1.8), glass)
  spaGlass.position.set(lounge.spa.x - 0.55, UY + 1.15, lounge.spa.z)

  const bakedS = bake(S, false)
  const bakedL = bake(L, false)
  for (const b of [bakedS, bakedL]) b.traverse((o) => o.isMesh && (o.receiveShadow = true))
  bakedL.add(chand, spaGlass)
  scene.add(bakedS, bakedL)
  bakedS.visible = bakedL.visible = door.visible = keypad.visible = false

  const doorSt = { open: 0, target: 0 }
  let t = 0
  return {
    cockpit: { zN, zF, halfW, door: { x: X, z: zF }, inside: { x: X - 0.7, z: zF - 0.8 }, outside: { x: X, z: zF + 1.6 }, pilots: [{ x: X - 0.62, z: zN + 2.35 }, { x: X + 0.62, z: zN + 2.35 }], jump: { x: X + 1.45, y: F + 0.56, z: zF - 1.2, yaw: Math.PI / 2 }, note: notePos },
    stair,
    lounge,
    keyLight,
    spaGlass,
    setVisible(v) {
      bakedS.visible = bakedL.visible = door.visible = keypad.visible = v
    },
    // 0 shut .. 1 wide open (into the cockpit); the collider blocks the doorway only while it's shut.
    setDoor(open) {
      doorSt.target = open ? 1 : 0
    },
    get doorOpen() {
      return doorSt.open
    },
    update(dt) {
      t += dt
      doorSt.open += Math.sign(doorSt.target - doorSt.open) * Math.min(Math.abs(doorSt.target - doorSt.open), dt * 1.6)
      door.rotation.y = doorSt.open * 1.65
      skyW.offset.x = (skyW.offset.x + dt * 0.01) % 1
      chand.rotation.y += dt * 0.08
      if (bakedL.visible) retint(chand.userData.glow, '#fff1c4', 1.8 + Math.sin(t * 2.3) * 0.3)
    },
  }
}
