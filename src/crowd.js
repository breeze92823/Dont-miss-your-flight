// The crowd: every NPC passenger and desk agent drawn with shared InstancedMeshes
// (one per body part, ~12 draw calls for all of them). Each NPC owns a fixed
// instance slot; the pose (walk cycle, idle, typing, waving, scared, knocked
// out, pulling a suitcase) is computed here every frame as plain matrices.
// Speech bubbles and name tags are small sprite pools handed to whoever needs them.
import {
  BoxGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DynamicDrawUsage,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { bubbleCanvas, drawBubble, drawName, nameCanvas, paintFace } from './airport/paint.js'

const SKINS = ['#f3c99c', '#e0a979', '#c58a5c', '#8d5a3b', '#5e3b26', '#f6d6b8', '#ffcc99']
const HAIRS = ['#1b1612', '#3a2617', '#6b3d1f', '#c8742c', '#e8c46b', '#141414', '#d0d0d0', '#e8452f', '#ff7fb6']
const SHIRTS = ['#1d1f24', '#f4f4f4', '#2a62d8', '#d8333b', '#3fae6b', '#f6b800', '#8a5cd6', '#7a8496', '#1d1f24', '#ececec', '#ff8a3d', '#36c3d6']
const PANTS = ['#1b2233', '#2b3f6b', '#1d1f24', '#59606e', '#c9b38f', '#2a2a2a', '#3b5bb5']
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

function hairGeometries() {
  const cap = new BoxGeometry(0.42, 0.13, 0.42).translate(0, HEAD.y + 0.2, -0.01)
  const back = new BoxGeometry(0.42, 0.26, 0.1).translate(0, HEAD.y + 0.06, -0.18)
  const fringe = new BoxGeometry(0.42, 0.07, 0.08).translate(0, HEAD.y + 0.14, 0.18)
  const long = new BoxGeometry(0.46, 0.52, 0.14).translate(0, HEAD.y - 0.04, -0.17)
  const afro = new IcosahedronGeometry(0.27, 1).scale(1, 0.85, 1).translate(0, HEAD.y + 0.12, -0.04)
  const spikes = [-0.12, 0, 0.12].map((x, i) => new BoxGeometry(0.1, 0.16, 0.36).rotateZ((x * 3) - 0).translate(x, HEAD.y + 0.27 + (i === 1 ? 0.04 : 0), -0.02))
  const strip = (g) => (g.index ? g.toNonIndexed() : g)
  const m = (list) => mergeGeometries(list.map(strip))
  return [m([cap, back, fringe]), m([cap, back, long]), strip(afro), m([cap, back, ...spikes])]
}

function bagGeometries() {
  const body = new BoxGeometry(0.42, 0.56, 0.24).translate(0, 0.34, 0)
  const ribs = [-0.1, 0.1].map((x) => new BoxGeometry(0.04, 0.5, 0.25).translate(x, 0.34, 0))
  const strip = (g) => (g.index ? g.toNonIndexed() : g)
  const handle = mergeGeometries([new BoxGeometry(0.025, 0.4, 0.025).translate(-0.12, 0.82, -0.1), new BoxGeometry(0.025, 0.4, 0.025).translate(0.12, 0.82, -0.1), new BoxGeometry(0.28, 0.04, 0.04).translate(0, 1.02, -0.1)].map(strip))
  const wheels = mergeGeometries([[-0.16, -0.08], [0.16, -0.08], [-0.16, 0.08], [0.16, 0.08]].map(([x, z]) => strip(new BoxGeometry(0.05, 0.07, 0.07).translate(x, 0.035, z))))
  return { body: mergeGeometries([body, ...ribs].map(strip)), handle, wheels }
}

export function createCrowd(scene, max = 64) {
  const faceTex = new CanvasTexture(paintFace())
  faceTex.colorSpace = SRGBColorSpace
  const std = (extra) => new MeshStandardMaterial({ color: '#ffffff', roughness: 0.65, ...extra })
  const bag = bagGeometries()
  const hairs = hairGeometries()
  const head = new CylinderGeometry(HEAD.r, HEAD.r, HEAD.h, 16, 1, false, Math.PI)
  const hat = mergeGeometries([new CylinderGeometry(0.21, 0.21, 0.12, 14).translate(0, HEAD.y + 0.24, 0), new BoxGeometry(0.36, 0.03, 0.16).translate(0, HEAD.y + 0.19, 0.2)].map((g) => (g.index ? g.toNonIndexed() : g)))
  const parts = {}
  const mk = (name, geo, mat, per, shadow = true) => {
    const m = new InstancedMesh(geo, mat, max * per)
    m.instanceMatrix.setUsage(DynamicDrawUsage)
    m.castShadow = shadow
    m.receiveShadow = true
    m.frustumCulled = false
    for (let i = 0; i < max * per; i++) {
      m.setMatrixAt(i, ZERO)
      m.setColorAt(i, new Color('#ffffff'))
    }
    scene.add(m)
    parts[name] = m
    return m
  }
  mk('leg', new BoxGeometry(LEG.w, LEG.h, LEG.d).translate(0, -LEG.h / 2, 0), std(), 2)
  mk('shoe', new BoxGeometry(0.27, 0.1, 0.32).translate(0, -LEG.h + 0.05, 0.03), std({ roughness: 0.5 }), 2, false)
  mk('arm', new BoxGeometry(ARM.w, ARM.h, ARM.d).translate(0, -ARM.h / 2 + 0.05, 0), std(), 2)
  mk('torso', new BoxGeometry(TORSO.w, TORSO.h, TORSO.d).translate(0, LEG.hipY + TORSO.h / 2, 0), std(), 1)
  mk('head', head.translate(0, HEAD.y, 0), std({ map: faceTex }), 1)
  hairs.forEach((g, i) => mk(`hair${i}`, g, std({ roughness: 0.8 }), 1, i === 2))
  mk('hat', hat, std({ roughness: 0.5 }), 1, false)
  mk('bag', bag.body, std({ roughness: 0.35 }), 1)
  mk('handle', bag.handle, std({ color: '#b9bfca', metalness: 0.7, roughness: 0.3 }), 1, false)
  mk('wheels', bag.wheels, std({ color: '#1b1c1f' }), 1, false)
  // Carry-on backpack on the back (body + front pocket + top loop), tinted per NPC.
  const s = (g) => (g.index ? g.toNonIndexed() : g)
  const packGeo = mergeGeometries([new BoxGeometry(0.42, 0.48, 0.18).translate(0, 1.04, -0.23), new BoxGeometry(0.32, 0.2, 0.07).translate(0, 0.92, -0.34), new BoxGeometry(0.14, 0.05, 0.05).translate(0, 1.3, -0.2)].map(s))
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
  mk('print', mergeGeometries([back, chest].map(s)), new MeshStandardMaterial({ map: printTex, transparent: true, roughness: 0.6, depthWrite: false }), 1, false)

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
      mode: o.mode ?? 'idle', // idle | type | wave
      headYaw: 0,
      lookT: Math.random() * 4,
      ko: 0, // 0..1 knocked over
      koT: 0,
      scare: 0,
      hairStyle: o.hairStyle ?? Math.floor(Math.random() * 4.6) % 4,
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
    for (let k = 0; k < 2; k++) {
      parts.arm.setColorAt(slot * 2 + k, c.set(sleeve ?? skin))
      parts.leg.setColorAt(slot * 2 + k, c.set(o.pants ?? pick(PANTS)))
      parts.shoe.setColorAt(slot * 2 + k, c.set(o.shoes ?? (Math.random() < 0.5 ? '#f2f2f2' : '#1d1f24')))
    }
    // keep both legs one colour
    const pantsCol = new Color()
    parts.leg.getColorAt(slot * 2, pantsCol)
    parts.leg.setColorAt(slot * 2 + 1, pantsCol)
    parts.head.setColorAt(slot, c.set(skin))
    parts[`hair${npc.hairStyle}`].setColorAt(slot, c.set(o.hair ?? pick(HAIRS)))
    parts.hat.setColorAt(slot, c.set(o.hatColor ?? '#1b2a52'))
    npc.hasHat = !!o.hat
    parts.bag.setColorAt(slot, c.set(typeof o.bag === 'string' ? o.bag : pick(BAGS)))
    // Backpack: an explicit colour, false for none, or undefined = 40% chance.
    npc.hasPack = o.pack === undefined ? Math.random() < 0.4 : !!o.pack
    parts.pack.setColorAt(slot, c.set(typeof o.pack === 'string' ? o.pack : pick(PACKS)))
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
    for (const [name, m] of Object.entries(parts)) {
      const per = name === 'leg' || name === 'arm' || name === 'shoe' ? 2 : 1
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
    n.phase += (n.speed * dt) / 0.32
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

    // Legs
    limb(parts.leg, s * 2, LEG.x, LEG.hipY, 0, -sw)
    limb(parts.leg, s * 2 + 1, -LEG.x, LEG.hipY, 0, sw)
    limb(parts.shoe, s * 2, LEG.x, LEG.hipY, 0, -sw)
    limb(parts.shoe, s * 2 + 1, -LEG.x, LEG.hipY, 0, sw)
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
    out.copy(base)
    parts.torso.setMatrixAt(s, out)
    // Head (+ hair, hat) turns a little.
    q.setFromAxisAngle(ay, n.headYaw)
    local.compose(p.set(0, 0, 0), q, one)
    out.multiplyMatrices(base, local)
    parts.head.setMatrixAt(s, out)
    for (let h = 0; h < 4; h++) parts[`hair${h}`].setMatrixAt(s, h === n.hairStyle && !n.hasHat ? out : ZERO)
    parts.hat.setMatrixAt(s, n.hasHat ? out : ZERO)
    parts.pack.setMatrixAt(s, n.hasPack ? base : ZERO)
    parts.print.setMatrixAt(s, n.print ? base : ZERO)

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
      parts.bag.setMatrixAt(s, out)
      parts.handle.setMatrixAt(s, out)
      parts.wheels.setMatrixAt(s, out)
    } else {
      parts.bag.setMatrixAt(s, ZERO)
      parts.handle.setMatrixAt(s, ZERO)
      parts.wheels.setMatrixAt(s, ZERO)
    }
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
    for (const n of npcs) pose(n, dt)
    for (const m of Object.values(parts)) m.instanceMatrix.needsUpdate = true

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
