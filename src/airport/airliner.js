// The gate's airliner (and its parked neighbour): a detailed narrow-body jet in the skyhop air
// livery. White fuselage with a blue belly + tail cone, the airline name and a full row of
// windows painted on decals bent onto the hull, door outlines, cockpit glass, swept wings with
// blue winglets, under-wing engines with spinning fan blades, gear, and nav / beacon / strobe lights.
// Local frame: nose toward +Z, up +Y, left side +X; the origin is the fuselage centre.
import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  CylinderGeometry,
  DoubleSide,
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
  TorusGeometry,
} from 'three'
import { bake } from '../bake.js'
import { AIRLINE } from '../config.js'
import { paintSoftDot } from '../textures.js'

export const JET = { r: 2.4, front: 16, back: -16, door: 12.6, rearDoor: -13.2, wingZ: 1, span: 17.5, gearY: -3.4 }
const BLUE = '#1c8cf0'
const FONT = 'Fredoka, "Arial Rounded MT Bold", Arial, sans-serif'

let shared = null
function mats() {
  if (shared) return shared
  shared = {
    white: new MeshStandardMaterial({ color: '#f7f9fc', roughness: 0.28, metalness: 0.12 }),
    blue: new MeshStandardMaterial({ color: BLUE, roughness: 0.3, metalness: 0.15 }),
    blueDark: new MeshStandardMaterial({ color: '#0f5fb0', roughness: 0.35, metalness: 0.2 }),
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
  // Windows: rounded black ovals with a blue glint, one every 0.55 m.
  const wy = 62
  for (let z = JET.front - 1.6; z > JET.back + 1.4; z -= 0.55) {
    if (Math.abs(z - JET.door) < 0.8 || Math.abs(z - JET.rearDoor) < 0.8 || Math.abs(z - 4.4) < 0.5) continue
    const x = zx(z)
    ctx.fillStyle = '#10131a'
    ctx.beginPath()
    ctx.ellipse(x, wy, 9, 14, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(120,180,255,0.55)'
    ctx.beginPath()
    ctx.ellipse(x - 2.5, wy - 4, 3, 5, 0.3, 0, Math.PI * 2)
    ctx.fill()
  }
  // Doors: rounded outlines with a small window.
  ctx.strokeStyle = '#4b5566'
  ctx.lineWidth = 3
  for (const z of [JET.door, JET.rearDoor, 4.4]) {
    const x = zx(z)
    const w = z === 4.4 ? 26 : 46
    const r = 14
    const y0 = z === 4.4 ? 44 : 30
    const y1 = 150
    ctx.beginPath()
    ctx.moveTo(x - w / 2 + r, y0)
    ctx.arcTo(x + w / 2, y0, x + w / 2, y1, r)
    ctx.arcTo(x + w / 2, y1, x - w / 2, y1, r)
    ctx.arcTo(x - w / 2, y1, x - w / 2, y0, r)
    ctx.arcTo(x - w / 2, y0, x + w / 2, y0, r)
    ctx.stroke()
    if (z !== 4.4) {
      ctx.fillStyle = '#10131a'
      ctx.beginPath()
      ctx.ellipse(x, 62, 7, 11, 0, 0, Math.PI * 2)
      ctx.fill()
    }
  }
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

const canvasTex = (c) => {
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 8
  return t
}

// A plane bent onto the hull: u along z (nose -> tail), v around the side from angle a0 to a1
// (0 = level with the centre, + = up) on the +X (side = 1) or -X (side = -1) side.
function hullBand(r, zFront, zBack, a0, a1, side, mat) {
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
  return new Mesh(g, mat)
}

function glowSprite(color, size) {
  const s = new Sprite(new SpriteMaterial({ map: dotTex(), color, transparent: true, depthWrite: false, blending: AdditiveBlending, fog: false }))
  s.scale.set(size, size, 1)
  return s
}
let dot = null
const dotTex = () => (dot ??= new CanvasTexture(paintSoftDot(64)))

export function makeJet() {
  const M = mats()
  const g = new Group()
  const add = (geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    const m = new Mesh(geo, mat)
    m.position.set(x, y, z)
    m.rotation.set(rx, ry, rz)
    g.add(m)
    return m
  }
  const R = JET.r
  const len = JET.front - JET.back
  // Fuselage: white body, blue belly band, nose cone, cockpit glass, tail cone sweeping up.
  add(new CylinderGeometry(R, R, len, 40, 1, true), M.white, 0, 0, (JET.front + JET.back) / 2, Math.PI / 2)
  add(new CylinderGeometry(R + 0.012, R + 0.012, len, 24, 1, true, -Math.PI * 0.32, Math.PI * 0.64), M.blue, 0, 0, (JET.front + JET.back) / 2, Math.PI / 2)
  const nose = add(new SphereGeometry(R, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), M.white, 0, 0, JET.front, Math.PI / 2)
  nose.scale.set(1, 2.3, 1)
  // Cockpit windows: a dark wraparound strip of six panes.
  for (let i = -2; i <= 2; i++) {
    const a = i * 0.32
    const w = add(new BoxGeometry(0.62, 0.42, 0.06), M.glass, Math.sin(a) * 1.72, 1.2, JET.front + 2.9 - Math.abs(i) * 0.45, -0.55, a, 0)
    w.scale.x = i === 0 ? 0.6 : 1
  }
  add(new BoxGeometry(2.6, 0.06, 0.2), M.dark, 0, 0.98, JET.front + 2.75, -0.5) // the frame line under the panes
  // Tail cone: tapers and rises; blue.
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
  add(new SphereGeometry(0.44, 12, 8), M.grey, 0, 1.5, JET.back - 9.5) // APU exhaust
  // Painted side bands (windows, doors, name) on both sides.
  const sideL = new MeshStandardMaterial({ map: canvasTex(paintSide(false)), transparent: true, roughness: 0.3, metalness: 0.1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })
  const sideR = new MeshStandardMaterial({ map: canvasTex(paintSide(true)), transparent: true, roughness: 0.3, metalness: 0.1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })
  const bandL = hullBand(R + 0.02, JET.front + 1, JET.back - 1, -0.95, 0.75, 1, sideL)
  const bandR = hullBand(R + 0.02, JET.back - 1, JET.front + 1, -0.95, 0.75, -1, sideR)
  bandL.renderOrder = bandR.renderOrder = 2
  // Wings: swept, tapered, with a grey flap line and blue winglets.
  const wing = (s) => {
    const sh = new Shape()
    sh.moveTo(s * 1.6, JET.wingZ + 4.2)
    sh.lineTo(s * JET.span, JET.wingZ - 4.6)
    sh.lineTo(s * JET.span, JET.wingZ - 6.2)
    sh.lineTo(s * 7, JET.wingZ - 5.2)
    sh.lineTo(s * 1.6, JET.wingZ - 4.4)
    sh.closePath()
    const geo = new ExtrudeGeometry(sh, { depth: 0.42, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 2 })
    geo.rotateX(Math.PI / 2)
    return geo
  }
  for (const s of [-1, 1]) {
    const w = add(wing(s), M.white, 0, -1.25, 0)
    w.rotation.z = s * 0.07 // dihedral
    // flap line
    const fl = add(new BoxGeometry(JET.span - 3, 0.05, 0.08), M.grey, s * (JET.span / 2 + 1.4), -1.12 + Math.abs(JET.span / 2) * 0.07, JET.wingZ - 4.9)
    fl.rotation.y = s * -0.06
    fl.rotation.z = s * 0.07
    // winglet
    const wl = new Shape()
    wl.moveTo(0, 0)
    wl.lineTo(1.6, 0)
    wl.lineTo(2.3, 2.4)
    wl.lineTo(1.6, 2.4)
    wl.closePath()
    const wg = new ExtrudeGeometry(wl, { depth: 0.12, bevelEnabled: false })
    wg.rotateY(Math.PI / 2)
    add(wg, M.blue, s * (JET.span - 0.05), -1.25 + JET.span * 0.07 + 0.05, JET.wingZ - 4.6)
    // Horizontal stabilisers.
    const st = new Shape()
    st.moveTo(s * 0.4, JET.back - 2.6)
    st.lineTo(s * 6.6, JET.back - 7.2)
    st.lineTo(s * 6.6, JET.back - 8.4)
    st.lineTo(s * 0.4, JET.back - 7.6)
    st.closePath()
    const sg = new ExtrudeGeometry(st, { depth: 0.22, bevelEnabled: false })
    sg.rotateX(Math.PI / 2)
    add(sg, M.white, 0, 1.0, 0)
  }
  // Wing-to-body fairing.
  const fair = add(new SphereGeometry(1, 20, 12), M.white, 0, -1.7, JET.wingZ - 0.8)
  fair.scale.set(2.35, 1.0, 5.4)
  // Fin: blue, swept, with the logo on both sides.
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
  const logoMat = new MeshStandardMaterial({ map: canvasTex(paintLogo()), transparent: true, roughness: 0.3, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })
  for (const s of [-1, 1]) {
    const lg = add(new PlaneGeometry(3, 3), logoMat, s * 0.32, 5.6, JET.back - 7.4, 0, s * Math.PI / 2)
    lg.renderOrder = 2
  }

  // Engines: blue nacelles on white pylons; dark intake; a spinning fan (kept live).
  const fans = []
  const engines = []
  for (const s of [-1, 1]) {
    const ex = s * 6.4
    const ey = -2.65
    const ez = JET.wingZ + 3.4
    add(new CylinderGeometry(1.15, 0.95, 3.8, 28, 1, true), M.blue, ex, ey, ez, Math.PI / 2)
    add(new TorusGeometry(1.12, 0.13, 10, 28), M.steel, ex, ey, ez + 1.9)
    add(new CylinderGeometry(1.05, 1.05, 0.1, 28), M.dark, ex, ey, ez + 1.3, Math.PI / 2)
    add(new CylinderGeometry(0.7, 0.32, 1.4, 20), M.grey, ex, ey, ez - 2.4, Math.PI / 2) // exhaust cone
    add(new CylinderGeometry(0.85, 0.72, 0.6, 24, 1, true), M.dark, ex, ey, ez - 1.95, Math.PI / 2)
    const py = add(new BoxGeometry(0.35, 1.1, 3.6), M.white, ex, ey + 1.05, ez - 0.4)
    py.rotation.x = 0.05
    const fan = new Group()
    fan.position.set(ex, ey, ez + 1.45)
    const spinner = new Mesh(new SphereGeometry(0.34, 16, 10), M.steel)
    spinner.scale.z = 1.6
    fan.add(spinner)
    const spiral = new Mesh(new BoxGeometry(0.04, 0.3, 0.02), M.white)
    spiral.position.set(0.12, 0.08, 0.5)
    fan.add(spiral)
    for (let i = 0; i < 18; i++) {
      const b = new Mesh(new BoxGeometry(0.16, 0.92, 0.03), M.fan)
      const a = (i / 18) * Math.PI * 2
      b.position.set(Math.sin(a) * 0.62, Math.cos(a) * 0.62, 0)
      b.rotation.set(0, 0.45, -a)
      fan.add(b)
    }
    // one draw call per material for the whole fan, spun as a unit
    const fb = bake(fan, false)
    fb.position.copy(fan.position)
    fans.push(fb)
    engines.push([ex, ey, ez - 3])
  }
  // Landing gear: nose (2 wheels), mains (4 wheels each side).
  const wheel = (x, y, z, r = 0.5, w = 0.36) => {
    add(new CylinderGeometry(r, r, w, 18), M.tyre, x, y, z, 0, 0, Math.PI / 2)
    add(new CylinderGeometry(r * 0.5, r * 0.5, w + 0.02, 12), M.grey, x, y, z, 0, 0, Math.PI / 2)
  }
  const gy = JET.gearY
  add(new CylinderGeometry(0.12, 0.12, 1.5, 10), M.steel, 0, gy + 1.3, JET.front - 1.2)
  for (const s of [-1, 1]) wheel(s * 0.26, gy + 0.42, JET.front - 1.2, 0.42, 0.24)
  for (const s of [-1, 1]) {
    add(new CylinderGeometry(0.16, 0.16, 1.6, 10), M.steel, s * 2.6, gy + 1.4, JET.wingZ - 2.4)
    add(new BoxGeometry(0.2, 0.14, 1.3), M.steel, s * 2.6, gy + 0.55, JET.wingZ - 2.4)
    for (const dz of [-0.55, 0.55]) for (const dx of [-0.32, 0.32]) wheel(s * 2.6 + dx, gy + 0.5, JET.wingZ - 2.4 + dz)
    // gear doors
    add(new BoxGeometry(0.06, 1.3, 1.5), M.white, s * 2.05, gy + 1.6, JET.wingZ - 2.4)
  }
  // Antennas + belly beacon mount.
  add(new BoxGeometry(0.06, 0.4, 0.3), M.dark, 0, R + 0.15, 4)
  add(new BoxGeometry(0.06, 0.3, 0.3), M.dark, 0, -R - 0.12, 6)

  const root = bake(g, true)
  root.add(bandL, bandR)
  for (const f of fans) root.add(f)
  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = o !== bandL && o !== bandR
      o.receiveShadow = true
    }
  })

  // Lights: red beacons top + bottom, red / green wingtips, white tail strobe.
  const beacons = [glowSprite('#ff2a2a', 2.2), glowSprite('#ff2a2a', 2.2)]
  beacons[0].position.set(0, R + 0.25, 2)
  beacons[1].position.set(0, -R - 0.25, 1)
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
