// Vehicle models, built from rounded primitives and extruded side profiles, then baked
// to a handful of meshes each. Local frame: forward = +Z, up = +Y, the car's
// right side = -X (so a car driving toward world -X has its right side to -Z,
// the terminal curb).
//
// Every model is built once as a baked prototype and cloned per instance (shared
// geometry + materials): the body colour is swapped in on the clone, the few driven
// materials (brake lights, taxi sign, bus LED) stay per instance.
// Small dark / trim parts use one vertex-coloured material, wheels another, so a car
// is ~11 draw calls (a taxi ~16) instead of ~25.
import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  CanvasTexture,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  LatheGeometry,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector2,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { bake } from '../bake.js'
import { lathe, rbox, ring, roundSlab } from '../detail.js'
import { paintSoftDot } from '../textures.js'
import { paintCheckers, paintLed, paintTaxiSign, tex } from './paint.js'

const mats = new Map()
function mat(key, make) {
  if (!mats.has(key)) mats.set(key, make())
  return mats.get(key)
}
const paint = (color, extra = {}) => mat(`p${color}${JSON.stringify(extra)}`, () => new MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.22, ...extra }))
// Opaque tinted glass (bus, plane); cars get see-through glass so the cabin shows.
const GLASS = () => mat('glass', () => new MeshStandardMaterial({ color: '#0f141d', roughness: 0.08, metalness: 0.7 }))
const CAR_GLASS = () => mat('carGlass', () => new MeshStandardMaterial({ color: '#1b2838', roughness: 0.04, metalness: 0.55, transparent: true, opacity: 0.58, depthWrite: false }))
// Vertex-coloured dark parts: bumpers, trims, seals, seats, liners, plates.
const DARK = () => mat('darkVC', () => new MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.72, metalness: 0.05, side: DoubleSide }))
const WHEEL = () => mat('wheelVC', () => new MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.58, metalness: 0.22 }))
const CHROME = () => mat('chrome', () => new MeshStandardMaterial({ color: '#d7dbe2', roughness: 0.18, metalness: 0.9 }))
const HEAD = () => mat('head', () => new MeshStandardMaterial({ color: '#fffbe8', emissive: '#fff4cc', emissiveIntensity: 2.2, roughness: 0.2 }))
const AMBER = () => mat('amber', () => new MeshStandardMaterial({ color: '#ffb347', emissive: '#ff8a00', emissiveIntensity: 0.7, roughness: 0.3 }))
const TAIL = () => mat('tail', () => new MeshStandardMaterial({ color: '#7a0d12', emissive: '#ff1a24', emissiveIntensity: 0.9, roughness: 0.3 }))
// Placeholder for "the body colour": swapped for paint(color) on each clone.
const BODY = () => mat('body', () => {
  const m = new MeshStandardMaterial({ color: '#ff00ff' })
  m.userData.k = 'body'
  return m
})

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

function add(parent, geo, material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new Mesh(geo, material)
  m.position.set(x, y, z)
  m.rotation.set(rx, ry, rz)
  parent.add(m)
  return m
}

// Vertex colour for a whole geometry (non-indexed copy). color: css string / Color.
export function tint(geo, color) {
  const g = geo.index ? geo.toNonIndexed() : geo
  const c = color instanceof Color ? color : new Color(color)
  const n = g.attributes.position.count
  const a = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    a[i * 3] = c.r
    a[i * 3 + 1] = c.g
    a[i * 3 + 2] = c.b
  }
  g.setAttribute('color', new BufferAttribute(a, 3))
  return g
}
// A dark vertex-coloured part.
const dk = (parent, geo, color, x, y, z, rx, ry, rz) => add(parent, tint(geo, color), DARK(), x, y, z, rx, ry, rz)

// A part stretched between two points (geometry built along +Y with the given length).
const UP = new Vector3(0, 1, 0)
function link(parent, material, a, b, make) {
  const A = new Vector3(...a)
  const B = new Vector3(...b)
  const len = A.distanceTo(B)
  const m = new Mesh(make(len), material)
  m.position.copy(A).add(B).multiplyScalar(0.5)
  m.quaternion.setFromUnitVectors(UP, B.sub(A).normalize())
  parent.add(m)
  return m
}

// Side profile (Shape: length along shape x, height along shape y) extruded across the
// width, centred on x = 0. The outline stays where it is drawn; the side faces are inset
// by the bevel so every edge comes out rounded.
function side(shape, width, bevel = 0.05, bevelSegments = 2, curveSegments = 5) {
  const g = new ExtrudeGeometry(shape, {
    depth: width - bevel * 2,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: -bevel,
    bevelSegments,
    curveSegments,
  })
  g.rotateY(-Math.PI / 2) // shape x -> +Z, extrusion -> -X
  g.translate((width - bevel * 2) / 2, 0, 0)
  return g
}

