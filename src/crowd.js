// The crowd: every NPC passenger and desk agent drawn with shared InstancedMeshes
// (one per body part, ~12 draw calls for all of them). Each NPC owns a fixed
// instance slot; the pose (walk cycle, idle, typing, waving, scared, knocked
// out, pulling a suitcase) is computed here every frame as plain matrices.
// Speech bubbles and name tags are small sprite pools handed to whoever needs them.
import {
  BoxGeometry,
  BufferAttribute,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  TorusGeometry,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { bubbleCanvas, drawBubble, drawName, nameCanvas } from './airport/paint.js'
import { lathe, nonIndexed, rbox } from './detail.js'

const SKINS = ['#f3c99c', '#e0a979', '#c58a5c', '#8d5a3b', '#5e3b26', '#f6d6b8', '#ffcc99']
const HAIRS = ['#1b1612', '#3a2617', '#6b3d1f', '#c8742c', '#e8c46b', '#141414', '#d0d0d0', '#e8452f', '#ff7fb6']
const SHIRTS = ['#1d1f24', '#f4f4f4', '#2a62d8', '#d8333b', '#3fae6b', '#f6b800', '#8a5cd6', '#7a8496', '#1d1f24', '#ececec', '#ff8a3d', '#36c3d6']
const PANTS = ['#1b2233', '#2b3f6b', '#1d1f24', '#59606e', '#c9b38f', '#2a2a2a', '#3b5bb5']
const SHOES = ['#f2f2f2', '#f2f2f2', '#1d1f24', '#1d1f24', '#d8333b', '#2a62d8', '#7a5638', '#8a919c']
const PACKS = ['#ff8fa3', '#3fc4c9', '#2b2f3a', '#ffb02e', '#7a5cff', '#4fbf5a', '#e8434f']
const BAGS = ['#2b2f3a', '#e8434f', '#5cc4ff', '#a98ae6', '#5fe0a8', '#ffc531', '#7a8496', '#4c6ef5']
const NAMES = ['sneakysun', 'zane_46168', 'sp4rk', 'leah_76402', 'funky_muffin', 'axel93', 'goldenphoenix', 'poppy396', 'Lin288306', 'sokatreey_07', 'Hobiofooo12', 'IslaBee', 'harp3r', 'meevakrol111', 'p3nguin', 'falcon_57394', 'NeonPanda', 'quietghost', 'cub76', 'branu08', 'nottess6', 'ryan13', 'Maiboki', 'SAM', 'coolpilot', 'Bupila', 'Brelioa', 'zoe', 'baymas', 'jet_lagged', 'skyhopper', 'momo_22']
const pick = (a) => a[Math.floor(Math.random() * a.length)]

// Body in metres, origin at the feet, facing +Z (right side = -X), 1.8 m tall.
const LEG = { w: 0.26, h: 0.675, d: 0.27, hipY: 0.675, x: 0.135 }
const ARM = { w: 0.24, h: 0.66, d: 0.24, y: 1.31, x: 0.4 }
const TORSO = { w: 0.56, h: 0.675, d: 0.28 }
const HEAD = { r: 0.19, h: 0.36, y: 1.55 }

const ZERO = new Matrix4().makeScale(0, 0, 0)
const HAIR_STYLES = 5

// --- Geometry (built once, shared by every NPC through instancing) ------------------------------
// Merge-ready: non-indexed with position / normal / uv only (plus `color` where a part is two-tone).
const ni = (g) => {
  g = nonIndexed(g)
  for (const n of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(n)) g.deleteAttribute(n)
  return g
}
const merge = (list) => mergeGeometries(list.map(ni))
// Vertex colour (a shade multiplied with the instance tint), for two-tone parts.
function shade(g, hex) {
  g = ni(g)
  const c = new Color(hex)
  const n = g.attributes.position.count
  const a = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3)
  g.setAttribute('color', new BufferAttribute(a, 3))
  return g
}
// Planar UVs for a part whose texture has a front half (u 0..0.5) and a back half (u 0.5..1);
// v runs bottom (0) to top (1) over [y0, y1].
function frontBackUv(g, w, y0, y1) {
  const p = g.attributes.position
  const nrm = g.attributes.normal
  const uv = g.attributes.uv
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / w + 0.5
    const v = (p.getY(i) - y0) / (y1 - y0)
    const nz = nrm.getZ(i)
    const nx = nrm.getX(i)
    let u
    if (nz > 0.35) u = (1 - x) * 0.5
    else if (nz < -0.35 || Math.abs(nx) > 0.35) u = 0.5 + x * 0.5
    else u = 0.75
    uv.setXY(i, Math.min(0.999, Math.max(0.001, u)), Math.min(0.999, Math.max(0.001, v)))
  }
  return g
}

// Rounded head (a Roblox-style "cylinder with soft edges"); u wraps the head with the face at u 0.5.
function headGeometry() {
  const { r, h } = HEAD
  const e = 0.07
  const pts = [[0, -h / 2]]
  for (let i = 0; i <= 3; i++) {
    const a = -Math.PI / 2 + (i / 3) * (Math.PI / 2)
    pts.push([r - e + Math.cos(a) * e, -h / 2 + e + Math.sin(a) * e])
  }
  for (let i = 0; i <= 3; i++) {
    const a = (i / 3) * (Math.PI / 2)
    pts.push([r - e + Math.cos(a) * e, h / 2 - e + Math.sin(a) * e])
  }
  pts.push([0, h / 2])
  // lathe: u 0 is at +Z; turn it half way so the seam is at the back and u 0.5 (the face) faces +Z.
  const g = lathe(pts, 16).rotateY(Math.PI)
  const p = g.attributes.position
  const uv = g.attributes.uv
  for (let i = 0; i < p.count; i++) uv.setY(i, (p.getY(i) + h / 2) / h)
  return g.translate(0, HEAD.y, 0)
}

