// The player's rolling suitcase (follows on a spring: pulled behind-right and
// tilted while moving, parked upright beside you when you stop; spinner wheels
// roll; it can fly onto a check-in scale and ride the belt away) and the role
// hats (security cap, pilot cap) that sit on the avatar's head.
import { Box3, BoxGeometry, CylinderGeometry, ExtrudeGeometry, Group, Mesh, MeshStandardMaterial, Shape, Vector3 } from 'three'
import { rollLoop, sfx } from './audio.js'

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

export function makeSuitcaseModel(color = '#a98ae6') {
  const root = new Group()
  const shellMat = new MeshStandardMaterial({ color, roughness: 0.28, metalness: 0.05 })
  const dark = new MeshStandardMaterial({ color: '#23252b', roughness: 0.6 })
  const metal = new MeshStandardMaterial({ color: '#c9ced8', roughness: 0.25, metalness: 0.85 })
  const tag = new MeshStandardMaterial({ color: '#ffcf33', roughness: 0.5 })
  const body = new Mesh(roundedBox(0.44, 0.6, 0.26, 0.07), shellMat)
  body.position.y = 0.08
  root.add(body)
  for (const x of [-0.11, 0, 0.11]) {
    const rib = new Mesh(new BoxGeometry(0.035, 0.52, 0.275), shellMat)
    rib.position.set(x, 0.38, 0)
    root.add(rib)
  }
  const zip = new Mesh(new BoxGeometry(0.46, 0.62, 0.02), dark)
  zip.position.set(0, 0.38, 0)
  zip.scale.set(1.0, 1.0, 1)
  root.add(zip)
  const top = new Mesh(new BoxGeometry(0.16, 0.035, 0.05), dark)
  top.position.set(0, 0.7, 0)
  root.add(top)
  const label = new Mesh(new BoxGeometry(0.07, 0.09, 0.012), tag)
  label.position.set(0.16, 0.6, 0.14)
  label.rotation.z = 0.2
  root.add(label)
  // Telescopic handle (extends while pulling).
  const handle = new Group()
  for (const x of [-0.12, 0.12]) {
    const rod = new Mesh(new BoxGeometry(0.022, 0.5, 0.022), metal)
    rod.position.set(x, 0.25, 0)
    handle.add(rod)
  }
  const grip = new Mesh(new BoxGeometry(0.3, 0.045, 0.045), dark)
  grip.position.y = 0.5
  handle.add(grip)
  handle.position.set(0, 0.62, -0.1)
  root.add(handle)
  const wheels = []
  for (const [x, z] of [[-0.17, -0.09], [0.17, -0.09], [-0.17, 0.09], [0.17, 0.09]]) {
    const caster = new Mesh(new BoxGeometry(0.05, 0.05, 0.05), dark)
    caster.position.set(x, 0.07, z)
    root.add(caster)
    const w = new Mesh(new CylinderGeometry(0.038, 0.038, 0.03, 10), dark)
    w.rotation.z = Math.PI / 2
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
        m.handle.position.y = 0.62 - 0.0 * moving
        m.handle.scale.y = 0.55 + 0.45 * Math.max(moving, 0.6)
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
  const loop = new Mesh(new BoxGeometry(0.12, 0.04, 0.04), dark)
  loop.position.set(0, 0.24, 0)
  g.add(loop)
  for (const s of [-1, 1]) {
    const strap = new Mesh(new BoxGeometry(0.06, 0.42, 0.03), dark)
    strap.position.set(s * 0.12, 0.0, 0.1)
    g.add(strap)
    const side = new Mesh(new BoxGeometry(0.04, 0.16, 0.12), pk)
    side.position.set(s * 0.21, -0.1, 0)
    g.add(side)
  }
  g.traverse((o) => o.isMesh && (o.castShadow = true))
  return g
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
  playerGroup.parent.add(pack)
  pack.updateMatrixWorld(true)
  const bone = avatar.nodes?.Spine2 ?? avatar.nodes?.Spine1
  if (bone) bone.attach(pack)
  else avatar.attach(pack)
}
