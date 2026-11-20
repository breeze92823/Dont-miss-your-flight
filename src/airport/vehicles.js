// Vehicle models, built from primitives and extruded side profiles, then baked
// to a handful of meshes each. Local frame: forward = +Z, up = +Y, the car's
// right side = -X (so a car driving toward world -X has its right side to -Z,
// the terminal curb).
import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
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
} from 'three'
import { bake } from '../bake.js'
import { paintSoftDot } from '../textures.js'
import { paintCheckers, paintLed, paintTaxiSign, tex } from './paint.js'

const mats = new Map()
function mat(key, make) {
  if (!mats.has(key)) mats.set(key, make())
  return mats.get(key)
}
const paint = (color, extra = {}) => mat(`p${color}${JSON.stringify(extra)}`, () => new MeshStandardMaterial({ color, roughness: 0.32, metalness: 0.15, ...extra }))
const GLASS = () => mat('glass', () => new MeshStandardMaterial({ color: '#0f141d', roughness: 0.08, metalness: 0.7 }))
const BLACK = () => mat('black', () => new MeshStandardMaterial({ color: '#161718', roughness: 0.85, side: DoubleSide }))
const TRIM = () => mat('trim', () => new MeshStandardMaterial({ color: '#3b3f47', roughness: 0.6 }))
const CHROME = () => mat('chrome', () => new MeshStandardMaterial({ color: '#d7dbe2', roughness: 0.2, metalness: 0.9 }))
const WHITE = () => mat('white', () => new MeshStandardMaterial({ color: '#f2f2f2', roughness: 0.5 }))

let glowTex = null
function glowSprite(color, scale) {
  if (!glowTex) {
    glowTex = new CanvasTexture(paintSoftDot(64))
    glowTex.colorSpace = SRGBColorSpace
  }
  const s = new Sprite(new SpriteMaterial({ map: glowTex, color, transparent: true, blending: AdditiveBlending, depthWrite: false, opacity: 0.8 }))
  s.scale.setScalar(scale)
  return s
}

function add(parent, geo, material, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new Mesh(geo, material)
  m.position.set(x, y, z)
  m.rotation.set(rx, ry, rz)
  parent.add(m)
  return m
}

// Side profile (length along shape x, height along shape y) extruded across the width.
function profile(points, width, bevel = 0.05) {
  const s = new Shape()
  points.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)))
  s.closePath()
  const g = new ExtrudeGeometry(s, { depth: width - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 1 })
  g.rotateY(-Math.PI / 2) // shape x -> +Z, extrusion -> -X
  g.translate((width - bevel * 2) / 2, 0, 0)
  return g
}

function wheel(r, w, spokes = 5) {
  const g = new Group()
  add(g, new CylinderGeometry(r, r, w, 22), mat('tire', () => new MeshStandardMaterial({ color: '#1b1c1f', roughness: 0.9 })), 0, 0, 0, 0, 0, Math.PI / 2)
  add(g, new CylinderGeometry(r * 0.62, r * 0.62, w + 0.02, 16), CHROME(), 0, 0, 0, 0, 0, Math.PI / 2)
  add(g, new CylinderGeometry(r * 0.2, r * 0.2, w + 0.04, 10), TRIM(), 0, 0, 0, 0, 0, Math.PI / 2)
  for (let i = 0; i < spokes; i++) add(g, new BoxGeometry(w + 0.03, r * 1.1, r * 0.12), TRIM(), 0, 0, 0, (i / spokes) * Math.PI, 0, 0)
  return bake(g, true)
}

