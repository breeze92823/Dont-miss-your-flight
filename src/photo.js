// Phase 4: PHOTO MODE (tunables FLIGHT.fun.photo). 📸 PHOTO on the seat bar (K) during the cruise: the HUD
// and touch controls hide, the game holds still, and you frame a shot:
// - VIEW: Orbit (drag to circle around yourself, pinch / wheel / − + to zoom), Selfie (arm out, camera in
//   front of your face), Wing Cam (the jet from outside, airport/skyView.js).
// - POSE: Natural / Wave / Peace / Cheer (an overlay on your avatar, seated or standing).
// - FILTER: Normal / Vivid / Retro / Noir / Dream (CSS on the game canvas, baked into the photo).
// SNAP: a shutter, a white flash, and a polaroid slides in (your photo with a skyhop air caption, seat and
// destination) that you can SAVE as a PNG. The first snap each flight pays a few coins.
import { Vector3 } from 'three'
import { FLIGHT } from './config.js'
import { player } from './player.js'
import { segmentClear } from './physics.js'
import { seating, SIT } from './seating.js'
import { onKey } from './input.js'
import { registerSfx, sfx } from './audio.js'
import './hud/photo.css'

const PH = FLIGHT.fun.photo
const deg = (d) => (d * Math.PI) / 180
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

// A camera shutter: a mechanical click-clack + a tiny wind-on whirr.
registerSfx('shutter', ({ now, out, tone, noise }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.45, o.pan)
  noise('white', d, t, 0.03, { type: 'highpass', f: 3000, peak: 0.8, a: 0.001 })
  tone(d, t, 0.04, { type: 'square', f: 1800, f2: 900, peak: 0.12, a: 0.001 })
  noise('white', d, t + 0.09, 0.04, { type: 'bandpass', f: 2500, q: 2, peak: 0.6, a: 0.001 })
  noise('pink', d, t + 0.16, 0.25, { type: 'bandpass', f: 900, f2: 1400, q: 4, peak: 0.2, a: 0.02 })
})