// Hair: a dome that hugs the round head, plus pieces per style.
function hairGeometries() {
  const Y = HEAD.y
  const dome = () => lathe([[0.205, 0.03], [0.209, 0.11], [0.2, 0.165], [0.175, 0.2], [0.12, 0.222], [0, 0.231]], 16).translate(0, Y, 0)
  // Back of the head: half an open cylinder (the head hides its inside).
  const backShell = (h, top = 0.12, rad = 0.207) => new CylinderGeometry(rad, rad * 1.02, h, 14, 2, true, Math.PI / 2, Math.PI).translate(0, Y + top - h / 2, 0)
  const fringe = rbox(0.4, 0.085, 0.1, 0.04, 1).rotateX(-0.35).translate(0, Y + 0.15, 0.165)
  const side = (s, h = 0.14) => new BoxGeometry(0.05, h, 0.12).translate(s * 0.192, Y + 0.12 - h / 2, 0.06)
  const short = merge([dome(), backShell(0.24), fringe, side(1), side(-1)])
  const long = merge([dome(), backShell(0.56, 0.12, 0.212), rbox(0.42, 0.06, 0.08, 0.03, 1).translate(0, Y + 0.165, 0.17), side(1, 0.42), side(-1, 0.42), rbox(0.34, 0.12, 0.08, 0.04, 1).translate(0, Y - 0.38, -0.16)])
  // Afro: a lumpy sphere, smooth-shaded.
  const afro = new SphereGeometry(0.27, 16, 12)
  {
    const p = afro.attributes.position
    const v = new Vector3()
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i)
      const th = Math.atan2(v.z, v.x)
      const ph = Math.acos(Math.max(-1, Math.min(1, v.y / 0.27)))
      v.multiplyScalar(1 + 0.055 * Math.sin(th * 6) * Math.sin(ph * 5) + 0.03 * Math.sin(th * 11 + ph * 7))
      p.setXYZ(i, v.x, v.y, v.z)
    }
    afro.computeVertexNormals()
    afro.scale(1, 0.85, 1).translate(0, Y + 0.12, -0.04)
  }
  // Spiky: cones pointing up and outward from the crown.
  const spikes = []
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2
    const ring = i % 2 ? 0.12 : 0.06
    const c = new ConeGeometry(0.075, 0.2, 5).rotateX(Math.sin(a) * 0.55).rotateZ(-Math.cos(a) * 0.55)
    spikes.push(c.translate(Math.cos(a) * ring, Y + 0.27, Math.sin(a) * ring - 0.02))
  }
  spikes.push(new ConeGeometry(0.08, 0.24, 5).translate(0, Y + 0.31, -0.02))
  const spiky = merge([dome(), backShell(0.22), ...spikes, rbox(0.38, 0.07, 0.09, 0.035, 1).rotateX(-0.6).translate(0, Y + 0.18, 0.17)])
  // Bun: tidy dome + a round bun on top-back with a band.
  const bun = merge([dome(), backShell(0.26), fringe.clone(), new SphereGeometry(0.1, 10, 7).translate(0, Y + 0.23, -0.15), new TorusGeometry(0.06, 0.018, 4, 10).rotateX(Math.PI / 2 - 0.6).translate(0, Y + 0.175, -0.12)])
  return [short, long, ni(afro), spiky, bun]
}

// Hard-shell spinner: rounded shell with ribs, carry handle, telescopic trolley handle, 4 spinners.
function bagGeometries() {
  // (Small pieces are plain boxes: there can be ~190 of these on screen.)
  const body = merge([
    rbox(0.42, 0.56, 0.24, 0.05, 2).translate(0, 0.34, 0),
    ...[-0.1, 0.1].map((x) => new BoxGeometry(0.05, 0.5, 0.256).translate(x, 0.34, 0)),
    new BoxGeometry(0.43, 0.02, 0.25).translate(0, 0.34, 0), // zip seam bead
    new BoxGeometry(0.13, 0.03, 0.04).translate(0, 0.635, 0.02), // carry grip
  ])
  const tube = (x) => new CylinderGeometry(0.013, 0.013, 0.44, 5, 1, true).translate(x, 0.84, -0.095)
  const handle = merge([tube(-0.11), tube(0.11), rbox(0.27, 0.045, 0.055, 0.02, 1).translate(0, 1.06, -0.095), new BoxGeometry(0.26, 0.03, 0.05).translate(0, 0.625, -0.095)])
  const wheels = merge([[-0.16, -0.08], [0.16, -0.08], [-0.16, 0.08], [0.16, 0.08]].flatMap(([x, z]) => [
    new BoxGeometry(0.06, 0.03, 0.06).translate(x, 0.07, z),
    new CylinderGeometry(0.032, 0.032, 0.026, 8).rotateZ(Math.PI / 2).translate(x, 0.032, z),
  ]))
  return { body, handle, wheels }
}