// Clone a baked prototype, swapping the body placeholder for the real paint.
function cloneWith(proto, bodyMat) {
  const c = proto.clone()
  const ph = BODY()
  c.traverse((o) => {
    if (o.isMesh && o.material === ph) o.material = bodyMat
  })
  return c
}

// --- Wheels ----------------------------------------------------------------------------
// One vertex-coloured mesh: tyre with rounded sidewalls, rim lip, dark dish, spokes,
// hub cap with lug nuts. Hub faces +X; wheels on the -X side are turned round inside
// their group, so the returned group can still be spun on x / steered on y.
const wheelGeos = new Map()
function wheelGeo(r, w, spokes) {
  const key = `${r}|${w}|${spokes}`
  if (wheelGeos.has(key)) return wheelGeos.get(key)
  const h = w / 2
  const parts = []
  const P = (geo, color) => parts.push(tint(geo, color))
  P(lathe([[r * 0.68, -h], [r * 0.9, -h], [r * 0.985, -h + w * 0.13], [r, -h + w * 0.3], [r, h - w * 0.3], [r * 0.985, h - w * 0.13], [r * 0.9, h], [r * 0.68, h]], 14), '#1c1d21')
  P(lathe([[r * 0.69, h - w * 0.25], [r * 0.7, h + 0.004], [r * 0.66, h + 0.01], [r * 0.62, h - w * 0.05], [r * 0.6, h - w * 0.15]], 14), '#cfd4dc')
  P(new CircleGeometry(r * 0.61, 14).rotateX(-Math.PI / 2).translate(0, h - w * 0.15, 0), '#565c67')
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2
    P(new BoxGeometry(r * 0.14, w * 0.09, r * 0.42).translate(0, h - w * 0.1, r * 0.39).rotateY(a), '#d6dae1')
  }
  P(new CylinderGeometry(r * 0.2, r * 0.24, w * 0.18, 12).translate(0, h - w * 0.08, 0), '#d6dae1')
  P(new CylinderGeometry(r * 0.065, r * 0.065, 0.012, 8).translate(0, h + 0.012, 0), '#3c4048')
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2
    P(new BoxGeometry(r * 0.06, 0.02, r * 0.06).rotateY(a).translate(Math.sin(a) * r * 0.135, h + 0.01, Math.cos(a) * r * 0.135), '#8b919b')
  }
  P(new CircleGeometry(r * 0.7, 12).rotateX(Math.PI / 2).translate(0, -h + 0.02, 0), '#1a1b1e')
  const g = mergeGeometries(parts)
  g.rotateZ(-Math.PI / 2) // axle along X, hub toward +X
  wheelGeos.set(key, g)
  return g
}
function wheel(r, w, spokes, x) {
  const g = new Group()
  const m = new Mesh(wheelGeo(r, w, spokes), WHEEL())
  if (x < 0) m.rotation.y = Math.PI
  m.castShadow = true
  m.receiveShadow = true
  g.add(m)
  return g
}

// --- Car ----------------------------------------------------------------------------------
const R_ARCH = 0.47
function carBodyShape() {
  const s = new Shape()
  const a = Math.asin(0.06 / R_ARCH)
  s.moveTo(-2.05, 0.3)
  s.absarc(-1.45, 0.36, R_ARCH, Math.PI + a, -a, true)
  s.absarc(1.45, 0.36, R_ARCH, Math.PI + a, -a, true)
  s.lineTo(2.26, 0.3)
  s.quadraticCurveTo(2.42, 0.31, 2.42, 0.5)
  s.lineTo(2.41, 0.66)
  s.quadraticCurveTo(2.39, 0.86, 2.15, 0.885)
  s.lineTo(1.18, 0.97)
  s.lineTo(-1.5, 1.0)
  s.lineTo(-2.15, 0.97)
  s.quadraticCurveTo(-2.4, 0.95, -2.42, 0.74)
  s.lineTo(-2.41, 0.45)
  s.quadraticCurveTo(-2.4, 0.3, -2.22, 0.3)
  return s
}
function greenhouseShape() {
  const s = new Shape()
  s.moveTo(-1.62, 0.9)
  s.lineTo(1.22, 0.9)
  s.lineTo(1.2, 0.96)
  s.quadraticCurveTo(0.78, 1.33, 0.46, 1.49)
  s.quadraticCurveTo(-0.22, 1.535, -0.92, 1.5)
  s.quadraticCurveTo(-1.3, 1.28, -1.6, 0.97)
  return s
}
// Taxi rear-right door outline in door space (hinge at z = 0), notched round the rear arch.
function doorShape() {
  const s = new Shape()
  const R = 0.56
  s.moveTo(0, 0.36)
  s.absarc(-1.25, 0.36, R, 0, Math.acos(0.2 / R), false)
  s.lineTo(-1.05, 0.975)
  s.lineTo(0, 0.975)
  return s
}