// A sedan. taxi: yellow with checker strip, roof sign and an opening rear-right door.
export function makeCar({ color = '#f6b800', taxi = false, glow = false } = {}) {
  const root = new Group()
  const body = new Group()
  root.add(body)
  const shell = new Group()
  const bodyMat = paint(color)
  const W = 1.8

  shell.add(new Mesh(profile([[-2.35, 0.3], [2.35, 0.3], [2.42, 0.62], [2.3, 0.86], [1.1, 0.98], [-1.5, 1.0], [-2.3, 0.95], [-2.42, 0.7]], W), bodyMat))
  shell.add(new Mesh(profile([[-1.45, 0.96], [1.12, 0.95], [0.5, 1.5], [-0.95, 1.52]], 1.52, 0.03), GLASS()))
  add(shell, new BoxGeometry(1.5, 0.06, 1.5), bodyMat, 0, 1.53, -0.22)
  add(shell, new BoxGeometry(1.55, 0.54, 0.1), bodyMat, 0, 1.24, -0.2) // B pillar
  add(shell, new BoxGeometry(1.55, 0.74, 0.12), bodyMat, 0, 1.25, -1.2, 0.75) // C pillar
  add(shell, new BoxGeometry(1.55, 0.8, 0.08), bodyMat, 0, 1.23, 0.8, -0.85) // A pillar
  // Wheel wells, bumpers, grille, plates, mirrors, handles, seams.
  for (const x of [-0.904, 0.904]) for (const z of [-1.45, 1.45]) {
    const arch = add(shell, new CircleGeometry(0.43, 16, 0, Math.PI), BLACK(), x, 0.33, z, 0, x > 0 ? Math.PI / 2 : -Math.PI / 2)
    arch.scale.set(1, 1, 1)
  }
  add(shell, new BoxGeometry(1.86, 0.22, 0.2), TRIM(), 0, 0.42, 2.38)
  add(shell, new BoxGeometry(1.86, 0.22, 0.2), TRIM(), 0, 0.42, -2.4)
  add(shell, new BoxGeometry(1.0, 0.14, 0.05), BLACK(), 0, 0.64, 2.41)
  add(shell, new BoxGeometry(0.52, 0.13, 0.02), WHITE(), 0, 0.46, 2.49)
  add(shell, new BoxGeometry(0.52, 0.13, 0.02), WHITE(), 0, 0.46, -2.51)
  for (const s of [-1, 1]) {
    add(shell, new BoxGeometry(0.16, 0.1, 0.2), bodyMat, s * 1.0, 1.05, 0.95)
    add(shell, new BoxGeometry(0.03, 0.04, 0.16), TRIM(), s * 0.915, 0.86, 0.35)
    for (const z of [1.1, -1.3]) add(shell, new BoxGeometry(0.012, 0.6, 0.012), BLACK(), s * 0.906, 0.66, z)
    if (!(taxi && s < 0)) {
      add(shell, new BoxGeometry(0.012, 0.6, 0.012), BLACK(), s * 0.906, 0.66, -0.2)
      add(shell, new BoxGeometry(0.03, 0.04, 0.16), TRIM(), s * 0.915, 0.86, -0.75)
    }
  }
  if (taxi) {
    const chk = mat('checkers', () => {
      const t = tex(paintCheckers(), { repeatX: 3, repeatY: 1 })
      return new MeshStandardMaterial({ map: t, roughness: 0.5 })
    })
    const strip = (x, z0, z1) => {
      const len = z1 - z0
      const g = new PlaneGeometry(len, 0.1)
      g.rotateY(x > 0 ? Math.PI / 2 : -Math.PI / 2)
      add(shell, g, chk, x, 0.7, (z0 + z1) / 2)
    }
    strip(0.908, -1.9, 2.0)
    strip(-0.908, -0.2, 2.0)
    strip(-0.908, -1.9, -1.25)
    // Dark cabin behind the opening door.
    const hole = new PlaneGeometry(1.05, 0.63)
    hole.rotateY(-Math.PI / 2)
    add(shell, hole, mat('cabin', () => new MeshStandardMaterial({ color: '#2a2b31', roughness: 0.9 })), -0.904, 0.66, -0.725)
  }
  body.add(bake(shell, true))

  // Lights (own materials so they can be driven).
  const headMat = new MeshStandardMaterial({ color: '#fffbe8', emissive: '#fff4cc', emissiveIntensity: 2.2 })
  const brakeMat = new MeshStandardMaterial({ color: '#7a0d12', emissive: '#ff1a24', emissiveIntensity: 0.9 })
  for (const s of [-1, 1]) {
    add(body, new BoxGeometry(0.36, 0.13, 0.05), headMat, s * 0.6, 0.73, 2.375)
    add(body, new BoxGeometry(0.34, 0.14, 0.05), brakeMat, s * 0.62, 0.82, -2.37)
    if (glow) {
      const g = glowSprite('#fff2c8', 1.1)
      g.position.set(s * 0.6, 0.73, 2.5)
      body.add(g)
    }
  }
  const brakeGlow = glow ? [-1, 1].map((s) => {
    const g = glowSprite('#ff3030', 0.7)
    g.position.set(s * 0.62, 0.82, -2.5)
    g.material.opacity = 0.2
    body.add(g)
    return g
  }) : []

  let signMat = null
  if (taxi) {
    const t = tex(paintTaxiSign())
    signMat = new MeshStandardMaterial({ map: t, emissiveMap: t, emissive: '#ffffff', emissiveIntensity: 0.6, roughness: 0.4 })
    const side = mat('signside', () => new MeshStandardMaterial({ color: '#f3e3b4', roughness: 0.5 }))
    const sign = new Mesh(new BoxGeometry(0.62, 0.22, 0.26), [side, side, side, side, signMat, signMat])
    sign.rotation.y = Math.PI / 2 // text faces the sides, readable from the curb and the road
    sign.position.set(0, 1.67, -0.25)
    sign.castShadow = true
    body.add(sign)
  }

  // Rear-right door on a hinge at its front edge; opens with a positive rotation.y.
  let door = null
  if (taxi) {
    door = new Group()
    door.position.set(-0.9, 0, -0.2)
    const d = new Group()
    add(d, new BoxGeometry(0.06, 0.64, 1.05), bodyMat, -0.03, 0.66, -0.525)
    add(d, new BoxGeometry(0.04, 0.46, 0.92), GLASS(), 0.12, 1.2, -0.5)
    add(d, new BoxGeometry(0.03, 0.04, 0.16), TRIM(), -0.07, 0.86, -0.55)
    const g = new PlaneGeometry(1.05, 0.1)
    g.rotateY(-Math.PI / 2)
    add(d, g, mat('checkers', () => null), -0.062, 0.7, -0.525)
    door.add(bake(d, true))
    body.add(door)
  }

  const wheels = []
  const proto = wheel(0.36, 0.26)
  for (const x of [-0.82, 0.82]) for (const z of [-1.45, 1.45]) {
    const w = proto.clone()
    w.position.set(x, 0.36, z)
    root.add(w)
    wheels.push(w)
  }

  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true
      o.receiveShadow = true
    }
  })
  return {
    root,
    body,
    wheels,
    door,
    wheelRadius: 0.36,
    setBrake(k) {
      brakeMat.emissiveIntensity = 0.9 + k * 4
      for (const g of brakeGlow) g.material.opacity = 0.2 + k * 0.8
    },
    signMat,
  }
}