// Four faces side by side (one per 256 px cell); the head shader picks a cell per NPC.
// Painted dark on white: the white multiplies to the skin colour.
function paintFaces() {
  const c = document.createElement('canvas')
  c.width = 1024
  c.height = 128
  const x = c.getContext('2d')
  x.fillStyle = '#ffffff'
  x.fillRect(0, 0, 1024, 128)
  const INK = '#1b1b1b'
  x.lineCap = 'round'
  x.lineJoin = 'round'
  const eye = (cx, cy, rx = 5, ry = 9) => {
    x.fillStyle = INK
    x.beginPath()
    x.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
    x.fill()
    x.fillStyle = '#ffffff'
    x.beginPath()
    x.arc(cx + 1.6, cy - 3.6, 1.9, 0, Math.PI * 2)
    x.fill()
  }
  const stroke = (w, f) => {
    x.strokeStyle = INK
    x.lineWidth = w
    x.beginPath()
    f()
    x.stroke()
  }
  // 0: classic smile
  eye(116, 56)
  eye(140, 56)
  stroke(4, () => x.arc(128, 70, 13, 0.2 * Math.PI, 0.8 * Math.PI))
  // 1: brows + open grin
  let o = 256
  eye(o + 116, 58)
  eye(o + 140, 58)
  stroke(3.5, () => {
    x.moveTo(o + 108, 42)
    x.lineTo(o + 122, 40)
    x.moveTo(o + 134, 40)
    x.lineTo(o + 148, 42)
  })
  x.fillStyle = INK
  x.beginPath()
  x.moveTo(o + 114, 72)
  x.quadraticCurveTo(o + 128, 96, o + 142, 72)
  x.closePath()
  x.fill()
  x.fillStyle = '#ffffff'
  x.fillRect(o + 117, 72, 22, 4)
  x.fillStyle = '#c4574f'
  x.beginPath()
  x.ellipse(o + 128, 83, 6, 3, 0, 0, Math.PI * 2)
  x.fill()
  // 2: happy closed eyes + blush
  o = 512
  stroke(4, () => {
    x.arc(o + 116, 60, 6, Math.PI * 1.1, Math.PI * 1.9)
  })
  stroke(4, () => {
    x.arc(o + 140, 60, 6, Math.PI * 1.1, Math.PI * 1.9)
  })
  stroke(4, () => x.arc(o + 128, 70, 10, 0.15 * Math.PI, 0.85 * Math.PI))
  x.fillStyle = 'rgba(255,120,130,0.45)'
  for (const bx of [104, 152]) {
    x.beginPath()
    x.ellipse(o + bx, 70, 8, 4.5, 0, 0, Math.PI * 2)
    x.fill()
  }
  // 3: glasses
  o = 768
  eye(o + 115, 57, 4, 7)
  eye(o + 141, 57, 4, 7)
  stroke(3, () => {
    x.arc(o + 115, 57, 11, 0, Math.PI * 2)
  })
  stroke(3, () => {
    x.arc(o + 141, 57, 11, 0, Math.PI * 2)
  })
  stroke(3, () => {
    x.moveTo(o + 126, 55)
    x.quadraticCurveTo(o + 128, 52, o + 130, 55)
    x.moveTo(o + 104, 55)
    x.lineTo(o + 92, 52)
    x.moveTo(o + 152, 55)
    x.lineTo(o + 164, 52)
  })
  stroke(3.5, () => x.arc(o + 128, 66, 11, 0.25 * Math.PI, 0.75 * Math.PI))
  return c
}

