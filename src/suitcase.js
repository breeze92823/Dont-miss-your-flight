// The player's rolling suitcase (follows on a spring: pulled behind-right and
// tilted while moving, parked upright beside you when you stop; spinner wheels
// roll; it can fly onto a check-in scale and ride the belt away) and the role
// hats (security cap, pilot cap) that sit on the avatar's head.
import { Box3, BoxGeometry, CylinderGeometry, ExtrudeGeometry, Group, Mesh, MeshStandardMaterial, PlaneGeometry, Shape, TorusGeometry, Vector3 } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { rollLoop, sfx } from './audio.js'
import { bake } from './bake.js'
import { rbox, roundRectShape } from './detail.js'
import { fontTex, planeGlyph } from './airport/interior.js'

function roundedBox(w, h, d, r) {
  const s = new Shape()
  const x = -w / 2
  const y = 0
  s.moveTo(x + r, y)
  s.lineTo(x + w - r, y)
  s.quadraticCurveTo(x + w, y, x + w, y + r)
  s.lineTo(x + w, y + h - r)
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  s.lineTo(x + r, y + h)
  s.quadraticCurveTo(x, y + h, x, y + h - r)
  s.lineTo(x, y + r)
  s.quadraticCurveTo(x, y, x + r, y)
  const g = new ExtrudeGeometry(s, { depth: d - 0.04, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2, curveSegments: 4 })
  g.translate(0, 0, -(d - 0.04) / 2)
  return g
}

// Two travel stickers on one small canvas (left half: round airline sticker, right half: a "skyport" label).
let stickerMat = null
function stickerMaterial() {
  if (stickerMat) return stickerMat
  const t = fontTex(256, 128, (ctx) => {
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(64, 64, 60, 0, 7)
    ctx.fill()
    ctx.fillStyle = '#2f7bff'
    ctx.beginPath()
    ctx.arc(64, 64, 52, 0, 7)
    ctx.fill()
    planeGlyph(ctx, 64, 60, 62, '#ffffff')
    ctx.fillStyle = '#ffffff'
    ctx.font = 'italic 600 18px Fredoka, Arial'
    ctx.textAlign = 'center'
    ctx.fillText('skyhop', 64, 104)
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.roundRect?.(132, 34, 120, 60, 14)
    ctx.fill()
    ctx.fillStyle = '#ffc531'
    ctx.beginPath()
    ctx.roundRect?.(137, 39, 110, 50, 10)
    ctx.fill()
    ctx.fillStyle = '#1e2433'
    ctx.font = '700 26px Fredoka, Arial'
    ctx.textBaseline = 'middle'
    ctx.fillText('skyport', 192, 66)
  }, { aniso: 4 })
  stickerMat = new MeshStandardMaterial({ map: t, roughness: 0.45, alphaTest: 0.5 })
  return stickerMat
}
function uvWindow(g, u0, u1, v0, v1) {
  const uv = g.attributes.uv
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0))
  return g
}

