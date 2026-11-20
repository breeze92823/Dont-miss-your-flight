// What the Shop's passes, the jobs and the Daily Reward's timed items DO in the world:
//   - hotbar (bottom centre, keys 1-5): Air Horn, Handcuffs, Gravity Gun, Ban Hammer (passes) and
//     the Grapple Hook (Daily Reward, timed). Pick one, then click (or tap USE / press F) on whoever
//     is under the crosshair (the cursor when it is free).
//   - job panel above it while you wear a job hat: Security (Search / Add Time / Let Go on the
//     person you aim at) or Pilot (Takeoff / Turbulence / Announce, which land on everyone).
//   - VIP: the gold tag (HUD + over your head), 2x coins (store.addCoins) and priority boarding:
//     joining a line puts you straight at the front.
//   - trolls: running one you bought (and relaying it, net.js) or one someone else bought.
//   - destinations: clearing security on a flight marks its city visited.
//   - timed rewards ending (store.expire).
// NPCs that tools hold are "pinned": their own logic (queue/security) keeps running, and this module
// overrides where they stand until it lets go, so update() runs before crowd.update().
import { BufferGeometry, CanvasTexture, Line, LineBasicMaterial, Raycaster, Sprite, SpriteMaterial, SRGBColorSpace, Vector2, Vector3 } from 'three'
import { AIRPORT, DESTINATIONS, FEATURED_DESTINATIONS, JOBS, SECURITY, SHOP, TOOLS } from './config.js'
import { store } from './store.js'
import { sfx } from './audio.js'
import { RAPIER, segmentClear, world } from './physics.js'
import { getYaw } from './camera.js'
import { isLocked, onKey } from './input.js'
import { isFirstPerson } from './modes.js'
import { sendTroll } from './net.js'
import { ART } from './hud/art.js'
import { clock } from './hud/windows.js'
import './tools.css'

const TROLL_NAMES = Object.fromEntries(SHOP.trolls.map((t) => [t.id, t.name]))
const EXTRA_TROLLS = ['lostFound', 'jetFlyover', 'coinShower', 'party', 'snow']
const POWER_TROLLS = ['killAll', 'scareAll', 'luggageRain', 'paperPlanes']
export const isTroll = (id) => id in TROLL_NAMES

function el(tag, cls, html = '', parent = null) {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (html) e.innerHTML = html
  parent?.appendChild(e)
  return e
}
function tap(e, fn) {
  e.addEventListener('pointerdown', (ev) => {
    ev.stopPropagation()
    ev.preventDefault()
    fn(ev)
  })
}