// Fabric detail maps (white = the NPC's tint): shirt front / back, trousers.
function grain(x, w, h, k = 0.05) {
  const img = x.getImageData(0, 0, w, h)
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 255 * k
    img.data[i] += n
    img.data[i + 1] += n
    img.data[i + 2] += n
  }
  x.putImageData(img, 0, 0)
}
function paintShirt() {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 128
  const x = c.getContext('2d')
  x.fillStyle = '#ffffff'
  x.fillRect(0, 0, 256, 128)
  for (const o of [0, 128]) {
    // soft shading toward the sides and the hem
    const gs = x.createLinearGradient(o, 0, o + 128, 0)
    gs.addColorStop(0, 'rgba(0,0,0,0.13)')
    gs.addColorStop(0.18, 'rgba(0,0,0,0)')
    gs.addColorStop(0.82, 'rgba(0,0,0,0)')
    gs.addColorStop(1, 'rgba(0,0,0,0.13)')
    x.fillStyle = gs
    x.fillRect(o, 0, 128, 128)
    const gv = x.createLinearGradient(0, 96, 0, 128)
    gv.addColorStop(0, 'rgba(0,0,0,0)')
    gv.addColorStop(1, 'rgba(0,0,0,0.12)')
    x.fillStyle = gv
    x.fillRect(o, 96, 128, 32)
    // hem stitch
    x.strokeStyle = 'rgba(0,0,0,0.22)'
    x.lineWidth = 2
    x.setLineDash([4, 3])
    x.beginPath()
    x.moveTo(o + 2, 118)
    x.lineTo(o + 126, 118)
    x.stroke()
    x.setLineDash([])
  }
  // front: crew neck, placket buttons, chest pocket (wearer's left = viewer's right)
  x.strokeStyle = 'rgba(0,0,0,0.3)'
  x.lineWidth = 5
  x.beginPath()
  x.ellipse(64, 0, 24, 15, 0, 0, Math.PI)
  x.stroke()
  x.fillStyle = 'rgba(0,0,0,0.12)'
  x.beginPath()
  x.ellipse(64, 0, 22, 13, 0, 0, Math.PI)
  x.fill()
  x.fillStyle = 'rgba(0,0,0,0.28)'
  for (const by of [26, 40]) {
    x.beginPath()
    x.arc(64, by, 2.2, 0, Math.PI * 2)
    x.fill()
  }
  x.strokeStyle = 'rgba(0,0,0,0.2)'
  x.lineWidth = 2
  x.strokeRect(80, 34, 22, 22)
  x.beginPath()
  x.moveTo(80, 40)
  x.lineTo(102, 40)
  x.stroke()
  // back: collar band + yoke seam
  x.strokeStyle = 'rgba(0,0,0,0.22)'
  x.lineWidth = 4
  x.beginPath()
  x.moveTo(168, 3)
  x.lineTo(216, 3)
  x.stroke()
  x.lineWidth = 1.5
  x.beginPath()
  x.moveTo(130, 22)
  x.quadraticCurveTo(192, 30, 254, 22)
  x.stroke()
  grain(x, 256, 128, 0.06)
  return c
}
function paintPants() {
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 128
  const x = c.getContext('2d')
  x.fillStyle = '#ffffff'
  x.fillRect(0, 0, 64, 128)
  // crease down the middle, cuff at the bottom, slight shading at the edges
  const g = x.createLinearGradient(0, 0, 64, 0)
  g.addColorStop(0, 'rgba(0,0,0,0.12)')
  g.addColorStop(0.5, 'rgba(0,0,0,0)')
  g.addColorStop(1, 'rgba(0,0,0,0.12)')
  x.fillStyle = g
  x.fillRect(0, 0, 64, 128)
  x.strokeStyle = 'rgba(0,0,0,0.14)'
  x.lineWidth = 1.5
  x.beginPath()
  x.moveTo(32, 6)
  x.lineTo(32, 116)
  x.stroke()
  x.fillStyle = 'rgba(0,0,0,0.12)'
  x.fillRect(0, 116, 64, 12)
  x.strokeStyle = 'rgba(0,0,0,0.25)'
  x.beginPath()
  x.moveTo(0, 116)
  x.lineTo(64, 116)
  x.stroke()
  grain(x, 64, 128, 0.07)
  return c
}

const canvasTex = (cnv) => {
  const t = new CanvasTexture(cnv)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 4
  return t
}

