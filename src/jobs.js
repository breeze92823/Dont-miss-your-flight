// Jobs as modes: Be Security / Be Pilot (`JOBS` in config).
// - Entering costs the job's price every time (PRICES.beSecurity / bePilot), or nothing while a Daily
//   Reward shift for it is running. Exit (or the shift ending, or your plane / flight starting) ends the
//   mode and puts you back where you stood.
// - Security: you stand at a desk on the walkway behind the search mats (frozen in place, the camera
//   still orbits). Passengers walk through from the lanes and stop at your desk: Search the nervous
//   ones (coins for a catch), Let Go the rest, Add Time makes someone wait / a search last longer.
//   They are local bots (only you see them), since the real players are the passengers otherwise.
// - Pilot: your own jet at the west end of the runway. Takeoff rolls it down the runway and lifts off,
//   then you fly it (W/S or joystick up/down climb and dive, A/D turn); Land glides it back onto the
//   runway (coins for a landing). Turbulence + Announce reach everyone in the server.
// While a mode runs the gameplay HUD is swapped for the mode HUD (top banner with Exit, action column
// on the right) so nothing overlaps; see jobs.css.
import './jobs.css'
import { Vector3 } from 'three'
import { AIRPORT, GATES, JOBS, PRICES, SECURITY } from './config.js'
import { store } from './store.js'
import { sfx, turbineLoop } from './audio.js'
import { inputState } from './input.js'
import { sendTroll } from './net.js'
import { makeJet } from './airport/airliner.js'
import { ICON } from './hud/icons.js'

const Y = AIRPORT.walkY
const SJ = JOBS.security
const PJ = JOBS.pilot
const GROUND = Y + GATES.plane.y // jet centre height when it stands on its gear
const GX = 89.5 // walkway east of the search area, up to the gates (as security.js)
const INFO = {
  security: { name: 'Security', label: 'Be Security', price: PRICES.beSecurity, icon: ICON.police, desc: 'Run the checkpoint: search the nervous passengers, let the rest go. You pay each time you clock in.' },
  pilot: { name: 'Pilot', label: 'Be Pilot', price: PRICES.bePilot, icon: ICON.pilot, desc: 'Take your own jet down the runway and fly it. You pay each time you take the controls.' },
}
const SUS_LINES = ['nothing to see here...', 'w-why are you looking at me?', 'my bag is totally normal', '*sweating*', 'i did NOT pack a duck', 'can we hurry this up?', 'officer, i can explain']
const OK_LINES = ['hi officer!', 'here is my pass', 'have a nice day!', 'do i take my shoes off?', 'my flight is soon!', 'hello!']
const WAIT_LINES = ['but my gate is closing!!', 'how much longer?', 'ugh, fine.', 'seriously??']

function el(tag, cls, html = '', parent = null) {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (html) e.innerHTML = html
  parent?.appendChild(e)
  return e
}
function tap(e, fn) {
  e.addEventListener('pointerdown', (ev) => ev.stopPropagation())
  e.addEventListener('click', (ev) => {
    ev.stopPropagation()
    fn(ev)
  })
}
const rand = (a, b) => a + Math.random() * (b - a)
const pickOne = (a) => a[Math.floor(Math.random() * a.length)]
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a))
const damp = (k, dt) => 1 - Math.exp(-k * dt)

// A polyline walked by distance.
function route(points) {
  const cum = [0]
  for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z))
  return {
    points,
    cum,
    len: cum[cum.length - 1],
    at(s, out) {
      let i = 1
      while (i < points.length - 1 && cum[i] < s) i++
      const a = points[i - 1]
      const b = points[i]
      const k = Math.max(0, Math.min(1, (s - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1])))
      out.x = a.x + (b.x - a.x) * k
      out.z = a.z + (b.z - a.z) * k
      out.yaw = Math.atan2(b.x - a.x, b.z - a.z)
      return out
    },
  }
}