// City bus (white with a blue skirt, red rear-corner stripes, LED destination sign).
export function makeBus({ stripe = '#1f6fe0', dest = 'AIRPORT EXPRESS' } = {}) {
  const g = new Group()
  const white = paint('#f4f6f9')
  g.add(new Mesh(profile([[-6, 0.45], [6, 0.45], [6.05, 2.6], [5.85, 3.1], [-5.95, 3.1], [-6.05, 2.9]], 2.55, 0.08), white))
  add(g, new BoxGeometry(2.58, 0.72, 12.1), paint(stripe), 0, 0.82, 0)
  add(g, new BoxGeometry(2.6, 1.12, 10.4), GLASS(), 0, 2.02, -0.4)
  add(g, new BoxGeometry(2.3, 1.7, 0.06), GLASS(), 0, 2.15, 6.06)
  add(g, new BoxGeometry(2.3, 0.9, 0.06), GLASS(), 0, 2.3, -6.06)
  for (const s of [-1, 1]) {
    add(g, new BoxGeometry(0.06, 1.7, 0.32), paint('#d6232e'), s * 1.3, 1.75, -5.7)
    add(g, new BoxGeometry(0.06, 1.7, 0.32), paint('#d6232e'), s * 1.3, 1.75, 5.75)
    for (const z of [-4, 4]) add(g, new CircleGeometry(0.62, 16, 0, Math.PI), BLACK(), s * 1.295, 0.45, z, 0, s > 0 ? Math.PI / 2 : -Math.PI / 2)
    for (let i = 0; i < 6; i++) add(g, new BoxGeometry(2.62, 1.1, 0.06), white, 0, 2.02, -5 + i * 1.85) // window posts
  }
  for (const z of [4.2, 0.2]) add(g, new BoxGeometry(0.05, 2.3, 1.2), GLASS(), -1.3, 1.6, z) // doors (curb side)
  for (const s of [-1, 1]) add(g, new BoxGeometry(0.4, 0.16, 0.05), mat('bh', () => new MeshStandardMaterial({ color: '#fff', emissive: '#fff6d6', emissiveIntensity: 1.5 })), s * 0.85, 0.75, 6.09)
  const led = tex(paintLed(dest))
  add(g, new BoxGeometry(1.8, 0.3, 0.05), new MeshStandardMaterial({ map: led, emissiveMap: led, emissive: '#ffffff', emissiveIntensity: 1.4 }), 0, 2.92, 6.07)
  const baked = bake(g, true)
  const proto = wheel(0.5, 0.34, 6)
  for (const x of [-1.1, 1.1]) for (const z of [-4, 4]) {
    const w = proto.clone()
    w.position.set(x, 0.5, z)
    baked.add(w)
  }
  baked.traverse((o) => {
    if (o.isMesh) o.receiveShadow = true
  })
  return baked
}