const shells = new Map()
function carShell(taxi) {
  if (shells.has(taxi)) return shells.get(taxi)
  const g = new Group()
  const B = BODY()
  add(g, side(carBodyShape(), 1.8, 0.1, 2, 5), B)
  add(g, side(greenhouseShape(), 1.56, 0.06, 1, 5), CAR_GLASS())
  add(g, roundSlab(1.48, 1.44, 0.07, 0.22, 0.02, 3), B, 0, 1.54, -0.23)

  // Pillars: A + C in body colour, B blacked out; beltline + roof-edge trims.
  // (rounded boxes only where the rounding reads; tiny parts are plain boxes)
  for (const s of [-1, 1]) {
    const x = s * 0.775
    link(g, B, [x, 0.97, 1.17], [x, 1.5, 0.47], (l) => rbox(0.07, l, 0.1, 0.03, 1))
    link(g, B, [x, 0.87, -1.52], [x, 1.4, -0.84], (l) => rbox(0.07, l, 0.26, 0.03, 1))
    link(g, DARK(), [x, 0.97, -0.2], [x, 1.5, -0.2], (l) => tint(new BoxGeometry(0.065, l, 0.1), '#17181b'))
    dk(g, new BoxGeometry(0.05, 0.035, 2.62), '#1d1e22', s * 0.79, 0.985, -0.2)
    dk(g, new BoxGeometry(0.04, 0.03, 1.4), '#1d1e22', s * 0.752, 1.505, -0.23)
  }

  // Cabin: dark floor at the beltline, dashboard, steering wheel, seats + headrests.
  dk(g, new BoxGeometry(1.5, 0.02, 2.56), '#2a2c31', 0, 1.006, -0.2)
  dk(g, rbox(1.44, 0.14, 0.32, 0.05, 1), '#232529', 0, 1.07, 0.93)
  dk(g, ring(0.14, 0.02, 12, 4), '#1b1c1f', 0.38, 1.19, 0.66, -0.5)
  for (const s of [-1, 1]) {
    dk(g, rbox(0.5, 0.46, 0.12, 0.05, 1), '#474a54', s * 0.38, 1.16, -0.02, -0.2)
    dk(g, new BoxGeometry(0.26, 0.14, 0.08), '#474a54', s * 0.38, 1.43, -0.08, -0.2)
    dk(g, new BoxGeometry(0.26, 0.13, 0.08), '#474a54', s * 0.42, 1.37, -1.3, -0.28)
  }
  dk(g, rbox(1.38, 0.42, 0.14, 0.05, 1), '#474a54', 0, 1.14, -1.22, -0.28)

  // Wheel-arch liners.
  for (const z of [-1.45, 1.45]) dk(g, new CylinderGeometry(0.455, 0.455, 1.74, 12, 1, true, 0, Math.PI).rotateZ(Math.PI / 2), '#16171a', 0, 0.36, z)

  // Front: bumper + intake, grille (chrome surround, dark core, slats), headlight
  // housings with lenses + projectors + indicators, fog lamps, plate.
  dk(g, rbox(1.86, 0.25, 0.26, 0.09, 1), '#2b2e35', 0, 0.43, 2.33)
  dk(g, new BoxGeometry(0.9, 0.06, 0.03), '#121315', 0, 0.355, 2.46)
  dk(g, new BoxGeometry(0.5, 0.11, 0.02), '#f0f1f3', 0, 0.455, 2.47)
  add(g, rbox(0.66, 0.2, 0.05, 0.03, 1), CHROME(), 0, 0.68, 2.405)
  dk(g, new BoxGeometry(0.58, 0.14, 0.05), '#141518', 0, 0.68, 2.425)
  for (const y of [0.645, 0.68, 0.715]) add(g, new BoxGeometry(0.54, 0.014, 0.015), CHROME(), 0, y, 2.452)
  for (const s of [-1, 1]) {
    dk(g, rbox(0.44, 0.18, 0.12, 0.05, 1), '#1f2125', s * 0.58, 0.72, 2.37)
    add(g, new BoxGeometry(0.36, 0.12, 0.04), HEAD(), s * 0.6, 0.72, 2.43)
    add(g, new CylinderGeometry(0.042, 0.042, 0.02, 8).rotateX(Math.PI / 2), CHROME(), s * 0.68, 0.72, 2.455)
    add(g, new BoxGeometry(0.06, 0.08, 0.012), AMBER(), s * 0.455, 0.72, 2.452)
    add(g, new CylinderGeometry(0.035, 0.035, 0.02, 8).rotateX(Math.PI / 2), HEAD(), s * 0.68, 0.37, 2.465)
  }

  // Rear: bumper, plate, tail housings (lenses are a per-car mesh), indicators, exhaust.
  dk(g, rbox(1.86, 0.25, 0.26, 0.09, 1), '#2b2e35', 0, 0.43, -2.33)
  dk(g, new BoxGeometry(0.5, 0.11, 0.02), '#f0f1f3', 0, 0.455, -2.47)
  for (const s of [-1, 1]) {
    dk(g, rbox(0.42, 0.17, 0.1, 0.04, 1), '#1d1e22', s * 0.6, 0.8, -2.39)
    add(g, new BoxGeometry(0.2, 0.05, 0.02), AMBER(), s * 0.6, 0.69, -2.43)
  }
  add(g, new CylinderGeometry(0.04, 0.04, 0.2, 8, 1, true).rotateX(Math.PI / 2), CHROME(), 0.55, 0.3, -2.4)

  // Sides: mirrors, door handles, door seams, side skirts, wipers.
  for (const s of [-1, 1]) {
    add(g, new BoxGeometry(0.14, 0.04, 0.06), B, s * 0.93, 1.0, 1.0)
    add(g, rbox(0.1, 0.13, 0.2, 0.04, 1), B, s * 1.02, 1.04, 0.98)
    add(g, new BoxGeometry(0.08, 0.105, 0.01), CHROME(), s * 1.02, 1.04, 0.876)
    dk(g, new BoxGeometry(0.06, 0.08, 1.9), '#24262b', s * 0.9, 0.35, 0)
    add(g, new BoxGeometry(0.035, 0.04, 0.16), CHROME(), s * 0.915, 0.82, 0.35)
    dk(g, new BoxGeometry(0.012, 0.42, 0.012), '#141416', s * 0.904, 0.73, 0.9)
    if (!(taxi && s < 0)) {
      add(g, new BoxGeometry(0.035, 0.04, 0.16), CHROME(), s * 0.915, 0.82, -0.72)
      dk(g, new BoxGeometry(0.012, 0.52, 0.012), '#141416', s * 0.904, 0.68, -0.2)
      dk(g, new BoxGeometry(0.012, 0.36, 0.012), '#141416', s * 0.904, 0.76, -0.92)
    }
    dk(g, new BoxGeometry(0.5, 0.015, 0.03), '#141416', s * 0.3 - 0.06, 0.99, 1.12, 0, 0.12)
  }

  if (taxi) {
    const chk = mat('checkers', () => new MeshStandardMaterial({ map: tex(paintCheckers(), { repeatX: 3, repeatY: 1 }), roughness: 0.5 }))
    const strip = (x, z0, z1) => {
      const geo = new PlaneGeometry(z1 - z0, 0.1)
      geo.rotateY(x > 0 ? Math.PI / 2 : -Math.PI / 2)
      add(g, geo, chk, x, 0.7, (z0 + z1) / 2)
    }
    strip(0.906, -0.95, 0.95)
    strip(-0.906, -0.2, 0.95)
    // Dark cabin behind the opening door (same outline as the door).
    dk(g, new ShapeGeometry(doorShape(), 4).rotateY(-Math.PI / 2), '#1e1f24', -0.906, 0, -0.2)
    // Roof sign: mount + light body baked here; the lit faces are a per-taxi mesh.
    dk(g, new BoxGeometry(0.5, 0.06, 0.18), '#202226', 0, 1.59, -0.25)
    add(g, rbox(0.26, 0.22, 0.62, 0.03, 1), mat('signside', () => new MeshStandardMaterial({ color: '#f3e3b4', roughness: 0.5 })), 0, 1.67, -0.25)
  }
  const baked = bake(g, true)
  shells.set(taxi, baked)
  return baked
}

