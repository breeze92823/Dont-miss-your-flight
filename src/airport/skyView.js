// Phase 4: the plane seen from OUTSIDE (the seat screen's cameras, photo mode's Wing Cam). A skyhop air jet
// (airliner.js makeJet) flies over a sea of clouds a little above the cabin interior: the deck hides the
// cabin and the airport below, puffs of cloud stream past from nose to tail for speed, the jet banks and
// bobs, its fans spin and its lights blink. Built on first use; hidden until a camera looks at it.
// Presets (local frame: nose +Z, left wing +X): wing (out over the left wing), tail (on top of the fin),
// chase (a rear-quarter view), nose (forward over the radome).
import { CanvasTexture, Color, Group, Mesh, MeshBasicMaterial, PlaneGeometry, RepeatWrapping, Sprite, SpriteMaterial, SRGBColorSpace, Vector3 } from 'three'
import { makeJet } from './airliner.js'
import { mulberry32, paintSoftDot } from '../textures.js'
import { FLIGHT } from '../config.js'

const PRESETS = {
  wing: { pos: [4.6, 2.5, 2.2], look: [17, -1.2, -4.5], fov: 62, sway: 0.05 },
  tail: { pos: [0, 10.8, -31], look: [0, 1.2, 14], fov: 58, sway: 0.08 },
  chase: { pos: [-22, 15, -34], look: [0, -1, 4], fov: 50, sway: 0.4 }, // from above: the (baked, always down) gear hides under the wings
  nose: { pos: [0, 2.9, 16.5], look: [0, 1.6, 70], fov: 70, sway: 0.03 },
}

function cloudTex() {
  const S = 512
  const c = document.createElement('canvas')
  c.width = c.height = S
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#dfe9f6'
  ctx.fillRect(0, 0, S, S)
  const r = mulberry32(11)
  // soft white billows, wrapped at the edges so the texture tiles
  for (let i = 0; i < 260; i++) {
    const x = r() * S
    const y = r() * S
    const rad = 12 + r() * 46
    const a = 0.08 + r() * 0.22
    for (const [ox, oy] of [[0, 0], [S, 0], [-S, 0], [0, S], [0, -S]]) {
      const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad)
      g.addColorStop(0, `rgba(255,255,255,${a})`)
      g.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = g
      ctx.fillRect(x + ox - rad, y + oy - rad, rad * 2, rad * 2)
    }
  }
  // a few blue-grey shadows between the billows
  for (let i = 0; i < 70; i++) {
    const x = r() * S
    const y = r() * S
    const rad = 20 + r() * 40
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad)
    g.addColorStop(0, 'rgba(120,140,175,0.12)')
    g.addColorStop(1, 'rgba(120,140,175,0)')
    ctx.fillStyle = g
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2)
  }
  const t = new CanvasTexture(c)
  t.wrapS = t.wrapT = RepeatWrapping
  t.repeat.set(10, 10)
  t.colorSpace = SRGBColorSpace
  return t
}

