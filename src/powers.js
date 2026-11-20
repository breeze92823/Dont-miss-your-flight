// The six power buttons (all paid in coins): Luggage Rain (physics suitcases
// tumble from the ceiling), Kill All (everyone nearby keels over, cartoon
// style, and gets back up), Paper Planes (a swarm loops around you), Scare All
// (everyone jumps with their arms up), Announce (PA chime + banner) and Emoji.
import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  DynamicDrawUsage,
  Float32BufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { RAPIER, world } from './physics.js'
import { sfx } from './audio.js'
import { paintEmoji } from './airport/paint.js'
import { rbox } from './detail.js'

const ZERO = new Matrix4().makeScale(0, 0, 0)

export function createPowers({ scene, crowd, fx, hud, getPlayer, camera }) {
  // --- Luggage rain -----------------------------------------------------------------------------
  const RAIN = 32
  const strip = (g) => (g.index ? g.toNonIndexed() : g)
  // Hard-shell case: rounded shell, two ribs, seam bead, top handle on posts, four spinner wheels.
  const bagGeo = mergeGeometries([
    rbox(0.44, 0.6, 0.26, 0.055, 2),
    ...[-0.105, 0.105].map((x) => new BoxGeometry(0.05, 0.54, 0.272).translate(x, 0, 0)),
    new BoxGeometry(0.452, 0.02, 0.262),
    rbox(0.3, 0.05, 0.055, 0.02, 1).translate(0, 0.42, 0),
    new BoxGeometry(0.03, 0.12, 0.03).translate(-0.12, 0.36, 0),
    new BoxGeometry(0.03, 0.12, 0.03).translate(0.12, 0.36, 0),
    ...[[-0.17, -0.08], [0.17, -0.08], [-0.17, 0.08], [0.17, 0.08]].map(([x, z]) => new CylinderGeometry(0.035, 0.035, 0.03, 8).rotateZ(Math.PI / 2).translate(x, -0.33, z)),
  ].map(strip))
  const bags = new InstancedMesh(bagGeo, new MeshStandardMaterial({ color: '#ffffff', roughness: 0.3 }), RAIN)
  bags.instanceMatrix.setUsage(DynamicDrawUsage)
  bags.castShadow = true
  bags.frustumCulled = false
  const palette = ['#ff4b55', '#4fe0e8', '#a98ae6', '#ffc531', '#5fe0a8', '#2b2f3a', '#ff8a3d', '#4c6ef5']
  for (let i = 0; i < RAIN; i++) {
    bags.setMatrixAt(i, ZERO)
    bags.setColorAt(i, new Color(palette[i % palette.length]))
  }
  bags.count = 0
  scene.add(bags)
  let rain = [] // { body, delay, t, vy }

  // --- Paper planes ------------------------------------------------------------------------------
  const pg = new BufferGeometry()
  // A folded dart: two wings + a keel, nose at +Z.
  pg.setAttribute('position', new Float32BufferAttribute([0, 0, 0.5, -0.32, 0.04, -0.4, 0, 0, -0.4, 0, 0, 0.5, 0, 0, -0.4, 0.32, 0.04, -0.4, 0, 0, 0.5, 0, 0, -0.4, 0, -0.12, -0.4], 3))
  pg.computeVertexNormals()
  const PLANES = 22
  const planes = new InstancedMesh(pg, new MeshStandardMaterial({ color: '#ffffff', roughness: 0.6, side: DoubleSide }), PLANES)
  planes.instanceMatrix.setUsage(DynamicDrawUsage)
  planes.frustumCulled = false
  for (let i = 0; i < PLANES; i++) planes.setMatrixAt(i, ZERO)
  scene.add(planes)
  let planeT = 0
  const pdata = Array.from({ length: PLANES }, (_, i) => ({ r: 2 + Math.random() * 6, h: 1 + Math.random() * 5, sp: 0.6 + Math.random() * 0.9, ph: (i / PLANES) * Math.PI * 2, wob: Math.random() * 6, dir: Math.random() < 0.3 ? -1 : 1 }))
  const o3 = new Object3D()

  // --- Emoji over the player ---------------------------------------------------------------------
  const emojiTex = new CanvasTexture(paintEmoji('😀'))
  emojiTex.colorSpace = SRGBColorSpace
  const emoji = new Sprite(new SpriteMaterial({ map: emojiTex, transparent: true, depthWrite: false }))
  emoji.renderOrder = 21
  emoji.visible = false
  scene.add(emoji)
  let emojiT = 0

  const timers = [] // { t, fn }
  const later = (t, fn) => timers.push({ t, fn })
  const near = (r) => {
    const p = getPlayer()
    return crowd.list.filter((n) => (n.x - p.x) ** 2 + (n.z - p.z) ** 2 < r * r)
  }
  const panFor = (x, z) => {
    const v = new Vector3(x, 1, z).project(camera)
    return Math.max(-1, Math.min(1, v.x))
  }

  const m = new Matrix4()
  const q = new Quaternion()
  const pv = new Vector3()
  const one = new Vector3(1, 1, 1)

  return {
    luggageRain() {
      for (const r of rain) if (r) world.removeRigidBody(r.body)
      rain = []
      const p = getPlayer()
      hud.big('LUGGAGE RAIN!', 'gold', 1.2)
      sfx('whoosh', { vol: 0.5, dur: 0.8 })
      for (let i = 0; i < RAIN; i++) {
        const a = Math.random() * Math.PI * 2
        const d = 1 + Math.random() * 7
        const x = p.x + Math.cos(a) * d
        const z = p.z + Math.sin(a) * d
        const y = Math.min(11.5, p.y + 8 + Math.random() * 4)
        const body = world.createRigidBody(
          RAPIER.RigidBodyDesc.dynamic()
            .setTranslation(x, y + 50, z) // parked out of the way until its delay passes
            .setRotation(new Quaternion().setFromAxisAngle(new Vector3(Math.random(), Math.random(), Math.random()).normalize(), Math.random() * 6))
            .setAngvel({ x: (Math.random() - 0.5) * 6, y: (Math.random() - 0.5) * 6, z: (Math.random() - 0.5) * 6 })
            .setLinearDamping(0.05)
            .setAngularDamping(0.3),
        )
        world.createCollider(RAPIER.ColliderDesc.cuboid(0.22, 0.3, 0.13).setDensity(60).setRestitution(0.35).setFriction(0.7), body)
        body.setEnabled(false)
        rain.push({ body, delay: i * 0.06 + Math.random() * 0.3, t: 0, x, y, z, vy: 0, live: false })
      }
    },
    killAll() {
      const list = near(40)
      hud.big('KILL ALL!', 'gold', 1.0)
      list.forEach((n, i) => {
        later(i * 0.04 + Math.random() * 0.15, () => {
          n.koT = 3.2 + Math.random() * 1.2
          n.scare = 0
          fx.sparkle(n.x, 2, n.z, { count: 6, color: '#ffe95a', speed: 1.5, up: 1.2, grav: 0, size: 0.3, life: 1.4 })
          fx.puff(n.x, 0.4, n.z, { count: 4, size: 0.4, alpha: 0.35, life: 0.7 })
          if (i < 8) sfx('bonk', { vol: 0.25, pan: panFor(n.x, n.z) })
        })
      })
    },
    paperPlanes() {
      planeT = 12
      hud.big('PAPER PLANES!', 'gold', 1.0)
      sfx('paper', { vol: 0.4 })
    },
    scareAll() {
      const list = near(40)
      hud.big('BOO!', 'gold', 0.9)
      list.forEach((n, i) => {
        later(Math.random() * 0.25, () => {
          n.scare = 1.4
          fx.sparkle(n.x, 2.3, n.z, { count: 3, color: '#ffffff', speed: 1, up: 2, size: 0.35 })
          if (i < 6) sfx('scream', { vol: 0.12, pan: panFor(n.x, n.z) })
          if (i < 3 && Math.random() < 0.6) crowd.say(n, ['AAAH!', 'what was that?!', 'not cool!!', 'my heart 😱'][Math.floor(Math.random() * 4)], 1.8)
        })
      })
    },
    announce(text) {
      sfx('pa')
      later(1.0, () => hud.announce(text))
      const list = near(30)
      later(3.2, () => {
        const n = list[Math.floor(Math.random() * list.length)]
        if (n) crowd.say(n, ['lol', 'who said that?', 'haha', 'ok captain'][Math.floor(Math.random() * 4)], 2)
      })
    },
    emoji(e) {
      const c = paintEmoji(e)
      emojiTex.image = c
      emojiTex.needsUpdate = true
      emoji.visible = true
      emojiT = 0
      sfx('emoji')
    },
    update(dt, t) {
      for (let i = timers.length - 1; i >= 0; i--) {
        timers[i].t -= dt
        if (timers[i].t <= 0) {
          timers[i].fn()
          timers.splice(i, 1)
        }
      }

      // Rain: wake each bag after its delay, mirror bodies into the instanced mesh.
      const p = getPlayer()
      for (let i = 0; i < RAIN; i++) {
        const r = rain[i]
        if (!r) {
          bags.setMatrixAt(i, ZERO)
          continue
        }
        r.t += dt
        if (!r.live) {
          if (r.t >= r.delay) {
            r.live = true
            r.body.setEnabled(true)
            r.body.setTranslation({ x: r.x, y: r.y, z: r.z }, true)
          } else {
            bags.setMatrixAt(i, ZERO)
            continue
          }
        }
        const tr = r.body.translation()
        const ro = r.body.rotation()
        const vy = r.body.linvel().y
        if (r.vy < -4 && vy > -1) {
          const d = Math.hypot(tr.x - p.x, tr.z - p.z)
          sfx('thud', { vol: Math.max(0.05, 0.5 - d * 0.04), pan: panFor(tr.x, tr.z) })
          fx.puff(tr.x, tr.y - 0.2, tr.z, { count: 3, size: 0.3, alpha: 0.3, life: 0.5, up: 0.3 })
        }
        r.vy = vy
        const age = r.t - r.delay
        const s = age > 12 ? Math.max(0, 1 - (age - 12) * 2) : 1
        m.compose(pv.set(tr.x, tr.y, tr.z), q.set(ro.x, ro.y, ro.z, ro.w), one.set(s, s, s))
        bags.setMatrixAt(i, m)
        one.set(1, 1, 1)
        if (s <= 0) {
          world.removeRigidBody(r.body)
          rain[i] = null
        }
      }
      if (rain.length && rain.every((r) => !r)) rain = []
      bags.count = rain.length ? RAIN : 0 // idle: draw nothing (not 32 zero-sized bags)
      bags.instanceMatrix.needsUpdate = true

      // Paper planes loop around the player, bobbing and banking.
      if (planeT > 0) {
        planeT -= dt
        const fadeS = Math.min(1, planeT)
        pdata.forEach((d, i) => {
          const a = d.ph + t * d.sp * d.dir
          const x = p.x + Math.cos(a) * d.r
          const z = p.z + Math.sin(a) * d.r
          const y = p.y + d.h + Math.sin(t * 2 + d.wob) * 0.6
          o3.position.set(x, y, z)
          o3.rotation.set(Math.cos(t * 2 + d.wob) * 0.25, Math.atan2(-Math.sin(a) * d.dir, Math.cos(a) * d.dir), d.dir * -0.5, 'YXZ')
          o3.scale.setScalar(fadeS * 0.8)
          o3.updateMatrix()
          planes.setMatrixAt(i, o3.matrix)
          if (Math.random() < dt * 0.4) sfx('paper', { vol: 0.06 })
        })
        if (planeT <= 0) for (let i = 0; i < PLANES; i++) planes.setMatrixAt(i, ZERO)
        planes.instanceMatrix.needsUpdate = true
      }

      if (emoji.visible) {
        emojiT += dt
        const pop = Math.min(1, emojiT * 5)
        const s = (0.6 + Math.sin(pop * Math.PI * 0.8) * 0.6) * (emojiT > 2.6 ? Math.max(0, 1 - (emojiT - 2.6) * 3) : 1)
        emoji.scale.set(s, s, 1)
        emoji.position.set(p.x, p.y + 2.6 + emojiT * 0.15, p.z)
        if (emojiT > 3) emoji.visible = false
      }
    },
  }
}
