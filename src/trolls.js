// The Shop's newer trolls and the effects other players' trolls have on you (net.js `trolled`):
//   Lost And Found Rain - lost property (emoji props with physics) tumbles out of the sky
//   Jet Flyover         - an airliner screams low over the terminal, the camera rattles
//   Coin Shower         - coins rain around you; walk into them to grab them (1 coin each)
//   Airport Party       - disco ball, coloured floor lights, a beat, everyone jumps around
//   Let It Snow         - snow falls around you, indoors too
//   jumpscare / knockout / turbulence / shake - what Scare All, Kill All and the pilot's
//   turbulence do to YOUR screen when someone else uses them.
// Everything is pooled and built once; nothing adds scene lights (that would recompile shaders).
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  DynamicDrawUsage,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  Points,
  PointsMaterial,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
} from 'three'
import { RAPIER, world } from './physics.js'
import { jetLoop, registerSfx, sfx } from './audio.js'
import { paintEmoji } from './airport/paint.js'
import { makeAirliner } from './airport/vehicles.js'
import { ART } from './hud/art.js'
import { lathe } from './detail.js'
import './trolls.css'
import { deathScreen } from './bloxity.js'

const ZERO = new Matrix4().makeScale(0, 0, 0)
const rnd = (a) => (Math.random() - 0.5) * 2 * a

registerSfx('beat', ({ now, out, tone, noise }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.25)
  tone(d, t, 0.18, { f: 140, f2: 45, peak: 0.9, a: 0.002 })
  noise('white', d, t + 0.25, 0.04, { f: 8000, peak: 0.25 })
  const n = [262, 330, 392, 523][o.step % 4]
  tone(d, t + 0.25, 0.2, { type: 'square', f: n, peak: 0.06, a: 0.005 })
})
registerSfx('rumble', ({ now, out, noise, tone }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.5)
  noise('pink', d, t, 1.6, { type: 'lowpass', f: 180, peak: 0.9, a: 0.1 })
  tone(d, t, 1.4, { type: 'sawtooth', f: 48, peak: 0.08, a: 0.1 })
})
registerSfx('airhorn', ({ now, out, tone }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.35)
  for (const f of [233, 294, 349]) tone(d, t, 1.1, { type: 'sawtooth', f, peak: 0.07, a: 0.02, curve: 'hold' })
})

function softDot() {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  r.addColorStop(0, 'rgba(255,255,255,1)')
  r.addColorStop(0.45, 'rgba(255,255,255,0.85)')
  r.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = r
  g.fillRect(0, 0, 64, 64)
  return new CanvasTexture(c)
}
function discoFloor() {
  const c = document.createElement('canvas')
  c.width = c.height = 512
  const g = c.getContext('2d')
  const cols = ['#ff3d7f', '#3dd6ff', '#ffe14a', '#7cff6b', '#b56bff', '#ff8a3d']
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * Math.PI * 2
    const d = 40 + Math.random() * 200
    const x = 256 + Math.cos(a) * d
    const y = 256 + Math.sin(a) * d
    const r = 30 + Math.random() * 30
    const gr = g.createRadialGradient(x, y, 0, x, y, r)
    gr.addColorStop(0, cols[i % cols.length])
    gr.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = gr
    g.beginPath()
    g.arc(x, y, r, 0, Math.PI * 2)
    g.fill()
  }
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  return t
}