export function createCrowd(scene, max = 64) {
  const std = (extra) => new MeshStandardMaterial({ color: '#ffffff', roughness: 0.65, ...extra })
  const bag = bagGeometries()
  const hairs = hairGeometries()
  // Officer / crew cap: crown, darker band, visor.
  const hat = merge([
    shade(lathe([[0.212, 0], [0.214, 0.055], [0.235, 0.12], [0.238, 0.145], [0.18, 0.155], [0, 0.158]], 18).translate(0, HEAD.y + 0.16, 0), '#ffffff'),
    shade(new CylinderGeometry(0.216, 0.214, 0.055, 18, 1, true).translate(0, HEAD.y + 0.19, 0), '#5a5a5a'),
    shade(new CylinderGeometry(0.16, 0.16, 0.022, 14, 1, false, -Math.PI / 2, Math.PI).scale(1, 1, 0.75).rotateX(0.18).translate(0, HEAD.y + 0.168, 0.15), '#3a3a3a'),
  ])
  const faceAtlas = canvasTex(paintFaces())
  const shirtTex = canvasTex(paintShirt())
  const pantsTex = canvasTex(paintPants())
  const parts = {}
  const mk = (name, geo, mat, per, shadow = true) => {
    const m = new InstancedMesh(geo, mat, max * per)
    m.instanceMatrix.setUsage(DynamicDrawUsage)
    m.castShadow = shadow
    m.receiveShadow = true
    m.frustumCulled = false
    m.userData.per = per
    for (let i = 0; i < max * per; i++) {
      m.setMatrixAt(i, ZERO)
      m.setColorAt(i, new Color('#ffffff'))
    }
    m.count = 0 // grows with the highest slot in use (unused slots cost nothing)
    scene.add(m)
    parts[name] = m
    return m
  }
  // Legs (trousers), shoes + soles.
  mk('leg', rbox(LEG.w, LEG.h, LEG.d, 0.05, 1).translate(0, -LEG.h / 2, 0), std({ map: pantsTex, roughness: 0.8 }), 2)
  mk('shoe', rbox(0.27, 0.11, 0.33, 0.045, 1).translate(0, -LEG.h + 0.075, 0.035), std({ roughness: 0.45 }), 2, false)
  mk('sole', new BoxGeometry(0.285, 0.035, 0.345).translate(0, -LEG.h + 0.0175, 0.035), std({ color: '#e9e9e6', roughness: 0.7 }), 2, false)
  // Arms: sleeve colour (or skin for t-shirts), a shirt-coloured shoulder cap, skin hands.
  mk('arm', rbox(ARM.w, ARM.h - 0.08, ARM.d, 0.05, 1).translate(0, -(ARM.h - 0.08) / 2 + 0.05, 0), std({ roughness: 0.75 }), 2)
  mk('sleeve', new BoxGeometry(ARM.w + 0.02, 0.2, ARM.d + 0.02).translate(0, -0.05, 0), std({ roughness: 0.75 }), 2, false)
  mk('hand', rbox(0.21, 0.17, 0.21, 0.07, 1).translate(0, -ARM.h + 0.12, 0), std({ roughness: 0.6 }), 2, false)
  // Torso with the shirt detail map, belt with a buckle.
  const torso = frontBackUv(rbox(TORSO.w, TORSO.h, TORSO.d, 0.06, 2).translate(0, LEG.hipY + TORSO.h / 2, 0), TORSO.w, LEG.hipY, LEG.hipY + TORSO.h)
  mk('torso', torso, std({ map: shirtTex, roughness: 0.75 }), 1)
  const belt = merge([shade(new BoxGeometry(TORSO.w + 0.012, 0.075, TORSO.d + 0.012).translate(0, LEG.hipY + 0.03, 0), '#2a211b'), shade(new BoxGeometry(0.09, 0.06, 0.02).translate(0, LEG.hipY + 0.03, TORSO.d / 2 + 0.012), '#c9ccd2')])
  mk('belt', belt, std({ vertexColors: true, roughness: 0.4, metalness: 0.3 }), 1, false)
  // Head: four faces in one atlas; aFace (per instance) picks the cell.
  const head = headGeometry()
  const aFace = new InstancedBufferAttribute(new Float32Array(max), 1)
  head.setAttribute('aFace', aFace)
  const headMat = std({ map: faceAtlas, roughness: 0.55 })
  headMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aFace;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\n\tvMapUv.x = (clamp(vMapUv.x, 0.004, 0.996) + aFace) * 0.25;\n#endif')
  }
  mk('head', head, headMat, 1)
  hairs.forEach((g, i) => mk(`hair${i}`, g, std({ roughness: 0.75 }), 1, i === 2))
  mk('hat', hat, std({ vertexColors: true, roughness: 0.45 }), 1, false)
  mk('bag', bag.body, std({ roughness: 0.3 }), 1)
  mk('handle', bag.handle, std({ color: '#b9bfca', metalness: 0.75, roughness: 0.28 }), 1, false)
  mk('wheels', bag.wheels, std({ color: '#1b1c1f', roughness: 0.6 }), 1, false)
  // Carry-on backpack: padded body, front pocket, side pockets, top loop and shoulder straps over the
  // front of the shirt, tinted per NPC.
  const packGeo = merge([
    rbox(0.42, 0.5, 0.19, 0.07, 2).translate(0, 1.04, -0.235),
    rbox(0.32, 0.22, 0.08, 0.035, 1).translate(0, 0.9, -0.34),
    ...[-1, 1].map((sx) => new BoxGeometry(0.05, 0.2, 0.12).translate(sx * 0.225, 0.92, -0.235)),
    new TorusGeometry(0.04, 0.012, 4, 8, Math.PI).translate(0, 1.29, -0.22),
    ...[-1, 1].flatMap((sx) => [
      new BoxGeometry(0.075, 0.03, 0.32).translate(sx * 0.14, 1.37, -0.01),
      new BoxGeometry(0.075, 0.32, 0.025).translate(sx * 0.14, 1.2, TORSO.d / 2 + 0.013),
    ]),
  ])
  mk('pack', packGeo, std({ roughness: 0.6 }), 1)
  // "SECURITY" printed on the officers' shirts (back, plus a small one on the chest).
  const printCanvas = document.createElement('canvas')
  printCanvas.width = 256
  printCanvas.height = 64
  {
    const ctx = printCanvas.getContext('2d')
    ctx.font = '700 46px Fredoka, Arial, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#ffffff'
    ctx.fillText('SECURITY', 128, 34)
  }
  const printTex = new CanvasTexture(printCanvas)
  printTex.colorSpace = SRGBColorSpace
  const back = new PlaneGeometry(0.46, 0.115).rotateY(Math.PI).translate(0, 1.2, -0.142)
  const chest = new PlaneGeometry(0.22, 0.055).translate(0.12, 1.24, 0.142)
  mk('print', merge([back, chest]), new MeshStandardMaterial({ map: printTex, transparent: true, roughness: 0.6, depthWrite: false }), 1, false)
  const optional = ['hat', 'bag', 'handle', 'wheels', 'pack', 'print', ...hairs.map((_, i) => `hair${i}`)].map((k) => parts[k])
  for (const m of optional) {
    m.userData.opt = true
    m.userData.n = 0
  }

  const npcs = []
  const free = []
  for (let i = max - 1; i >= 0; i--) free.push(i)

  const c = new Color()
  function add(o = {}) {
    if (!free.length) return null
    const slot = free.pop()
    const npc = {
      slot,
      active: true,
      x: o.x ?? 0,
      y: o.y ?? 0,
      z: o.z ?? 0,
      yaw: o.yaw ?? 0,
      speed: 0,
      phase: Math.random() * 6.28,
      mode: o.mode ?? 'idle', // idle | type | wave | point | sit | tpose | pat | hold | cuffed | float | push | serve | stop
      headYaw: 0,
      lookT: Math.random() * 4,
      ko: 0, // 0..1 knocked over
      koT: 0,
      scare: 0,
      hairStyle: o.hairStyle ?? Math.floor(Math.random() * (HAIR_STYLES + 0.6)) % HAIR_STYLES,
      hasBag: o.bag !== null && o.bag !== false,
      bagTilt: 0,
      name: o.name ?? pick(NAMES),
      t: Math.random() * 10,
      data: {},
    }
    const shirt = o.shirt ?? pick(SHIRTS)
    parts.torso.setColorAt(slot, c.set(shirt))
    const sleeve = o.arms ?? (Math.random() < 0.4 ? o.skin ?? null : shirt)
    const skin = o.skin ?? pick(SKINS)
    const pants = o.pants ?? pick(PANTS)
    const shoes = o.shoes ?? pick(SHOES)
    for (let k = 0; k < 2; k++) {
      const i = slot * 2 + k
      parts.arm.setColorAt(i, c.set(sleeve ?? skin))
      parts.sleeve.setColorAt(i, c.set(shirt))
      parts.hand.setColorAt(i, c.set(skin))
      parts.leg.setColorAt(i, c.set(pants))
      parts.shoe.setColorAt(i, c.set(shoes))
    }
    parts.head.setColorAt(slot, c.set(skin))
    aFace.setX(slot, o.face ?? Math.floor(Math.random() * 4))
    aFace.needsUpdate = true
    // Optional parts are packed per frame (see emit), so their colours live on the NPC.
    npc.col = {
      hair: new Color(o.hair ?? pick(HAIRS)),
      hat: new Color(o.hatColor ?? '#1b2a52'),
      bag: new Color(typeof o.bag === 'string' ? o.bag : pick(BAGS)),
      pack: new Color(typeof o.pack === 'string' ? o.pack : pick(PACKS)),
    }
    npc.hasHat = !!o.hat
    // Backpack: an explicit colour, false for none, or undefined = 40% chance.
    npc.hasPack = o.pack === undefined ? Math.random() < 0.4 : !!o.pack
    npc.print = !!o.print
    for (const m of Object.values(parts)) if (m.instanceColor) m.instanceColor.needsUpdate = true
    npcs.push(npc)
    return npc
  }

  function remove(npc) {
    if (!npc.active) return
    npc.active = false
    const i = npcs.indexOf(npc)
    if (i >= 0) npcs.splice(i, 1)
    clearSlot(npc.slot)
    free.push(npc.slot)
    if (npc.bubble) npc.bubble.until = 0
  }
  function clearSlot(s) {
    for (const m of Object.values(parts)) {
      if (m.userData.opt) continue
      const per = m.userData.per
      for (let k = 0; k < per; k++) m.setMatrixAt(s * per + k, ZERO)
    }
  }

  // --- Pose ---------------------------------------------------------------------------
  const base = new Matrix4()
  const local = new Matrix4()
  const out = new Matrix4()
  const q = new Quaternion()
  const p = new Vector3()
  const one = new Vector3(1, 1, 1)
  const ax = new Vector3(1, 0, 0)
  const az = new Vector3(0, 0, 1)
  const ay = new Vector3(0, 1, 0)
  const qa = new Quaternion()
  const qb = new Quaternion()

  // pivot (px,py,pz) rotated by rx (then rz) in the body frame.
  function limb(mesh, index, px, py, pz, rx, rz = 0) {
    q.setFromAxisAngle(ax, rx)
    if (rz) q.premultiply(qa.setFromAxisAngle(az, rz))
    local.compose(p.set(px, py, pz), q, one)
    out.multiplyMatrices(base, local)
    mesh.setMatrixAt(index, out)
  }

  function pose(n, dt) {
    const s = n.slot
    n.t += dt
    // Walk phase follows distance travelled so feet don't slide.
    // (Guarded: a single NaN speed from a walker would otherwise hide this NPC for good.)
    if (!Number.isFinite(n.speed)) n.speed = 0
    n.phase += (n.speed * dt) / 0.32
    if (!Number.isFinite(n.phase)) n.phase = 0
    const move = Math.min(1, n.speed / 2.5)
    const sw = Math.sin(n.phase) * 0.6 * move
    const bob = Math.abs(Math.cos(n.phase)) * 0.05 * move
    const breathe = Math.sin(n.t * 2.1) * 0.012
    let jump = 0
    if (n.scare > 0) {
      n.scare = Math.max(0, n.scare - dt)
      jump = Math.abs(Math.sin((1.4 - n.scare) * 7)) * 0.35 * Math.min(1, n.scare * 2)
    }
    if (n.koT > 0) {
      n.koT -= dt
      n.ko = Math.min(1, n.ko + dt * 4)
    } else n.ko = Math.max(0, n.ko - dt * 1.6)
    // Look around now and then.
    n.lookT -= dt
    if (n.lookT < 0) {
      n.lookT = 2 + Math.random() * 5
      n.headTarget = (Math.random() - 0.5) * 1.2
    }
    n.headYaw += ((n.headTarget ?? 0) * (1 - move) - n.headYaw) * Math.min(1, dt * 3)

    const koE = n.ko * n.ko * (3 - 2 * n.ko)
    q.setFromAxisAngle(ay, n.yaw)
    if (koE > 0) q.multiply(qb.setFromAxisAngle(ax, -koE * Math.PI * 0.5))
    base.compose(p.set(n.x, n.y + bob + breathe * (1 - move) + jump + koE * 0.15, n.z), q, one)

    // Legs (seated: straight out in front, like a blocky avatar in a chair)
    const sitting = n.mode === 'sit' && koE < 0.3
    const la = sitting ? -1.5 : -sw
    const ra = sitting ? -1.5 : sw
    limb(parts.leg, s * 2, LEG.x, LEG.hipY, 0, la)
    limb(parts.leg, s * 2 + 1, -LEG.x, LEG.hipY, 0, ra)
    limb(parts.shoe, s * 2, LEG.x, LEG.hipY, 0, la)
    limb(parts.shoe, s * 2 + 1, -LEG.x, LEG.hipY, 0, ra)
    limb(parts.sole, s * 2, LEG.x, LEG.hipY, 0, la)
    limb(parts.sole, s * 2 + 1, -LEG.x, LEG.hipY, 0, ra)
    // Arms: counter-swing; right arm holds the bag; modes override.
    let lx = sw * 0.8 + 0.05
    let rx = -sw * 0.8 + 0.05
    let lz = 0.08
    let rz = -0.08
    const carry = n.hasBag && !n.ko
    if (carry) {
      rx = 0.35 * move + 0.05
      rz = -0.12
    }
    if (n.mode === 'type') {
      lx = -1.15 + Math.sin(n.t * 14) * 0.06
      rx = -1.15 + Math.sin(n.t * 14 + 2) * 0.06
      lz = 0.15
      rz = -0.15
    } else if (n.mode === 'wave') {
      rx = -2.7
      rz = -0.3 + Math.sin(n.t * 9) * 0.35
    } else if (n.mode === 'point') {
      rx = -1.45
      rz = 0.25
    } else if (n.mode === 'tpose') {
      // Arms out for the pat-down.
      lx = rx = -0.05
      lz = 1.45 + Math.sin(n.t * 2) * 0.03
      rz = -1.45 - Math.sin(n.t * 2) * 0.03
    } else if (n.mode === 'pat') {
      // Officer patting down: hands forward, alternating little pats.
      lx = -0.95 + Math.sin(n.t * 11) * 0.28
      rx = -0.95 + Math.sin(n.t * 11 + Math.PI) * 0.28
      lz = 0.2
      rz = -0.2
    } else if (n.mode === 'hold') {
      // Holding a found item up high.
      rx = -2.9
      rz = -0.15
    } else if (n.mode === 'sit') {
      // Hands on the lap, or both up holding a phone; now and then a stretch.
      if (n.data.phone) {
        lx = rx = -1.05 + Math.sin(n.t * 1.3) * 0.03
        lz = 0.32
        rz = -0.32
      } else {
        lx = rx = -0.6
        lz = 0.12
        rz = -0.12
      }
      if (n.data.stretch > 0) {
        n.data.stretch -= dt
        lx = rx = -2.9
        lz = 0.25
        rz = -0.25
      }
    } else if (n.mode === 'cuffed') {
      // Detained (tools.js handcuffs / security job): hands behind the back.
      lx = rx = 0.55
      lz = -0.12
      rz = 0.12
    } else if (n.mode === 'float') {
      // Held by the gravity gun: limbs dangling and flailing.
      lx = -0.4 + Math.sin(n.t * 9) * 0.6
      rx = -0.4 + Math.sin(n.t * 9 + 2) * 0.6
      lz = 0.7
      rz = -0.7
    } else if (n.mode === 'push') {
      // Cabin crew pushing a trolley: both hands forward on the bar.
      lx = rx = -1.25 + Math.sin(n.t * 3) * 0.03
      lz = 0.1
      rz = -0.1
    } else if (n.mode === 'serve') {
      // Holding a serving tray up on the right palm, the left hand offering.
      rx = -1.55
      rz = -0.25
      lx = -0.9 + Math.sin(n.t * 2) * 0.05
      lz = 0.2
    } else if (n.mode === 'stop') {
      // "Excuse me!": the left hand up, palm out; the right pointing back down the aisle.
      lx = -2.1 + Math.sin(n.t * 6) * 0.06
      lz = 0.25
      rx = -1.3
      rz = -0.55
    }
    if (n.scare > 0) {
      lx = rx = -2.9
      lz = 0.35
      rz = -0.35
    }
    if (koE > 0.3) {
      lx = rx = -2.6 * koE
      lz = 0.6
      rz = -0.6
    }
    limb(parts.arm, s * 2, ARM.x, ARM.y, 0, lx, lz)
    limb(parts.arm, s * 2 + 1, -ARM.x, ARM.y, 0, rx, rz)
    limb(parts.sleeve, s * 2, ARM.x, ARM.y, 0, lx, lz)
    limb(parts.sleeve, s * 2 + 1, -ARM.x, ARM.y, 0, rx, rz)
    limb(parts.hand, s * 2, ARM.x, ARM.y, 0, lx, lz)
    limb(parts.hand, s * 2 + 1, -ARM.x, ARM.y, 0, rx, rz)
    out.copy(base)
    parts.torso.setMatrixAt(s, out)
    parts.belt.setMatrixAt(s, out)
    // Head (+ hair, hat) turns a little.
    q.setFromAxisAngle(ay, n.headYaw)
    local.compose(p.set(0, 0, 0), q, one)
    out.multiplyMatrices(base, local)
    parts.head.setMatrixAt(s, out)
    if (n.hasHat) emit(parts.hat, out, n.col.hat)
    else emit(parts[`hair${n.hairStyle}`], out, n.col.hair)
    if (n.hasPack) emit(parts.pack, base, n.col.pack)
    if (n.print) emit(parts.print, base)

    // Suitcase: pulled behind-right and tilted while walking, upright beside when standing.
    if (n.hasBag) {
      n.bagTilt += (move - n.bagTilt) * Math.min(1, dt * 5)
      const k = n.bagTilt
      if (n.ko > 0.05) {
        q.setFromAxisAngle(ay, n.yaw)
        base.compose(p.set(n.x - Math.cos(n.yaw) * 0.6, n.y, n.z + Math.sin(n.yaw) * 0.6), q, one)
        local.identity()
      } else {
        q.setFromAxisAngle(ax, 0.75 * k)
        local.compose(p.set(-0.42 - 0.2 * (1 - k), 0, -0.8 * k + 0.05 * (1 - k)), q, one)
      }
      out.multiplyMatrices(base, local)
      emit(parts.bag, out, n.col.bag)
      emit(parts.handle, out)
      emit(parts.wheels, out)
    }
  }

  // Optional parts (hair styles, hat, bags, pack, print) are packed: each frame they're written one
  // after another for only the NPCs that have them, and drawn up to that count. (With a fixed slot
  // per NPC, all five hair meshes, the hat and both bags drew every NPC, hidden or not.)
  function emit(mesh, matrix, color) {
    const i = mesh.userData.n++
    mesh.setMatrixAt(i, matrix)
    if (color) mesh.setColorAt(i, color)
  }

  // --- Bubbles + name tags ------------------------------------------------------------------
  const bubbles = Array.from({ length: 8 }, () => {
    const cnv = bubbleCanvas()
    const t = new CanvasTexture(cnv)
    t.colorSpace = SRGBColorSpace
    const sp = new Sprite(new SpriteMaterial({ map: t, transparent: true, depthTest: false, depthWrite: false }))
    sp.renderOrder = 20
    sp.scale.set(4, 0.5, 1)
    sp.visible = false
    scene.add(sp)
    return { sp, cnv, t, until: 0, who: null, pop: 0 }
  })
  function say(who, text, dur = 3) {
    // who: an npc or a { x, y, z } point (e.g. the player)
    let b = bubbles.find((b) => b.who === who) ?? bubbles.find((b) => b.until <= 0) ?? bubbles.reduce((a, b) => (a.until < b.until ? a : b))
    drawBubble(b.cnv, text)
    b.t.needsUpdate = true
    b.who = who
    b.until = dur
    b.pop = 0
    if (who.slot !== undefined) who.bubble = b
  }
  const tags = Array.from({ length: 12 }, () => {
    const cnv = nameCanvas()
    const t = new CanvasTexture(cnv)
    t.colorSpace = SRGBColorSpace
    const sp = new Sprite(new SpriteMaterial({ map: t, transparent: true, depthWrite: false, opacity: 0.85 }))
    sp.scale.set(1.6, 0.24, 1)
    sp.visible = false
    sp.renderOrder = 19
    scene.add(sp)
    return { sp, cnv, t, who: null }
  })
  const near = []

  function update(dt, camera) {
    let hi = 0
    for (const m of optional) m.userData.n = 0
    for (const n of npcs) {
      pose(n, dt)
      if (n.slot + 1 > hi) hi = n.slot + 1
    }
    // Body parts: draw up to the highest slot in use. Optional parts: up to what was packed.
    for (const m of Object.values(parts)) {
      if (m.userData.opt) {
        m.count = m.userData.n
        if (m.instanceColor) m.instanceColor.needsUpdate = true
      } else m.count = hi * m.userData.per
      m.instanceMatrix.needsUpdate = true
    }

    for (const b of bubbles) {
      if (b.until <= 0 || !b.who || b.who.active === false) {
        b.sp.visible = false
        continue
      }
      b.until -= dt
      b.pop = Math.min(1, b.pop + dt * 6)
      const s = b.pop < 1 ? 0.6 + Math.sin(b.pop * Math.PI * 0.75) * 0.5 : 1
      b.sp.visible = true
      b.sp.position.set(b.who.x, (b.who.y ?? 0) + 2.45, b.who.z)
      b.sp.scale.set(4 * s, 0.5 * s, 1)
      b.sp.material.opacity = Math.min(1, b.until * 3)
    }

    // Name tags for the closest few passengers only.
    near.length = 0
    for (const n of npcs) {
      if (n.mode === 'type') continue
      const d = (n.x - camera.position.x) ** 2 + (n.z - camera.position.z) ** 2
      if (d < 22 * 22) near.push([d, n])
    }
    near.sort((a, b) => a[0] - b[0])
    tags.forEach((tg, i) => {
      const e = near[i]
      if (!e) {
        tg.sp.visible = false
        tg.who = null
        return
      }
      const n = e[1]
      if (tg.who !== n) {
        tg.who = n
        drawName(tg.cnv, n.name)
        tg.t.needsUpdate = true
      }
      tg.sp.visible = n.ko < 0.5
      tg.sp.position.set(n.x, n.y + 2.05 + (n.scare > 0 ? 0.3 : 0), n.z)
    })
  }

  return { add, remove, update, say, list: npcs, parts }
}

export const randomLook = () => ({ shirt: pick(SHIRTS), pants: pick(PANTS), skin: pick(SKINS), hair: pick(HAIRS) })