// Fuselage texture: v runs along the plane, window rows on both sides (u = 0.25 / 0.75).
function paintPlaneSkin() {
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 512
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#f7f9fc'
  ctx.fillRect(0, 0, 128, 512)
  for (const u of [32, 96]) {
    ctx.fillStyle = '#1d5fd6'
    ctx.fillRect(u - 5 + (u < 64 ? 3 : -3), 0, 4, 512)
    ctx.fillStyle = '#26324a'
    for (let v = 40; v < 470; v += 12) ctx.fillRect(u - 2, v, 4, 7)
  }
  return c
}

// Airliner, ~40 m long. Forward = +Z.
export function makeAirliner() {
  const g = new Group()
  const white = mat('planeWhite', () => new MeshStandardMaterial({ color: '#f5f7fb', roughness: 0.35, metalness: 0.2 }))
  const blue = paint('#1d5fd6')
  const grey = paint('#9aa3b2')
  const skin = new MeshStandardMaterial({ map: tex(paintPlaneSkin()), roughness: 0.35, metalness: 0.2 })
  add(g, new CylinderGeometry(2, 2, 28, 20, 1, true), skin, 0, 0, 0, Math.PI / 2)
  const nose = add(g, new SphereGeometry(2, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), white, 0, 0, 14, Math.PI / 2)
  nose.scale.set(1, 2.2, 1)
  add(g, new CylinderGeometry(2, 0.5, 9, 20), white, 0, 0.5, -18.5, Math.PI / 2 - 0.08)
  add(g, new BoxGeometry(2.6, 0.5, 1), GLASS(), 0, 0.9, 15.6, -0.5) // cockpit windows
  const wingShape = (s) => {
    const sh = new Shape()
    sh.moveTo(s * 1.5, 4)
    sh.lineTo(s * 18, -3.5)
    sh.lineTo(s * 18, -5.5)
    sh.lineTo(s * 1.5, -4)
    sh.closePath()
    const geo = new ExtrudeGeometry(sh, { depth: 0.45, bevelEnabled: false })
    geo.rotateX(Math.PI / 2)
    return geo
  }
  for (const s of [-1, 1]) {
    add(g, wingShape(s), white, 0, -0.8, 0)
    add(g, new CylinderGeometry(0.95, 0.8, 3.6, 16), grey, s * 6.5, -2.1, 1.6, Math.PI / 2)
    add(g, new CylinderGeometry(0.75, 0.75, 0.2, 16), BLACK(), s * 6.5, -2.1, 3.42, Math.PI / 2)
    const st = new Shape()
    st.moveTo(s * 0.5, -16.5)
    st.lineTo(s * 7, -20.5)
    st.lineTo(s * 7, -21.8)
    st.lineTo(s * 0.5, -21)
    st.closePath()
    const sg = new ExtrudeGeometry(st, { depth: 0.3, bevelEnabled: false })
    sg.rotateX(Math.PI / 2)
    add(g, sg, white, 0, 1.2, 0)
  }
  const fin = new Shape()
  fin.moveTo(-15.5, 1.5)
  fin.lineTo(-21.5, 9)
  fin.lineTo(-24, 9)
  fin.lineTo(-22.5, 1.5)
  fin.closePath()
  const fg = new ExtrudeGeometry(fin, { depth: 0.4, bevelEnabled: false })
  fg.rotateY(-Math.PI / 2)
  fg.translate(0.2, 0, 0)
  add(g, fg, blue, 0, 0, 0)
  const baked = bake(g, false)
  // Navigation lights: red / green wingtips + white strobe (unlit, bright).
  const tips = {}
  for (const [s, c] of [[-1, '#ff2a2a'], [1, '#2aff5a']]) {
    const l = glowSprite(c, 3)
    l.position.set(s * 18, -0.6, -4.6)
    baked.add(l)
    tips[s] = l
  }
  const strobe = glowSprite('#ffffff', 4)
  strobe.position.set(0, 2.2, -2)
  baked.add(strobe)
  return { root: baked, strobe, engines: [[-6.5, -2.1, -0.5], [6.5, -2.1, -0.5]] }
}