export function createTrolls({ scene, crowd, fx, hud, getPlayer, store }) {
  const timers = []
  const later = (t, fn) => timers.push({ t, fn })
  const near = (r) => {
    const p = getPlayer()
    return crowd.list.filter((n) => (n.x - p.x) ** 2 + (n.z - p.z) ** 2 < r * r)
  }

  // --- Camera shake (applied after the camera update, so it never accumulates) --------------------
  const shakeS = { t: 0, dur: 1, amp: 0 }
  function shake(amp, dur) {
    if (amp >= shakeS.amp * (shakeS.t / shakeS.dur || 0)) Object.assign(shakeS, { t: dur, dur, amp })
  }

  // --- Lost And Found Rain ------------------------------------------------------------------------
  const LOST = ['🦩', '🚰', '☂️', '🧸', '👟', '🎸', '🕶️', '🧦', '🎒', '📱', '🥾', '🎩', '🛹', '🪑', '🧳', '🦆']
  const lostTex = new Map()
  const texFor = (e) => {
    if (!lostTex.has(e)) {
      const t = new CanvasTexture(paintEmoji(e))
      t.colorSpace = SRGBColorSpace
      lostTex.set(e, t)
    }
    return lostTex.get(e)
  }
  const LOST_N = 28
  const lostPool = Array.from({ length: LOST_N }, () => {
    const sp = new Sprite(new SpriteMaterial({ transparent: true, depthWrite: false }))
    sp.visible = false
    sp.scale.set(1.1, 1.1, 1)
    scene.add(sp)
    return { sp, body: null, t: 0, delay: 0, vy: 0 }
  })
  function clearLost() {
    for (const l of lostPool) {
      if (l.body) world.removeRigidBody(l.body)
      l.body = null
      l.sp.visible = false
    }
  }
  function lostFound() {
    clearLost()
    const p = getPlayer()
    hud.big('LOST AND FOUND!', 'gold', 1.2)
    sfx('whoosh', { vol: 0.5, dur: 0.8 })
    lostPool.forEach((l, i) => {
      const a = Math.random() * Math.PI * 2
      const d = 1 + Math.random() * 8
      const x = p.x + Math.cos(a) * d
      const z = p.z + Math.sin(a) * d
      const y = Math.min(11.5, p.y + 8 + Math.random() * 4)
      const e = i === 0 ? '🚰' : LOST[Math.floor(Math.random() * LOST.length)]
      l.sp.material.map = texFor(e)
      l.sp.material.needsUpdate = true
      const s = e === '🚰' ? 1.8 : 0.9 + Math.random() * 0.5
      l.sp.scale.set(s, s, 1)
      l.body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y + 60, z).setLinearDamping(0.1))
      world.createCollider(RAPIER.ColliderDesc.ball(s * 0.32).setDensity(40).setRestitution(0.45).setFriction(0.8), l.body)
      l.body.setEnabled(false)
      Object.assign(l, { x, y, z, t: 0, delay: i * 0.05 + Math.random() * 0.3, vy: 0, live: false, s })
    })
  }

  // --- Jet Flyover --------------------------------------------------------------------------------
  let jet = null
  let jetSound = null
  const jetS = { t: -1 }
  function jetFlyover() {
    if (!jet) {
      jet = makeAirliner()
      jet.root.rotation.order = 'YXZ'
      jet.root.visible = false
      scene.add(jet.root)
    }
    jetSound ??= jetLoop()
    jetS.t = 0
    const p = getPlayer()
    jetS.z = p.z
    jetS.x0 = p.x - 260
    jet.root.visible = true
    hud.big('JET FLYOVER!', 'gold', 1.2)
  }

  // --- Coin Shower ----------------------------------------------------------------------------------
  const COINS = 30
  // Minted coin: raised rim around a recessed face (turned profile, axis = Y like the old cylinder).
  const coinGeo = lathe([[0, -0.026], [0.205, -0.026], [0.215, -0.035], [0.262, -0.035], [0.28, -0.022], [0.28, 0.022], [0.262, 0.035], [0.215, 0.035], [0.205, 0.026], [0, 0.026]], 22)
  const coinMesh = new InstancedMesh(coinGeo, new MeshStandardMaterial({ color: '#ffc21a', metalness: 0.75, roughness: 0.25, emissive: '#6a4200', emissiveIntensity: 0.4 }), COINS)
  coinMesh.instanceMatrix.setUsage(DynamicDrawUsage)
  coinMesh.frustumCulled = false
  for (let i = 0; i < COINS; i++) coinMesh.setMatrixAt(i, ZERO)
  coinMesh.count = 0
  scene.add(coinMesh)
  const coins = Array.from({ length: COINS }, () => ({ on: false }))
  let grabbed = 0
  let grabT = 0
  let coinsLeft = 0
  function coinShower() {
    const p = getPlayer()
    hud.big('COIN SHOWER!', 'gold', 1.2)
    sfx('fanfare')
    coins.forEach((c, i) => {
      const a = Math.random() * Math.PI * 2
      const d = 1.5 + Math.random() * 8
      Object.assign(c, { on: true, x: p.x + Math.cos(a) * d, z: p.z + Math.sin(a) * d, y: p.y + 9 + Math.random() * 6, vy: -Math.random() * 3, floor: p.y + 0.3, spin: Math.random() * 6, age: -i * 0.06 })
    })
    coinsLeft = 14
    for (const n of near(25)) {
      n.scare = 1
      if (Math.random() < 0.15) crowd.say(n, ['MONEY!!', 'coins!! 🤑', 'mine mine mine'][Math.floor(Math.random() * 3)], 1.8)
    }
  }

  // --- Airport Party --------------------------------------------------------------------------------
  const ball = new Mesh(new IcosahedronGeometry(0.9, 1), new MeshStandardMaterial({ color: '#dfe8ff', metalness: 0.95, roughness: 0.12, flatShading: true, emissive: '#3344aa', emissiveIntensity: 0.4 }))
  ball.visible = false
  scene.add(ball)
  const floor = new Mesh(new CircleGeometry(15, 40), new MeshBasicMaterial({ map: discoFloor(), transparent: true, blending: AdditiveBlending, depthWrite: false, opacity: 0 }))
  floor.rotation.x = -Math.PI / 2
  floor.visible = false
  floor.renderOrder = 2
  scene.add(floor)
  const partyS = { t: 0, beat: 0, step: 0 }
  function party() {
    const p = getPlayer()
    partyS.t = 16
    partyS.beat = 0
    ball.position.set(p.x, p.y + 7, p.z)
    floor.position.set(p.x, p.y + 0.04, p.z)
    ball.visible = floor.visible = true
    hud.big('AIRPORT PARTY!', 'gold', 1.4)
    document.body.classList.add('troll-party')
  }

  // --- Let It Snow --------------------------------------------------------------------------------------
  const FLAKES = 1400
  const snowPos = new Float32Array(FLAKES * 3)
  const snowGeo = new BufferGeometry()
  snowGeo.setAttribute('position', new BufferAttribute(snowPos, 3).setUsage(DynamicDrawUsage))
  const snowMat = new PointsMaterial({ size: 0.16, map: softDot(), transparent: true, depthWrite: false, opacity: 0, color: '#ffffff' })
  const snowPts = new Points(snowGeo, snowMat)
  snowPts.frustumCulled = false
  snowPts.visible = false
  scene.add(snowPts)
  const snowS = { t: 0 }
  function snow() {
    const p = getPlayer()
    for (let i = 0; i < FLAKES; i++) {
      snowPos[i * 3] = p.x + rnd(22)
      snowPos[i * 3 + 1] = p.y + Math.random() * 14
      snowPos[i * 3 + 2] = p.z + rnd(22)
    }
    snowS.t = 25
    snowPts.visible = true
    hud.big('LET IT SNOW!', 'gold', 1.2)
    sfx('chime')
  }

  // --- What other players' trolls do to you -------------------------------------------------------------
  const overlay = document.createElement('div')
  overlay.className = 'troll-scare'
  overlay.innerHTML = `<div class="skull">${ART.skull ?? ''}</div>`
  document.body.appendChild(overlay)
  function jumpscare() {
    overlay.classList.remove('show')
    void overlay.offsetWidth
    overlay.classList.add('show')
    sfx('scream', { vol: 0.5 })
    later(0.08, () => sfx('scream', { vol: 0.45 }))
    later(0.18, () => sfx('scream', { vol: 0.4 }))
    shake(0.25, 0.6)
  }
  let koTimer = null
  let koCount = 0
  function knockout(player) {
    if (player.frozen || player.auto) return
    player.frozen = true
    hud.big('KNOCKED OUT!', 'gold', 2.2)
    sfx('bonk', { vol: 0.5 })
    shake(0.3, 0.5)
    document.body.classList.add('troll-ko')
    clearTimeout(koTimer)
    // Boxity's death screen (its countdown) where available; you get up once it allows it.
    const ko = ++koCount
    Promise.all([new Promise((r) => (koTimer = setTimeout(r, 2500))), deathScreen()]).then(() => {
      if (ko !== koCount) return
      player.frozen = false
      document.body.classList.remove('troll-ko')
    })
  }
  function turbulence() {
    hud.big('TURBULENCE!', 'gold', 1.4)
    sfx('rumble', { vol: 0.6 })
    shake(0.22, 3)
    for (const n of near(45)) {
      later(Math.random() * 0.8, () => {
        if (Math.random() < 0.35) n.koT = 1.2 + Math.random()
        else n.scare = 1.2
      })
    }
  }

  // --- Per frame ------------------------------------------------------------------------------------------
  const o3 = new Object3D()
  const tmpC = new Color()

  return {
    lostFound,
    jetFlyover,
    coinShower,
    party,
    snow,
    jumpscare,
    knockout,
    turbulence,
    shake,
    update(dt, t) {
      for (let i = timers.length - 1; i >= 0; i--) {
        timers[i].t -= dt
        if (timers[i].t <= 0) {
          timers[i].fn()
          timers.splice(i, 1)
        }
      }
      const p = getPlayer()

      // Lost and found: wake each prop after its delay; sprites follow their bodies, then fade out.
      for (const l of lostPool) {
        if (!l.body) continue
        l.t += dt
        if (!l.live) {
          if (l.t < l.delay) continue
          l.live = true
          l.body.setEnabled(true)
          l.body.setTranslation({ x: l.x, y: l.y, z: l.z }, true)
          l.body.setAngvel({ x: rnd(5), y: rnd(5), z: rnd(5) }, true)
          l.sp.visible = true
        }
        const tr = l.body.translation()
        const vy = l.body.linvel().y
        if (l.vy < -4 && vy > -1) {
          sfx('thud', { vol: Math.max(0.04, 0.4 - Math.hypot(tr.x - p.x, tr.z - p.z) * 0.03) })
          fx.puff(tr.x, tr.y - 0.2, tr.z, { count: 3, size: 0.3, alpha: 0.3, life: 0.5, up: 0.3 })
        }
        l.vy = vy
        l.sp.position.set(tr.x, tr.y, tr.z)
        const age = l.t - l.delay
        const k = age > 14 ? Math.max(0, 1 - (age - 14) * 2) : 1
        l.sp.material.opacity = k
        if (k <= 0) {
          world.removeRigidBody(l.body)
          l.body = null
          l.sp.visible = false
        }
      }

      // Jet: one low pass over your head, loud and shaky when it's overhead.
      if (jetS.t >= 0 && jet) {
        jetS.t += dt
        const x = jetS.x0 + jetS.t * 95
        jet.root.position.set(x, p.y + 26, jetS.z)
        jet.root.rotation.set(0.05, Math.PI / 2, Math.sin(jetS.t) * 0.08)
        jet.strobe.visible = t % 0.8 < 0.08
        const d = Math.abs(x - p.x)
        jetSound?.set(Math.max(0, 1 - d / 220) * 0.9, Math.max(0, 1 - d / 160))
        if (d < 60) shake(0.18 * (1 - d / 60), 0.2)
        if (d < 30 && !jetS.scared) {
          jetS.scared = true
          for (const n of near(40)) n.scare = 1.4
        }
        if (jetS.t > 5.5) {
          jetS.t = -1
          jetS.scared = false
          jet.root.visible = false
          jetSound?.set(0, 0)
        }
      }

      // Coins: fall, bounce once, spin; walk into one to grab it.
      let anyCoin = false
      coinsLeft -= dt
      coins.forEach((c, i) => {
        if (!c.on) return coinMesh.setMatrixAt(i, ZERO)
        anyCoin = true
        c.age += dt
        if (c.age < 0) return coinMesh.setMatrixAt(i, ZERO)
        c.vy -= 18 * dt
        c.y += c.vy * dt
        if (c.y < c.floor) {
          c.y = c.floor
          c.vy = Math.abs(c.vy) > 3 ? -c.vy * 0.3 : 0
        }
        c.spin += dt * 5
        if (Math.hypot(c.x - p.x, c.z - p.z) < 1.3 && c.y < p.y + 2.2) {
          c.on = false
          grabbed++
          sfx('coin', { vol: 0.2 })
          fx.sparkle(c.x, c.y + 0.3, c.z, { count: 6, color: '#ffd84a', speed: 2, up: 2, size: 0.25 })
          return coinMesh.setMatrixAt(i, ZERO)
        }
        if (coinsLeft <= 0) c.on = false
        o3.position.set(c.x, c.y, c.z)
        o3.rotation.set(Math.PI / 2, 0, c.spin)
        o3.scale.setScalar(coinsLeft < 1 ? Math.max(0.01, coinsLeft) : 1)
        o3.updateMatrix()
        coinMesh.setMatrixAt(i, o3.matrix)
      })
      if (anyCoin || grabbed) coinMesh.instanceMatrix.needsUpdate = true
      coinMesh.count = anyCoin ? COINS : 0 // idle: draw nothing
      grabT -= dt
      if (grabbed && grabT <= 0) {
        store.addCoins(grabbed, { x: p.x, y: p.y + 1.6, z: p.z })
        grabbed = 0
        grabT = 0.5
      }

      // Party: ball spins, floor lights swirl, a beat, people jump to it.
      if (partyS.t > 0) {
        partyS.t -= dt
        const fade = Math.min(1, partyS.t, (16 - partyS.t) * 2)
        ball.rotation.y += dt * 1.5
        floor.rotation.z += dt * 0.8
        floor.material.opacity = 0.75 * fade * (0.75 + 0.25 * Math.sin(t * 8))
        floor.material.color.copy(tmpC.setHSL((t * 0.15) % 1, 0.6, 0.6))
        partyS.beat -= dt
        if (partyS.beat <= 0) {
          partyS.beat = 0.5
          partyS.step++
          sfx('beat', { vol: 0.22 * fade, step: partyS.step })
          if (partyS.step % 2 === 0) fx.confetti(ball.position.x + rnd(6), ball.position.y - 1, ball.position.z + rnd(6), 14)
          for (const n of near(18)) if (Math.random() < 0.5) n.scare = Math.max(n.scare, 0.45)
        }
        if (partyS.t <= 0) {
          ball.visible = floor.visible = false
          document.body.classList.remove('troll-party')
        }
      }

      // Snow: flakes drift down and wrap around you.
      if (snowS.t > 0) {
        snowS.t -= dt
        snowMat.opacity = Math.min(1, snowS.t / 2, (25 - snowS.t) / 1.5) * 0.9
        for (let i = 0; i < FLAKES; i++) {
          const k = i * 3
          snowPos[k] += Math.sin(t * 0.7 + i) * dt * 0.4
          snowPos[k + 1] -= dt * (1 + (i % 5) * 0.25)
          if (snowPos[k + 1] < p.y - 0.5) snowPos[k + 1] += 14
          if (snowPos[k] < p.x - 22) snowPos[k] += 44
          if (snowPos[k] > p.x + 22) snowPos[k] -= 44
          if (snowPos[k + 2] < p.z - 22) snowPos[k + 2] += 44
          if (snowPos[k + 2] > p.z + 22) snowPos[k + 2] -= 44
        }
        snowGeo.attributes.position.needsUpdate = true
        if (snowS.t <= 0) snowPts.visible = false
      }
    },
    // After the camera update, before rendering.
    late(camera, dt) {
      if (shakeS.t <= 0) return
      shakeS.t -= dt
      const a = shakeS.amp * Math.max(0, shakeS.t / shakeS.dur)
      camera.position.x += rnd(a)
      camera.position.y += rnd(a)
      camera.position.z += rnd(a)
    },
  }
}
