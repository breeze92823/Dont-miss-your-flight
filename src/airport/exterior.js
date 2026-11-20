// The terminal curb: roads, sidewalk, canopy with light strips, the glass
// facade with its sliding entrance doors, car park, control tower, trees,
// lamps, parked buses and taxis, through traffic, planes taking off, birds and
// pigeons that scatter when you walk at them. Static parts are baked to one
// mesh per material; repeated props (trees, bollards, shrubs) are built once as
// prototype geometry and placed many times before the bake.
import {
  BoxGeometry,
  BufferAttribute,
  CanvasTexture,
  CylinderGeometry,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Quaternion,
  RepeatWrapping,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { AIRPORT, SECURITY } from '../config.js'
import { bake } from '../bake.js'
import { lathe, pole, rbox, ring, roundSlab } from '../detail.js'
import { neon, solidBox, solidPole } from '../propkit.js'
import { RAPIER, addFixed } from '../physics.js'
import { mulberry32, paintFacade } from '../textures.js'
import { paintAsphalt, paintGarage, paintGlass, paintRoadText, paintSidewalk, paintSlabSign, tex } from './paint.js'
import { makeAirliner, makeBus, makeCar, tint } from './vehicles.js'
import { engineLoop, jetLoop, sfx } from '../audio.js'

const A = AIRPORT
const Y = A.walkY
const L = A.halfLength

// --- helpers ------------------------------------------------------------------------
function box(parent, w, h, d, mat, x, y, z, ry = 0) {
  const m = new Mesh(new BoxGeometry(w, h, d), mat)
  m.position.set(x, y, z)
  m.rotation.y = ry
  parent.add(m)
  return m
}
function cyl(parent, r0, r1, h, mat, x, y, z, seg = 14) {
  const m = new Mesh(new CylinderGeometry(r0, r1, h, seg), mat)
  m.position.set(x, y, z)
  parent.add(m)
  return m
}
function place(parent, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new Mesh(geo, mat)
  m.position.set(x, y, z)
  m.rotation.set(rx, ry, rz)
  parent.add(m)
  return m
}
// An (open) tube from a to b, radius r0 at a and r1 at b.
const UP = new Vector3(0, 1, 0)
function strut(r0, r1, a, b, n = 8) {
  const P = new Vector3(...a)
  const Q = new Vector3(...b)
  const d = Q.clone().sub(P)
  const g = new CylinderGeometry(r1, r0, d.length(), n, 1, true)
  g.applyQuaternion(new Quaternion().setFromUnitVectors(UP, d.normalize()))
  g.translate((P.x + Q.x) / 2, (P.y + Q.y) / 2, (P.z + Q.z) / 2)
  return g
}
// Per-vertex grey multiplier (fake AO / gradients) as a colour attribute.
function shade(geo, fn) {
  const g = geo.index ? geo.toNonIndexed() : geo
  const p = g.attributes.position
  const a = new Float32Array(p.count * 3)
  for (let i = 0; i < p.count; i++) {
    const k = fn(p.getX(i), p.getY(i), p.getZ(i))
    a[i * 3] = a[i * 3 + 1] = a[i * 3 + 2] = k
  }
  g.setAttribute('color', new BufferAttribute(a, 3))
  return g
}
const flatList = (list) => mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)))
// A flat rectangle on the ground (x0..x1, z0..z1) with UVs in metres / tile.
function flat(parent, x0, x1, z0, z1, y, mat, tile = 1) {
  const w = x1 - x0
  const d = z1 - z0
  const g = new PlaneGeometry(w, d)
  g.rotateX(-Math.PI / 2)
  const uv = g.attributes.uv
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / tile, (uv.getY(i) * d) / tile)
  const m = new Mesh(g, mat)
  m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2)
  parent.add(m)
  return m
}
// A vertical rectangle facing +Z (or -Z with flip) with UVs in metres / tile.
function wall(parent, x0, x1, y0, y1, z, mat, tileX, tileY, flip = false) {
  const w = x1 - x0
  const h = y1 - y0
  const g = new PlaneGeometry(w, h)
  if (flip) g.rotateY(Math.PI)
  const uv = g.attributes.uv
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / tileX, (uv.getY(i) * h) / tileY)
  const m = new Mesh(g, mat)
  m.position.set((x0 + x1) / 2, (y0 + y1) / 2, z)
  parent.add(m)
  return m
}
// Box with UVs scaled to metres / tile on every face.
function tiledBox(parent, w, h, d, mat, x, y, z, tile) {
  const g = new BoxGeometry(w, h, d)
  const uv = g.attributes.uv
  const n = g.attributes.normal
  for (let i = 0; i < uv.count; i++) {
    const ax = Math.abs(n.getX(i))
    const ay = Math.abs(n.getY(i))
    const su = ax > 0.5 ? d : w
    const sv = ay > 0.5 ? d : h
    uv.setXY(i, (uv.getX(i) * su) / tile, (uv.getY(i) * sv) / tile)
  }
  const m = new Mesh(g, mat)
  m.position.set(x, y, z)
  parent.add(m)
  return m
}

// --- small canvas painters (kept local; all <= 128 px) -----------------------------------
function cvs(w, h) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}
function repeatTex(c, rx = 1, ry = 1) {
  const t = new CanvasTexture(c)
  t.wrapS = t.wrapT = RepeatWrapping
  t.repeat.set(rx, ry)
  t.anisotropy = 4
  t.colorSpace = SRGBColorSpace
  return t
}
// Bark: warm brown with vertical streaks.
function paintBark() {
  const c = cvs(64, 128)
  const ctx = c.getContext('2d')
  const rand = mulberry32(7)
  ctx.fillStyle = '#7a5638'
  ctx.fillRect(0, 0, 64, 128)
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = rand() < 0.55 ? `rgba(40,24,12,${0.2 + rand() * 0.3})` : `rgba(160,120,84,${0.15 + rand() * 0.2})`
    const x = rand() * 64
    const w = 1 + rand() * 3
    const y = rand() * 128
    const h = 12 + rand() * 50
    ctx.fillRect(x, y, w, h)
    ctx.fillRect(x, y - 128, w, h) // wrap
  }
  return c
}
// Wood slats: honey planks with grain lines along u.
function paintWood() {
  const c = cvs(128, 64)
  const ctx = c.getContext('2d')
  const rand = mulberry32(17)
  ctx.fillStyle = '#b8814c'
  ctx.fillRect(0, 0, 128, 64)
  for (let i = 0; i < 26; i++) {
    const y = rand() * 64
    ctx.strokeStyle = rand() < 0.6 ? `rgba(90,52,24,${0.2 + rand() * 0.25})` : `rgba(230,180,120,${0.2 + rand() * 0.2})`
    ctx.lineWidth = 0.6 + rand() * 1.4
    ctx.beginPath()
    ctx.moveTo(0, y)
    for (let x = 0; x <= 128; x += 16) ctx.lineTo(x, y + Math.sin(x * 0.05 + i) * 1.5)
    ctx.stroke()
  }
  return c
}
// Ribbed rubber / grate: dark with lighter slats along u.
function paintRibs() {
  const c = cvs(64, 16)
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#23262c'
  ctx.fillRect(0, 0, 64, 16)
  ctx.fillStyle = '#3b4049'
  for (let x = 0; x < 64; x += 8) ctx.fillRect(x + 1, 0, 4, 16)
  return c
}

