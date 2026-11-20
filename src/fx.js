// CPU-simulated particle pools drawn as one Points object each (2 draw calls in
// total). Particles are preallocated and recycled, so emitting never allocates.
//   smoke - normal blending soft dots: exhaust, dust, contrails, poofs
//   glow  - additive sparkles (HDR-bright, so bloom picks them up): coins, stars, motes
import { AdditiveBlending, BufferAttribute, BufferGeometry, CanvasTexture, NormalBlending, Points, ShaderMaterial, SRGBColorSpace } from 'three'
import { paintSoftDot, paintSparkle } from './textures.js'

const vert = /* glsl */ `
  attribute float size;
  attribute float alpha;
  attribute vec3 tint;
  attribute float spin;
  uniform float uScale;
  varying float vAlpha;
  varying vec3 vTint;
  varying float vSpin;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = size * uScale / max(-mv.z, 0.1);
    vAlpha = alpha;
    vTint = tint;
    vSpin = spin;
  }`
const frag = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uBoost;
  varying float vAlpha;
  varying vec3 vTint;
  varying float vSpin;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float s = sin(vSpin), k = cos(vSpin);
    c = vec2(c.x * k - c.y * s, c.x * s + c.y * k) + 0.5;
    vec4 t = texture2D(uMap, c);
    gl_FragColor = vec4(vTint * t.rgb * uBoost, t.a * vAlpha);
    if (gl_FragColor.a < 0.01) discard;
  }`

function makePool(scene, max, map, additive, boost) {
  const geo = new BufferGeometry()
  const pos = new Float32Array(max * 3)
  const tint = new Float32Array(max * 3)
  const size = new Float32Array(max)
  const alpha = new Float32Array(max)
  const spin = new Float32Array(max)
  geo.setAttribute('position', new BufferAttribute(pos, 3))
  geo.setAttribute('tint', new BufferAttribute(tint, 3))
  geo.setAttribute('size', new BufferAttribute(size, 1))
  geo.setAttribute('alpha', new BufferAttribute(alpha, 1))
  geo.setAttribute('spin', new BufferAttribute(spin, 1))
  const mat = new ShaderMaterial({
    uniforms: { uMap: { value: map }, uScale: { value: 400 }, uBoost: { value: boost } },
    vertexShader: vert,
    fragmentShader: frag,
    transparent: true,
    depthWrite: false,
    blending: additive ? AdditiveBlending : NormalBlending,
  })
  const points = new Points(geo, mat)
  points.frustumCulled = false
  points.renderOrder = 5
  scene.add(points)
  const parts = Array.from({ length: max }, () => ({ alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 0, life: 1, s0: 1, s1: 1, a: 1, r: 1, g: 1, b: 1, drag: 0, grav: 0, spin: 0, spinV: 0, fadeIn: 0.1 }))
  return { points, geo, pos, tint, size, alpha, spin, parts, cursor: 0, mat }
}

export function createFx(scene) {
  const tex = (c) => {
    const t = new CanvasTexture(c)
    t.colorSpace = SRGBColorSpace
    return t
  }
  const smoke = makePool(scene, 900, tex(paintSoftDot(64)), false, 1)
  const glow = makePool(scene, 600, tex(paintSparkle(64)), true, 2.2)
  let density = 1

  function spawn(pool, o) {
    // Ring buffer: the oldest particle is reused when the pool is full.
    const p = pool.parts[pool.cursor]
    pool.cursor = (pool.cursor + 1) % pool.parts.length
    p.alive = true
    p.x = o.x
    p.y = o.y
    p.z = o.z
    p.vx = o.vx ?? 0
    p.vy = o.vy ?? 0
    p.vz = o.vz ?? 0
    p.age = 0
    p.life = o.life ?? 1
    p.s0 = o.size ?? 0.5
    p.s1 = o.size1 ?? p.s0
    p.a = o.alpha ?? 1
    p.r = o.r ?? 1
    p.g = o.g ?? 1
    p.b = o.b ?? 1
    p.drag = o.drag ?? 1
    p.grav = o.grav ?? 0
    p.spin = Math.random() * 6.28
    p.spinV = o.spinV ?? (Math.random() - 0.5) * 2
    p.fadeIn = o.fadeIn ?? 0.08
  }

  const rnd = (s) => (Math.random() - 0.5) * 2 * s
  const hex = (c) => {
    const n = typeof c === 'number' ? c : parseInt(String(c).slice(1), 16)
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
  }

  function step(pool, dt) {
    let n = 0
    for (const p of pool.parts) {
      if (!p.alive) continue
      p.age += dt
      if (p.age >= p.life) {
        p.alive = false
        continue
      }
      const k = Math.exp(-p.drag * dt)
      p.vx *= k
      p.vz *= k
      p.vy = p.vy * k - p.grav * dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.z += p.vz * dt
      p.spin += p.spinV * dt
      const t = p.age / p.life
      const i3 = n * 3
      pool.pos[i3] = p.x
      pool.pos[i3 + 1] = p.y
      pool.pos[i3 + 2] = p.z
      pool.tint[i3] = p.r
      pool.tint[i3 + 1] = p.g
      pool.tint[i3 + 2] = p.b
      pool.size[n] = p.s0 + (p.s1 - p.s0) * t
      const fin = Math.min(1, p.age / (p.life * p.fadeIn + 1e-4))
      pool.alpha[n] = p.a * fin * (1 - t * t)
      pool.spin[n] = p.spin
      n++
    }
    for (const name of ['position', 'tint', 'size', 'alpha', 'spin']) pool.geo.attributes[name].needsUpdate = true
    pool.geo.setDrawRange(0, n)
  }

  const api = {
    setDensity(d) {
      density = d
    },
    setViewport(heightPx, camera) {
      const s = heightPx * camera.projectionMatrix.elements[5] * 0.5
      smoke.mat.uniforms.uScale.value = s
      glow.mat.uniforms.uScale.value = s
    },
    // Soft smoke / dust puff.
    puff(x, y, z, { count = 8, color = '#d9d4cc', size = 0.6, grow = 2.2, spread = 0.4, up = 0.6, speed = 1, life = 1.1, alpha = 0.5, drag = 2.5, grav = -0.2 } = {}) {
      const [r, g, b] = hex(color)
      const n = Math.max(1, Math.round(count * density))
      for (let i = 0; i < n; i++) {
        spawn(smoke, { x: x + rnd(spread), y: y + rnd(spread * 0.4), z: z + rnd(spread), vx: rnd(speed), vy: up + Math.random() * up, vz: rnd(speed), life: life * (0.7 + Math.random() * 0.6), size, size1: size * grow, alpha, r, g, b, drag, grav })
      }
    },
    // Additive sparkles bursting outward.
    sparkle(x, y, z, { count = 16, color = '#ffd84a', size = 0.35, speed = 4, life = 0.8, grav = 6, up = 3, spread = 0.1 } = {}) {
      const [r, g, b] = hex(color)
      const n = Math.max(1, Math.round(count * density))
      for (let i = 0; i < n; i++) {
        spawn(glow, { x: x + rnd(spread), y: y + rnd(spread), z: z + rnd(spread), vx: rnd(speed), vy: up + Math.random() * speed, vz: rnd(speed), life: life * (0.6 + Math.random() * 0.8), size: size * (0.6 + Math.random() * 0.8), size1: size * 0.2, r, g, b, drag: 1.5, grav, spinV: rnd(6) })
      }
    },
    // Multicolour confetti-ish sparkles.
    confetti(x, y, z, count = 40) {
      const cols = ['#ff4f6d', '#ffd84a', '#4fd6ff', '#7cff6b', '#c77dff']
      for (let i = 0; i < count; i++) api.sparkle(x, y, z, { count: 1, color: cols[i % cols.length], size: 0.32, speed: 5, up: 5, life: 1.4, grav: 7 })
    },
    // One trail particle (exhaust, contrails): caller supplies everything.
    trail(x, y, z, o) {
      if (Math.random() > density) return
      const [r, g, b] = hex(o.color ?? '#ffffff')
      spawn(o.glow ? glow : smoke, { x, y, z, vx: o.vx ?? rnd(0.2), vy: o.vy ?? 0.3, vz: o.vz ?? rnd(0.2), life: o.life ?? 1, size: o.size ?? 0.3, size1: o.size1 ?? (o.size ?? 0.3) * 3, alpha: o.alpha ?? 0.4, r, g, b, drag: o.drag ?? 1.5, grav: o.grav ?? -0.3, fadeIn: o.fadeIn })
    },
    update(dt) {
      step(smoke, dt)
      step(glow, dt)
    },
  }
  return api
}