let doorProto = null
function taxiDoor() {
  if (doorProto) return doorProto
  const d = new Group()
  add(d, side(doorShape(), 0.06, 0.02, 1, 4), BODY(), -0.03, 0, 0)
  add(d, rbox(0.02, 0.44, 0.68, 0.01, 1), CAR_GLASS(), 0.095, 1.22, -0.38)
  add(d, new BoxGeometry(0.035, 0.04, 0.16), CHROME(), -0.075, 0.82, -0.55)
  const geo = new PlaneGeometry(0.75, 0.1)
  geo.rotateY(-Math.PI / 2)
  add(d, geo, mat('checkers', () => new MeshStandardMaterial({ map: tex(paintCheckers(), { repeatX: 3, repeatY: 1 }), roughness: 0.5 })), -0.062, 0.7, -0.375)
  doorProto = bake(d, true)
  return doorProto
}

let brakeGeoCache = null
function brakeGeo() {
  if (!brakeGeoCache) brakeGeoCache = mergeGeometries([-1, 1].map((s) => new BoxGeometry(0.36, 0.12, 0.04).toNonIndexed().translate(s * 0.6, 0.81, -2.44)))
  return brakeGeoCache
}
// The taxi sign's two lit faces (readable from the curb and from the road).
let signGeo = null
let signTex = null
function signFaces() {
  if (!signGeo) signGeo = mergeGeometries([1, -1].map((s) => new PlaneGeometry(0.57, 0.18).toNonIndexed().rotateY(s * Math.PI / 2).translate(s * 0.132, 1.67, -0.25)))
  return signGeo
}