// Hard-shell spinner: rounded shell with raised ribs, a zip seam, rubber corner guards, top + side
// carry handles, a two-stage telescopic handle, four twin-wheel spinner casters, a tag and stickers.
// Static parts are baked to one mesh per material; the handle and wheels stay separate (animated).
export function makeSuitcaseModel(color = '#a98ae6') {
  const root = new Group()
  const shellMat = new MeshStandardMaterial({ color, roughness: 0.28, metalness: 0.05 })
  shellMat.userData.k = 'suitcase-shell' // never merged with another material that happens to match
  const dark = new MeshStandardMaterial({ color: '#23252b', roughness: 0.6 })
  const metal = new MeshStandardMaterial({ color: '#c9ced8', roughness: 0.25, metalness: 0.85 })
  const tag = new MeshStandardMaterial({ color: '#ffcf33', roughness: 0.5 })
  const S = new Group()
  const part = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0, parent = S) => {
    const m = new Mesh(geo, mat)
    m.position.set(x, y, z)
    m.rotation.set(rx, ry, rz)
    parent.add(m)
    return m
  }
  // Shell (y 0.08 .. 0.68) + the zip seam around its middle + a zip pull on top.
  part(rbox(0.44, 0.6, 0.26, 0.06, 3), shellMat, 0, 0.38, 0)
  const seam = roundRectShape(0.452, 0.612, 0.066)
  seam.holes.push(roundRectShape(0.4, 0.56, 0.04))
  part(new ExtrudeGeometry(seam, { depth: 0.022, bevelEnabled: false, curveSegments: 5 }).translate(0, 0, -0.011), dark, 0, 0.38, 0)
  part(rbox(0.05, 0.012, 0.022, 0.005, 1), metal, 0.1, 0.692, 0.004, 0, 0.3)
  // Raised ribs on both faces.
  const rib = rbox(0.036, 0.46, 0.016, 0.007, 1)
  for (const s of [-1, 1]) for (const x of [-0.1, 0, 0.1]) part(rib, shellMat, x, 0.38, s * 0.13)
  // Rubber corner guards.
  const guard = rbox(0.075, 0.085, 0.272, 0.03, 2)
  for (const s of [-1, 1]) for (const y of [0.115, 0.645]) part(guard, dark, s * 0.19, y, 0)
  // Top carry handle + side handle, each on two mounts.
  const mount = rbox(0.035, 0.022, 0.05, 0.008, 1)
  part(new TorusGeometry(0.065, 0.014, 6, 12, Math.PI), dark, 0, 0.69, 0.03)
  for (const s of [-1, 1]) part(mount, dark, s * 0.065, 0.69, 0.03)
  part(new TorusGeometry(0.06, 0.012, 6, 10, Math.PI), dark, 0.225, 0.4, 0, 0, 0, -Math.PI / 2)
  for (const s of [-1, 1]) part(mount, dark, 0.225, 0.4 + s * 0.06, 0, 0, 0, Math.PI / 2)
  // Telescopic handle housing on top (the outer sleeves).
  part(rbox(0.3, 0.02, 0.06, 0.009, 1), dark, 0, 0.682, -0.1)
  const sleeve = new CylinderGeometry(0.018, 0.018, 0.05, 8)
  for (const s of [-1, 1]) part(sleeve, dark, s * 0.12, 0.7, -0.1)
  // Luggage tag on its strap.
  part(rbox(0.07, 0.1, 0.01, 0.012, 1), tag, 0.15, 0.56, 0.146, 0, 0, 0.2)
  part(new BoxGeometry(0.012, 0.07, 0.004), dark, 0.135, 0.635, 0.143, 0, 0, 0.2)
  // Stickers on the left side.
  const sm = stickerMaterial()
  part(uvWindow(new PlaneGeometry(0.11, 0.11), 0, 0.5, 0, 1), sm, -0.2215, 0.48, 0, 0, -Math.PI / 2)
  part(uvWindow(new PlaneGeometry(0.12, 0.06), 0.5, 1, 0.25, 0.75), sm, -0.2215, 0.3, 0.005, 0.25, -Math.PI / 2)
  // Caster forks (static) under the four corners.
  const forkTop = rbox(0.054, 0.022, 0.05, 0.008, 1)
  const forkSide = new BoxGeometry(0.006, 0.05, 0.036)
  const corners = [[-0.17, -0.09], [0.17, -0.09], [-0.17, 0.09], [0.17, 0.09]]
  for (const [x, z] of corners) {
    part(forkTop, dark, x, 0.085, z)
    for (const s of [-1, 1]) part(forkSide, metal, x + s * 0.024, 0.06, z)
  }
  root.add(bake(S, true))
  // Telescopic handle (inner stage slides out while pulling): rods, end caps and a padded grip at y = 0.
  const handle = new Group()
  const rodG = new CylinderGeometry(0.011, 0.011, 0.46, 8).translate(0, -0.25, 0)
  for (const s of [-1, 1]) {
    part(rodG, metal, s * 0.12, 0, 0, 0, 0, 0, handle)
    part(rbox(0.04, 0.06, 0.05, 0.015, 1), dark, s * 0.12, -0.012, 0, 0, 0, 0, handle)
  }
  part(rbox(0.3, 0.045, 0.05, 0.02, 2), dark, 0, 0, 0, 0, 0, 0, handle)
  handle.position.set(0, 0.62 + 0.5 * 0.82, -0.1)
  root.add(handle)
  // Twin-wheel spinners (one merged geometry each, spun about X).
  const disc = new CylinderGeometry(0.038, 0.038, 0.013, 12).rotateZ(Math.PI / 2)
  const wheelGeo = mergeGeometries([disc.clone().translate(-0.011, 0, 0), disc.translate(0.011, 0, 0), new CylinderGeometry(0.015, 0.015, 0.04, 8).rotateZ(Math.PI / 2)])
  const wheels = []
  for (const [x, z] of corners) {
    const w = new Mesh(wheelGeo, dark)
    w.position.set(x, 0.038, z)
    root.add(w)
    wheels.push(w)
  }
  root.traverse((o) => {
    if (o.isMesh) o.castShadow = true
  })
  return { root, handle, wheels, shellMat }
}