export function createJobs({ scene, crowd, fx, hud, trolls, tools, queue, security, boarding, flight, player, teleport, onHat, isPlaying }) {
  const play = hud.root.querySelector('.play') ?? hud.root
  let active = null // 'security' | 'pilot' | null
  let paid = false // false = a free Daily Reward shift
  const back = { x: 0, y: 0, z: 0, facing: 0 }
  const timers = []
  const later = (sec, fn) => timers.push({ t: sec, fn })
  const cd = { turbulence: 0 }
  let lastDt = 1 / 60

  // --- Mode HUD -----------------------------------------------------------------------------------------
  const banner = el('div', 'job-hud', '<span class="jh-ico"></span><span class="jh-txt"><b class="jh-title"></b><span class="jh-info"></span></span>', play)
  const bIco = banner.querySelector('.jh-ico')
  const bTitle = banner.querySelector('.jh-title')
  const bInfo = banner.querySelector('.jh-info')
  const exitBtn = el('button', 'jh-exit', `${ICON.close}<span>Exit</span>`, banner)
  tap(exitBtn, () => {
    sfx('click')
    exit()
  })
  const actions = el('div', 'job-actions', '', play)
  const buttons = {}
  function button(key, label, cls, fn) {
    const b = el('button', `ja-btn ${cls}`, `<span class="t">${label}</span><i></i>`, actions)
    tap(b, () => {
      if (!active || !isPlaying()) return
      fn()
    })
    buttons[key] = b
    return b
  }
  function buildHud(id) {
    actions.innerHTML = ''
    for (const k in buttons) delete buttons[k]
    bIco.innerHTML = INFO[id].icon
    bTitle.textContent = id === 'pilot' ? 'PILOT · IN COMMAND' : 'SECURITY · ON DUTY'
    banner.className = `job-hud show ${id}`
    actions.className = `job-actions show ${id}`
    if (id === 'security') {
      button('search', 'Search', 'b-search', jobSearch)
      button('time', 'Add Time', 'b-time', jobAddTime)
      button('go', 'Let Go', 'b-go', jobLetGo)
    } else {
      button('fly', 'Takeoff', 'b-fly', () => (jet.phase === 'parked' ? takeoff() : land()))
      button('turb', 'Turbulence', 'b-turb', jobTurbulence)
      button('ann', 'Announce', 'b-ann', () => hud.openAnnounce({ pilot: true }))
    }
  }
  function setModeClasses(id) {
    for (const c of ['job-mode', 'job-security', 'job-pilot']) {
      hud.root.classList.remove(c)
      document.body.classList.remove(c)
    }
    banner.classList.toggle('show', !!id)
    actions.classList.toggle('show', !!id)
    if (!id) return
    hud.root.classList.add('job-mode', `job-${id}`)
    document.body.classList.add('job-mode', `job-${id}`)
  }
  const touch = () => document.body.classList.contains('touch-ui')

  // --- Entering / leaving ---------------------------------------------------------------------------------
  function blocked() {
    if (!isPlaying()) return 'Wait for the game to start!'
    if (flight.active) return "You're on your trip! Try again back at the airport."
    if (!['free', 'checked'].includes(queue.mode)) return 'Leave the check-in line first!'
    if (!['off', 'free', 'cleared'].includes(security.mode)) return 'Finish security first!'
    if (!['off', 'wait'].includes(boarding.mode)) return "You're boarding your plane!"
    if (player.frozen || player.auto) return 'Finish what you are doing first!'
    return null
  }
  // Role buttons / Shop / Daily Reward: start the mode (pay, or free during a shift) or leave it.
  function request(id) {
    if (active === id) return exit()
    if (active) {
      sfx('error')
      return hud.toast(`Exit ${INFO[active].name} first!`)
    }
    const why = blocked()
    if (why) {
      sfx('error')
      return hud.toast(why)
    }
    if (store.timeLeft(id) > 0) return enter(id, false)
    hud.confirm(INFO[id].label, INFO[id].price, () => enter(id, true), INFO[id].desc)
  }
  function enter(id, wasPaid) {
    if (active || blocked()) return
    active = id
    paid = wasPaid
    back.x = player.position.x
    back.y = player.position.y
    back.z = player.position.z
    back.facing = player.facing
    store.set('hat', id)
    onHat()
    hud.closeWin()
    hud.cine.fade(1, 200)
    buildHud(id)
    setModeClasses(id)
    player.frozen = true
    later(0.25, () => {
      if (active !== id) return
      if (id === 'security') startSecurity()
      else startPilot()
      hud.cine.fade(0, 450)
      sfx('fanfare')
      hud.big(id === 'pilot' ? 'CAPTAIN ON BOARD!' : 'SECURITY ON DUTY!', 'gold', 1.6)
      hud.toast(id === 'pilot' ? (touch() ? 'Tap Takeoff, then fly with the joystick.' : 'Tap Takeoff, then fly with W/S + A/D.') : 'Search the nervous ones, let the rest go!')
    })
  }
  function exit(reason = '') {
    if (!active) return
    const id = active
    active = null
    if (id === 'security') stopSecurity()
    else stopPilot()
    setModeClasses(null)
    teleport(back, back.facing)
    player.frozen = false
    store.set('hat', null)
    onHat()
    hud.cine.fade(1, 0)
    later(0.05, () => hud.cine.fade(0, 400))
    hud.toast(reason || `Off duty. Tap ${INFO[id].label} to go again (${INFO[id].price} coins).`)
  }

  // --- Security ------------------------------------------------------------------------------------------
  const lanesZ = SECURITY.checkpoints.filter((c) => c.open).map((c) => c.z)
  const travellers = [] // { npc, r, s, sDesk, state: walk | desk | search | leave, t, sus }
  let spawnIn = 0
  const stats = { caught: 0, waved: 0, missed: 0 }
  const tmp = { x: 0, z: 0, yaw: 0 }
  const SD = SJ.desk

  function spawnTraveller() {
    const lz = pickOne(lanesZ.length ? lanesZ : [-24.5])
    const r = route([
      { x: SECURITY.laneEndX + 0.6, z: lz },
      { x: SECURITY.corridorX, z: lz },
      { x: SECURITY.corridorX, z: SD.z },
      { x: SD.x, z: SD.z },
      { x: GX, z: SD.z },
      { x: GX, z: SECURITY.gates.z },
      { x: SECURITY.gates.x - 0.4, z: SECURITY.gates.z },
    ])
    const npc = crowd.add({ x: r.points[0].x, z: r.points[0].z, y: Y, yaw: Math.PI / 2, pack: Math.random() < 0.5 })
    if (!npc) return
    npc.mode = 'idle'
    travellers.push({ npc, r, s: 0, sDesk: r.cum[3], state: 'walk', t: 0, sus: Math.random() < SJ.susChance })
  }
  function startSecurity() {
    stats.caught = stats.waved = stats.missed = 0
    spawnIn = 0.3
    teleport({ x: SJ.post.x, y: Y, z: SJ.post.z }, SJ.post.facing)
  }
  function stopSecurity() {
    for (const tr of travellers) if (tr.npc.active) crowd.remove(tr.npc)
    travellers.length = 0
  }
  // The passenger at your desk (waiting or being searched).
  const front = () => travellers.find((tr) => tr.state === 'desk' || tr.state === 'search') ?? null
  function leave(tr) {
    tr.state = 'leave'
    tr.npc.mode = 'idle'
  }
  function needFront() {
    const f = front()
    if (!f) {
      sfx('error')
      hud.toast('Wait for a passenger to reach your desk!')
    }
    return f
  }
  function jobSearch() {
    const f = needFront()
    if (!f) return
    if (f.state === 'search') return hud.toast('Already searching them!')
    f.state = 'search'
    f.t = JOBS.searchTime
    f.npc.mode = 'tpose'
    crowd.say(f.npc, f.sus ? pickOne(['n-no wait!', 'is this really needed?', 'uh oh']) : pickOne(['why me??', 'random check again?!', 'it tickles lol']), 2)
    sfx('pat', { vol: 0.25 })
  }
  function jobAddTime() {
    const f = needFront()
    if (!f) return
    f.t += JOBS.holdTime
    sfx('stamp')
    crowd.say(f.npc, pickOne(WAIT_LINES), 2)
    hud.toast(`+${JOBS.holdTime}s: they have to wait.`)
  }
  function jobLetGo() {
    const f = needFront()
    if (!f) return
    const searching = f.state === 'search'
    leave(f)
    if (searching) {
      crowd.say(f.npc, 'finally!', 1.6)
      return sfx('clearBeep', { vol: 0.3 })
    }
    if (f.sus) {
      stats.missed++
      crowd.say(f.npc, 'phew... 😅', 1.8)
      sfx('error', { vol: 0.3 })
      hud.toast('They were hiding something! Search the nervous ones.')
    } else {
      stats.waved++
      crowd.say(f.npc, pickOne(['thank you officer!', 'bye!!', 'have a good one!']), 1.6)
      sfx('clearBeep', { vol: 0.3 })
      store.addCoins(SJ.waveReward, { x: f.npc.x, y: f.npc.y + 1.6, z: f.npc.z })
    }
  }
  function finishSearch(tr) {
    const n = tr.npc
    if (tr.sus) {
      const item = pickOne(SECURITY.items)
      stats.caught++
      crowd.say(n, `${item.icon} ${item.name}?!`, 2.6)
      hud.big('CAUGHT!', 'green', 1.2)
      sfx('found', { vol: 0.35 })
      fx.sparkle(n.x, n.y + 1.8, n.z, { count: 14, color: '#ffe95a', speed: 3, up: 2 })
      store.addCoins(SJ.catchReward, { x: n.x, y: n.y + 1.6, z: n.z })
    } else {
      crowd.say(n, 'told you, nothing!', 2)
      hud.toast('Nothing on them.')
      sfx('clearBeep', { vol: 0.3 })
      store.addCoins(SJ.clearReward, { x: n.x, y: n.y + 1.6, z: n.z })
    }
    leave(tr)
  }
  function updateSecurity(dt) {
    // Stay at your desk (Respawn, a knockout etc. can't move you off duty).
    if (Math.hypot(player.position.x - SJ.post.x, player.position.z - SJ.post.z) > 1.5) teleport({ x: SJ.post.x, y: Y, z: SJ.post.z }, SJ.post.facing)
    let waiting = 0
    for (const tr of travellers) if (tr.state !== 'leave') waiting++
    spawnIn -= dt
    if (spawnIn <= 0) {
      spawnIn = rand(SJ.every[0], SJ.every[1])
      if (waiting < SJ.max) spawnTraveller()
    }
    let aheadD = -Infinity // distance-to-desk of the passenger ahead (queue order = spawn order)
    for (let i = travellers.length - 1; i >= 0; i--) if (!travellers[i].npc.active) travellers.splice(i, 1)
    for (let i = 0; i < travellers.length; i++) {
      const tr = travellers[i]
      const n = tr.npc
      if (tools.pinned?.(n)) continue // a tool (handcuffs, gravity gun...) has them
      let moving = false
      if (tr.state === 'walk') {
        const d = tr.sDesk - tr.s
        const target = aheadD === -Infinity ? 0 : aheadD + SJ.spacing
        if (d > target + 0.01) {
          tr.s += Math.min(SJ.speed * dt, d - target)
          moving = true
        } else if (aheadD === -Infinity) {
          tr.state = 'desk'
          tr.t = SJ.patience
          crowd.say(n, tr.sus ? pickOne(SUS_LINES) : pickOne(OK_LINES), 2.6)
          if (tr.sus) n.scare = 0.6
        }
        aheadD = tr.sDesk - tr.s
      } else if (tr.state === 'desk' || tr.state === 'search') {
        aheadD = 0
        tr.t -= dt
        if (tr.state === 'desk' && tr.sus && Math.random() < dt * 0.5) n.scare = 0.4 // fidgeting
        if (tr.t <= 0) {
          if (tr.state === 'search') finishSearch(tr)
          else {
            if (tr.sus) stats.missed++
            crowd.say(n, "nobody's checking? bye!", 1.8)
            leave(tr)
          }
        }
      }
      if (tr.state === 'leave') {
        tr.s += SJ.speed * 1.15 * dt
        moving = true
        if (tr.s >= tr.r.len) {
          crowd.remove(n)
          continue
        }
      }
      tr.r.at(tr.s, tmp)
      n.x = tmp.x
      n.z = tmp.z
      n.y = Y
      n.speed = moving ? SJ.speed : 0
      if (moving) n.yaw = tmp.yaw
      else n.yaw = Math.atan2(SJ.post.x - n.x, SJ.post.z - n.z) // face the officer
      if (tr.state !== 'search' && n.mode === 'tpose') n.mode = 'idle'
    }
    const f = front()
    bInfo.textContent = `Caught ${stats.caught} · Waved through ${stats.waved}${stats.missed ? ` · Missed ${stats.missed}` : ''}`
    for (const k of ['search', 'time', 'go']) buttons[k]?.classList.toggle('cool', !f)
    if (buttons.search) buttons.search.querySelector('i').textContent = f?.state === 'search' ? Math.ceil(f.t) : ''
  }

  // --- Pilot -------------------------------------------------------------------------------------------------
  let model = null
  let engine = null
  const jet = { phase: 'parked', x: 0, y: GROUND, z: 0, yaw: Math.PI / 2, pitch: 0, roll: 0, v: 0, air: 0, turb: 0, warned: false }
  const cam = { pos: new Vector3(), look: new Vector3(), snap: true }
  const fwd = new Vector3()
  function resetJet() {
    Object.assign(jet, { phase: 'parked', x: PJ.start.x, y: GROUND, z: PJ.start.z, yaw: Math.PI / 2, pitch: 0, roll: 0, v: 0, air: 0, turb: 0, warned: false })
    cam.snap = true
  }
  function startPilot() {
    if (!model) {
      model = makeJet()
      model.root.rotation.order = 'YXZ'
      scene.add(model.root)
    }
    model.root.visible = true
    engine ??= turbineLoop()
    resetJet()
    placeJet()
  }
  function stopPilot() {
    if (model) model.root.visible = false
    engine?.stop()
    engine = null
  }
  function takeoff() {
    if (jet.phase !== 'parked') return
    jet.phase = 'roll'
    jet.air = 0
    sfx('rumble', { vol: 0.4 })
    hud.big('CLEARED FOR TAKEOFF!', 'gold', 1.4)
    sendTroll('takeoff')
  }
  function land() {
    if (jet.phase !== 'fly' && jet.phase !== 'climb') return
    jet.phase = 'approach'
    hud.cine.fade(1, 350)
    later(0.4, () => {
      if (active !== 'pilot' || jet.phase !== 'approach') return
      Object.assign(jet, { phase: 'final', x: PJ.start.x - 200, y: GROUND + 32, z: PJ.start.z, yaw: Math.PI / 2, pitch: -0.14, roll: 0, v: 50 })
      cam.snap = true
      hud.cine.fade(0, 450)
      hud.toast('On final approach...')
    })
  }
  function jobTurbulence() {
    if (cd.turbulence > 0) return
    cd.turbulence = JOBS.turbulenceCooldown
    jet.turb = 3
    trolls.turbulence()
    sendTroll('turbulence')
  }
  function integrate(dt) {
    const cp = Math.cos(jet.pitch)
    jet.x += Math.sin(jet.yaw) * cp * jet.v * dt
    jet.y += Math.sin(jet.pitch) * jet.v * dt
    jet.z += Math.cos(jet.yaw) * cp * jet.v * dt
  }
  function updatePilot(dt) {
    const mx = inputState.move.x
    const mz = inputState.move.z
    let rpm = 0.15
    let hint = ''
    if (jet.phase === 'roll') {
      jet.v = Math.min(PJ.cruise, jet.v + PJ.accel * dt)
      jet.pitch += (0 - jet.pitch) * damp(4, dt)
      integrate(dt)
      jet.y = GROUND
      rpm = 0.6 + (jet.v / PJ.cruise) * 0.4
      if (jet.v >= PJ.rotateAt) {
        jet.phase = 'climb'
        sfx('gear', { vol: 0.4 })
      }
      hint = `Rolling... ${Math.round(jet.v * 3.6)} km/h`
    } else if (jet.phase === 'climb') {
      jet.v = Math.min(PJ.cruise, jet.v + PJ.accel * dt)
      jet.pitch += (0.3 - jet.pitch) * damp(2.5, dt)
      integrate(dt)
      jet.air += dt
      rpm = 1
      if (jet.y > GROUND + 45) {
        jet.phase = 'fly'
        hud.toast(touch() ? 'You have control! Joystick up/down to climb or dive, left/right to turn.' : 'You have control! W/S climb or dive, A/D turn.')
      }
    } else if (jet.phase === 'fly') {
      jet.v += (PJ.cruise - jet.v) * damp(1, dt)
      let pitchTo = mz * 0.38
      const alt = jet.y - GROUND
      if (alt < PJ.minAlt && pitchTo < 0.12) pitchTo = 0.12
      if (alt > PJ.maxAlt && pitchTo > 0) pitchTo = 0
      let turn = -mx * PJ.turnRate
      const dx = jet.x - PJ.centre.x
      const dz = jet.z - PJ.centre.z
      if (Math.hypot(dx, dz) > PJ.radius) {
        const want = wrap(Math.atan2(-dx, -dz) - jet.yaw)
        turn = Math.sign(want) * PJ.turnRate
        hint = 'Too far! Turning back to the airport...'
      }
      jet.pitch += (pitchTo - jet.pitch) * damp(2.2, dt)
      jet.yaw = wrap(jet.yaw + turn * dt)
      jet.roll += ((-turn / PJ.turnRate) * 0.55 - jet.roll) * damp(3, dt)
      integrate(dt)
      jet.air += dt
      rpm = 0.8 + Math.max(0, jet.pitch) * 0.6
    } else if (jet.phase === 'final') {
      const touchX = PJ.start.x + 20
      const left = touchX - jet.x
      const want = GROUND + Math.max(0, left) * (32 / 220)
      jet.x += jet.v * dt
      jet.y += (want - jet.y) * damp(6, dt)
      jet.pitch += ((left < 30 ? 0.06 : -0.08) - jet.pitch) * damp(3, dt)
      jet.roll += (0 - jet.roll) * damp(3, dt)
      rpm = 0.45
      if (left <= 0) {
        jet.phase = 'rollout'
        jet.y = GROUND
        sfx('touchdown', { vol: 0.6 })
        fx.puff(jet.x, Y + 0.4, jet.z - 2.5, { count: 10, size: 1.4, alpha: 0.5, spread: 2 })
        fx.puff(jet.x, Y + 0.4, jet.z + 2.5, { count: 10, size: 1.4, alpha: 0.5, spread: 2 })
      }
      hint = `Landing... ${Math.round(Math.max(0, jet.y - GROUND))} m`
    } else if (jet.phase === 'rollout') {
      jet.v = Math.max(0, jet.v - 13 * dt)
      jet.x += jet.v * dt
      jet.y = GROUND
      jet.pitch += (0 - jet.pitch) * damp(4, dt)
      rpm = 0.3 + (jet.v / 50) * 0.4
      if (jet.v <= 0) {
        jet.phase = 'landed'
        if (jet.air >= PJ.minFlight) {
          hud.big('SMOOTH LANDING!', 'green', 1.8)
          sfx('cheer', { vol: 0.5 })
          store.addCoins(PJ.landReward, { x: jet.x, y: jet.y + 4, z: jet.z })
        } else hud.big('LANDED!', 'gold', 1.4)
        later(2.2, () => {
          if (active !== 'pilot' || jet.phase !== 'landed') return
          hud.cine.fade(1, 300)
          later(0.35, () => {
            if (active !== 'pilot') return
            resetJet()
            hud.cine.fade(0, 400)
          })
        })
      }
      hint = 'Braking...'
    } else if (jet.phase === 'parked' || jet.phase === 'landed') {
      jet.v = 0
      hint = jet.phase === 'parked' ? 'Ready on the runway. Tap Takeoff!' : 'Taxiing back...'
    }
    if (jet.phase !== 'fly') jet.roll += (0 - jet.roll) * damp(3, dt)
    jet.turb = Math.max(0, jet.turb - dt)
    cd.turbulence = Math.max(0, cd.turbulence - dt)
    placeJet()
    model?.update(dt, rpm, true)
    engine?.set(0.32, rpm)

    const airborne = ['climb', 'fly', 'approach', 'final'].includes(jet.phase)
    bInfo.textContent = hint || (airborne ? `ALT ${Math.round(jet.y - GROUND)} m · ${Math.round(jet.v * 3.6)} km/h` : '')
    const fly = buttons.fly
    if (fly) {
      const t = jet.phase === 'parked' ? 'Takeoff' : jet.phase === 'fly' || jet.phase === 'climb' ? 'Land' : jet.phase === 'roll' ? 'Rolling...' : 'Landing...'
      if (fly.firstChild.textContent !== t) fly.firstChild.textContent = t
      fly.classList.toggle('cool', !['parked', 'fly', 'climb'].includes(jet.phase))
      fly.classList.toggle('land', jet.phase === 'fly' || jet.phase === 'climb')
    }
    if (buttons.turb) {
      buttons.turb.classList.toggle('cool', cd.turbulence > 0)
      buttons.turb.querySelector('i').textContent = cd.turbulence > 0 ? Math.ceil(cd.turbulence) : ''
    }
  }
  function placeJet() {
    if (!model) return
    const w = jet.turb > 0 ? Math.min(1, jet.turb) : 0
    const tt = performance.now() / 1000
    model.root.position.set(jet.x, jet.y + w * Math.sin(tt * 23) * 0.35, jet.z)
    model.root.rotation.set(-jet.pitch + w * Math.sin(tt * 17) * 0.04, jet.yaw, jet.roll + w * Math.sin(tt * 13) * 0.08)
  }

  // --- Per frame -------------------------------------------------------------------------------------------
  return {
    request,
    exit,
    get active() {
      return active
    },
    // The avatar is hidden while you sit in the cockpit.
    hidesPlayer: () => active === 'pilot',
    // Shadows follow the jet while you fly it.
    focus: () => (active === 'pilot' && model ? model.root.position : null),
    // Before the camera + tools.update (travellers are placed, tools may pin them after).
    update(dt) {
      lastDt = dt
      for (let i = timers.length - 1; i >= 0; i--) {
        timers[i].t -= dt
        if (timers[i].t <= 0) timers.splice(i, 1)[0].fn()
      }
      // The hat is the mode: nothing else keeps it on (a saved hat from an old session comes off).
      const want = active ?? null
      if ((store.data.hat ?? null) !== want) {
        store.set('hat', want)
        onHat()
      }
      if (!active) return
      // The mode ends when its free shift does, or when the trip moves on without you.
      if (!paid && store.timeLeft(active) <= 0) return exit('Your free shift is over!')
      if (flight.active || !['off', 'wait'].includes(boarding.mode)) return exit('Your plane is here! Off duty.')
      player.frozen = true // a knockout etc. un-freezes you; the job keeps you in place
      if (active === 'security') updateSecurity(dt)
      else updatePilot(dt)
      const left = paid ? 0 : store.timeLeft(active)
      if (left) bInfo.textContent += `${bInfo.textContent ? ' · ' : ''}free shift ${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`
    },
    // Drives the camera while you fly (returns true), like boarding.camera / flight.camera.
    camera(camera) {
      if (active !== 'pilot' || !model) return false
      const hx = Math.sin(jet.yaw)
      const hz = Math.cos(jet.yaw)
      const parked = jet.phase === 'parked' || jet.phase === 'landed'
      const dist = parked ? 48 : 44
      const up = parked ? 14 : 18
      const want = fwd.set(jet.x - hx * dist, jet.y + up, jet.z - hz * dist)
      if (cam.snap) cam.pos.copy(want)
      else cam.pos.lerp(want, damp(3.5, lastDt))
      cam.pos.y = Math.max(cam.pos.y, Y + 2)
      // Look a little below the jet in the air so the ground (and the airport) stays in view.
      const look = cam.look.set(jet.x + hx * 14, jet.y + (parked ? 2 : -8) + Math.sin(jet.pitch) * 10, jet.z + hz * 14)
      cam.snap = false
      camera.position.copy(cam.pos)
      camera.lookAt(look)
      return true
    },
  }
}