// A sedan. taxi: yellow with checker strip, roof sign and an opening rear-right door.
export function makeCar({ color = '#f6b800', taxi = false, glow = false } = {}) {
  const root = new Group()
  const body = new Group()
  root.add(body)
  const bodyMat = paint(color)
  body.add(cloneWith(carShell(taxi), bodyMat))

  // Lights: the head lenses are in the shell; brake lenses get their own material per car.
  const brakeMat = new MeshStandardMaterial({ color: '#7a0d12', emissive: '#ff1a24', emissiveIntensity: 0.9, roughness: 0.3 })
  body.add(new Mesh(brakeGeo(), brakeMat))
  for (const s of [-1, 1]) {
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
    if (!signTex) signTex = tex(paintTaxiSign())
    signMat = new MeshStandardMaterial({ map: signTex, emissiveMap: signTex, emissive: '#ffffff', emissiveIntensity: 0.6, roughness: 0.4 })
    body.add(new Mesh(signFaces(), signMat))
  }

  // Rear-right door on a hinge at its front edge; opens with a positive rotation.y.
  let door = null
  if (taxi) {
    door = new Group()
    door.position.set(-0.9, 0, -0.2)
    door.add(cloneWith(taxiDoor(), bodyMat))
    body.add(door)
  }

  const wheels = []
  for (const x of [-0.82, 0.82]) for (const z of [-1.45, 1.45]) {
    const w = wheel(0.36, 0.26, 5, x)
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

// --- Bus ----------------------------------------------------------------------------------
const R_BUS = 0.64
function busShape(top = true, grow = 0, r = R_BUS) {
  const s = new Shape()
  const a = Math.asin(0.05 / r)
  s.moveTo(0, 0.45)
  s.absarc(4, 0.5, r, Math.PI + a, -a, true)
  s.lineTo(5.85, 0.45)
  s.quadraticCurveTo(6.05 + grow, 0.45, 6.05 + grow, 0.65)
  if (top) {
    s.lineTo(6.06, 2.6)
    s.quadraticCurveTo(6.06, 3.1, 5.6, 3.1)
    s.lineTo(-5.7, 3.1)
    s.quadraticCurveTo(-6.05, 3.1, -6.05, 2.75)
  } else {
    s.lineTo(6.06 + grow, 1.2)
    s.lineTo(-6.05 - grow, 1.2)
  }
  s.lineTo(-6.05 - grow, 0.65)
  s.quadraticCurveTo(-6.05 - grow, 0.45, -5.85, 0.45)
  s.absarc(-4, 0.5, r, Math.PI + a, -a, true)
  return s
}

const busProtos = new Map()
function busProto(stripe) {
  if (busProtos.has(stripe)) return busProtos.get(stripe)
  const g = new Group()
  const white = paint('#f4f6f9')
  const red = paint('#d6232e')
  add(g, side(busShape(true), 2.55, 0.14, 3, 6), white)
  add(g, side(busShape(false, 0.015, R_BUS - 0.012), 2.58, 0.1, 2, 6), paint(stripe))
  for (const z of [-4, 4]) dk(g, new CylinderGeometry(0.62, 0.62, 2.4, 12, 1, true, 0, Math.PI).rotateZ(Math.PI / 2), '#16171a', 0, 0.5, z)

  // Side windows: tinted band, rounded posts, rubber seals top + bottom.
  add(g, rbox(2.59, 1.12, 10.4, 0.04, 1), GLASS(), 0, 2.02, -0.4)
  for (let i = 0; i < 6; i++) add(g, rbox(2.63, 1.1, 0.14, 0.04, 1), white, 0, 2.02, -5 + i * 1.85)
  for (const y of [1.45, 2.59]) dk(g, rbox(2.61, 0.05, 10.45, 0.02, 1), '#1c1d21', 0, y, -0.4)
  for (const s of [-1, 1]) {
    add(g, rbox(0.04, 1.7, 0.32, 0.015, 1), red, s * 1.29, 1.75, -5.72)
    add(g, rbox(0.04, 1.7, 0.32, 0.015, 1), red, s * 1.29, 1.75, 5.75)
    add(g, rbox(0.04, 0.07, 0.18, 0.02, 1), AMBER(), s * 1.3, 1.02, 5.2)
  }

  // Curb-side doors (bi-fold glass with dark frames + seals).
  for (const z of [4.2, 0.2]) {
    dk(g, rbox(0.05, 2.32, 1.26, 0.03, 1), '#2a2d33', -1.3, 1.62, z)
    for (const dz of [-0.29, 0.29]) add(g, rbox(0.03, 1.98, 0.5, 0.02, 1), GLASS(), -1.32, 1.68, z + dz)
    dk(g, new BoxGeometry(0.035, 2.0, 0.04), '#141416', -1.335, 1.68, z)
  }

  // Front: framed windscreen, wipers, LED housing, headlights, grille, bumper, mirrors.
  dk(g, rbox(2.44, 1.56, 0.04, 0.06, 1), '#1c1d21', 0, 1.98, 6.045)
  add(g, rbox(2.3, 1.42, 0.06, 0.04, 1), GLASS(), 0, 1.98, 6.06)
  for (const s of [-1, 1]) dk(g, new BoxGeometry(0.9, 0.03, 0.03), '#141416', s * 0.45, 1.35, 6.1, 0, 0, s * 0.25)
  dk(g, rbox(2.0, 0.36, 0.05, 0.03, 1), '#151618', 0, 2.9, 6.055)
  for (const s of [-1, 1]) {
    dk(g, rbox(0.55, 0.26, 0.08, 0.04, 1), '#202226', s * 0.85, 0.88, 6.07)
    add(g, rbox(0.46, 0.17, 0.04, 0.02, 1), HEAD(), s * 0.85, 0.88, 6.1)
    add(g, rbox(0.12, 0.12, 0.03, 0.02, 1), AMBER(), s * 1.13, 0.88, 6.09)
    const x = s * 1.45
    link(g, DARK(), [s * 1.18, 2.85, 5.9], [x, 2.7, 6.38], (l) => tint(new CylinderGeometry(0.035, 0.035, l, 6), '#1c1d21'))
    link(g, DARK(), [x, 2.7, 6.38], [x, 2.42, 6.42], (l) => tint(new CylinderGeometry(0.035, 0.035, l, 6), '#1c1d21'))
    dk(g, rbox(0.14, 0.45, 0.1, 0.04, 1), '#1c1d21', x, 2.2, 6.42)
  }
  dk(g, rbox(0.9, 0.22, 0.04, 0.02, 1), '#141518', 0, 0.98, 6.075)
  for (const y of [0.92, 0.98, 1.04]) add(g, new BoxGeometry(0.84, 0.018, 0.015), CHROME(), 0, y, 6.1)
  dk(g, rbox(2.62, 0.32, 0.3, 0.1, 2), '#2b2e35', 0, 0.55, 6.02)

  // Rear: window, engine grille, tail lights, bumper.
  add(g, rbox(2.2, 0.9, 0.06, 0.04, 1), GLASS(), 0, 2.35, -6.06)
  dk(g, rbox(1.6, 0.55, 0.05, 0.03, 1), '#17181b', 0, 1.5, -6.07)
  for (let i = 0; i < 4; i++) add(g, new BoxGeometry(1.5, 0.02, 0.015), CHROME(), 0, 1.32 + i * 0.12, -6.1)
  for (const s of [-1, 1]) add(g, rbox(0.22, 0.55, 0.05, 0.03, 1), TAIL(), s * 1.0, 1.0, -6.08)
  dk(g, rbox(2.62, 0.32, 0.3, 0.1, 2), '#2b2e35', 0, 0.55, -6.02)

  // Roof: air-con pod with vents, escape hatch.
  add(g, rbox(1.7, 0.32, 2.8, 0.12, 2), paint('#dfe3ea'), 0, 3.25, 0.5)
  for (const z of [0, 1.1]) dk(g, new BoxGeometry(1.2, 0.02, 0.6), '#3a3d44', 0, 3.415, z)
  add(g, rbox(0.8, 0.08, 0.8, 0.03, 1), paint('#dfe3ea'), 0, 3.13, -3.5)

  const baked = bake(g, true)
  busProtos.set(stripe, baked)
  return baked
}

// City bus (white with a blue skirt, red rear-corner stripes, LED destination sign).
export function makeBus({ stripe = '#1f6fe0', dest = 'AIRPORT EXPRESS' } = {}) {
  const baked = busProto(stripe).clone()
  const led = tex(paintLed(dest))
  add(baked, new BoxGeometry(1.8, 0.28, 0.03), new MeshStandardMaterial({ map: led, emissiveMap: led, emissive: '#ffffff', emissiveIntensity: 1.4 }), 0, 2.9, 6.085)
  for (const x of [-1.1, 1.1]) for (const z of [-4, 4]) {
    const w = wheel(0.5, 0.34, 6, x)
    w.position.set(x, 0.5, z)
    baked.add(w)
  }
  baked.traverse((o) => {
    if (o.isMesh) o.receiveShadow = true
  })
  return baked
}

// --- Airliner -------------------------------------------------------------------------------
// Fuselage texture: v runs along the plane (canvas top = nose), u around it
// (0 = belly, 0.25 = +X side, 0.5 = top, 0.75 = -X side). Window rows, cheat lines,
// door outlines, grey belly, faint panel seams.
function paintPlaneSkin() {
  const W = 256
  const H = 512
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#f7f9fc'
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = '#d9dee6'
  ctx.fillRect(0, 0, W * 0.1, H)
  ctx.fillRect(W * 0.9, 0, W * 0.1, H)
  ctx.strokeStyle = 'rgba(120,130,150,0.18)'
  ctx.lineWidth = 1
  for (let y = 22; y < H; y += 44) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(W, y)
    ctx.stroke()
  }
  const rr = (x, y, w, h, r) => {
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.arcTo(x + w, y, x + w, y + h, r)
    ctx.arcTo(x + w, y + h, x, y + h, r)
    ctx.arcTo(x, y + h, x, y, r)
    ctx.arcTo(x, y, x + w, y, r)
    ctx.closePath()
  }
  for (const [u, dir] of [[0.27, -1], [0.73, 1]]) {
    const x = u * W
    // cheat lines below the windows (toward the belly)
    ctx.fillStyle = '#1d5fd6'
    ctx.fillRect(x + dir * 14 - 4, 0, 8, H)
    ctx.fillStyle = '#5fb2ff'
    ctx.fillRect(x + dir * 21 - 1.5, 0, 3, H)
    // windows
    ctx.fillStyle = '#26324a'
    for (let v = 44; v < 470; v += 12) {
      if (Math.abs(v - 250) < 10) continue
      rr(x - 4, v, 8, 7, 3)
      ctx.fill()
    }
    // doors (front, over-wing exit, rear)
    ctx.strokeStyle = '#9aa4b5'
    ctx.lineWidth = 1.5
    for (const [v, h] of [[18, 20], [244, 12], [476, 20]]) {
      rr(x - 7 + dir * 1, v, 14, h, 3)
      ctx.stroke()
    }
  }
  return c
}

let planeProto = null
function airlinerProto() {
  if (planeProto) return planeProto
  const g = new Group()
  const white = mat('planeWhite', () => new MeshStandardMaterial({ color: '#f5f7fb', roughness: 0.35, metalness: 0.2 }))
  const blue = paint('#1d5fd6')
  const grey = paint('#9aa3b2')
  const skin = mat('planeSkin', () => new MeshStandardMaterial({ map: tex(paintPlaneSkin()), roughness: 0.35, metalness: 0.2 }))
  add(g, new CylinderGeometry(2, 2, 28, 24, 1, true), skin, 0, 0, 0, Math.PI / 2)

  // Nose: smooth lathe ogive, cockpit window band wrapped over the top.
  const nosePts = [[2, 0], [1.99, 0.7], [1.9, 1.6], [1.7, 2.5], [1.35, 3.3], [0.85, 3.95], [0.35, 4.32], [0, 4.42]]
  add(g, lathe(nosePts, 24).rotateX(Math.PI / 2), white, 0, 0, 14)
  const band = new LatheGeometry([[1.895, 1.7], [1.83, 2.0], [1.75, 2.35]].map(([r, y]) => new Vector2(r, y)), 12, Math.PI - 1.15, 2.3)
  add(g, band.rotateX(Math.PI / 2), GLASS(), 0, 0, 14)

  // Tail cone: sweeps up toward the APU; seam along the belly.
  const tailPts = [[2, 0], [1.96, 1.5], [1.8, 3.5], [1.45, 5.5], [1.0, 7.2], [0.55, 8.4], [0.25, 9.0], [0, 9.15]]
  const tail = new LatheGeometry(tailPts.map(([r, y]) => new Vector2(r, y)), 20, Math.PI)
  const p = tail.attributes.position
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    const y = p.getY(i)
    const z = p.getZ(i)
    const u = y / 9.15
    p.setXYZ(i, x, z + 1.7 * u * u, -y - 14)
  }
  tail.computeVertexNormals()
  add(g, tail, white)
  dk(g, new CylinderGeometry(0.16, 0.2, 0.3, 8).rotateX(Math.PI / 2), '#3a3e46', 0, 1.7, -23.2)

  // Belly fairing under the wing box.
  add(g, new SphereGeometry(1, 16, 10).scale(2.0, 0.9, 6), white, 0, -1.55, 0)

  const wingShape = (s) => {
    const sh = new Shape()
    sh.moveTo(s * 1.5, 4)
    sh.lineTo(s * 18, -3.5)
    sh.lineTo(s * 18, -5.5)
    sh.lineTo(s * 1.5, -4)
    sh.closePath()
    const geo = new ExtrudeGeometry(sh, { depth: 0.3, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 2 })
    geo.rotateX(Math.PI / 2)
    return geo
  }
  const winglet = () => {
    const sh = new Shape()
    sh.moveTo(-3.6, 0)
    sh.lineTo(-4.7, 1.7)
    sh.lineTo(-5.25, 1.7)
    sh.lineTo(-5.5, 0)
    sh.closePath()
    const geo = new ExtrudeGeometry(sh, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 1 })
    geo.rotateY(-Math.PI / 2)
    geo.translate(0.04, 0, 0)
    return geo
  }
  for (const s of [-1, 1]) {
    // Wing with a little dihedral, winglet, flap-track fairings.
    const wg = new Group()
    wg.position.set(0, -0.8, 0)
    wg.rotation.z = s * 0.05
    add(wg, wingShape(s), white)
    add(wg, winglet(), blue, s * 17.95, 0.02, 0, 0, 0, -s * 0.12)
    for (const k of [0.3, 0.55, 0.78]) {
      const x = s * (1.5 + k * 16.5)
      const zt = -4 - k * 1.5
      add(wg, new SphereGeometry(1, 8, 6).scale(0.18, 0.2, 1.1), grey, x, -0.42, zt + 0.2)
    }
    g.add(wg)

    // Engine: nacelle with a curled intake lip, fan face + spinner, exhaust cone, pylon.
    const eg = new Group()
    eg.position.set(s * 6.5, -2.1, -0.2)
    eg.rotation.x = Math.PI / 2
    add(eg, lathe([[0.55, 0], [0.72, 0.3], [0.88, 1.2], [0.95, 2.4], [0.94, 3.3]], 18), blue)
    add(eg, lathe([[0.94, 3.28], [0.91, 3.55], [0.81, 3.63], [0.72, 3.5], [0.72, 3.0]], 18), CHROME())
    dk(eg, new CircleGeometry(0.73, 18).rotateX(-Math.PI / 2).translate(0, 3.05, 0), '#22252b')
    for (let i = 0; i < 10; i++) dk(eg, new BoxGeometry(0.06, 0.02, 0.62).translate(0, 3.07, 0.36).rotateY((i / 10) * Math.PI * 2 + 0.3), '#4b515c')
    add(eg, lathe([[0.26, 3.0], [0.2, 3.22], [0.09, 3.38], [0, 3.42]], 12), CHROME())
    dk(eg, lathe([[0, -0.9], [0.2, -0.8], [0.42, -0.4], [0.56, 0.02]], 14), '#4a4f58')
    g.add(eg)
    add(g, rbox(0.28, 0.9, 2.8, 0.1, 1), grey, s * 6.5, -1.35, 1.2)

    // Horizontal stabiliser.
    const st = new Shape()
    st.moveTo(s * 0.5, -16.5)
    st.lineTo(s * 7, -20.5)
    st.lineTo(s * 7, -21.8)
    st.lineTo(s * 0.5, -21)
    st.closePath()
    const sg = new ExtrudeGeometry(st, { depth: 0.2, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 1 })
    sg.rotateX(Math.PI / 2)
    add(g, sg, white, 0, 1.2, 0)
  }
  const fin = new Shape()
  fin.moveTo(-15.5, 1.5)
  fin.lineTo(-21.5, 9)
  fin.lineTo(-24, 9)
  fin.lineTo(-22.5, 1.5)
  fin.closePath()
  const fg = new ExtrudeGeometry(fin, { depth: 0.24, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 2 })
  fg.rotateY(-Math.PI / 2)
  fg.translate(0.12, 0, 0)
  add(g, fg, blue)
  // Fin-root fillet (dorsal strake).
  const dor = new Shape()
  dor.moveTo(-12.5, 1.7)
  dor.lineTo(-16.5, 2.9)
  dor.lineTo(-16.5, 1.5)
  dor.closePath()
  const dg = new ExtrudeGeometry(dor, { depth: 0.2, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 1 })
  dg.rotateY(-Math.PI / 2)
  dg.translate(0.1, 0, 0)
  add(g, dg, blue)
  planeProto = bake(g, false)
  return planeProto
}

// Airliner, ~40 m long. Forward = +Z.
export function makeAirliner() {
  const baked = airlinerProto().clone()
  // Navigation lights: red / green wingtips + white strobe (unlit, bright).
  for (const [s, c] of [[-1, '#ff2a2a'], [1, '#2aff5a']]) {
    const l = glowSprite(c, 3)
    l.position.set(s * 18.1, 0.15, -4.6)
    baked.add(l)
  }
  const strobe = glowSprite('#ffffff', 4)
  strobe.position.set(0, 2.2, -2)
  baked.add(strobe)
  return { root: baked, strobe, engines: [[-6.5, -2.1, -0.5], [6.5, -2.1, -0.5]] }
}