export function createSuitcase(scene, fx) {
  const m = makeSuitcaseModel()
  scene.add(m.root)
  const roll = rollLoop()
  const pos = new Vector3(0, 0, 0)
  const vel = new Vector3()
  const target = new Vector3()
  let tilt = 0
  let yaw = 0
  let state = 'follow' // follow | fly | scale | belt | gone
  let anim = null
  let first = true

  const api = {
    root: m.root,
    get state() {
      return state
    },
    setColor(c) {
      m.shellMat.color.set(c)
    },
    show(on) {
      m.root.visible = on
    },
    // Hop onto the scale (an arc), then call landed().
    toScale(p, landed) {
      state = 'fly'
      anim = { t: 0, from: m.root.position.clone(), to: new Vector3(p.x, p.y, p.z), done: landed }
      sfx('hop', { vol: 0.4 })
    },
    toBelt(end, done) {
      state = 'belt'
      anim = { end: new Vector3(end.x, end.y, end.z), done }
      sfx('belt', { vol: 0.25 })
    },
    reset() {
      state = 'follow'
      m.root.visible = true
      first = true
    },
    // owner: { x, y, z, facing, speed }
    update(dt, owner) {
      if (state === 'gone') return
      if (state === 'follow') {
        const moving = Math.min(1, owner.speed / 3)
        // Behind-right while pulling, beside when standing (owner local: right = -X, forward = +Z).
        const lx = -0.42 - 0.22 * (1 - moving)
        const lz = -0.85 * moving + 0.05 * (1 - moving)
        const c = Math.cos(owner.facing)
        const s = Math.sin(owner.facing)
        target.set(owner.x + lx * c + lz * s, owner.y, owner.z - lx * s + lz * c)
        if (first) {
          pos.copy(target)
          first = false
        }
        // Critically-damped spring toward the target: a little lag, no wobble.
        const k = 60
        const d = 2 * Math.sqrt(k)
        vel.x += ((target.x - pos.x) * k - vel.x * d) * dt
        vel.y += ((target.y - pos.y) * k - vel.y * d) * dt
        vel.z += ((target.z - pos.z) * k - vel.z * d) * dt
        pos.addScaledVector(vel, dt)
        if (pos.distanceTo(target) > 3) pos.copy(target)
        const sp = Math.hypot(vel.x, vel.z)
        tilt += (moving * 0.72 - tilt) * Math.min(1, dt * 6)
        yaw = owner.facing
        m.root.position.copy(pos)
        m.root.rotation.set(tilt, yaw, 0, 'YXZ')
        // Grip height as before (0.62 + 0.5 * extension); the inner stage slides instead of stretching.
        m.handle.position.y = 0.62 + 0.5 * (0.55 + 0.45 * Math.max(moving, 0.6))
        for (const w of m.wheels) w.rotation.x += (sp * dt) / 0.038
        roll.set(sp, dt, owner.indoor ? 1 : 0.6)
        if (sp > 3 && Math.random() < dt * 6) fx?.puff(pos.x, pos.y + 0.03, pos.z, { count: 1, size: 0.18, grow: 2, alpha: 0.18, life: 0.6, up: 0.2, speed: 0.3 })
      } else if (state === 'fly') {
        anim.t += dt / 0.55
        const t = Math.min(1, anim.t)
        m.root.position.lerpVectors(anim.from, anim.to, t)
        m.root.position.y += Math.sin(t * Math.PI) * 0.8
        const e = t * t * (3 - 2 * t)
        m.root.rotation.set((-Math.PI / 2) * e, Math.atan2(Math.sin(yaw), Math.cos(yaw)) * (1 - e), Math.sin(t * Math.PI) * 0.5, 'YXZ')
        roll.set(0, dt)
        if (t >= 1) {
          state = 'scale'
          m.root.rotation.set(-Math.PI / 2, 0, 0, 'YXZ') // lies flat, top toward the belt (-Z)
          sfx('thud', { vol: 0.4 })
          fx?.puff(anim.to.x, anim.to.y, anim.to.z, { count: 6, size: 0.2, alpha: 0.25, life: 0.5 })
          anim.done?.()
        }
      } else if (state === 'belt') {
        const p = m.root.position
        const dz = anim.end.z - p.z
        p.z += Math.sign(dz) * Math.min(Math.abs(dz), dt * 1.4)
        p.y += (anim.end.y - p.y) * Math.min(1, dt * 4)
        if (Math.abs(dz) < 0.05) {
          state = 'gone'
          m.root.visible = false
          anim.done?.()
        }
      }
    },
  }
  return api
}