export function createSkyView(scene, cabin) {
  let built = null
  const at = new Vector3(FLIGHT.cabin.x, cabin.floorY + 85, cabin.zFront - 40)
  const tmp = new Vector3()
  const look = new Vector3()
  const st = { t: 0, storm: 0, bolt: 0, bump: 0, bumpT: 0 }
  const white = new Color('#ffffff')
  const stormCol = new Color('#59627a')

  function build() {
    const g = new Group()
    g.position.copy(at)
    const jet = makeJet()
    const plane = new Group() // the jet banks / bobs inside g
    plane.add(jet.root)
    g.add(plane)
    // the sea of clouds below + a second, sparser layer above
    const tex = cloudTex()
    const deckMat = new MeshBasicMaterial({ map: tex, color: '#ffffff' })
    const deck = new Mesh(new PlaneGeometry(900, 900).rotateX(-Math.PI / 2), deckMat)
    deck.position.y = -24
    g.add(deck)
    // puffs streaming past (nose -> tail)
    const dot = new CanvasTexture(paintSoftDot(64))
    const puffs = []
    const r = mulberry32(5)
    for (let i = 0; i < 34; i++) {
      const m = new SpriteMaterial({ map: dot, color: '#ffffff', transparent: true, opacity: 0.55 + r() * 0.35, depthWrite: false })
      const s = new Sprite(m)
      const big = 10 + r() * 26
      s.scale.set(big * 1.5, big, 1)
      let x = (r() - 0.5) * 160
      if (Math.abs(x) < 26) x = Math.sign(x || 1) * (26 + r() * 30)
      s.position.set(x, -14 + r() * 40, -180 + r() * 360)
      g.add(s)
      puffs.push(s)
    }
    g.visible = false
    scene.add(g)
    built = { g, jet, plane, deck, deckMat, tex, puffs }
  }

  return {
    get shown() {
      return !!built?.g.visible
    },
    show(on) {
      if (on && !built) build()
      if (built) built.g.visible = on
    },
    // A turbulence bump (k 0..1): the jet lurches.
    bump(k) {
      st.bump = Math.max(st.bump, k)
    },
    // The storm (0..1): darker clouds; lightning() flashes them.
    setStorm(k) {
      st.storm = k
    },
    lightning() {
      st.bolt = 1
    },
    // Drive the camera from a preset ('wing' | 'tail' | 'chase' | 'nose').
    camera(cam, id) {
      if (!built) return
      const p = PRESETS[id] ?? PRESETS.wing
      const pl = built.plane
      pl.updateMatrixWorld(true)
      const s = p.sway
      tmp.set(p.pos[0] + Math.sin(st.t * 0.7) * s, p.pos[1] + Math.sin(st.t * 1.1) * s * 0.6, p.pos[2])
      look.set(p.look[0], p.look[1], p.look[2])
      pl.localToWorld(tmp)
      pl.localToWorld(look)
      cam.position.copy(tmp)
      cam.up.set(0, 1, 0)
      cam.lookAt(look)
      // the wing / tail / nose cams are bolted on: they roll with the jet
      if (id !== 'chase') cam.rotateZ(pl.rotation.z)
      if (st.bumpT > 0) {
        cam.position.x += (Math.random() - 0.5) * st.bumpT * 0.3
        cam.position.y += (Math.random() - 0.5) * st.bumpT * 0.3
      }
      cam.fov = p.fov
      cam.updateProjectionMatrix()
    },
    update(dt) {
      st.t += dt
      if (!built || !built.g.visible) return
      const b = built
      b.jet.update(dt, 0.85, true)
      // a lazy bank and a gentle bob, plus any turbulence lurch
      st.bumpT = Math.max(st.bumpT * Math.exp(-dt * 3), st.bump)
      st.bump = 0
      b.plane.rotation.z = Math.sin(st.t * 0.18) * 0.07 + Math.sin(st.t * 9) * st.bumpT * 0.03
      b.plane.rotation.x = Math.sin(st.t * 0.23) * 0.02
      b.plane.position.y = Math.sin(st.t * 0.5) * 0.6 + Math.sin(st.t * 13) * st.bumpT * 0.5
      // the cloud deck slides under us, the puffs rush past
      b.tex.offset.y = (b.tex.offset.y + dt * 0.045) % 1
      for (const s of b.puffs) {
        s.position.z -= dt * 95
        if (s.position.z < -190) s.position.z += 380
      }
      st.bolt = Math.max(0, st.bolt - dt * 2.5)
      const c = b.deckMat.color.copy(white).lerp(stormCol, st.storm)
      if (st.bolt > 0) c.lerp(white, st.bolt).multiplyScalar(1 + st.bolt * 0.8)
      for (const s of b.puffs) s.material.color.copy(c)
    },
  }
}