// canvas: the game canvas (filters). capture(): render now, return a data URL. avatarYaw(): your avatar's
// facing. headPos(out): your head in world space. sky: skyView. hooks.hideAvatar(on).
export function createPhoto({ hud, store, fx, trip, rules, sky, canvas, capture = () => null, avatarYaw = () => 0, headPos = () => false, dest = () => '' }) {
  const st = { on: false, view: 'orbit', pose: 'none', filter: 'none', yaw: 0, pitch: 0.15, dist: 2.6, paid: false, phase: 'off', frozen: false, t: 0, shot: null }
  const target = new Vector3()
  const tmp = new Vector3()

  // --- The seat-bar button ---------------------------------------------------------------------------
  const bar = hud.root.querySelector('.seatbar') // (on phones it lives in a side dock)
  const btn = document.createElement('button')
  btn.className = 'sb-btn sb-photo'
  btn.innerHTML = '<span class="sb-ico">📸</span><span class="sb-l">PHOTO</span><span class="sb-k">K</span>'
  btn.addEventListener('pointerdown', (e) => e.stopPropagation())
  btn.addEventListener('click', (e) => {
    e.stopPropagation()
    toggle()
  })
  bar?.insertBefore(btn, bar.querySelector('.sb-buff'))
  onKey('KeyK', () => toggle())

  // --- The photo-mode overlay ---------------------------------------------------------------------------
  const ui = document.createElement('div')
  ui.className = 'photo-ui'
  ui.innerHTML = `
    <div class="ph-drag"></div>
    <div class="ph-frame"><i></i><i></i><i></i><i></i></div>
    <button class="ph-x" aria-label="Close">✕</button>
    <div class="ph-zoom"><button class="ph-zi">+</button><button class="ph-zo">−</button></div>
    <div class="ph-panel">
      <div class="ph-row ph-views"></div>
      <div class="ph-row ph-poses"></div>
      <div class="ph-row ph-filters"></div>
    </div>
    <button class="ph-snap" aria-label="Snap"><span>📸</span></button>
    <div class="ph-flash"></div>
    <div class="ph-shot"><div class="ph-card"><img alt="your photo"><div class="ph-btns"><button class="btn green ph-save">💾 Save</button><button class="btn grey ph-close">Keep shooting</button></div></div></div>`
  hud.root.appendChild(ui)
  const drag = ui.querySelector('.ph-drag')
  const flash = ui.querySelector('.ph-flash')
  const shotEl = ui.querySelector('.ph-shot')
  const img = shotEl.querySelector('img')
  const stop = (el, fn) => {
    el.addEventListener('pointerdown', (e) => e.stopPropagation())
    el.addEventListener('click', (e) => {
      e.stopPropagation()
      fn()
    })
  }
  function chips(row, list, key, onPick) {
    const el = ui.querySelector(row)
    el.innerHTML = ''
    for (const it of list) {
      const b = document.createElement('button')
      b.className = 'ph-chip'
      b.dataset.id = it.id
      b.textContent = it.icon ? `${it.icon} ${it.name}` : it.name
      stop(b, () => {
        sfx('click')
        onPick(it.id)
        refresh()
      })
      el.appendChild(b)
    }
    el.dataset.key = key
  }
  const VIEWS = [
    { id: 'orbit', name: 'Orbit', icon: '🔄' },
    { id: 'selfie', name: 'Selfie', icon: '🤳' },
    { id: 'wing', name: 'Wing Cam', icon: '🛩️' },
  ]
  chips('.ph-views', VIEWS, 'view', (id) => setView(id))
  chips('.ph-poses', PH.poses, 'pose', (id) => (st.pose = id))
  chips('.ph-filters', PH.filters, 'filter', (id) => setFilter(id))
  function refresh() {
    for (const row of ui.querySelectorAll('.ph-row')) {
      const k = row.dataset.key
      for (const b of row.children) b.classList.toggle('on', b.dataset.id === st[k])
    }
    ui.querySelector('.ph-poses').classList.toggle('dim', st.view === 'wing')
    ui.classList.toggle('outside', st.view === 'wing')
  }
  stop(ui.querySelector('.ph-x'), () => toggle(false))
  stop(ui.querySelector('.ph-snap'), () => snap())
  stop(ui.querySelector('.ph-zi'), () => (st.dist = clamp(st.dist - 0.4, 0.8, maxDist())))
  stop(ui.querySelector('.ph-zo'), () => (st.dist = clamp(st.dist + 0.4, 0.8, maxDist())))
  stop(ui.querySelector('.ph-save'), () => save())
  stop(ui.querySelector('.ph-close'), () => {
    shotEl.classList.remove('show')
    ui.classList.remove('shot')
  })
  // drag to orbit, pinch / wheel to zoom (pointer events: mouse + touch)
  const pts = new Map()
  let pinch = 0
  drag.addEventListener('pointerdown', (e) => {
    drag.setPointerCapture?.(e.pointerId)
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pts.size === 2) {
      const [a, b] = [...pts.values()]
      pinch = Math.hypot(a.x - b.x, a.y - b.y)
    }
  })
  drag.addEventListener('pointermove', (e) => {
    const p = pts.get(e.pointerId)
    if (!p) return
    if (pts.size === 2) {
      p.x = e.clientX
      p.y = e.clientY
      const [a, b] = [...pts.values()]
      const d = Math.hypot(a.x - b.x, a.y - b.y)
      if (pinch) st.dist = clamp(st.dist * (pinch / d), 0.8, maxDist())
      pinch = d
      return
    }
    const dx = e.clientX - p.x
    const dy = e.clientY - p.y
    p.x = e.clientX
    p.y = e.clientY
    st.yaw -= dx * 0.008
    st.pitch = clamp(st.pitch + dy * 0.006, -0.35, 1.2)
  })
  for (const ev of ['pointerup', 'pointercancel']) drag.addEventListener(ev, (e) => {
    pts.delete(e.pointerId)
    pinch = 0
  })
  drag.addEventListener('wheel', (e) => {
    e.preventDefault()
    st.dist = clamp(st.dist * (1 + Math.sign(e.deltaY) * 0.1), 0.8, maxDist())
  }, { passive: false })
  // the game must not move you while you frame the shot
  const BLOCK = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight', 'KeyE', 'KeyH', 'KeyB', 'KeyM', 'KeyT', 'KeyG'])
  window.addEventListener('keydown', (e) => {
    if (!st.on || !BLOCK.has(e.code)) return
    e.preventDefault()
    e.stopImmediatePropagation()
  }, true)

  const inCabin = () => player.position.y < 1000
  const maxDist = () => (inCabin() ? 4 : 7)
  function setView(id) {
    st.view = id
    sky.show(id === 'wing')
    if (id === 'selfie') st.pose = st.pose === 'none' ? 'none' : st.pose
  }
  function setFilter(id) {
    st.filter = id
    const f = PH.filters.find((x) => x.id === id)
    canvas.style.filter = f && f.css !== 'none' ? f.css : ''
  }
  function toggle(on = !st.on) {
    if (on === st.on) return
    if (on) {
      if (st.phase !== 'cruise' || rules.chasing || rules.hidden) {
        if (rules.chasing) hud.toast('No time for photos, run!')
        return
      }
      st.on = true
      document.exitPointerLock?.()
      st.frozen = player.frozen
      if (!seating.seat) {
        player.frozen = true
        player.velocity.x = player.velocity.z = 0
      }
      // seated: from the aisle, a little ahead of your row (in front of you is the seat ahead)
      const s = seating.seat
      st.yaw = s && s.aisleX != null ? Math.atan2(s.aisleX - s.x, -0.9) : avatarYaw() + 0.45
      st.pitch = s ? 0.3 : 0.12
      st.dist = s ? Math.max(1.8, Math.abs(s.aisleX - s.x) + 0.6) : 2.6
      setView('orbit')
      st.pose = 'none'
      setFilter('none')
      refresh()
      hud.root.classList.add('photo-mode')
      document.body.classList.add('photo-mode')
      sfx('shutter', { vol: 0.2 })
      ui.classList.add('show')
    } else {
      st.on = false
      if (!seating.seat) player.frozen = st.frozen
      sky.show(false)
      setFilter('none')
      shotEl.classList.remove('show')
      ui.classList.remove('show', 'shot')
      hud.root.classList.remove('photo-mode')
      document.body.classList.remove('photo-mode')
    }
  }

  // --- The shot -----------------------------------------------------------------------------------------
  function snap() {
    sfx('shutter', { vol: 0.5 })
    flash.classList.remove('go')
    void flash.offsetWidth
    flash.classList.add('go')
    const url = capture()
    if (!url) return
    const im = new Image()
    im.onload = () => {
      // a polaroid: the shot (filter baked in) + a white frame with a caption
      const maxW = 960
      const k = Math.min(1, maxW / im.width)
      const w = Math.round(im.width * k)
      const h = Math.round(im.height * k)
      const pad = Math.round(w * 0.035)
      const foot = Math.round(w * 0.12)
      const c = document.createElement('canvas')
      c.width = w + pad * 2
      c.height = h + pad + foot
      const x = c.getContext('2d')
      x.fillStyle = '#fffdf7'
      x.fillRect(0, 0, c.width, c.height)
      const f = PH.filters.find((q) => q.id === st.filter)
      x.filter = f?.css ?? 'none'
      x.drawImage(im, pad, pad, w, h)
      x.filter = 'none'
      x.fillStyle = '#2a2f3a'
      x.textAlign = 'center'
      x.textBaseline = 'middle'
      x.font = `700 ${Math.round(foot * 0.34)}px Fredoka, Arial, sans-serif`
      x.fillText(`✈ skyhop air · seat ${trip.code}${dest() ? ` · to ${dest()}` : ''}`, c.width / 2, h + pad + foot * 0.42)
      x.font = `500 ${Math.round(foot * 0.2)}px Fredoka, Arial, sans-serif`
      x.fillStyle = '#7a8296'
      x.fillText(new Date().toLocaleDateString(), c.width / 2, h + pad + foot * 0.76)
      st.shot = c.toDataURL('image/png')
      img.src = st.shot
      shotEl.classList.remove('show')
      void shotEl.offsetWidth
      shotEl.classList.add('show')
      ui.classList.add('shot')
      if (!st.paid) {
        st.paid = true
        hud.big('📸 NICE SHOT!', 'gold', 1.4)
        const p = player.renderPosition
        store.addCoins(PH.coins, { x: p.x, y: p.y + 1.6, z: p.z })
      }
    }
    im.src = url
  }
  function save() {
    if (!st.shot) return
    const a = document.createElement('a')
    a.href = st.shot
    a.download = `skyhop-photo-${Date.now()}.png`
    document.body.appendChild(a)
    a.click()
    a.remove()
    sfx('chime', { vol: 0.3 })
    hud.toast('Photo saved!')
  }

  // --- Poses --------------------------------------------------------------------------------------------
  const P = {}
  function pose(seated) {
    if (!st.on) return null
    const id = st.view === 'selfie' ? (st.pose === 'none' ? 'selfie' : st.pose) : st.pose
    if (id === 'none') return null
    for (const k of Object.keys(P)) delete P[k]
    if (seated) for (const k in SIT) P[k] = { ...SIT[k] }
    const set = (b, o) => (P[b] = { ...(P[b] ?? {}), ...o })
    const w = Math.sin(st.t * 9)
    if (id === 'wave') {
      set('ArmR1', { x: deg(-160), y: 0, z: deg(-25) + w * 0.35 })
      set('ArmR2', { x: deg(-30) })
      set('Neck1', { x: deg(-5), y: 0 })
    } else if (id === 'peace') {
      set('ArmR1', { x: deg(-128), y: 0, z: deg(-28) })
      set('ArmR2', { x: deg(-95) })
      set('Neck1', { x: 0, y: deg(-8) })
    } else if (id === 'cheer') {
      set('ArmL1', { x: deg(-165), y: 0, z: deg(25) + w * 0.1 })
      set('ArmR1', { x: deg(-165), y: 0, z: deg(-25) - w * 0.1 })
      set('ArmL2', { x: deg(-15) })
      set('ArmR2', { x: deg(-15) })
      set('Neck1', { x: deg(-12), y: 0 })
    } else if (id === 'selfie') {
      // arm out and up, holding the phone toward the camera
      set('ArmR1', { x: deg(-120), y: 0, z: deg(-22) })
      set('ArmR2', { x: deg(-10) })
      set('Neck1', { x: deg(-8), y: 0 })
    }
    if (st.view === 'selfie' && id !== 'selfie') {
      // a selfie with a pose: the left hand holds the phone
      set('ArmL1', { x: deg(-120), y: 0, z: deg(22) })
      set('ArmL2', { x: deg(-10) })
    }
    return P
  }

  return {
    st,
    toggle,
    get on() {
      return st.on
    },
    pose: () => (seating.seat ? pose(true) : null),
    standPose: () => (seating.seat ? null : pose(false)),
    camera(cam) {
      if (!st.on) return false
      if (st.view === 'wing') {
        sky.camera(cam, 'wing')
        return true
      }
      if (!headPos(target)) {
        const p = player.renderPosition
        target.set(p.x, p.y + 1.5, p.z)
      }
      if (st.view === 'selfie') {
        // in front of your face, held up a little
        const a = avatarYaw()
        const fwd = seating.seat ? 1.05 : 1.3
        tmp.set(target.x + Math.sin(a) * fwd + Math.cos(a) * 0.15, target.y + (seating.seat ? 0.95 : 0.6), target.z + Math.cos(a) * fwd - Math.sin(a) * 0.12)
        cam.position.copy(tmp)
        cam.up.set(0, 1, 0)
        cam.lookAt(target.x, target.y + 0.3, target.z)
        cam.fov = 70
      } else {
        target.y -= 0.15
        const c = Math.cos(st.pitch)
        tmp.set(target.x + Math.sin(st.yaw) * c * st.dist, target.y + Math.sin(st.pitch) * st.dist, target.z + Math.cos(st.yaw) * c * st.dist)
        // keep clear of the bins, walls and ceiling
        const k = segmentClear(target.x, target.y, target.z, tmp.x, tmp.y, tmp.z)
        if (k < 1) tmp.lerpVectors(target, tmp, Math.max(0.12, k - 0.06))
        cam.position.copy(tmp)
        cam.up.set(0, 1, 0)
        cam.lookAt(target)
        cam.fov = 55
      }
      cam.updateProjectionMatrix()
      return true
    },
    setPhase(p) {
      st.phase = p
      if (p !== 'cruise') toggle(false)
    },
    board() {
      st.paid = false
      st.phase = 'takeoff'
    },
    update(dt) {
      st.t += dt
      const show = st.phase === 'cruise' && !st.on
      if (btn._shown !== show) {
        btn._shown = show
        btn.classList.toggle('show', show)
      }
      if (st.on && (rules.chasing || st.phase !== 'cruise')) toggle(false)
    },
  }
}
