// The terminal curb: roads, sidewalk, canopy with light strips, the glass
// facade with its sliding entrance doors, car park, control tower, trees,
// lamps, parked buses and taxis, through traffic, planes taking off, birds and
// pigeons that scatter when you walk at them. Static parts are baked to one
// mesh per material.
import {
  BoxGeometry,
  CylinderGeometry,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  SphereGeometry,
  Vector3,
} from 'three'
import { AIRPORT } from '../config.js'
import { bake } from '../bake.js'
import { neon, solidBox, solidPole } from '../propkit.js'
import { RAPIER, addFixed } from '../physics.js'
import { mulberry32, paintFacade } from '../textures.js'
import { paintAsphalt, paintGarage, paintGlass, paintRoadText, paintSidewalk, paintSlabSign, tex } from './paint.js'
import { makeAirliner, makeBus, makeCar } from './vehicles.js'
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
  M.trunk = new MeshStandardMaterial({ color: '#6b4a2f', roughness: 0.9 })
  M.leafA = new MeshStandardMaterial({ color: '#3f9a3c', roughness: 0.8, flatShading: true })
  M.leafB = new MeshStandardMaterial({ color: '#56b54a', roughness: 0.8, flatShading: true })
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

function tree(parent, x, z, s = 1, y = 0) {
  const g = new Group()
  cyl(g, 0.14 * s, 0.2 * s, 2.6 * s, M.trunk, 0, 1.3 * s, 0, 7)
  const blobs = [[0, 3.2, 0, 1.5], [0.8, 2.8, 0.3, 1.0], [-0.7, 2.9, -0.2, 1.1], [0.1, 3.9, -0.1, 1.0]]
  blobs.forEach(([bx, by, bz, r], i) => {
    const m = new Mesh(new IcosahedronGeometry(r * s, 0), i % 2 ? M.leafB : M.leafA)
    // Geometry positions are local to the crown so the sway grows with height.
    m.geometry.translate(0, 0, 0)
    m.position.set(bx * s, by * s, bz * s)
    m.rotation.set(i, i * 2, 0)
    g.add(m)
  })
  g.position.set(x, y, z)
  parent.add(g)
  return g
}

function planter(parent, x, z, y = Y) {
  box(parent, 1.8, 0.75, 1.8, M.concrete, x, y + 0.375, z)
  box(parent, 1.6, 0.05, 1.6, M.trunk, x, y + 0.76, z)
  tree(parent, x, z, 0.9, y + 0.75)
  solidBox(0.9, 0.6, 0.9, x, y + 0.4, z)
}

function bollard(parent, x, z) {
  cyl(parent, 0.13, 0.15, 0.9, M.metal, x, Y + 0.45, z, 12)
  cyl(parent, 0.155, 0.155, 0.1, M.white, x, Y + 0.72, z, 12)
  const top = new Mesh(new SphereGeometry(0.13, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), M.metal)
  top.position.set(x, Y + 0.9, z)
  parent.add(top)
  const base = cyl(parent, 0.22, 0.24, 0.06, M.dark, x, Y + 0.03, z, 12)
  base.castShadow = false
}

function lamp(parent, x, z, dir = 1, y = Y, h = 9) {
  cyl(parent, 0.12, 0.16, h, M.dark, x, y + h / 2, z, 10)
  box(parent, 0.12, 0.12, 2.2, M.dark, x, y + h - 0.1, z + dir * 1.0)
  box(parent, 0.6, 0.18, 0.9, M.dark, x, y + h - 0.2, z + dir * 2.0)
  box(parent, 0.5, 0.04, 0.8, M.lampLens, x, y + h - 0.3, z + dir * 2.0)
  return new Vector3(x, y + h - 0.6, z + dir * 2.0)
}

function trolley(parent, x, z, ry) {
  const g = new Group()
  box(g, 0.7, 0.05, 1.1, M.metal, 0, 0.35, 0)
  box(g, 0.05, 0.9, 0.05, M.metal, -0.33, 0.8, -0.5)
  box(g, 0.05, 0.9, 0.05, M.metal, 0.33, 0.8, -0.5)
  box(g, 0.75, 0.06, 0.06, M.dark, 0, 1.25, -0.55)
  box(g, 0.7, 0.5, 0.05, M.metal, 0, 0.6, 0.53)
  for (const [wx, wz] of [[-0.3, -0.45], [0.3, -0.45], [-0.3, 0.45], [0.3, 0.45]]) {
    const w = cyl(g, 0.1, 0.1, 0.05, M.dark, wx, 0.1, wz, 10)
    w.rotation.z = Math.PI / 2
  }
  g.position.set(x, Y, z)
  g.rotation.y = ry
  parent.add(g)
}