// --- Hats -----------------------------------------------------------------------------------
export function makeHat(kind) {
  const g = new Group()
  const mat = (color, extra = {}) => new MeshStandardMaterial({ color, roughness: 0.45, ...extra })
  const gold = mat('#ffc531', { metalness: 0.8, roughness: 0.25, emissive: '#5a3a00', emissiveIntensity: 0.3 })
  if (kind === 'pilot') {
    const crown = new Mesh(new CylinderGeometry(0.27, 0.2, 0.16, 20), mat('#f7f8fb'))
    crown.position.y = 0.12
    const band = new Mesh(new CylinderGeometry(0.205, 0.205, 0.06, 20), mat('#1b1d24'))
    band.position.y = 0.04
    const visor = new Mesh(new CylinderGeometry(0.2, 0.2, 0.02, 20, 1, false, -Math.PI / 2, Math.PI), mat('#111216', { roughness: 0.15 }))
    visor.position.set(0, 0.02, 0.05)
    visor.scale.set(1, 1, 0.7)
    const wings = new Mesh(new BoxGeometry(0.2, 0.04, 0.02), gold)
    wings.position.set(0, 0.12, 0.215)
    const badge = new Mesh(new BoxGeometry(0.06, 0.06, 0.025), gold)
    badge.position.set(0, 0.13, 0.22)
    g.add(crown, band, visor, wings, badge)
  } else {
    const crown = new Mesh(new CylinderGeometry(0.235, 0.21, 0.15, 20), mat('#1f3f9a'))
    crown.position.y = 0.1
    const band = new Mesh(new CylinderGeometry(0.212, 0.212, 0.05, 20), mat('#0f1a3c'))
    band.position.y = 0.035
    const visor = new Mesh(new CylinderGeometry(0.2, 0.2, 0.02, 20, 1, false, -Math.PI / 2, Math.PI), mat('#0b0d14', { roughness: 0.15 }))
    visor.position.set(0, 0.015, 0.05)
    visor.scale.set(1, 1, 0.7)
    const badge = new Mesh(new CylinderGeometry(0.05, 0.05, 0.02, 6), gold)
    badge.rotation.x = Math.PI / 2
    badge.position.set(0, 0.11, 0.225)
    g.add(crown, band, visor, badge)
  }
  g.traverse((o) => {
    if (o.isMesh) o.castShadow = true
  })
  return g
}