const M = {}
function materials() {
  if (M.ready) return M
  M.ready = true
  M.asphalt = new MeshStandardMaterial({ map: tex(paintAsphalt()), roughness: 0.92 })
  const side = paintSidewalk()
  M.walk = new MeshStandardMaterial({ map: tex(side.color), normalMap: tex(side.normal, { srgb: false }), roughness: 0.85 })
  M.concrete = new MeshStandardMaterial({ color: '#c9cdd4', roughness: 0.8 })
  M.curb = new MeshStandardMaterial({ color: '#e4e6ea', roughness: 0.7 })
  M.white = new MeshStandardMaterial({ color: '#f4f6f9', roughness: 0.45 })
  M.paint = new MeshStandardMaterial({ color: '#f2f2f2', roughness: 0.75 })
  M.yellow = new MeshStandardMaterial({ color: '#f2c52b', roughness: 0.75 })
  M.navy = new MeshStandardMaterial({ color: '#0f1a36', roughness: 0.4, metalness: 0.3 })
  M.dark = new MeshStandardMaterial({ color: '#2a2e36', roughness: 0.6, metalness: 0.4 })
  M.metal = new MeshStandardMaterial({ color: '#8d939d', roughness: 0.35, metalness: 0.8 })
  M.grass = new MeshStandardMaterial({ color: '#5cc152', roughness: 1 })
  M.trunk = new MeshStandardMaterial({ map: repeatTex(paintBark(), 1, 2), roughness: 0.95 })
  M.soil = new MeshStandardMaterial({ color: '#4a3624', roughness: 1 })
  M.wood = new MeshStandardMaterial({ map: repeatTex(paintWood()), roughness: 0.7 })
  M.reflect = new MeshStandardMaterial({ color: '#f6f7f9', emissive: '#ffffff', emissiveIntensity: 0.12, roughness: 0.3 })
  M.accent = new MeshStandardMaterial({ color: '#1f6fe0', roughness: 0.45, metalness: 0.2 })
  M.grate = new MeshStandardMaterial({ map: repeatTex(paintRibs()), roughness: 0.9 })
  M.leafA = new MeshStandardMaterial({ color: '#3f9a3c', roughness: 0.8, flatShading: true, vertexColors: true })
  M.leafB = new MeshStandardMaterial({ color: '#56b54a', roughness: 0.8, flatShading: true, vertexColors: true })
  const glass = paintGlass()
  const gt = tex(glass)
  M.glass = new MeshStandardMaterial({ map: gt, emissiveMap: gt, emissive: '#ffffff', emissiveIntensity: 0.32, roughness: 0.08, metalness: 0.35 })
  M.glassSee = new MeshStandardMaterial({ map: gt, emissiveMap: gt, emissive: '#ffffff', emissiveIntensity: 0.18, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.42, depthWrite: false, side: DoubleSide })
  M.doorGlass = new MeshStandardMaterial({ color: '#a8d4ff', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.28, depthWrite: false, side: DoubleSide })
  M.strip = neon('#eaf6ff', 2.6)
  M.lampLens = new MeshStandardMaterial({ color: '#fff7e0', emissive: '#fff1c8', emissiveIntensity: 0.3 })
  // Wind sway on the tree crowns: vertex shader offset by height and world position.
  M.wind = { value: 0 }
  for (const m of [M.leafA, M.leafB]) {
    m.onBeforeCompile = (s) => {
      s.uniforms.uWind = M.wind
      s.vertexShader = s.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uWind;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          vec4 wp = modelMatrix * vec4(position, 1.0);
          float sway = sin(uWind * 1.7 + wp.x * 0.35 + wp.z * 0.2) * 0.08 + sin(uWind * 3.1 + wp.x) * 0.03;
          float h = clamp((position.y - 1.5) * 0.45, 0.0, 1.6);
          transformed.x += sway * h;
          transformed.z += sway * 0.6 * h;`,
        )
    }
  }
  return M
}

// --- Trees: two prototype variants (trunk + branches, 7 lumpy faceted foliage clusters
// with a dark-underside gradient), ~650 triangles each, placed with rotation / scale.
let TREES = null
function treeProtos() {
  if (TREES) return TREES
  TREES = [11, 23].map((seed) => {
    const rand = mulberry32(seed)
    const blobs = [[0, 3.35, 0, 1.2], [0.85, 2.85, 0.35, 0.9], [-0.8, 2.95, -0.25, 0.95], [0.2, 2.75, -0.85, 0.85], [-0.3, 2.8, 0.8, 0.85], [0.05, 4.1, 0.05, 0.8], [0.6, 3.75, -0.4, 0.7]]
    for (const b of blobs) {
      b[0] += (rand() - 0.5) * 0.3
      b[2] += (rand() - 0.5) * 0.3
    }
    const wood = [lathe([[0.3, 0], [0.2, 0.12], [0.16, 0.5], [0.13, 1.6], [0.1, 2.9]], 8)]
    for (let i = 1; i <= 4; i++) {
      const [bx, by, bz] = blobs[i]
      wood.push(strut(0.085, 0.045, [0, 1.45 + i * 0.22, 0], [bx * 0.8, by - 0.3, bz * 0.8], 6))
    }
    const leaves = [[], []]
    blobs.forEach(([bx, by, bz, r], i) => {
      const g = new IcosahedronGeometry(r * (0.92 + rand() * 0.16), 1)
      const p = g.attributes.position
      const ph = rand() * 10
      for (let k = 0; k < p.count; k++) {
        let x = p.getX(k)
        let y = p.getY(k)
        let z = p.getZ(k)
        const l = Math.hypot(x, y, z) || 1
        const lump = 1 + Math.sin((x / l) * 5.1 + ph) * Math.sin((y / l) * 4.3 + ph * 1.3) * Math.sin((z / l) * 4.7 - ph) * 0.35
        x *= lump
        y *= lump * (y < 0 ? 0.78 : 1)
        z *= lump
        p.setXYZ(k, x, y, z)
      }
      g.translate(bx, by, bz)
      leaves[i % 2].push(shade(g, (x, y) => {
        const local = Math.min(1, Math.max(0, (y - (by - r)) / (2 * r)))
        const crown = Math.min(1, Math.max(0, (y - 1.8) / 2.8))
        return 0.6 + 0.32 * local + 0.2 * crown
      }))
    })
    return { trunk: flatList(wood), leafA: mergeGeometries(leaves[0]), leafB: mergeGeometries(leaves[1]) }
  })
  return TREES
}
let SHRUB = null
function shrubGeo() {
  if (!SHRUB) {
    const g = new IcosahedronGeometry(0.34, 0)
    g.scale(1, 0.75, 1)
    SHRUB = shade(g, (x, y) => 0.7 + Math.max(0, y) * 1.2)
  }
  return SHRUB
}

let treeN = 0
function tree(parent, x, z, s = 1, y = 0) {
  const P = treeProtos()[treeN++ % 2]
  const ry = treeN * 2.39
  for (const [geo, mat] of [[P.trunk, M.trunk], [P.leafA, M.leafA], [P.leafB, M.leafB]]) {
    const m = new Mesh(geo, mat)
    m.position.set(x, y, z)
    m.rotation.y = ry
    m.scale.setScalar(s)
    parent.add(m)
  }
}

function planter(parent, x, z, y = Y) {
  place(parent, rbox(1.8, 0.75, 1.8, 0.12, 2), M.concrete, x, y + 0.375, z)
  place(parent, roundSlab(1.94, 1.94, 0.1, 0.16, 0.025), M.curb, x, y + 0.76, z)
  place(parent, roundSlab(1.62, 1.62, 0.04, 0.12, 0.01), M.soil, x, y + 0.815, z)
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) place(parent, shrubGeo(), M.leafB, x + sx * 0.5, y + 0.95, z + sz * 0.5, 0, sx * 0.7 + sz, 0)
  tree(parent, x, z, 0.9, y + 0.8)
  solidBox(0.9, 0.6, 0.9, x, y + 0.4, z)
}

// Bollard: flanged base, tapered steel post, reflective band, domed cap (~240 tris).
let BOL = null
function bollard(parent, x, z) {
  if (!BOL) {
    BOL = [
      [lathe([[0.21, 0], [0.21, 0.035], [0.15, 0.075]], 12), M.dark],
      [lathe([[0.145, 0.06], [0.132, 0.14], [0.13, 0.84]], 12), M.metal],
      [lathe([[0.134, 0.6], [0.134, 0.72]], 12), M.reflect],
      [lathe([[0.13, 0.83], [0.142, 0.85], [0.142, 0.88], [0.12, 0.94], [0.075, 0.99], [0, 1.01]], 12), M.metal],
    ]
  }
  for (const [geo, mat] of BOL) place(parent, geo, mat, x, Y, z)
}

function lamp(parent, x, z, dir = 1, y = Y, h = 9) {
  const g = new Group()
  place(g, lathe([[0.32, 0], [0.32, 0.22], [0.22, 0.3], [0.17, 0.55], [0.13, h - 0.6], [0.11, h - 0.35]], 10), M.dark)
  place(g, lathe([[0.19, 0.5], [0.19, 0.64]], 10), M.metal)
  place(g, strut(0.085, 0.075, [0, h - 0.5, 0], [0, h - 0.05, dir * 0.45], 8), M.dark)
  place(g, strut(0.075, 0.06, [0, h - 0.05, dir * 0.45], [0, h + 0.04, dir * 1.7], 8), M.dark)
  place(g, new SphereGeometry(0.09, 8, 6), M.dark, 0, h - 0.05, dir * 0.45)
  place(g, rbox(0.55, 0.2, 1.0, 0.08, 2), M.dark, 0, h - 0.02, dir * 2.05)
  place(g, rbox(0.42, 0.05, 0.82, 0.02, 1), M.lampLens, 0, h - 0.13, dir * 2.05)
  place(g, rbox(0.3, 0.06, 0.6, 0.03, 1), M.metal, 0, h + 0.1, dir * 2.0)
  g.position.set(x, y, z)
  parent.add(g)
  return new Vector3(x, y + h - 0.6, z + dir * 2.0)
}

function trolley(parent, x, z, ry) {
  const g = new Group()
  for (const s of [-1, 1]) {
    place(g, strut(0.02, 0.02, [s * 0.3, 0.17, -0.52], [s * 0.3, 0.17, 0.52], 6), M.metal)
    place(g, strut(0.022, 0.022, [s * 0.33, 0.17, -0.5], [s * 0.33, 1.2, -0.58], 6), M.metal)
    for (const wz of [-0.45, 0.45]) {
      place(g, new BoxGeometry(0.03, 0.1, 0.06), M.metal, s * 0.3, 0.13, wz)
      place(g, new CylinderGeometry(0.08, 0.08, 0.05, 10).rotateZ(Math.PI / 2), M.dark, s * 0.3, 0.08, wz)
    }
  }
  for (const y of [0.55, 0.85]) place(g, strut(0.016, 0.016, [-0.33, y, -0.52 - (y - 0.17) * 0.08], [0.33, y, -0.52 - (y - 0.17) * 0.08], 6), M.metal)
  place(g, rbox(0.66, 0.04, 1.02, 0.015, 1), M.metal, 0, 0.36, 0.02)
  place(g, rbox(0.7, 0.5, 0.04, 0.02, 1), M.metal, 0, 0.62, 0.52)
  place(g, rbox(0.56, 0.36, 0.045, 0.02, 1), M.dark, 0, 0.62, 0.52)
  place(g, strut(0.035, 0.035, [-0.38, 1.2, -0.58], [0.38, 1.2, -0.58], 8), M.accent)
  g.position.set(x, Y, z)
  g.rotation.y = ry
  parent.add(g)
}

function bench(parent, x, z, ry = 0) {
  const g = new Group()
  for (const s of [-1, 1]) {
    place(g, rbox(0.08, 0.46, 0.56, 0.03, 1), M.dark, s * 1.08, 0.23, 0)
    place(g, rbox(0.09, 0.06, 0.5, 0.025, 1), M.dark, s * 1.08, 0.7, 0.03)
    place(g, rbox(0.06, 0.26, 0.06, 0.02, 1), M.dark, s * 1.08, 0.57, 0.2)
    place(g, rbox(0.06, 0.62, 0.06, 0.02, 1), M.dark, s * 1.08, 0.76, -0.27, -0.15)
  }
  for (let i = 0; i < 4; i++) place(g, rbox(2.3, 0.05, 0.12, 0.02, 1), M.wood, 0, 0.48, -0.2 + i * 0.135)
  for (let i = 0; i < 3; i++) place(g, rbox(2.3, 0.1, 0.04, 0.02, 1), M.wood, 0, 0.64 + i * 0.13, -0.29 - i * 0.02, -0.15)
  place(g, rbox(2.1, 0.04, 0.04, 0.015, 1), M.metal, 0, 0.43, 0)
  g.position.set(x, Y, z)
  g.rotation.y = ry
  parent.add(g)
  solidBox(1.2, 0.5, 0.3, x, Y + 0.5, z, ry)
}

function bin(parent, x, z) {
  place(parent, lathe([[0.27, 0], [0.3, 0.06], [0.32, 0.92]], 14), M.dark, x, Y, z)
  place(parent, lathe([[0.327, 0.5], [0.327, 0.66]], 14), M.accent, x, Y, z)
  place(parent, lathe([[0.3, 0.9], [0.345, 0.92], [0.345, 0.98], [0.3, 1.03], [0.16, 1.08], [0, 1.1]], 14), M.metal, x, Y, z)
  place(parent, rbox(0.26, 0.07, 0.04, 0.02, 1), M.dark, x, Y + 0.99, z + 0.32)
  solidPole(0.35, 1, x, z)
}

// ---------------------------------------------------------------------------------------
export function buildExterior(scene, { lighting, fx }) {
  materials()
  const S = new Group() // static, baked at the end
  const rand = mulberry32(99)

  // --- Ground and roads ---------------------------------------------------------
  flat(S, -600, 600, -400, 400, -0.08, M.grass, 1)
  flat(S, -400, 400, A.roadA[0], A.roadA[1], 0, M.asphalt, 8)
  flat(S, -400, 400, A.roadB[0], A.roadB[1], 0, M.asphalt, 8)
  addFixed(RAPIER.ColliderDesc.cuboid(400, 1, 400), { x: 0, y: -1, z: 0 })

  // Sidewalk (terminal side), median, far sidewalk: raised slabs with a bright curb.
  const slab = (x0, x1, z0, z1) => {
    tiledBox(S, x1 - x0, Y + 0.3, z1 - z0, M.walk, (x0 + x1) / 2, (Y - 0.3) / 2, (z0 + z1) / 2, 1.6)
    addFixed(RAPIER.ColliderDesc.cuboid((x1 - x0) / 2, 0.5, (z1 - z0) / 2), { x: (x0 + x1) / 2, y: Y - 0.5, z: (z0 + z1) / 2 })
  }
  slab(-400, 400, A.facadeZ - 60, A.curbZ)
  slab(-400, 400, A.median[0], A.median[1])
  slab(-400, 400, A.farWalk[0], A.farWalk[1])
  for (const z of [A.curbZ - 0.15, A.median[0] + 0.15, A.median[1] - 0.15, A.farWalk[0] + 0.15]) box(S, 800, 0.03, 0.3, M.curb, 0, Y + 0.005, z)
  // drainage grate along the terminal curb (slotted)
  flat(S, -400, 400, -1.5, -1.2, Y + 0.01, M.grate, 1)

  // Lane paint: dashed lane lines, solid edges, yellow centre on the far road.
  const dash = (z, mat, len = 3, gap = 5, w = 0.15) => {
    for (let x = -300; x < 300; x += len + gap) flat(S, x, x + len, z - w / 2, z + w / 2, 0.012, mat)
  }
  const solid = (z, mat, w = 0.18) => flat(S, -400, 400, z - w / 2, z + w / 2, 0.012, mat)
  dash(4, M.paint)
  dash(8, M.paint)
  solid(0.45, M.paint)
  solid(11.6, M.paint)
  dash(21, M.yellow, 2, 3)
  solid(16.45, M.paint)
  solid(25.6, M.paint)
  // Crosswalks (zebra) across both roads, tactile pads on each side.
  for (const [z0, z1] of [A.roadA, A.roadB]) for (let z = z0 + 0.7; z < z1 - 0.4; z += 1.1) flat(S, -25, -19, z, z + 0.55, 0.013, M.paint)
  for (const z of [-0.55, 12.55, 15.45, 26.55]) flat(S, -24.5, -19.5, z - 0.3, z + 0.3, Y + 0.012, M.yellow)
  // "DROP OFF ONLY" in the curb lane, readable by drivers heading -X.
  const decal = new MeshBasicMaterial({ map: tex(paintRoadText(['DROP', 'OFF', 'ONLY'])), transparent: true, depthWrite: false, color: '#dcdcdc' })
  for (const x of [-14, 22, 48, -46]) {
    const g = new PlaneGeometry(3.4, 3.4)
    g.rotateX(-Math.PI / 2)
    g.rotateY(-Math.PI / 2)
    const m = new Mesh(g, decal)
    m.position.set(x, 0.015, 2)
    scene.add(m)
  }

  // --- Terminal facade -------------------------------------------------------------
  const fz = A.facadeZ
  const top = 13.4
  const dh = A.doorHalf
  const hall = A.hall
  // Opaque glass outside the hall, see-through glass in front of it.
  wall(S, -L, hall.x0, Y, top, fz, M.glass, 4, 4.4)
  wall(S, hall.x1, L, Y, top, fz, M.glass, 4, 4.4)
  const seeL = wall(scene, hall.x0, -dh, Y, top, fz, M.glassSee, 4, 4.4)
  const seeR = wall(scene, dh, hall.x1, Y, top, fz, M.glassSee, 4, 4.4)
  const seeT = wall(scene, -dh, dh, A.doorHeight + Y, top, fz, M.glassSee, 4, 4.4)
  for (const m of [seeL, seeR, seeT]) m.renderOrder = 2
  // Rounded navy mullions + transoms, a low sill rail, white columns in front.
  const mullion = rbox(0.22, top - Y, 0.3, 0.06, 1)
  for (let x = -L; x <= L; x += 4) if (Math.abs(x) > dh + 0.2) place(S, mullion, M.navy, x, (top + Y) / 2, fz + 0.05)
  for (let y = Y + 4.4; y < top; y += 4.4) {
    place(S, rbox(hall.x0 + L - 0.1, 0.18, 0.28, 0.05, 1), M.navy, (-L + hall.x0) / 2, y, fz + 0.05)
    place(S, rbox(L - hall.x1, 0.18, 0.28, 0.05, 1), M.navy, (L + hall.x1) / 2, y, fz + 0.05)
    place(S, rbox(hall.x1 - hall.x0, 0.18, 0.28, 0.05, 1), M.navy, 0, y, fz + 0.05)
  }
  for (const s of [-1, 1]) place(S, rbox(L - dh - 0.4, 0.32, 0.34, 0.06, 1), M.navy, s * (L + dh + 0.4) / 2, Y + 0.16, fz + 0.06)
  const colGeo = rbox(0.9, top - Y + 0.6, 0.7, 0.2, 2)
  const plinth = rbox(1.1, 0.4, 0.9, 0.08, 1)
  const capital = rbox(1.0, 0.24, 0.8, 0.06, 1)
  for (let x = -L + 4; x <= L - 4; x += 8) {
    if (Math.abs(x) < 5) continue
    place(S, colGeo, M.white, x, (top + Y) / 2 + 0.3, fz + 0.5)
    place(S, plinth, M.concrete, x, Y + 0.2, fz + 0.5)
    place(S, capital, M.navy, x, top - 0.45, fz + 0.5)
    solidBox(0.45, 7, 0.35, x, 7, fz + 0.5)
  }
  place(S, rbox(2 * L + 1, 1.3, 1.0, 0.18, 2), M.white, 0, top + 0.6, fz + 0.2) // top fascia
  box(S, 2 * L + 1.02, 0.14, 1.04, M.navy, 0, top + 0.18, fz + 0.2)
  place(S, rbox(2 * L + 1.2, 0.16, 1.24, 0.06, 1), M.white, 0, top + 1.3, fz + 0.2)
  // Entrance surround: dark header + frame, door sensors, ribbed entry mat, sign above.
  place(S, rbox(2 * dh + 1.6, 1.6, 0.6, 0.12, 2), M.navy, 0, Y + A.doorHeight + 0.8, fz + 0.2)
  for (const s of [-1, 1]) {
    place(S, rbox(0.35, A.doorHeight, 0.5, 0.08, 1), M.navy, s * (dh + 0.18), Y + A.doorHeight / 2, fz + 0.15)
    place(S, rbox(0.4, 0.1, 0.14, 0.04, 1), M.dark, s * 1.2, Y + A.doorHeight - 0.06, fz + 0.4)
  }
  tiledBox(S, 2 * dh + 1.2, 0.04, 2.2, M.grate, 0, Y + 0.02, fz + 1.2, 1) // entry mat
  const dep = tex(paintSlabSign('departures  ✈', { w: 512, h: 96, bg: '#0f1a36' }))
  const depMat = new MeshStandardMaterial({ map: dep, emissiveMap: dep, emissive: '#ffffff', emissiveIntensity: 0.9 })
  const depSign = new Mesh(new PlaneGeometry(5.6, 1.05), depMat)
  depSign.position.set(0, Y + A.doorHeight + 0.82, fz + 0.52)
  scene.add(depSign)
  // Facade walls (collision): split around the door opening.
  solidBox((L - dh) / 2, 8, 0.25, -(L + dh) / 2, 8, fz - 0.1)
  solidBox((L - dh) / 2, 8, 0.25, (L + dh) / 2, 8, fz - 0.1)
  solidBox(dh, 5, 0.25, 0, A.doorHeight + Y + 5, fz - 0.1)

  // Building shell behind the facade: roof slab, side + back walls, rooftop plant rooms.
  // (the east side stops at the security hall's end wall, x = 92: the concourse + gates continue from there)
  const eastX = SECURITY.hall.x1
  tiledBox(S, L + eastX, 1.2, 60, M.white, (eastX - L) / 2, top + 0.6, fz - 30, 4)
  box(S, 1, top, 60, M.white, -L, top / 2, fz - 30)
  box(S, 1, top, 26, M.white, eastX - 0.5, top / 2, fz - 47)
  for (const [x, w, d] of [[-50, 14, 8], [-20, 8, 6], [40, 16, 10]]) {
    place(S, rbox(w, 2.5, d, 0.2, 1), M.concrete, x, top + 2.4, fz - 25)
    for (const dy of [-0.5, 0.1, 0.7]) box(S, w + 0.04, 0.12, d + 0.04, M.dark, x, top + 2.4 + dy, fz - 25)
    for (let k = 0; k < Math.floor(w / 4); k++) place(S, lathe([[0.7, 0], [0.7, 0.5], [0.6, 0.55]], 12), M.metal, x - w / 2 + 2 + k * 4, top + 3.65, fz - 25)
  }

  // --- Canopy over the curb ------------------------------------------------------------
  const cz0 = fz + 0.4
  const cz1 = A.median[1] + 0.6
  const cy = A.canopyY
  const cmz = (cz0 + cz1) / 2
  const canopy = new Mesh(rbox(2 * L, 0.6, cz1 - cz0, 0.22, 2), M.white)
  canopy.position.set(0, cy + 0.3, cmz)
  canopy.receiveShadow = true
  scene.add(canopy)
  const edge = new Mesh(rbox(2 * L, 1.1, 0.4, 0.15, 2), M.white)
  edge.position.set(0, cy + 0.2, cz1)
  edge.receiveShadow = true
  scene.add(edge)
  box(S, 2 * L, 0.1, 0.42, M.navy, 0, cy - 0.38, cz1)
  const fascia = tex(paintSlabSign('skyport international', { w: 1024, h: 96, bg: '#0f1a36', color: '#ffffff' }))
  const fasciaSign = new Mesh(new PlaneGeometry(16, 1.0), new MeshStandardMaterial({ map: fascia, emissiveMap: fascia, emissive: '#ffffff', emissiveIntensity: 0.8 }))
  fasciaSign.position.set(0, cy + 0.2, cz1 + 0.22)
  scene.add(fasciaSign)
  const strips = new Group()
  for (let z = cz0 + 1.6; z < cz1 - 0.8; z += 2.4) box(strips, 2 * L - 2, 0.06, 0.22, M.strip, 0, cy - 0.04, z)
  // Primary beams every 16 m, secondary joists every 4 m (a coffered underside).
  const beam = rbox(0.5, 0.9, cz1 - cz0, 0.12, 1)
  const joist = new BoxGeometry(0.16, 0.3, cz1 - cz0 - 0.6)
  for (let x = -L + 4; x <= L - 4; x += 4) {
    if ((x + L - 8) % 16 === 0) place(S, beam, M.white, x, cy - 0.4, cmz)
    else place(S, joist, M.white, x, cy - 0.15, cmz)
  }
  // Median columns: plinth, tapered shaft with a node, four branching struts to the roof.
  const zc = (A.median[0] + A.median[1]) / 2
  const colShaft = lathe([[0.56, Y + 0.3], [0.5, Y + 1.2], [0.42, cy - 2.8], [0.52, cy - 2.55], [0.52, cy - 2.3], [0.4, cy - 2.05], [0.36, cy - 0.85]], 18)
  const colBase = lathe([[0.8, 0], [0.8, Y + 0.25], [0.68, Y + 0.32], [0.56, Y + 0.34]], 18)
  const branches = []
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) branches.push(strut(0.15, 0.1, [0, cy - 2.45, 0], [sx * 2.4, cy - 0.05, sz * 1.5], 8))
  const branchGeo = flatList(branches)
  const shoe = rbox(0.5, 0.08, 0.5, 0.03, 1)
  for (let x = -L + 8; x <= L - 8; x += 16) {
    place(S, colShaft, M.white, x, 0, zc)
    place(S, colBase, M.concrete, x, 0, zc)
    place(S, branchGeo, M.white, x, 0, zc)
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) place(S, shoe, M.metal, x + sx * 2.4, cy - 0.05, zc + sz * 1.5)
    solidPole(0.55, cy, x, zc)
  }
  scene.add(bake(strips))

  // --- Street furniture ------------------------------------------------------------------
  for (let k = -39; k <= 39; k++) {
    const x = k * 2.4
    if (Math.abs(x + 22) < 3.2) continue
    bollard(S, x, -0.75)
    solidPole(0.16, 1, x, -0.75)
  }
  for (const x of [-38, -14, 18, 34, 58, -62]) planter(S, x, -2.6)
  for (const x of [-80, -48, -32, 32, 48, 80]) planter(S, x, zc)
  for (const x of [-10, -26, 14, 26]) bench(S, x, fz + 1.6)
  for (const x of [-7, 7, -30, 30]) bin(S, x, fz + 1.3)
  trolley(S, -16.5, fz + 2, 0.2)
  trolley(S, -17.4, fz + 2.1, 0.25)
  trolley(S, 21, fz + 2.2, -0.3)
  const lampPts = []
  for (let x = -96; x <= 96; x += 24) lampPts.push(lamp(S, x, A.farWalk[0] + 1, -1))
  for (const p of lampPts.filter((p) => Math.abs(p.x) < 50).slice(0, 4)) lighting?.addLamp(p.x, p.y, p.z, M.lampLens)

  // Far side: grass verge, a row of trees, the multi-storey car park.
  for (let x = -110; x <= 110; x += 11) tree(S, x + rand() * 3, A.farWalk[1] + 3 + rand() * 4, 1 + rand() * 0.35)
  const G = A.garage
  const gTex = tex(paintGarage(), { repeatX: (2 * G.x) / 20, repeatY: 1 })
  const gSide = tex(paintGarage(), { repeatX: (G.z1 - G.z0) / 20, repeatY: 1 })
  const gFront = new MeshStandardMaterial({ map: gTex, roughness: 0.85 })
  const gSideM = new MeshStandardMaterial({ map: gSide, roughness: 0.85 })
  const garage = new Mesh(new BoxGeometry(2 * G.x, G.height, G.z1 - G.z0), [gSideM, gSideM, M.concrete, M.concrete, gFront, gFront])
  garage.position.set(0, G.height / 2, (G.z0 + G.z1) / 2)
  garage.receiveShadow = true
  scene.add(garage)
  place(S, rbox(2 * G.x + 0.6, 1.2, 0.6, 0.15, 1), M.concrete, 0, G.height + 0.3, G.z0) // parapet
  // Stair cores at the front corners, glazed slot up the face, roof caps.
  for (const s of [-1, 1]) {
    const x = s * (G.x - 3)
    place(S, rbox(4, G.height + 3.5, 4, 0.2, 1), M.concrete, x, (G.height + 3.5) / 2, G.z0 + 1.9)
    box(S, 0.9, G.height + 1.5, 0.1, M.navy, x, (G.height + 1.5) / 2 + 0.6, G.z0 - 0.12)
    place(S, rbox(4.4, 0.4, 4.4, 0.12, 1), M.white, x, G.height + 3.6, G.z0 + 1.9)
  }

  // Control tower behind the terminal: flared base, banded shaft with window slits,
  // cab with mullions, balcony + railing, overhanging roof, masts, radar dome.
  const towerX = 70
  const towerZ = -120
  const shaftR = (y) => (y < 10 ? 3.0 + (10 - y) * 0.05 : 3.0 - (Math.min(y, 30) - 10) * 0.02 - Math.max(0, y - 30) * 0.015)
  place(S, lathe([[5.2, 0], [5.2, 1.0], [4.4, 1.3], [4.2, 1.5]], 24), M.concrete, towerX, 0, towerZ)
  place(S, lathe([[3.7, 1.4], [3.3, 4], [3.0, 10], [2.6, 30], [2.45, 40], [2.55, 41.5], [3.4, 42.8], [4.5, 43.75]], 24), M.white, towerX, 0, towerZ)
  for (const y of [14, 28, 38]) place(S, lathe([[shaftR(y) + 0.06, y], [shaftR(y + 0.6) + 0.06, y + 0.6]], 24), M.navy, towerX, 0, towerZ)
  for (let y = 6; y < 38; y += 4) {
    if (y === 14 || y === 26) continue
    const r = shaftR(y)
    box(S, 0.5, 1.8, 0.14, M.navy, towerX, y, towerZ + r - 0.02)
    box(S, 0.14, 1.8, 0.5, M.navy, towerX + r - 0.02, y, towerZ)
    box(S, 0.14, 1.8, 0.5, M.navy, towerX - r + 0.02, y, towerZ)
  }
  cyl(S, 6, 4.4, 4.5, M.glass, towerX, 46, towerZ, 16)
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2
    place(S, strut(0.08, 0.08, [Math.sin(a) * 4.42, 43.75, Math.cos(a) * 4.42], [Math.sin(a) * 6.02, 48.25, Math.cos(a) * 6.02], 6), M.navy, towerX, 0, towerZ)
  }
  place(S, lathe([[4.3, 43.6], [5.3, 43.6], [5.3, 43.85], [4.3, 43.85]], 32), M.white, towerX, 0, towerZ)
  place(S, ring(5.25, 0.05, 40, 4), M.metal, towerX, 44.8, towerZ, Math.PI / 2)
  for (let k = 0; k < 20; k++) {
    const a = (k / 20) * Math.PI * 2
    place(S, pole(0.03, 43.85, 44.8, 4), M.metal, towerX + Math.sin(a) * 5.25, 0, towerZ + Math.cos(a) * 5.25)
  }
  place(S, lathe([[5.9, 48.15], [6.75, 48.15], [6.75, 48.85], [6.1, 49.25], [3.2, 49.65], [0, 49.75]], 24), M.white, towerX, 0, towerZ)
  place(S, rbox(2, 0.8, 1.4, 0.12, 1), M.concrete, towerX - 2, 50.1, towerZ + 1)
  place(S, pole(0.13, 49.6, 55, 8), M.dark, towerX, 0, towerZ)
  for (const y of [52.6, 53.9]) box(S, 1.6, 0.07, 0.07, M.dark, towerX, y, towerZ)
  place(S, pole(0.06, 49.6, 53.5, 6), M.dark, towerX + 2.4, 0, towerZ - 1.2)
  place(S, pole(0.12, 49.6, 50.5, 8), M.dark, towerX + 2.6, 0, towerZ + 2.0)
  place(S, new SphereGeometry(0.9, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.4, 1), M.white, towerX + 2.6, 50.6, towerZ + 2.0, 1.0)
  const beacon = new Mesh(new SphereGeometry(0.45, 10, 8), neon('#ff2a2a', 4))
  beacon.position.set(towerX, 55.2, towerZ)
  scene.add(beacon)

  // Distant hotels: facade boxes with a cornice and rooftop plant.
  const fac = paintFacade('#2b4f7e', 256, 6, 4, 61)
  const facM = new MeshStandardMaterial({ map: tex(fac.color, { repeatX: 3, repeatY: 5 }), roughness: 0.6 })
  for (const [x, z, w, h] of [[-190, -40, 30, 48], [-170, 70, 26, 36], [200, -30, 34, 54], [180, 80, 24, 30]]) {
    const b = new Mesh(new BoxGeometry(w, h, w), facM)
    b.position.set(x, h / 2, z)
    S.add(b)
    place(S, rbox(w + 0.8, 1.4, w + 0.8, 0.3, 1), M.white, x, h + 0.2, z)
    place(S, rbox(w * 0.4, 2.6, w * 0.3, 0.2, 1), M.concrete, x - w * 0.15, h + 2.1, z)
    box(S, w * 0.4 + 0.04, 0.2, w * 0.3 + 0.04, M.dark, x - w * 0.15, h + 2.6, z)
  }

  // --- Parked vehicles ----------------------------------------------------------------------
  const parked = new Group()
  const busA = makeBus()
  busA.position.set(-7, 0, 10)
  busA.rotation.y = -Math.PI / 2
  const busB = makeBus({ stripe: '#1f6fe0', dest: 'CITY CENTRE' })
  busB.position.set(-44, 0, 10)
  busB.rotation.y = -Math.PI / 2
  parked.add(busA, busB)
  solidBox(6.1, 1.6, 1.3, -7, 1.6, 10)
  solidBox(6.1, 1.6, 1.3, -44, 1.6, 10)
  for (const [x, c] of [[-9.5, '#f6b800'], [-16, '#f6b800'], [-60, '#f6b800']]) {
    const t = makeCar({ color: c, taxi: true })
    t.root.position.set(x, 0, 2)
    t.root.rotation.y = -Math.PI / 2
    parked.add(t.root)
    solidBox(2.4, 0.8, 0.95, x, 0.8, 2)
  }
  scene.add(parked)

  // --- The hero taxi (driven by the cutscene) ----------------------------------------------
  const taxi = makeCar({ color: '#f6b800', taxi: true, glow: true })
  taxi.root.position.set(140, 0, 2)
  taxi.root.rotation.y = -Math.PI / 2
  scene.add(taxi.root)

  // --- Through traffic on the far road ------------------------------------------------------
  const traffic = []
  const colors = ['#d8333b', '#f2f4f7', '#2a62d8', '#9aa3ad', '#1d1f24', '#f6b800', '#3fae6b']
  for (let i = 0; i < 7; i++) {
    const dir = i % 2 ? 1 : -1
    const car = makeCar({ color: colors[i], taxi: colors[i] === '#f6b800' })
    car.root.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2
    const lane = dir > 0 ? 23.4 : 18.6
    car.root.position.set(-260 + i * 75 + rand() * 20, 0, lane)
    scene.add(car.root)
    traffic.push({ car, dir, speed: 11 + rand() * 4 })
  }

  // --- Static bake + shadows -----------------------------------------------------------------
  const baked = bake(S, false)
  const casters = new Set([M.white, M.metal, M.dark, M.trunk, M.leafA, M.leafB, M.concrete, M.navy, M.wood, M.reflect, M.accent, M.curb])
  baked.traverse((o) => {
    if (!o.isMesh) return
    o.receiveShadow = true
    // Small solid props cast shadows; huge flats and glass do not (cheaper, and the canopy stays bright).
    o.castShadow = casters.has(o.material)
  })
  scene.add(baked)

  // --- Sliding entrance doors ---------------------------------------------------------------
  // Each panel: glass, rounded frame (rails, stiles, kick plate), pull bar, frosted band.
  const doors = { open: 0, target: 0, panels: [], colliders: [] }
  const dH = A.doorHeight
  for (const s of [-1, 1]) {
    const p = new Group()
    const d = new Group()
    box(d, dh - 0.05, dH - 0.1, 0.03, M.doorGlass, 0, 0, 0)
    place(d, rbox(dh - 0.05, 0.14, 0.1, 0.03, 1), M.dark, 0, dH / 2 - 0.1, 0)
    place(d, rbox(dh - 0.05, 0.3, 0.1, 0.03, 1), M.dark, 0, -dH / 2 + 0.18, 0)
    place(d, rbox(0.09, dH - 0.1, 0.1, 0.03, 1), M.dark, -s * (dh / 2 - 0.05), 0, 0)
    place(d, rbox(0.06, dH - 0.1, 0.1, 0.02, 1), M.dark, s * (dh / 2 - 0.06), 0, 0)
    place(d, rbox(dh - 0.2, 0.07, 0.04, 0.02, 1), M.white, 0, -0.35, 0)
    place(d, pole(0.022, -0.35, 0.65, 8), M.metal, -s * (dh / 2 - 0.32), 0, 0.09)
    for (const y of [-0.3, 0.6]) place(d, new BoxGeometry(0.03, 0.03, 0.08), M.metal, -s * (dh / 2 - 0.32), y, 0.05)
    const pb = bake(d, false)
    pb.renderOrder = 3
    pb.traverse((o) => (o.renderOrder = 3))
    p.add(pb)
    p.position.set(s * dh / 2, Y + dH / 2, fz + 0.08)
    p.userData.s = s
    p.renderOrder = 3
    scene.add(p)
    doors.panels.push(p)
    doors.colliders.push(addFixed(RAPIER.ColliderDesc.cuboid(dh / 2, dH / 2, 0.1), { x: s * dh / 2, y: Y + dH / 2, z: fz }))
  }

  // --- Planes taking off, birds, pigeons ---------------------------------------------------------
  const plane = makeAirliner()
  plane.root.rotation.order = 'YXZ'
  scene.add(plane.root)
  const jet = jetLoop()
  const fl = { t: 8, route: 0 }
  const tmpV = new Vector3()

  // Birds: one swept wing + half body per instance, mirrored for the other side.
  const ws = new Shape()
  ws.moveTo(0, -0.14)
  ws.quadraticCurveTo(0.35, -0.17, 0.72, -0.02)
  ws.lineTo(0.66, 0.05)
  ws.quadraticCurveTo(0.42, 0.08, 0.22, 0.12)
  ws.lineTo(0.05, 0.2)
  ws.lineTo(0, 0.2)
  const birdGeo = flatList([
    new ShapeGeometry(ws, 4).rotateX(-Math.PI / 2),
    new SphereGeometry(1, 8, 5, Math.PI / 2, Math.PI).scale(0.055, 0.05, 0.2).translate(0, 0, 0.02),
    new SphereGeometry(1, 6, 4, Math.PI / 2, Math.PI).scale(0.04, 0.04, 0.05).translate(0, 0.01, 0.22),
  ])
  const birds = new InstancedMesh(birdGeo, new MeshStandardMaterial({ color: '#2b2f38', roughness: 0.9, side: DoubleSide }), 24)
  birds.instanceMatrix.setUsage(DynamicDrawUsage)
  birds.frustumCulled = false
  scene.add(birds)
  const flock = Array.from({ length: 12 }, (_, i) => ({ off: new Vector3((i % 6) * 1.6 - 4, Math.sin(i) * 0.6, Math.abs((i % 6) - 2.5) * 1.4 + (i < 6 ? 0 : 40)), ph: i * 0.7 }))
  const fb = { x: -200, z: -30, y: 38, dir: 1 }
  const o3 = new Object3D()

  const pigeons = makePigeons(scene, rand)

  // --- Per-frame update ---------------------------------------------------------------------
  const brakeOff = () => taxi.setBrake(0)
  brakeOff()
  return {
    taxi,
    doors,
    plane,
    update(dt, t, { actors, camera }) {
      M.wind.value = t
      beacon.visible = t % 1.6 < 0.25

      // Doors open for anyone close (player, cutscene actor, passengers).
      let near = false
      for (const a of actors) if (Math.abs(a.x) < 5 && Math.abs(a.z - fz) < 5) near = true
      const want = near ? 1 : 0
      if (want !== doors.target) {
        doors.target = want
        const d = camera.position.distanceTo(tmpV.set(0, 2, fz))
        sfx('slide', { vol: Math.max(0, 0.45 - d * 0.012) })
      }
      doors.open += Math.sign(doors.target - doors.open) * Math.min(Math.abs(doors.target - doors.open), dt * 1.9)
      const e = doors.open * doors.open * (3 - 2 * doors.open)
      for (const p of doors.panels) p.position.x = p.userData.s * (dh / 2 + e * (dh - 0.1))
      for (const c of doors.colliders) c.setEnabled(doors.open < 0.6)

      // Traffic loops along the far road.
      for (const c of traffic) {
        const r = c.car.root
        r.position.x += c.dir * c.speed * dt
        if (r.position.x > 280) r.position.x = -280
        if (r.position.x < -280) r.position.x = 280
        for (const w of c.car.wheels) w.rotation.x += (c.speed * dt) / 0.36
      }

      // Plane: alternate a take-off behind the terminal and a high pass over the car park.
      fl.t += dt
      const P = plane.root
      if (fl.route === 0) {
        const k = fl.t
        P.position.set(-600 + k * 70, 15 + Math.max(0, k - 2) * 16, 230)
        P.rotation.set(-Math.min(0.23, k * 0.05), Math.PI / 2, 0)
        if (k > 20) {
          fl.t = 0
          fl.route = 1
        }
      } else {
        const k = fl.t
        P.position.set(700 - k * 60, 200 - k * 3, 320)
        P.rotation.set(0.04, -Math.PI / 2, 0)
        if (k > 24) {
          fl.t = 0
          fl.route = 0
        }
      }
      plane.strobe.visible = t % 1.2 < 0.08
      if (P.position.y > 50) for (const [ex, ey, ez] of plane.engines) {
        tmpV.set(ex, ey, ez - 2).applyMatrix4(P.matrixWorld)
        fx.trail(tmpV.x, tmpV.y, tmpV.z, { size: 2.4, size1: 7, life: 3.2, alpha: 0.35, vy: 0, vx: 0, vz: 0, drag: 0, grav: 0, fadeIn: 0.02 })
      }
      const dist = camera.position.distanceTo(P.position)
      jet.set((60 / (dist + 60)) * 0.6, Math.max(0, 1 - dist / 600))

      // Flock: one V crossing the sky, wings flapping (wings span across the flight path).
      fb.x += fb.dir * 9 * dt
      if (Math.abs(fb.x) > 260) {
        fb.dir = -fb.dir
        fb.z = -60 + Math.random() * 120
        fb.y = 30 + Math.random() * 20
      }
      let bi = 0
      for (const b of flock) {
        const flap = Math.sin(t * 9 + b.ph) * 0.7
        const bx = fb.x + b.off.z * -fb.dir * 0.4
        const bz = fb.z + b.off.x
        const by = fb.y + b.off.y + Math.sin(t + b.ph) * 0.3
        for (const s of [-1, 1]) {
          o3.position.set(bx, by, bz)
          o3.rotation.set(0, fb.dir > 0 ? Math.PI / 2 : -Math.PI / 2, 0)
          o3.rotateZ(s > 0 ? flap : Math.PI - flap)
          o3.updateMatrix()
          birds.setMatrixAt(bi++, o3.matrix)
        }
      }
      birds.instanceMatrix.needsUpdate = true

      pigeons.update(dt, t, actors, camera)
    },
  }
}

// --- Pigeons ----------------------------------------------------------------------------------
// Shaped body (lathe) + tail with a dark tip + legs and toes, head with iridescent neck,
// cere, beak and orange eyes, wings with two dark bars. One vertex-coloured material and
// shared geometry: 4 draw calls per bird (body, head, 2 wings). Wings fold at rest.
function makePigeons(scene, rand) {
  const PM = new MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.65, metalness: 0.1 })
  const parts = (list) => mergeGeometries(list.map(([geo, col]) => tint(geo, col)))
  const bodyParts = [
    [lathe([[0, -0.2], [0.045, -0.17], [0.085, -0.1], [0.112, -0.02], [0.115, 0.05], [0.095, 0.11], [0.06, 0.15], [0, 0.17]], 10).rotateX(Math.PI / 2).scale(0.85, 0.95, 1).rotateX(-0.15).translate(0, 0.17, 0), '#8e96a8'],
    [new SphereGeometry(0.07, 8, 6).scale(1, 0.8, 1.1).translate(0, 0.13, 0.08), '#a3abbb'],
    [rbox(0.1, 0.02, 0.16, 0.008, 1).rotateX(-0.3).translate(0, 0.17, -0.22), '#737b8e'],
    [new BoxGeometry(0.102, 0.022, 0.035).rotateX(-0.3).translate(0, 0.149, -0.287), '#2c3038'],
  ]
  for (const s of [-1, 1]) {
    bodyParts.push([new CylinderGeometry(0.008, 0.008, 0.09, 5).translate(s * 0.04, 0.045, 0.01), '#e07a86'])
    for (const a of [-0.5, 0, 0.5]) bodyParts.push([new BoxGeometry(0.007, 0.006, 0.04).translate(0, 0.004, 0.02).rotateY(a).translate(s * 0.04, 0, 0.01), '#d06a78'])
  }
  const bodyGeo = parts(bodyParts)
  const headParts = [
    [new SphereGeometry(0.075, 8, 6), '#4f8a78'],
    [new SphereGeometry(0.065, 10, 8).translate(0, 0.06, 0.02), '#5b6478'],
    [new CylinderGeometry(0.004, 0.013, 0.05, 6).rotateX(Math.PI / 2).translate(0, 0.05, 0.1), '#2e2f33'],
    [new SphereGeometry(0.013, 6, 4).translate(0, 0.06, 0.077), '#e8e4dc'],
  ]
  for (const s of [-1, 1]) {
    headParts.push([new SphereGeometry(0.012, 6, 4).translate(s * 0.04, 0.072, 0.055), '#f08c2a'])
    headParts.push([new SphereGeometry(0.006, 5, 3).translate(s * 0.049, 0.074, 0.06), '#111111'])
  }
  // Head-group origin sits at the old neck (head moved up by the old neck offset).
  const headGeo = parts(headParts).translate(0, -0.06, -0.02)
  const wingGeo = {}
  for (const s of [-1, 1]) {
    wingGeo[s] = parts([
      [new SphereGeometry(1, 10, 6).scale(0.14, 0.022, 0.1).translate(s * 0.13, 0, -0.03), '#7a8296'],
      [new SphereGeometry(1, 8, 4).scale(0.07, 0.018, 0.06).translate(s * 0.235, 0, -0.06), '#4a5060'],
      [new BoxGeometry(0.1, 0.006, 0.014).translate(s * 0.13, 0.021, -0.02), '#2c3038'],
      [new BoxGeometry(0.1, 0.006, 0.014).translate(s * 0.13, 0.021, -0.055), '#2c3038'],
    ])
  }
  const FOLD = 0.35
  const REST = 0.45
  const list = []
  const home = () => ({ x: -9 + rand() * 18, z: A.facadeZ + 3 + rand() * 6 })
  for (let i = 0; i < 6; i++) {
    const g = new Group()
    const b = new Group()
    const body = new Mesh(bodyGeo, PM)
    const head = new Group()
    head.position.set(0, 0.28, 0.13)
    const h = new Mesh(headGeo, PM)
    head.add(h)
    b.add(body, head)
    const wings = []
    for (const s of [-1, 1]) {
      const w = new Group()
      w.position.set(s * 0.07, 0.21, 0)
      w.add(new Mesh(wingGeo[s], PM))
      w.scale.x = FOLD
      w.rotation.z = -s * REST
      b.add(w)
      wings.push(w)
    }
    g.add(b)
    for (const m of [body, h]) m.castShadow = true
    const p = home()
    g.position.set(p.x, Y, p.z)
    g.rotation.y = rand() * 6.28
    scene.add(g)
    list.push({ g, head, wings, state: 'peck', t: rand() * 3, vx: 0, vy: 0, vz: 0, land: null, cooIn: 3 + rand() * 10 })
  }
  return {
    update(dt, t, actors, camera) {
      for (const p of list) {
        const pos = p.g.position
        p.t += dt
        if (p.state === 'peck' || p.state === 'walk') {
          // Scatter when someone comes close.
          for (const a of actors) {
            const dx = pos.x - a.x
            const dz = pos.z - a.z
            if (dx * dx + dz * dz < 9) {
              const d = Math.hypot(dx, dz) || 1
              p.state = 'fly'
              p.t = 0
              p.vx = (dx / d) * 4
              p.vz = (dz / d) * 4
              p.vy = 5
              p.g.rotation.y = Math.atan2(p.vx, p.vz)
              p.land = home()
              const cd = camera.position.distanceTo(pos)
              sfx('flap', { vol: Math.max(0.05, 0.5 - cd * 0.02) })
              break
            }
          }
        }
        if (p.state === 'peck') {
          const k = Math.sin(p.t * 5)
          p.head.position.y = 0.28 - Math.max(0, k) * 0.1
          p.head.position.z = 0.13 + Math.max(0, k) * 0.06
          p.wings[0].rotation.z = REST
          p.wings[1].rotation.z = -REST
          p.wings[0].scale.x = p.wings[1].scale.x = FOLD
          if (p.t > 2.5 + Math.random() * 3) {
            p.state = 'walk'
            p.t = 0
            p.g.rotation.y += (Math.random() - 0.5) * 2
          }
          p.cooIn -= dt
          if (p.cooIn < 0) {
            p.cooIn = 6 + Math.random() * 12
            const cd = camera.position.distanceTo(pos)
            if (cd < 14) sfx('coo', { vol: 0.12 * (1 - cd / 14) })
          }
        } else if (p.state === 'walk') {
          const step = Math.abs(Math.sin(p.t * 9))
          pos.x += Math.sin(p.g.rotation.y) * dt * 0.5
          pos.z += Math.cos(p.g.rotation.y) * dt * 0.5
          pos.y = Y + step * 0.02
          p.head.position.z = 0.13 + Math.sin(p.t * 9) * 0.03
          if (pos.z < A.facadeZ + 1.5 || pos.z > -1.5) p.g.rotation.y += Math.PI
          if (p.t > 1.2) {
            p.state = 'peck'
            p.t = 0
          }
        } else if (p.state === 'fly') {
          // Up and away, then glide back down to a new spot.
          const back = p.t > 2.2
          if (back) {
            const dx = p.land.x - pos.x
            const dz = p.land.z - pos.z
            const d = Math.hypot(dx, dz)
            p.vx += ((dx / (d || 1)) * 5 - p.vx) * dt * 2
            p.vz += ((dz / (d || 1)) * 5 - p.vz) * dt * 2
            p.vy += ((Y + 0.2 - pos.y) * 1.2 - p.vy) * dt * 2
            p.g.rotation.y = Math.atan2(p.vx, p.vz)
            if (d < 0.4 && pos.y < Y + 0.5) {
              p.state = 'peck'
              p.t = 0
              pos.y = Y
            }
          } else p.vy -= dt * 2
          pos.x += p.vx * dt
          pos.y = Math.max(Y, pos.y + p.vy * dt)
          pos.z += p.vz * dt
          const flap = Math.sin(p.t * (back ? 14 : 28)) * 1.1
          p.wings[0].rotation.z = -flap
          p.wings[1].rotation.z = flap
          p.wings[0].scale.x = p.wings[1].scale.x = 1
          if (p.t > 9) {
            p.state = 'peck'
            pos.set(p.land.x, Y, p.land.z)
          }
        }
      }
    },
  }
}

// Points of interest used by the cutscene / gameplay.
export const DOOR_POINT = new Vector3(0, Y, A.facadeZ)