function bench(parent, x, z, ry = 0) {
  const g = new Group()
  box(g, 2.4, 0.08, 0.6, M.metal, 0, 0.48, 0)
  box(g, 2.4, 0.5, 0.06, M.metal, 0, 0.82, -0.28)
  for (const s of [-1, 1]) box(g, 0.08, 0.48, 0.55, M.dark, s * 1.05, 0.24, 0)
  g.position.set(x, Y, z)
  g.rotation.y = ry
  parent.add(g)
  solidBox(1.2, 0.5, 0.3, x, Y + 0.5, z, ry)
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
  // drainage grate along the terminal curb
  flat(S, -400, 400, -1.5, -1.2, Y + 0.01, M.dark, 1)

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
  // Mullions + transoms (navy), white columns in front.
  for (let x = -L; x <= L; x += 4) if (Math.abs(x) > dh + 0.2) box(S, 0.2, top - Y, 0.3, M.navy, x, (top + Y) / 2, fz + 0.05)
  for (let y = Y + 4.4; y < top; y += 4.4) {
    box(S, hall.x0 + L - 0.1, 0.18, 0.28, M.navy, (-L + hall.x0) / 2, y, fz + 0.05)
    box(S, L - hall.x1, 0.18, 0.28, M.navy, (L + hall.x1) / 2, y, fz + 0.05)
    box(S, hall.x1 - hall.x0, 0.18, 0.28, M.navy, 0, y, fz + 0.05)
  }
  for (let x = -L + 4; x <= L - 4; x += 8) {
    if (Math.abs(x) < 5) continue
    box(S, 0.9, top - Y + 0.6, 0.7, M.white, x, (top + Y) / 2 + 0.3, fz + 0.5)
    solidBox(0.45, 7, 0.35, x, 7, fz + 0.5)
  }
  box(S, 2 * L + 1, 1.3, 1.0, M.white, 0, top + 0.6, fz + 0.2) // top fascia
  // Entrance surround: dark header + frame, sign above.
  box(S, 2 * dh + 1.6, 1.6, 0.6, M.navy, 0, Y + A.doorHeight + 0.8, fz + 0.2)
  for (const s of [-1, 1]) box(S, 0.35, A.doorHeight, 0.5, M.navy, s * (dh + 0.18), Y + A.doorHeight / 2, fz + 0.15)
  box(S, 2 * dh + 1.2, 0.04, 2.2, M.dark, 0, Y + 0.02, fz + 1.2) // entry mat
  const dep = tex(paintSlabSign('departures  ✈', { w: 512, h: 96, bg: '#0f1a36' }))
  const depMat = new MeshStandardMaterial({ map: dep, emissiveMap: dep, emissive: '#ffffff', emissiveIntensity: 0.9 })
  const depSign = new Mesh(new PlaneGeometry(5.6, 1.05), depMat)
  depSign.position.set(0, Y + A.doorHeight + 0.82, fz + 0.52)
  scene.add(depSign)
  // Facade walls (collision): split around the door opening.
  solidBox((L - dh) / 2, 8, 0.25, -(L + dh) / 2, 8, fz - 0.1)
  solidBox((L - dh) / 2, 8, 0.25, (L + dh) / 2, 8, fz - 0.1)
  solidBox(dh, 5, 0.25, 0, A.doorHeight + Y + 5, fz - 0.1)

  // Building shell behind the facade: roof slab, side + back walls.
  tiledBox(S, 2 * L, 1.2, 60, M.white, 0, top + 0.6, fz - 30, 4)
  box(S, 1, top, 60, M.white, -L, top / 2, fz - 30)
  box(S, 1, top, 60, M.white, L, top / 2, fz - 30)
  for (const [x, w, d] of [[-50, 14, 8], [-20, 8, 6], [40, 16, 10]]) box(S, w, 2.5, d, M.concrete, x, top + 2.4, fz - 25)

  // --- Canopy over the curb ------------------------------------------------------------
  const cz0 = fz + 0.4
  const cz1 = A.median[1] + 0.6
  const cy = A.canopyY
  const canopy = box(scene, 2 * L, 0.6, cz1 - cz0, M.white, 0, cy + 0.3, (cz0 + cz1) / 2)
  canopy.receiveShadow = true
  box(scene, 2 * L, 1.1, 0.4, M.white, 0, cy + 0.2, cz1).receiveShadow = true
  const fascia = tex(paintSlabSign('skyport international', { w: 1024, h: 96, bg: '#0f1a36', color: '#ffffff' }))
  const fasciaSign = new Mesh(new PlaneGeometry(16, 1.0), new MeshStandardMaterial({ map: fascia, emissiveMap: fascia, emissive: '#ffffff', emissiveIntensity: 0.8 }))
  fasciaSign.position.set(0, cy + 0.2, cz1 + 0.22)
  scene.add(fasciaSign)
  const strips = new Group()
  for (let z = cz0 + 1.6; z < cz1 - 0.8; z += 2.4) box(strips, 2 * L - 2, 0.06, 0.22, M.strip, 0, cy - 0.04, z)
  for (let x = -L + 8; x <= L - 8; x += 16) box(S, 0.5, 0.9, cz1 - cz0, M.white, x, cy - 0.4, (cz0 + cz1) / 2)
  for (let x = -L + 8; x <= L - 8; x += 16) {
    cyl(S, 0.5, 0.55, cy, M.white, x, cy / 2, (A.median[0] + A.median[1]) / 2, 18)
    cyl(S, 0.75, 0.75, 0.3, M.concrete, x, Y + 0.15, (A.median[0] + A.median[1]) / 2, 18)
    solidPole(0.55, cy, x, (A.median[0] + A.median[1]) / 2)
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
  for (const x of [-80, -48, -32, 32, 48, 80]) planter(S, x, (A.median[0] + A.median[1]) / 2)
  for (const x of [-10, -26, 14, 26]) bench(S, x, fz + 1.6)
  for (const x of [-7, 7, -30, 30]) {
    cyl(S, 0.32, 0.3, 1.0, M.dark, x, Y + 0.5, fz + 1.3, 12)
    solidPole(0.35, 1, x, fz + 1.3)
  }
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
  box(S, 2 * G.x + 0.6, 1.2, 0.6, M.concrete, 0, G.height + 0.3, G.z0) // parapet

  // Control tower behind the terminal + distant hotels.
  const towerX = 70
  const towerZ = -120
  cyl(S, 2.4, 3.2, 44, M.white, towerX, 22, towerZ, 20)
  cyl(S, 6, 4.4, 4.5, M.glass, towerX, 46, towerZ, 16)
  cyl(S, 6.6, 6.6, 0.8, M.white, towerX, 48.6, towerZ, 16)
  cyl(S, 0.12, 0.12, 6, M.dark, towerX, 52, towerZ, 6)
  const beacon = new Mesh(new SphereGeometry(0.45, 10, 8), neon('#ff2a2a', 4))
  beacon.position.set(towerX, 55.2, towerZ)
  scene.add(beacon)
  const fac = paintFacade('#2b4f7e', 256, 6, 4, 61)
  const facM = new MeshStandardMaterial({ map: tex(fac.color, { repeatX: 3, repeatY: 5 }), roughness: 0.6 })
  for (const [x, z, w, h] of [[-190, -40, 30, 48], [-170, 70, 26, 36], [200, -30, 34, 54], [180, 80, 24, 30]]) {
    const b = new Mesh(new BoxGeometry(w, h, w), facM)
    b.position.set(x, h / 2, z)
    S.add(b)
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
  baked.traverse((o) => {
    if (!o.isMesh) return
    o.receiveShadow = true
    const m = o.material
    // Small solid props cast shadows; huge flats and glass do not (cheaper, and the canopy stays bright).
    o.castShadow = m === M.white || m === M.metal || m === M.dark || m === M.trunk || m === M.leafA || m === M.leafB || m === M.concrete || m === M.navy
  })
  scene.add(baked)

  // --- Sliding entrance doors ---------------------------------------------------------------
  const doors = { open: 0, target: 0, panels: [], colliders: [] }
  for (const s of [-1, 1]) {
    const p = new Group()
    box(p, dh - 0.05, A.doorHeight - 0.1, 0.06, M.doorGlass, 0, 0, 0)
    box(p, dh - 0.05, 0.12, 0.1, M.dark, 0, A.doorHeight / 2 - 0.1, 0)
    box(p, dh - 0.05, 0.12, 0.1, M.dark, 0, -A.doorHeight / 2 + 0.1, 0)
    box(p, 0.08, A.doorHeight - 0.1, 0.1, M.dark, -s * (dh / 2 - 0.05), 0, 0)
    box(p, 0.5, 0.06, 0.04, M.metal, -s * (dh / 2 - 0.4), 0.1, 0.06)
    p.position.set(s * dh / 2, Y + A.doorHeight / 2, fz + 0.08)
    p.userData.s = s
    p.renderOrder = 3
    scene.add(p)
    doors.panels.push(p)
    doors.colliders.push(addFixed(RAPIER.ColliderDesc.cuboid(dh / 2, A.doorHeight / 2, 0.1), { x: s * dh / 2, y: Y + A.doorHeight / 2, z: fz }))
  }

  // --- Planes taking off, birds, pigeons ---------------------------------------------------------
  const plane = makeAirliner()
  plane.root.rotation.order = 'YXZ'
  scene.add(plane.root)
  const jet = jetLoop()
  const fl = { t: 8, route: 0 }
  const tmpV = new Vector3()

  const birdGeo = new BoxGeometry(0.7, 0.03, 0.28)
  birdGeo.translate(0.35, 0, 0)
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

      // Flock: one V crossing the sky, wings flapping.
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
          o3.rotation.set(0, fb.dir > 0 ? 0 : Math.PI, 0)
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
function makePigeons(scene, rand) {
  const bodyMat = new MeshStandardMaterial({ color: '#8e96a8', roughness: 0.8 })
  const headMat = new MeshStandardMaterial({ color: '#5b6478', roughness: 0.6, metalness: 0.3 })
  const neckMat = new MeshStandardMaterial({ color: '#4f8a78', roughness: 0.4, metalness: 0.5 })
  const beakMat = new MeshStandardMaterial({ color: '#e8b37a', roughness: 0.6 })
  const legMat = new MeshStandardMaterial({ color: '#e07a86', roughness: 0.6 })
  const wingMat = new MeshStandardMaterial({ color: '#7a8296', roughness: 0.8 })
  const list = []
  const home = () => ({ x: -9 + rand() * 18, z: A.facadeZ + 3 + rand() * 6 })
  for (let i = 0; i < 6; i++) {
    const g = new Group()
    const b = new Group()
    const body = new Mesh(new SphereGeometry(0.13, 10, 8), bodyMat)
    body.scale.set(0.85, 0.8, 1.35)
    body.position.y = 0.16
    const head = new Group()
    head.position.set(0, 0.28, 0.13)
    const h = new Mesh(new SphereGeometry(0.065, 10, 8), headMat)
    const neck = new Mesh(new SphereGeometry(0.075, 8, 6), neckMat)
    neck.position.set(0, -0.06, -0.02)
    const beak = new Mesh(new BoxGeometry(0.025, 0.02, 0.06), beakMat)
    beak.position.set(0, -0.005, 0.07)
    head.add(neck, h, beak)
    const tail = new Mesh(new BoxGeometry(0.1, 0.02, 0.16), wingMat)
    tail.position.set(0, 0.17, -0.2)
    tail.rotation.x = -0.3
    for (const s of [-1, 1]) {
      const leg = new Mesh(new BoxGeometry(0.015, 0.09, 0.015), legMat)
      leg.position.set(s * 0.04, 0.045, 0)
      b.add(leg)
    }
    b.add(body, head, tail)
    const wings = []
    for (const s of [-1, 1]) {
      const w = new Group()
      w.position.set(s * 0.09, 0.2, 0)
      const wm = new Mesh(new BoxGeometry(0.26, 0.02, 0.2), wingMat)
      wm.position.x = s * 0.12
      w.add(wm)
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
          for (const w of p.wings) w.rotation.z = 0
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