export function createTools({ scene, camera, canvas, crowd, fx, hud, powers, trolls, queue, security, player, getName, onHat, isPlaying }) {
  const play = hud.root.querySelector('.play') ?? hud.root

  // --- DOM: hotbar, crosshair, USE button, job panel, VIP tag -----------------------------------------
  const bar = el('div', 'hotbar', '', play)
  const cross = el('div', 'tool-cross', '', hud.root)
  const useBtn = el('button', 'tool-use', 'USE', play)
  const jobPanel = el('div', 'job-panel', '', play)
  const vipTag = el('span', 'vip-tag', '★ VIP', hud.root.querySelector('.hud-coins') ?? play)
  let held = null // selected tool id
  let slots = []

  function refreshBar() {
    const ids = TOOLS.order.filter((id) => store.has(id))
    if (held && !ids.includes(held)) select(null)
    const key = ids.join()
    if (key !== bar.dataset.key) {
      bar.dataset.key = key
      bar.innerHTML = ''
      slots = ids.map((id, i) => {
        const b = el('button', 'slot', `<span class="art">${ART[id] ?? ''}</span><span class="k">${i + 1}</span><span class="t"></span>`, bar)
        b.title = TOOLS.names[id]
        tap(b, () => select(held === id ? null : id))
        return { id, b, t: b.querySelector('.t') }
      })
    }
    for (const s of slots) {
      s.b.classList.toggle('on', s.id === held)
      const left = store.ownsForGood(s.id) ? 0 : store.timeLeft(s.id)
      s.t.textContent = left ? clock(left) : ''
    }
    bar.classList.toggle('show', slots.length > 0)
    hud.root.classList.toggle('has-tools', slots.length > 0)
  }
  function select(id) {
    if (id === held) return
    if (held === 'gravityGun' && grav.npc) dropHeld()
    held = id
    sfx(id ? 'select' : 'click')
    if (id) hud.toast(`${TOOLS.names[id]}: ${id === 'airHorn' ? 'click or tap USE to honk!' : id === 'grapple' ? 'aim at a wall or ceiling and click!' : 'aim at someone and click!'}`)
    document.body.classList.toggle('tool-held', !!id)
    refreshBar()
  }
  TOOLS.order.forEach((_, i) => onKey(`Digit${i + 1}`, () => isPlaying() && slots[i] && select(held === slots[i].id ? null : slots[i].id)))
  onKey('KeyF', () => use())
  onKey('KeyQ', () => select(null))

  // --- Aim: the crosshair (locked mouse / touch) or the free cursor ------------------------------------
  const aim = new Vector2(innerWidth / 2, innerHeight / 2)
  let cursorAim = false
  window.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || isLocked()) return
    aim.set(e.clientX, e.clientY)
    cursorAim = true
  })
  window.addEventListener('pointerdown', (e) => {
    if (e.target !== canvas || e.button !== 0 || !held || e.pointerType !== 'mouse') return
    if (!isLocked()) aim.set(e.clientX, e.clientY)
    use(!isLocked())
  })
  const aimPoint = (free) => (free && cursorAim ? aim : new Vector2(innerWidth / 2, innerHeight / 2))
  const v = new Vector3()
  // The person nearest the aim point on screen, in range and in front of the camera.
  function pick(at) {
    const p = player.position
    let best = null
    let bestD = TOOLS.pickPx * Math.max(0.7, Math.min(1.4, innerHeight / 800))
    for (const n of crowd.list) {
      if (pins.get(n)?.kind === 'thrown') continue
      if ((n.x - p.x) ** 2 + (n.z - p.z) ** 2 > TOOLS.range ** 2) continue
      v.set(n.x, n.y + 1.1, n.z).project(camera)
      if (v.z > 1) continue
      const d = Math.hypot((v.x * 0.5 + 0.5) * innerWidth - at.x, (-v.y * 0.5 + 0.5) * innerHeight - at.y)
      if (d < bestD) {
        bestD = d
        best = n
      }
    }
    return best
  }

  // --- Pins: tools hold NPCs where they want them ---------------------------------------------------------
  const pins = new Map() // npc -> { kind, x, y, z, yaw, t, mode, prevMode, vx, vy, vz, mine }
  function pin(n, o) {
    const old = pins.get(n)
    pins.set(n, { x: n.x, y: n.y, z: n.z, yaw: n.yaw, prevMode: old?.prevMode ?? n.mode, ...o })
  }
  function release(n, puff = false) {
    const pn = pins.get(n)
    if (!pn) return
    pins.delete(n)
    n.mode = pn.prevMode === 'cuffed' || pn.prevMode === 'float' ? 'idle' : pn.prevMode
    n.y = AIRPORT.walkY
    if (puff) fx.puff(n.x, n.y + 0.8, n.z, { count: 10, size: 0.6, alpha: 0.5 })
  }

  // --- Tools ----------------------------------------------------------------------------------------------
  const grav = { npc: null }
  let cooldown = 0
  const rope = new Line(new BufferGeometry().setFromPoints([new Vector3(), new Vector3()]), new LineBasicMaterial({ color: '#2b2f3a' }))
  rope.visible = false
  rope.frustumCulled = false
  scene.add(rope)
  const grapple = { on: false, t: 0, to: new Vector3() }
  const ray = new Raycaster()

  function dropHeld() {
    const n = grav.npc
    grav.npc = null
    if (n) {
      pins.get(n) && Object.assign(pins.get(n), { kind: 'thrown', vx: 0, vy: 0, vz: 0, t: 0 })
    }
  }
  function use(free = false) {
    if (!held || !isPlaying() || cooldown > 0) return
    const at = aimPoint(free)
    const say = (n, lines, d = 2) => crowd.say(n, lines[Math.floor(Math.random() * lines.length)], d)
    if (held === 'airHorn') {
      cooldown = TOOLS.hornCooldown
      sfx('airhorn', { vol: 0.45 })
      const p = player.position
      fx.sparkle(p.x, p.y + 2.2, p.z, { count: 14, color: '#ffd84a', speed: 4, up: 2 })
      for (const n of crowd.list) {
        if ((n.x - p.x) ** 2 + (n.z - p.z) ** 2 > TOOLS.hornRadius ** 2) continue
        n.scare = 1.4
        if (Math.random() < 0.12) say(n, ['WHAT WAS THAT', 'my ears!!', 'HONK?!'])
      }
      return
    }
    if (held === 'grapple') return shootGrapple(at)
    if (held === 'gravityGun' && grav.npc) {
      // Throw where you're looking.
      const n = grav.npc
      grav.npc = null
      const yaw = getYaw()
      const pn = pins.get(n)
      if (pn) Object.assign(pn, { kind: 'thrown', t: 0, vx: -Math.sin(yaw) * TOOLS.throwSpeed, vy: 7, vz: -Math.cos(yaw) * TOOLS.throwSpeed })
      sfx('whoosh', { vol: 0.5, dur: 0.5 })
      say(n, ['WAAAAH', 'PUT ME DOWN— wait no', 'AAAAAAA'], 1.6)
      cooldown = 0.4
      return
    }
    const n = pick(at)
    if (!n) {
      sfx('error')
      cross.classList.remove('miss')
      void cross.offsetWidth
      cross.classList.add('miss')
      return
    }
    cooldown = 0.35
    if (held === 'handcuffs') {
      pin(n, { kind: 'cuffed', mode: 'cuffed', t: TOOLS.cuffTime })
      sfx('beep')
      fx.sparkle(n.x, n.y + 1.2, n.z, { count: 10, color: '#9fd0ff', speed: 2, up: 1 })
      say(n, ['HEY!', "I didn't do anything!", 'am i under arrest??', 'this is a mistake!'])
    } else if (held === 'gravityGun') {
      pin(n, { kind: 'held', mode: 'float', t: 99 })
      grav.npc = n
      sfx('scanHum', { vol: 0.3 })
      say(n, ['whoa whoa WHOA', "i'm FLOATING", 'help!!'])
    } else if (held === 'banHammer') {
      cooldown = 1
      sfx('bonk', { vol: 0.6 })
      hud.big('BANNED!', 'gold', 1)
      fx.sparkle(n.x, n.y + 1.9, n.z, { count: 18, color: '#ffe95a', speed: 3, up: 2 })
      n.koT = 1.2
      pin(n, { kind: 'bonked', t: 0.9, mode: n.mode })
    }
  }
  function shootGrapple(at) {
    if (player.frozen || player.auto) return hud.toast("You can't grapple right now!")
    ray.setFromCamera(new Vector2((at.x / innerWidth) * 2 - 1, -(at.y / innerHeight) * 2 + 1), camera)
    const o = ray.ray.origin
    const d = ray.ray.direction
    const hit = world.castRay(new RAPIER.Ray({ x: o.x, y: o.y, z: o.z }, { x: d.x, y: d.y, z: d.z }), TOOLS.grappleRange, true, RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC | RAPIER.QueryFilterFlags.EXCLUDE_SENSORS)
    cooldown = 0.6
    if (!hit) {
      sfx('error')
      return hud.toast('Too far! Aim at a wall or the ceiling.')
    }
    const toi = hit.timeOfImpact ?? hit.toi
    grapple.to.set(o.x + d.x * toi, o.y + d.y * toi, o.z + d.z * toi)
    grapple.on = true
    grapple.t = 0
    rope.visible = true
    sfx('whoosh', { vol: 0.45, dur: 0.35 })
    fx.sparkle(grapple.to.x, grapple.to.y, grapple.to.z, { count: 10, color: '#ffffff', speed: 2, up: 0.5, grav: 3 })
  }
  tap(useBtn, () => use(false))

  // --- Jobs ---------------------------------------------------------------------------------------------------
  const jobCd = { search: 0, takeoff: 0, turbulence: 0 }
  let jobKey = ''
  function jobButton(label, cls, fn) {
    const b = el('button', `job-btn ${cls}`, `<span>${label}</span><i></i>`, jobPanel)
    tap(b, () => isPlaying() && fn())
    return b
  }
  function refreshJob() {
    const hat = store.data.hat
    const key = `${hat}`
    if (key !== jobKey) {
      jobKey = key
      jobPanel.innerHTML = ''
      jobPanel.className = `job-panel ${hat ? `show ${hat}` : ''}`
      hud.root.classList.toggle('has-job', !!hat)
      if (hat === 'security') {
        el('div', 'job-title', 'SECURITY', jobPanel)
        jobButton('Search', 'b-search', jobSearch).dataset.cd = 'search'
        jobButton('Add Time', 'b-time', jobHold)
        jobButton('Let Go', 'b-go', jobLetGo)
      } else if (hat === 'pilot') {
        el('div', 'job-title', 'PILOT', jobPanel)
        jobButton('Takeoff', 'b-takeoff', jobTakeoff).dataset.cd = 'takeoff'
        jobButton('Turbulence', 'b-turb', jobTurbulence).dataset.cd = 'turbulence'
        jobButton('Announce', 'b-ann', () => hud.openAnnounce?.({ pilot: true }))
      }
      el('div', 'job-time', '', jobPanel)
    }
    const shift = hat && !store.ownsForGood(hat) ? store.timeLeft(hat) : 0
    const tEl = jobPanel.querySelector('.job-time')
    if (tEl) tEl.textContent = shift ? `Shift ends in ${clock(shift)}` : ''
    for (const b of jobPanel.querySelectorAll('[data-cd]')) {
      const c = jobCd[b.dataset.cd]
      b.classList.toggle('cool', c > 0)
      b.querySelector('i').textContent = c > 0 ? Math.ceil(c) : ''
    }
  }
  const aimed = () => {
    const n = pick(aimPoint(true))
    if (!n) {
      sfx('error')
      hud.toast('Aim at a passenger first!')
    }
    return n
  }
  function jobSearch() {
    if (jobCd.search > 0) return
    const n = aimed()
    if (!n) return
    jobCd.search = JOBS.searchTime
    pin(n, { kind: 'job', mode: 'tpose', t: JOBS.searchTime, search: true })
    crowd.say(n, ['why me??', 'random check again?!', 'it tickles lol'][Math.floor(Math.random() * 3)], 2)
    hud.prompt('Searching...')
    sfx('pat', { vol: 0.2 })
  }
  function jobHold() {
    const n = aimed()
    if (!n) return
    const pn = pins.get(n)
    if (pn?.kind === 'job') pn.t += JOBS.holdTime
    else pin(n, { kind: 'job', mode: 'idle', t: JOBS.holdTime })
    sfx('stamp')
    crowd.say(n, ['but my gate is closing!!', 'how much longer?', 'ugh, fine.'][Math.floor(Math.random() * 3)], 2)
    hud.toast(`+${JOBS.holdTime}s: ${n.name ?? 'they'} must wait.`)
  }
  function jobLetGo() {
    let k = 0
    for (const [n, pn] of pins) {
      if (pn.kind !== 'job') continue
      release(n)
      crowd.say(n, ['finally!', 'thank you officer!', 'bye!!'][k % 3], 1.6)
      k++
    }
    sfx(k ? 'clearBeep' : 'error', { vol: 0.3 })
    hud.toast(k ? `Let ${k} ${k === 1 ? 'person' : 'people'} go.` : 'Nobody is being held.')
  }
  function jobTakeoff() {
    if (jobCd.takeoff > 0) return
    jobCd.takeoff = JOBS.takeoffCooldown
    trolls.jetFlyover()
    hud.big('CLEARED FOR TAKEOFF!', 'gold', 1.4)
    sendTroll('takeoff')
  }
  function jobTurbulence() {
    if (jobCd.turbulence > 0) return
    jobCd.turbulence = JOBS.turbulenceCooldown
    trolls.turbulence()
    sendTroll('turbulence')
  }

  // --- VIP tag over your head ----------------------------------------------------------------------------------
  const tagCanvas = document.createElement('canvas')
  tagCanvas.width = 256
  tagCanvas.height = 96
  const tg = tagCanvas.getContext('2d')
  function paintTag() {
    tg.clearRect(0, 0, 256, 96)
    tg.fillStyle = '#14213d'
    tg.beginPath()
    tg.roundRect(28, 14, 200, 68, 34)
    tg.fill()
    const g = tg.createLinearGradient(0, 18, 0, 78)
    g.addColorStop(0, '#ffe680')
    g.addColorStop(1, '#ff9d00')
    tg.fillStyle = g
    tg.beginPath()
    tg.roundRect(34, 20, 188, 56, 28)
    tg.fill()
    tg.font = '700 44px Fredoka, Arial'
    tg.textAlign = 'center'
    tg.textBaseline = 'middle'
    tg.lineWidth = 8
    tg.strokeStyle = '#14213d'
    tg.strokeText('★ VIP', 128, 50)
    tg.fillStyle = '#fff'
    tg.fillText('★ VIP', 128, 50)
  }
  paintTag()
  document.fonts?.ready?.then(() => {
    paintTag()
    tagTex.needsUpdate = true
  })
  const tagTex = new CanvasTexture(tagCanvas)
  tagTex.colorSpace = SRGBColorSpace
  const tag = new Sprite(new SpriteMaterial({ map: tagTex, transparent: true, depthWrite: false }))
  tag.scale.set(1.4, 0.52, 1)
  tag.renderOrder = 22
  tag.visible = false
  scene.add(tag)

  // --- Trolls: yours (run + relay) and other players' -----------------------------------------------------------
  function runTroll(id, text = '') {
    if (POWER_TROLLS.includes(id)) powers[id]()
    else if (EXTRA_TROLLS.includes(id)) trolls[id]()
    else if (id === 'announce') powers.announce(text)
  }
  function useTroll(id, text = '') {
    runTroll(id, text)
    sendTroll(id, text)
  }
  function receive({ id, from, text }) {
    if (!isPlaying()) return
    const clean = text.replace(/</g, '&lt;')
    if (id === 'pilotAnnounce') return powers.announce(`✈ Captain ${from}: ${clean}`)
    if (id === 'announce') return powers.announce(`${from}: ${clean}`)
    if (id === 'turbulence') {
      hud.toast(`Captain ${from}: turbulence ahead!`)
      return trolls.turbulence()
    }
    if (id === 'takeoff') {
      hud.toast(`Captain ${from} is taking off!`)
      return trolls.jetFlyover()
    }
    if (!TROLL_NAMES[id]) return
    hud.toast(`${from} used ${TROLL_NAMES[id]}!`)
    runTroll(id)
    if (id === 'killAll') trolls.knockout(player)
    if (id === 'scareAll') trolls.jumpscare()
  }
  function pilotAnnounce(text) {
    powers.announce(`✈ Captain ${getName()}: ${text.replace(/</g, '&lt;')}`)
    sendTroll('pilotAnnounce', text)
  }

  // --- Per frame --------------------------------------------------------------------------------------------------
  const vip = { line: false, sec: false }
  let lastSec = security.mode
  let tick1 = 0
  const pv = new Vector3()

  refreshBar()
  refreshJob()
  store.on((e) => {
    if (['own', 'timed', 'expired', 'hydrate', 'set'].includes(e.type)) {
      refreshBar()
      refreshJob()
    }
  })

  return {
    useTroll,
    receive,
    pilotAnnounce,
    refresh() {
      refreshBar()
      refreshJob()
    },
    // Before crowd.update(): pinned NPCs, the grapple pull, VIP, visits, timers.
    update(dt) {
      cooldown = Math.max(0, cooldown - dt)
      for (const k in jobCd) jobCd[k] = Math.max(0, jobCd[k] - dt)
      const p = player.position
      const playing = isPlaying()
      if (!playing && held) select(null)

      // Pins.
      const yaw = getYaw()
      for (const [n, pn] of pins) {
        if (!n.active) {
          pins.delete(n)
          continue
        }
        if (pn.kind === 'held') {
          // Floating in front of you.
          pn.x += (p.x - Math.sin(yaw) * 2.6 - pn.x) * Math.min(1, dt * 10)
          pn.z += (p.z - Math.cos(yaw) * 2.6 - pn.z) * Math.min(1, dt * 10)
          pn.y += (p.y + 1.3 + Math.sin(performance.now() / 300) * 0.15 - pn.y) * Math.min(1, dt * 8)
          pn.yaw += dt * 2
          if (Math.random() < dt * 8) fx.sparkle(pn.x, pn.y + 1, pn.z, { count: 1, color: '#ffb020', speed: 1, up: 0.5, size: 0.25 })
        } else if (pn.kind === 'thrown') {
          pn.t += dt
          const nx = pn.x + pn.vx * dt
          const nz = pn.z + pn.vz * dt
          if (!segmentClear(pn.x, pn.y + 1, pn.z, nx, pn.y + 1, nz)) {
            pn.vx *= -0.3
            pn.vz *= -0.3
          } else {
            pn.x = nx
            pn.z = nz
          }
          pn.vy -= 22 * dt
          pn.y += pn.vy * dt
          pn.yaw += dt * 9
          if (pn.y <= AIRPORT.walkY) {
            pn.y = AIRPORT.walkY
            sfx('thud', { vol: 0.4 })
            fx.puff(pn.x, pn.y + 0.2, pn.z, { count: 8, size: 0.5, alpha: 0.4 })
            n.koT = 2.5
            Object.assign(pn, { kind: 'landed', t: 3, mode: n.mode === 'float' ? 'idle' : pn.prevMode })
          }
        } else if (pn.kind === 'bonked') {
          pn.t -= dt
          if (pn.t <= 0) {
            fx.puff(n.x, n.y + 0.8, n.z, { count: 12, size: 0.7, alpha: 0.5 })
            const e = TOOLS.entrance
            Object.assign(pn, { kind: 'banished', t: TOOLS.banTime, x: e.x + (Math.random() - 0.5) * 8, z: e.z, y: AIRPORT.walkY, yaw: Math.PI, mode: 'idle' })
            n.koT = 0
            fx.puff(pn.x, pn.y + 0.8, pn.z, { count: 12, size: 0.7, alpha: 0.5 })
            crowd.say(n, ['how did i get OUTSIDE', 'not again...', 'my place in line!!'][Math.floor(Math.random() * 3)], 2.4)
          }
        } else if (pn.kind === 'banished') {
          pn.t -= dt
          pn.z -= 1.4 * dt
          n.speed = 1.4
          if (pn.t <= 0) release(n, true)
        } else {
          pn.t -= dt
          if (pn.t <= 0) {
            if (pn.search) {
              const item = SECURITY.items[Math.floor(Math.random() * SECURITY.items.length)]
              crowd.say(n, `${item.icon} ${item.name}?!`, 2.4)
              sfx('found', { vol: 0.3 })
              store.addCoins(JOBS.searchReward, { x: n.x, y: n.y + 1.6, z: n.z })
              hud.prompt(null)
            }
            release(n)
            continue
          }
        }
        if (pn.kind !== 'banished') n.speed = 0
        n.x = pn.x
        n.y = pn.y
        n.z = pn.z
        n.yaw = pn.yaw
        if (pn.mode) n.mode = pn.mode
      }

      // Grapple: pull toward the hook point.
      if (grapple.on) {
        grapple.t += dt
        pv.set(grapple.to.x - p.x, grapple.to.y - (p.y + 1), grapple.to.z - p.z)
        const d = pv.length()
        if (d < 1.6 || grapple.t > 1.8 || player.frozen || player.auto) {
          grapple.on = false
          rope.visible = false
          player.velocity.y = Math.min(player.velocity.y, 6)
        } else {
          pv.multiplyScalar(TOOLS.grappleSpeed / d)
          player.velocity.x = pv.x
          player.velocity.y = pv.y + 2
          player.velocity.z = pv.z
          const a = rope.geometry.attributes.position
          a.setXYZ(0, p.x, p.y + 1.3, p.z)
          a.setXYZ(1, grapple.to.x, grapple.to.y, grapple.to.z)
          a.needsUpdate = true
        }
      }

      // Crosshair + USE.
      const showCross = playing && !!held && (isLocked() || document.body.classList.contains('touch-ui'))
      cross.classList.toggle('show', showCross)
      useBtn.classList.toggle('show', playing && !!held)
      cross.classList.toggle('hit', showCross && held !== 'airHorn' && held !== 'grapple' && !!pick(aimPoint(false)))

      // VIP: tag + priority boarding (straight to the front of a line, free).
      const isVip = store.has('vip')
      vipTag.style.display = isVip ? '' : 'none'
      tag.visible = isVip && playing && !isFirstPerson()
      if (tag.visible) tag.position.set(player.renderPosition.x, player.renderPosition.y + 2.75, player.renderPosition.z)
      if (isVip && queue.mode === 'line' && !vip.line && queue.skipLine()) {
        vip.line = true
        hud.toast('VIP priority: straight to the front! ★')
      }
      if (queue.mode !== 'line') vip.line = false
      if (isVip && security.mode === 'line' && !vip.sec && security.skipLine()) {
        vip.sec = true
        hud.toast('VIP priority: straight to the front! ★')
      }
      if (security.mode !== 'line') vip.sec = false

      // Destinations: clearing security on a flight there = visited.
      if (security.mode === 'cleared' && lastSec !== 'cleared') {
        const d = DESTINATIONS[queue.destIndex]
        if (d && FEATURED_DESTINATIONS.includes(queue.destIndex) && store.visit(d.code)) {
          const seen = store.data.visited.length
          setTimeout(() => {
            hud.big(`${d.name.toUpperCase()} VISITED!`, 'green', 2)
            hud.toast(`Destinations: ${Math.min(seen, FEATURED_DESTINATIONS.length)} / ${FEATURED_DESTINATIONS.length} visited ✈`)
            sfx('stamp')
          }, 2200)
        }
      }
      lastSec = security.mode

      // Once a second: timers on the hotbar / job panel, timed rewards ending.
      tick1 -= dt
      if (tick1 <= 0) {
        tick1 = 1
        const gone = store.expire()
        for (const id of gone) hud.toast(`${TOOLS.names[id] ?? (id === 'security' ? 'Your security shift' : id)} ran out!`)
        if (gone.length) onHat()
        refreshBar()
        refreshJob()
      }
    },
  }
}