// Puts `hat` on an avatar (in its bind pose) at the top of its head, parented to
// the neck bone so it follows the head's motion.
const box = new Box3()
export function wearHat(avatar, hat, playerGroup) {
  playerGroup.updateMatrixWorld(true)
  box.setFromObject(avatar)
  const base = playerGroup.position.y
  const top = base + Math.min(2.2, Math.max(1.5, box.max.y - base))
  const neck = avatar.nodes?.Neck1
  hat.position.set(playerGroup.position.x, top - 0.13, playerGroup.position.z)
  hat.rotation.set(0, playerGroup.rotation.y, 0)
  hat.scale.setScalar(1)
  playerGroup.parent.add(hat)
  hat.updateMatrixWorld(true)
  if (neck) neck.attach(hat)
  else avatar.attach(hat)
}

// --- Carry-on backpack -------------------------------------------------------------------------
// Rounded body, front pocket with a zip, side pocket, top loop and two straps. Origin at its
// centre; the straps side faces +Z (it sits on the wearer's back, which faces -Z).
export function makeBackpack(color = '#3fc4c9', pocket = '#ff8fa3') {
  const g = new Group()
  const body = new MeshStandardMaterial({ color, roughness: 0.6 })
  const pk = new MeshStandardMaterial({ color: pocket, roughness: 0.6 })
  const dark = new MeshStandardMaterial({ color: '#1d1f24', roughness: 0.7 })
  const main = new Mesh(roundedBox(0.38, 0.46, 0.18, 0.06), body)
  main.position.y = -0.23
  g.add(main)
  const front = new Mesh(roundedBox(0.3, 0.2, 0.07, 0.04), pk)
  front.position.set(0, -0.2, -0.11)
  g.add(front)
  const zip = new Mesh(new BoxGeometry(0.26, 0.012, 0.012), dark)
  zip.position.set(0, -0.02, -0.15)
  g.add(zip)
  const metal = new MeshStandardMaterial({ color: '#c9ced8', roughness: 0.25, metalness: 0.85 })
  for (const x of [-0.08, 0.1]) {
    const pull = new Mesh(rbox(0.018, 0.04, 0.008, 0.004, 1), metal)
    pull.position.set(x, -0.045, -0.155)
    g.add(pull)
  }
  const loop = new Mesh(new TorusGeometry(0.05, 0.012, 5, 10, Math.PI), dark)
  loop.position.set(0, 0.225, 0)
  g.add(loop)
  const patch = new Mesh(rbox(0.1, 0.05, 0.01, 0.01, 1), dark)
  patch.position.set(0, -0.36, -0.15)
  g.add(patch)
  for (const s of [-1, 1]) {
    const strap = new Mesh(rbox(0.06, 0.42, 0.03, 0.012, 1), dark)
    strap.position.set(s * 0.12, 0.0, 0.1)
    g.add(strap)
    const buckle = new Mesh(rbox(0.07, 0.03, 0.035, 0.008, 1), metal)
    buckle.position.set(s * 0.12, -0.17, 0.1)
    g.add(buckle)
    const side = new Mesh(rbox(0.05, 0.16, 0.12, 0.02, 1), pk)
    side.position.set(s * 0.21, -0.1, 0)
    g.add(side)
  }
  return bake(g, true) // one mesh per material
}

// Puts the backpack on an avatar's back (bind pose), parented to the upper spine bone.
export function wearOnBack(avatar, pack, playerGroup) {
  playerGroup.updateMatrixWorld(true)
  box.setFromObject(avatar)
  const base = playerGroup.position.y
  const h = Math.min(2.2, Math.max(1.5, box.max.y - base))
  const local = new Vector3(0, h * 0.6, -0.24)
  playerGroup.localToWorld(local)
  pack.position.copy(local)
  pack.rotation.set(0, playerGroup.rotation.y, 0) // straps (+Z) against the back
  // Reset the scale: when the avatar is swapped, the pack comes off the old spine bone still
  // carrying that bone's compensation scale, and attaching again would compound it (~3.5x).
  pack.scale.setScalar(1)
  playerGroup.parent.add(pack)
  pack.updateMatrixWorld(true)
  const bone = avatar.nodes?.Spine2 ?? avatar.nodes?.Spine1
  if (bone) bone.attach(pack)
  else avatar.attach(pack)
}
