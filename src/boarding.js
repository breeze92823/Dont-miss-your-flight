// Past security, until you step onto the jet bridge. Clearing security starts your plane's clock
// ("PLANE ARRIVING IN 3:30", Skip Time for coins). The concourse and your gate hall are busy: shop
// clerks, people walking to their gates, passengers waiting in the rows of seats each with their
// own countdown floating over their head, the Sky Lounge with its bouncer and bartender. You can
// sit anywhere (walk into a seat). When the clock runs out a short cutscene shows your plane
// taxiing in ("Your plane is here!"); boarding opens: everyone on your flight gets up and lines up,
// the gate agent scans boarding passes ("Next!", "Enjoy your flight!"), and when it's your turn you
// walk through the scanners and the door into the jet bridge -> "now boarding" -> flight.js.
import { Quaternion, Vector3 } from 'three'
import { AIRPORT, DESTINATIONS, GATES, PRICES, QUEUE } from './config.js'
import { player, resetPlayer } from './player.js'
import { lineStepClear } from './lineBlockers.js'
import { syncYawToPlayer } from './camera.js'
import { inputState } from './input.js'
import { sfx, turbineLoop } from './audio.js'
import { angTo, lineTurn, linesOnServer, makePath, myTicket, syncRemoteLine } from './linepath.js'
import { skipLineOnServer } from './net.js'
import { seating, sit, standUp } from './seating.js'
import { floatText, fmtClock as clock } from './airport/gates.js'

const Y = AIRPORT.walkY
const G = GATES
const C = G.corridor
const HL = G.hall
const LG = G.lounge
const rr = (a, b) => a + Math.random() * (b - a)
const pick = (a) => a[Math.floor(Math.random() * a.length)]
const ease = (t) => t * t * (3 - 2 * t)
const lerp = (a, b, t) => a + (b - a) * t
const inRect = (x, z, x0, x1, z0, z1) => x > Math.min(x0, x1) && x < Math.max(x0, x1) && z > Math.min(z0, z1) && z < Math.max(z0, z1)
export const inGateArea = (x, z) => inRect(x, z, 92, C.x1, -17, HL.zN - 4)
export const inGateHall = (x, z) => inRect(x, z, HL.x0, HL.x1, HL.zS, HL.zN)
export const inLounge = (x, z) => inRect(x, z, LG.x0, LG.x1, LG.zS, LG.zN)

// remote (remote.js): real passengers take places in the boarding line and hold the scanner.
export function createBoarding({ scene, crowd, gates, secHall, hud, store, queue, security, fx, onBoarded, remote = null }) {
  const LINE = makePath(G.linePath)
  const slotS = (i) => LINE.total - i * QUEUE.spacing
  const tmp = {}
  const v = new Vector3()
  const bx = G.boardX
  const RO = G.rotunda
  const PX = G.plane.x
  const PZ = G.plane.z
  const st = { mode: 'off', wait: G.waitTime, entry: null, leaveHeld: 0, route: null, t: 0, cut: null, prevFrozen: false, loungeT: 0, bounceT: 0, offered: false, aside: false, said: '' }
  const line = []
  const walkers = []
  const sitters = [] // { npc, seat, left, same }
  const timers = []
  const later = (sec, fn) => timers.push({ t: sec, fn })
  let camRef = null
  let jetSound = null
  let scanBusy = false
  let serveIn = 0
  const turn = lineTurn('boarding') // online: the server says when it's your turn at the scanner
  let extraIn = 0
  let extraLeft = 0
  let corridorIn = 2
  let refillIn = 6
  let chatIn = 4
  let doorK = 0
  let secDoorK = 0
  const dest = () => DESTINATIONS[queue.destIndex] ?? DESTINATIONS[0]

  // --- Staff --------------------------------------------------------------------------------------
  const uniform = { shirt: '#1d2b52', arms: '#1d2b52', pants: '#16203d', hat: true, hatColor: '#16203d', bag: null, pack: false }
  const agent = crowd.add({ ...uniform, x: gates.agentSpot.x, z: gates.agentSpot.z, y: Y, yaw: gates.agentSpot.yaw, name: 'gate agent' })
  if (agent) agent.mode = 'type'
  const bouncer = crowd.add({ x: gates.bouncerSpot.x, z: gates.bouncerSpot.z, y: Y, yaw: gates.bouncerSpot.yaw, bag: null, pack: false, print: true, hat: true, hatColor: '#15171c', shirt: '#1b1d22', arms: '#1b1d22', pants: '#15171c', name: 'security' })
  const bartender = crowd.add({ x: gates.bartender.x, z: gates.bartender.z, y: Y, yaw: gates.bartender.yaw, bag: null, pack: false, shirt: '#f4f4f4', arms: '#f4f4f4', pants: '#15171c', name: 'bartender' })
  if (bartender) bartender.mode = 'type'
  for (const sh of G.shops) {
    const w = sh.x1 - sh.x0
    const clerk = crowd.add({ x: (sh.x0 + sh.x1) / 2 + w * 0.18, z: -18.6, y: Y, yaw: Math.PI, bag: null, pack: false, shirt: pick(['#d6232e', '#2a62d8', '#3fae6b', '#1d1f24']), name: 'shop' })
    if (clerk) clerk.mode = Math.random() < 0.5 ? 'type' : 'idle'
  }

  // --- Seated passengers, each with their own countdown ----------------------------------------------
  const seatY = (s) => s.y - 0.555
  const seatFront = (s, d = 1.8) => ({ x: s.x + Math.sin(s.yaw) * d, z: s.z + Math.cos(s.yaw) * d })
  const freeSeats = (list) => list.filter((s) => !s.npc && !s.player)
  function seatNpc(npc, s) {
    s.npc = npc
    npc.x = s.x
    npc.z = s.z
    npc.y = seatY(s)
    npc.yaw = s.yaw
    npc.speed = 0
    npc.mode = 'sit'
    npc.hasBag = false
    npc.data.phone = Math.random() < 0.4
  }
  function addSitter(s, { same = false, left = rr(40, 420) } = {}) {
    const npc = crowd.add({ x: s.x, z: s.z, y: seatY(s), yaw: s.yaw, bag: null })
    if (!npc) return null
    seatNpc(npc, s)
    const e = { npc, seat: s, left, same }
    sitters.push(e)
    return e
  }
  {
    const pool = [...gates.seats].sort(() => Math.random() - 0.5)
    // Seated bot passengers only when there are any (PASSENGERS.bots).
    const seedBots = (remote?.botShare() ?? 1) > 0
    for (let i = 0; seedBots && i < G.startSeated && i < pool.length; i++) addSitter(pool[i])
    if (seedBots) for (const s of gates.loungeSeats.slice(0, 4)) if (Math.random() < 0.8) addSitter(s, { left: rr(200, 600) })
  }
  function unseat(e) {
    const i = sitters.indexOf(e)
    if (i >= 0) sitters.splice(i, 1)
    e.seat.npc = null
    const n = e.npc
    n.mode = 'idle'
    n.y = Y
    const f = seatFront(e.seat, 0.9)
    n.x = f.x
    n.z = f.z
  }
  // Out of the rows: along the legroom to the middle aisle, then out of the hall.
  function routeOutOfRow(s) {
    const f = seatFront(s)
    return [{ x: f.x, z: f.z }, { x: 125.1, z: f.z }, { x: 125.3, z: -34 }]
  }
  function routeToSeat(s) {
    const f = seatFront(s)
    return [{ x: 125.3, z: -34.5 }, { x: 125.1, z: f.z }, { x: s.x, z: f.z }, { x: s.x, z: s.z }]
  }

  // --- Walking ------------------------------------------------------------------------------------
  function walk(npc, route, speed, done) {
    const old = walkers.findIndex((w) => w.npc === npc)
    if (old >= 0) walkers.splice(old, 1)
    walkers.push({ npc, route, i: 0, speed, done })
  }
  function updateWalkers(dt) {
    for (let i = walkers.length - 1; i >= 0; i--) {
      const w = walkers[i]
      const n = w.npc
      if (!n.active) {
        walkers.splice(i, 1)
        continue
      }
      const p = w.route[w.i]
      const dx = p.x - n.x
      const dz = p.z - n.z
      const d = Math.hypot(dx, dz)
      const step = Math.min(d, w.speed * dt)
      if (d > 1e-4) {
        n.x += (dx / d) * step
        n.z += (dz / d) * step
        n.yaw = angTo(n.yaw, Math.atan2(dx, dz), dt * 8)
      }
      n.speed = step / dt
      if (d < 0.05) {
        w.i++
        if (w.i >= w.route.length) {
          walkers.splice(i, 1)
          n.speed = 0
          w.done?.()
        }
      }
    }
  }
  // Somewhere to disappear to along the concourse: another gate, a shop, the far end.
  const corridorExits = () => [
    ...G.fakeGates.map((g) => ({ x: g.x, z: C.zN + 0.9 })),
    { x: C.x1 - 0.8, z: -28 },
    ...G.shops.map((s) => ({ x: s.x0 + 2, z: C.zS - 0.3 })),
  ]
  function wander(npc) {
    const to = pick(corridorExits())
    walk(npc, [{ x: rr(96, 170), z: rr(-31, -25) }, { x: to.x, z: to.z }], rr(2.6, 3.6), () => crowd.remove(npc))
  }
  // Called by security.js when someone clears the checkpoint: through the gates door into the concourse.
  function adopt(npc) {
    walk(npc, [{ x: 95, z: -28 }], 3, () => wander(npc))
  }

  // --- Timers floating over waiting passengers (and you) ---------------------------------------------
  const tags = Array.from({ length: 14 }, () => {
    const f = floatText(scene, 1.5, { lines: 1, renderOrder: 18 })
    f.sp.visible = false
    return { f, who: null }
  })
  const mine = floatText(scene, 1.5, { lines: 1, renderOrder: 18 })
  mine.sp.visible = false
  let tagT = 0
  const near = []
  function updateTags(dt) {
    tagT -= dt
    if (tagT <= 0 && camRef) {
      tagT = 0.3
      near.length = 0
      for (const e of sitters) {
        const d = (e.npc.x - camRef.position.x) ** 2 + (e.npc.z - camRef.position.z) ** 2
        if (d < 26 * 26) near.push([d, e])
      }
      near.sort((a, b) => a[0] - b[0])
    }
    tags.forEach((tg, i) => {
      const e = near[i]?.[1]
      if (!e || !e.npc.active || !sitters.includes(e)) {
        tg.f.sp.visible = false
        return
      }
      const left = e.same && (st.mode === 'wait' || st.mode === 'off') ? st.wait + e.left * 0 : e.left
      tg.f.sp.visible = true
      tg.f.set('', clock(Math.max(0, left)))
      tg.f.sp.position.set(e.npc.x, e.npc.y + 2.45, e.npc.z)
    })
    const showMine = st.mode === 'wait'
    mine.sp.visible = showMine
    if (showMine) {
      mine.set('', clock(st.wait))
      mine.sp.position.set(player.renderPosition.x, player.renderPosition.y + 2.75, player.renderPosition.z)
    }
  }

  // --- The boarding line ----------------------------------------------------------------------------
  function joinLine(npc) {
    line.push({ npc, s: 0 })
    refreshHud()
  }
  function toLine(npc) {
    LINE.at(0, tmp)
    walk(npc, [{ x: 136.5, z: -36.5 }, { x: tmp.x, z: tmp.z }], rr(2.8, 3.4), () => joinLine(npc))
  }
  function serveNpc(npc) {
    scanBusy = true
    walk(npc, [{ x: bx, z: G.scanZ + 0.4 }], 2.4, () => {
      npc.yaw = Math.PI
      if (agent) crowd.say(agent, pick(G.agentLines), 2)
      gates.flashScanner(Math.random() < 0.5 ? 0 : 1)
      sfx('scanOk', { vol: vol(bx, G.scanZ, 0.3) })
      later(0.9, () => {
        walk(npc, [{ x: bx, z: G.doorZ + 0.2 }, { x: bx, z: G.doorZ - 1.4 }, { x: RO.x, z: RO.z - 0.4 }], 2.8, () => crowd.remove(npc))
        later(0.6, () => (scanBusy = false))
      })
    })
  }
  const vol = (x, z, k = 0.3) => (camRef ? Math.max(0, k - camRef.position.distanceTo(v.set(x, 1.5, z)) * 0.012) : 0)
  const playerIndex = () => line.indexOf(st.entry)
  function refreshHud() {
    if (st.mode !== 'line') return
    const i = playerIndex()
    hud.setLine(i + 1)
    hud.status(i <= 1 ? "You're next!" : null)
  }

  // --- HUD while waiting ---------------------------------------------------------------------------------
  function skipTime() {
    if (st.mode !== 'wait') return
    hud.confirm('Skip Time', PRICES.skipTime, () => {
      st.wait = 0
      hud.toast('Your plane is on its way in!')
    }, 'Skip the wait: your plane pulls up to the gate right now.')
  }
  function waitHud() {
    hud.planeTimer(clock(st.wait))
    hud.action({ label: `Plane arriving in ${clock(st.wait)}`, text: 'Skip Time', color: 'blue', price: PRICES.skipTime, onTap: skipTime })
  }
  function clearHud() {
    hud.planeTimer(null)
    hud.action(null)
    hud.setLine(null)
    hud.status(null)
  }

  // --- Plane arrival cutscene ------------------------------------------------------------------------------
  const camPos = new Vector3()
  const camLook = new Vector3()
  const q = new Quaternion()
  function startArrival() {
    st.mode = 'arrive'
    st.cut = { t: 0, said: 0 }
    clearHud()
    if (seating.active) {
      // stay seated: the cutscene doesn't move you
    }
    st.prevFrozen = player.frozen
    player.frozen = true
    player.auto = null
    gates.jet.root.visible = true
    gates.jet.root.position.set(PX + 110, Y + G.plane.y, PZ)
    jetSound ??= turbineLoop()
    hud.setMode('cutscene')
    hud.cine.bars(true)
    hud.cine.skip(true)
    hud.cine.onSkip(() => endArrival())
    sfx('whoosh', { vol: 0.25, dur: 0.8 })
  }
  function updateArrival(dt) {
    const c = st.cut
    c.t += dt
    const T = 9.5
    const u = Math.min(1, c.t / T)
    const x = PX + 110 * (1 - u) * (1 - u)
    const J = gates.jet.root
    J.position.x = x
    J.position.y = Y + G.plane.y + (u >= 1 ? Math.sin(Math.min(1.2, c.t - T) * 9) * 0.04 * Math.max(0, 1 - (c.t - T)) : 0)
    const rpm = u < 1 ? 0.42 : Math.max(0.04, 0.42 - (c.t - T) * 0.35)
    gates.jet.update(dt, rpm, true)
    if (jetSound && camRef) {
      const d = camRef.position.distanceTo(J.position)
      jetSound.set(Math.min(0.55, 34 / (d + 20)) * (c.t < 5 ? 0.45 : 1), rpm)
    }
    if (u >= 1 && c.said < 1) {
      c.said = 1
      sfx('brake', { vol: 0.35 })
    }
    if (c.t > 5.6 && c.said < 2) {
      c.said = 2
      hud.cine.subtitle('Your plane is here!')
      sfx('chime')
    }
    if (c.t > T + 0.8 && c.said < 3) {
      c.said = 3
      sfx('gear', { vol: 0.4 })
    }
    // the jet bridge swings over and docks
    if (c.t > 9.9) {
      const k = 1 - Math.min(1, (c.t - 9.9) / 2.6)
      gates.setBridge(k)
      if (c.said < 4) {
        c.said = 4
        sfx('belt', { vol: 0.35 })
      }
      if (k <= 0 && c.said < 5) {
        c.said = 5
        sfx('pneumatic', { vol: 0.35 })
      }
    }
    if (c.t > 13.4) endArrival()
  }
  function arrivalCam(camera) {
    const c = st.cut
    const J = gates.jet.root.position
    if (c.t < 5) {
      // from inside the gate, through the glass: the plane rolls in
      camPos.set(150.9, Y + 2.3, HL.zN + 0.8)
      camLook.set(J.x - 4, J.y + 0.4, J.z)
      camera.fov = 46
    } else if (c.t < 9.9) {
      // low on the apron by the wing as it brakes to a stop
      const k = ease(Math.min(1, (c.t - 5) / 4.9))
      camPos.set(lerp(PX - 6, PX - 11, k), lerp(Y + 2.0, Y + 2.8, k), lerp(PZ + 11.5, PZ + 14.5, k))
      camLook.set(lerp(PX + 6, PX + 2, k), Y + 3.4, PZ)
      camera.fov = 56
    } else {
      // high and wide: the jet bridge swings over to the door
      const k = ease(Math.min(1, (c.t - 9.9) / 3.5))
      camPos.set(lerp(160, 157, k), Y + 8.5, lerp(-63.5, -64.5, k))
      camLook.set(147, Y + 2.2, -78)
      camera.fov = 52
    }
    camera.position.copy(camPos)
    camera.lookAt(camLook)
    camera.updateProjectionMatrix()
  }
  function parkJet() {
    gates.jet.root.visible = true
    gates.jet.root.position.set(PX, Y + G.plane.y, PZ)
    gates.setBridge(0)
  }
  function endArrival() {
    if (st.mode !== 'arrive') return
    st.cut = null
    parkJet()
    hud.cine.subtitle(null)
    hud.cine.bars(false)
    hud.cine.skip(false)
    hud.setMode('play')
    player.frozen = seating.active ? true : st.prevFrozen && false
    jetSound?.set(0.08, 0.05)
    openBoarding()
  }
  function openBoarding() {
    st.mode = 'open'
    sfx('pa')
    hud.big('BOARDING NOW!', 'green', 1.8)
    hud.toast(`Gate ${dest().gate}: boarding has started!`)
    // everyone on your flight gets up and lines up
    let k = 0
    for (const e of [...sitters]) {
      if (!e.same) continue
      later(0.4 + k++ * 0.7, () => {
        if (!sitters.includes(e)) return
        unseat(e)
        const out = routeOutOfRow(e.seat)
        LINE.at(0, tmp)
        walk(e.npc, [...out, { x: 136.5, z: -36.5 }, { x: tmp.x, z: tmp.z }], rr(2.8, 3.4), () => joinLine(e.npc))
      })
    }
    extraLeft = 9
    extraIn = 1
  }

  // --- The player in line / at the desk ------------------------------------------------------------------
  function join() {
    if (store.has('vip')) {
      hud.toast('VIP priority boarding: straight to the desk! ★')
      st.route = [{ x: 155.6, z: -38.5 }, { x: 155.6, z: -58.4 }, { x: bx + 0.6, z: -58.6 }]
      goTurn(true)
      return
    }
    st.mode = 'line'
    st.entry = { player: true, s: LINE.project(player.position.x, player.position.z) }
    line.push(st.entry)
    st.leaveHeld = 0
    sfx('pop')
    hud.big("You're in line!", 'green', 1.2)
    refreshHud()
  }
  function leaveLine() {
    const i = line.indexOf(st.entry)
    if (i >= 0) line.splice(i, 1)
    st.entry = null
    st.mode = 'open'
    player.auto = null
    hud.setLine(null)
    hud.status(null)
    hud.toast('You left the line')
  }
  function goTurn(priority = false) {
    st.mode = 'turn'
    st.entry = null
    hud.setLine(null)
    hud.big('YOUR TURN!', 'gold', 1.6)
    sfx('fanfare')
    hud.status("You're up!")
    if (!priority) st.route = [{ x: bx, z: -57.6 }]
    st.route.push({ x: bx, z: G.scanZ + 0.45 })
    if (agent) crowd.say(agent, 'Next!', 2)
  }
  function teleport(x, z, face) {
    fx.puff(player.position.x, player.position.y + 0.8, player.position.z, { count: 14, color: '#ffffff', size: 0.5, alpha: 0.6, life: 0.7, speed: 2 })
    resetPlayer({ x, y: Y + 0.02, z }, face)
    syncYawToPlayer()
    fx.sparkle(x, Y + 1, z, { count: 24, color: '#7cf0ff', speed: 4 })
    sfx('whoosh', { vol: 0.5, dur: 0.4 })
  }

  // --- Sky Lounge: bouncer + perk -------------------------------------------------------------------------
  function updateLounge(dt) {
    const pp = player.position
    const has = store.has('lounge')
    gates.setLoungeOpen(has)
    const B = gates.bouncerSpot
    if (bouncer) {
      const tx = has ? B.aside.x : B.x
      const tz = has ? B.aside.z : B.z
      bouncer.x += (tx - bouncer.x) * Math.min(1, dt * 3)
      bouncer.z += (tz - bouncer.z) * Math.min(1, dt * 3)
      bouncer.speed = Math.hypot(tx - bouncer.x, tz - bouncer.z) * 3
    }
    const close = Math.hypot(pp.x - (B.x + 0.6), pp.z - B.z) < 3.4
    st.bounceT -= dt
    if (close && bouncer && st.bounceT <= 0) {
      st.bounceT = 4.5
      if (has) {
        crowd.say(bouncer, pick(['Welcome back!', 'Enjoy the lounge!', 'Right this way.']), 2.4)
      } else {
        crowd.say(bouncer, pick(G.bouncerLines), 2.6)
        bouncer.mode = 'point'
        later(1.4, () => bouncer.mode === 'point' && (bouncer.mode = 'idle'))
        if (!st.offered) {
          st.offered = true
          sfx('error')
          hud.confirm('Sky Lounge Pass', PRICES.loungePass, () => {
            store.own('passes', 'lounge')
            hud.big('SKY LOUNGE UNLOCKED!', 'gold', 1.8)
            sfx('fanfare')
            fx.confetti(B.x, Y + 2.5, B.z, 40)
          }, `Members & pass holders only. Get the Sky Lounge Pass: comfy chairs and +${G.loungeCoins} coins every ${G.loungeEvery} s inside.`)
        }
      }
    }
    if (!close) st.offered = false
    // the perk
    if (has && inLounge(pp.x, pp.z)) {
      st.loungeT += dt
      if (st.loungeT >= G.loungeEvery) {
        st.loungeT = 0
        sfx('pour', { vol: 0.35 })
        if (bartender) crowd.say(bartender, pick(['On the house!', 'Your usual?', 'Enjoy!']), 2)
        store.addCoins(G.loungeCoins, { x: pp.x, y: pp.y + 1.6, z: pp.z })
        fx.sparkle(pp.x, pp.y + 1.8, pp.z, { count: 14, color: '#ffd84a', speed: 3 })
      }
    }
  }

  // --- Player seat trigger ---------------------------------------------------------------------------------
  function trySit() {
    if (seating.active || seating.cooldown > 0 || player.frozen || player.auto) return
    if (!['off', 'wait', 'open'].includes(st.mode)) return
    const pp = player.position
    if (!inGateArea(pp.x, pp.z) && !inLounge(pp.x, pp.z)) return
    const lounge = inLounge(pp.x, pp.z)
    const list = lounge ? gates.loungeSeats : gates.seats
    const reach = lounge ? 1.1 : 0.98
    let best = null
    let bd = reach
    for (const s of list) {
      if (s.npc || s.player) continue
      const dx = pp.x - s.x
      const dz = pp.z - s.z
      const d = Math.hypot(dx, dz)
      if (d >= bd) continue
      if (dx * Math.sin(s.yaw) + dz * Math.cos(s.yaw) < -0.2) continue // from behind: no
      best = s
      bd = d
    }
    if (!best) return
    if (lounge && !store.has('lounge')) return
    best.player = true
    const f = seatFront(best, lounge ? 0.95 : 1.0)
    sit(best, { x: f.x, y: Y + 0.02, z: f.z }, { onStand: () => (best.player = false) })
  }

  // --- Doors -----------------------------------------------------------------------------------------------
  function updateDoors(dt) {
    const pp = player.position
    let near = false
    let secNear = false
    for (const n of crowd.list) {
      if (Math.abs(n.x - bx) < 2.2 && Math.abs(n.z - G.doorZ) < 3.2) near = true
      if (Math.abs(n.x - 92) < 3.5 && Math.abs(n.z + 28) < 3) secNear = true
    }
    if (['gate', 'bridge'].includes(st.mode) || (Math.abs(pp.x - bx) < 2.2 && Math.abs(pp.z - G.doorZ) < 3 && st.mode === 'turn')) near = true
    if (security.mode === 'cleared' && Math.abs(pp.x - 92) < 5 && Math.abs(pp.z + 28) < 3.5) secNear = true
    const want = near ? 1 : 0
    if ((want > 0.5) !== (doorK > 0.5) && Math.abs(want - doorK) > 0.9) sfx('pneumatic', { vol: vol(bx, G.doorZ, 0.35) })
    doorK += Math.sign(want - doorK) * Math.min(Math.abs(want - doorK), dt * 2.2)
    gates.setBoardDoor(doorK)
    const sw = secNear ? 1 : 0
    if (Math.abs(sw - secDoorK) > 0.95) sfx('slide', { vol: vol(92, -28, 0.4) })
    secDoorK += Math.sign(sw - secDoorK) * Math.min(Math.abs(sw - secDoorK), dt * 1.9)
    secHall.setGateDoor?.(secDoorK)
  }

  // --- Info screens + sign text ------------------------------------------------------------------------------
  let lastDest = -1
  let blink = 0
  function updateSigns(dt) {
    if (queue.destIndex !== lastDest) {
      lastDest = queue.destIndex
      gates.setFlight(lastDest)
    }
    blink += dt
    const d = dest()
    const head = `${d.flight.toLowerCase()}  |  ${d.name.toLowerCase()}  |  gate ${d.gate}`
    const waiting = st.mode === 'off' || st.mode === 'wait'
    if (waiting) {
      const tleft = st.mode === 'off' ? G.waitTime : st.wait
      gates.info.set(head, clock(tleft), 'until your plane arrives', false)
      gates.doorTimer.set('boarding opens in', clock(tleft))
      gates.entranceTimer.set('plane arriving in', clock(tleft))
    } else if (st.mode === 'arrive') {
      gates.info.set(head, 'arrived', 'boarding soon', true)
      gates.doorTimer.set('', '')
      gates.entranceTimer.set('', '')
    } else {
      gates.info.set(head, 'boarding', 'please have your boarding pass ready', true)
      gates.doorTimer.set('', Math.floor(blink * 2) % 2 ? 'now boarding' : '')
      gates.entranceTimer.set('', Math.floor(blink * 2) % 2 ? 'now boarding' : '')
    }
  }

  // =====================================================================================================
  const api = {
    adopt,
    get mode() {
      return st.mode
    },
    get waitLeft() {
      return st.wait
    },
    // Dev: set the plane clock.
    devWait(sec) {
      st.wait = sec
    },
    // For main.js: who is indoors (ambience) and which prompts to show.
    prompts() {
      if (st.mode === 'off' || st.mode === 'gone') return null
      const pp = player.position
      const n = dest().gate
      if (st.mode === 'wait') return { prompt: inGateArea(pp.x, pp.z) || inLounge(pp.x, pp.z) ? null : `Head to gate ${n}! →`, hint: null }
      if (st.mode === 'open') return { prompt: inGateHall(pp.x, pp.z) ? 'Walk to the queue!' : `Gate ${n} is boarding now!`, hint: null }
      return { prompt: null, hint: null }
    },
    // NPCs standing in the boarding line (solid to the player, see lineBlockers.js).
    // solidOnly: just the bots (real passengers are never solid: the server keeps the order).
    lineNpcs(out, solidOnly = false) {
      for (const e of line) if (e.npc || (e.remote && !solidOnly)) out.push(e.npc ?? e.remote)
      return out
    },
    // For the other passengers (net trip): standing in this line / at the scanner.
    get inLine() {
      return st.mode === 'line'
    },
    get hold() {
      return st.mode === 'turn' || st.mode === 'scan' ? 'scan' : ''
    },
    skipLine() {
      if (st.mode !== 'line') return false
      const i = line.indexOf(st.entry)
      line.splice(i, 1)
      line.unshift(st.entry)
      st.entry.s = LINE.total
      LINE.at(LINE.total, tmp)
      teleport(tmp.x, tmp.z, tmp.yaw)
      skipLineOnServer('boarding')
      refreshHud()
      return true
    },
    canFastBoard() {
      if (['turn', 'scan', 'gate', 'bridge', 'gone'].includes(st.mode)) {
        hud.toast("You're already boarding!")
        return false
      }
      return true
    },
    // Board The Plane once you're through security: skip the wait + the line, straight to the desk.
    fastBoard() {
      if (seating.active) standUp()
      if (st.mode === 'arrive') endArrival()
      if (st.mode === 'off' || st.mode === 'wait') {
        st.wait = 0
        parkJet()
        jetSound ??= turbineLoop()
        openBoarding()
      }
      if (st.mode === 'line') {
        const i = line.indexOf(st.entry)
        if (i >= 0) line.splice(i, 1)
      }
      teleport(bx, -57.4, Math.PI)
      st.route = []
      goTurn(true)
      hud.big('FAST TRACK!', 'gold', 1.4)
      return true
    },
    // A new trip (Fly Again): back to square one.
    reset() {
      st.mode = 'off'
      st.wait = G.waitTime
      st.entry = null
      for (const e of line) if (e.npc) crowd.remove(e.npc)
      line.length = 0
      gates.jet.root.visible = false
      gates.setBridge(1)
      gates.marker.visible = false
      gates.pad.visible = false
      clearHud()
      for (const e of sitters) e.same = false
    },
    // Main hands the camera to us during the arrival cutscene.
    camera(camera) {
      if (st.mode !== 'arrive' || !st.cut) return false
      arrivalCam(camera)
      return true
    },
    // Before physics: walking into seats.
    preUpdate() {
      trySit()
    },
    update(dt, t, camera) {
      camRef = camera
      for (let i = timers.length - 1; i >= 0; i--) {
        timers[i].t -= dt
        if (timers[i].t <= 0) timers.splice(i, 1)[0].fn()
      }
      updateSigns(dt)
      updateDoors(dt)
      updateWalkers(dt)
      updateLounge(dt)
      gates.update(dt, t)
      for (const nb of gates.neighbours) nb.update(dt, 0.02, true)

      // Clock: starts once you're through security.
      if (st.mode === 'off' && security.mode === 'cleared' && queue.mode === 'checked') {
        st.mode = 'wait'
        st.wait = G.waitTime
        // some of the people waiting are on your flight
        const pool = sitters.filter((e) => gates.seats.includes(e.seat)).sort(() => Math.random() - 0.5)
        pool.slice(0, G.sameFlight).forEach((e) => (e.same = true))
        hud.toast(`Your flight leaves from gate ${dest().gate}. Find a seat!`)
      }
      if (st.mode === 'wait') {
        st.wait = Math.max(0, st.wait - dt)
        waitHud()
        if (st.wait <= 0) startArrival()
      } else if (st.mode === 'arrive') {
        updateArrival(dt)
      } else if (gates.jet.root.visible) {
        gates.jet.update(dt, 0.04, true)
        if (jetSound && camRef) jetSound.set(Math.min(0.12, 12 / (camRef.position.distanceTo(gates.jet.root.position) + 30)), 0.06)
      }

      // Seated passengers' clocks: when theirs runs out they head off to their gate; newcomers sit down.
      for (const e of [...sitters]) {
        if (e.same && (st.mode === 'off' || st.mode === 'wait' || st.mode === 'arrive')) continue
        e.left -= dt
        if (e.left <= 0 && !e.same) {
          unseat(e)
          walk(e.npc, routeOutOfRow(e.seat), 2.8, () => wander(e.npc))
        }
        if (Math.random() < dt * 0.02) e.npc.data.stretch = 1.2
      }
      refillIn -= dt
      if (refillIn <= 0) {
        refillIn = rr(5, 9)
        const seated = sitters.filter((e) => gates.seats.includes(e.seat)).length
        if (seated < G.startSeated * (remote?.botShare() ?? 1)) {
          const s = pick(freeSeats(gates.seats))
          const npc = s && crowd.add({ x: rr(110, 140), z: rr(-30, -26), y: Y, yaw: Math.PI, bag: null })
          if (npc) {
            s.npc = npc // reserved
            walk(npc, routeToSeat(s), rr(2.8, 3.4), () => {
              seatNpc(npc, s)
              sitters.push({ npc, seat: s, left: rr(90, 420), same: false })
            })
          }
        }
      }
      // Corridor life.
      corridorIn -= dt
      if (corridorIn <= 0) {
        corridorIn = rr(2.5, 5)
        if (walkers.length < 16 && Math.random() < (remote?.botShare() ?? 1)) {
          const from = pick(corridorExits())
          const npc = crowd.add({ x: from.x, z: from.z, y: Y, yaw: 0, bag: Math.random() < 0.35 ? undefined : null })
          if (npc) wander(npc)
        }
      }
      chatIn -= dt
      if (chatIn <= 0) {
        chatIn = rr(4, 9)
        const e = pick(sitters)
        if (e) crowd.say(e.npc, pick(G.passengerLines), 3)
      }

      // Boarding: extra passengers walk up from the concourse; the line shuffles; the desk serves.
      if (['open', 'line', 'turn', 'scan', 'gate', 'bridge'].includes(st.mode)) {
        extraIn -= dt
        if (extraLeft > 0 && extraIn <= 0 && Math.random() < (remote?.botShare() ?? 1)) {
          extraIn = rr(1.6, 3.2)
          extraLeft--
          const npc = crowd.add({ x: rr(118, 132), z: -29, y: Y, yaw: Math.PI, bag: null })
          if (npc) {
            walk(npc, [{ x: 125.3, z: -34.5 }, { x: 136.5, z: -36.6 }], rr(3, 3.6), () => toLine(npc))
          }
        }
      }
      // Real passengers take their places in the line.
      const online = linesOnServer()
      if (remote) syncRemoteLine(line, remote.lineMembers('boarding'), LINE.project, LINE.total, online ? myTicket('boarding') : undefined)
      // Line shuffles forward (never closer than `spacing` to the one ahead, and nobody walks into the player).
      const playerS = LINE.project(player.position.x, player.position.z)
      for (let i = 0; i < line.length; i++) {
        const e = line[i]
        if (e.player || e.remote) continue
        const gap = slotS(i) - e.s
        const speed = gap > 3 ? 3.3 : QUEUE.lineSpeed
        let ds = Math.max(-speed * dt, Math.min(gap, speed * dt))
        if (ds > 0 && i > 0) ds = Math.min(ds, Math.max(0, line[i - 1].s - QUEUE.spacing - e.s))
        LINE.at(e.s + ds, tmp)
        if (!lineStepClear(e.npc, tmp.x, tmp.z, playerS > e.s)) {
          e.npc.speed = 0 // the player is in the way: wait
          continue
        }
        e.s += ds
        e.npc.x = tmp.x
        e.npc.z = tmp.z
        e.npc.speed = Math.abs(ds) / dt
        e.npc.yaw = angTo(e.npc.yaw, tmp.yaw, dt * 7)
      }
      serveIn -= dt
      const head = line[0]
      const scanFree = !remote?.held('scan') && !scanBusy && st.mode !== 'gate' && st.mode !== 'scan'
      // (online only bots are sent from here: the server calls the real passengers, below)
      if (head && !head.remote && (head.npc || !online) && scanFree && serveIn <= 0 && head.s >= LINE.total - 0.2) {
        line.shift()
        serveIn = 1.6
        if (head.player) goTurn()
        else serveNpc(head.npc)
        refreshHud()
      }
      if (online && st.mode === 'line') {
        const i = line.indexOf(st.entry)
        turn.update(dt, line, st.entry, slotS(i), () => (scanFree && serveIn <= 0 ? ['scan'] : []), () => {
          if (st.mode !== 'line') return
          const k = line.indexOf(st.entry)
          if (k >= 0) line.splice(k, 1)
          serveIn = 1.6
          goTurn()
          refreshHud()
        })
      }

      // --- The player ---
      const pp = player.position
      gates.marker.visible = gates.pad.visible = st.mode === 'open'
      if (st.mode === 'open') {
        const jz = G.joinZone
        if (!seating.active && inRect(pp.x, pp.z, jz.x0, jz.x1, jz.z0, jz.z1)) join()
      } else if (st.mode === 'line') {
        const i = line.indexOf(st.entry)
        if (i !== st.shownAt) {
          st.shownAt = i // real passengers ahead joined / left: a new Position In Line
          refreshHud()
        }
        const real = LINE.project(pp.x, pp.z)
        st.entry.s = Math.min(slotS(i), st.entry.s + QUEUE.autoSpeed * dt, real + 1.6)
        LINE.at(st.entry.s, tmp)
        player.auto = { x: tmp.x, z: tmp.z, speed: QUEUE.autoSpeed, face: tmp.yaw }
        const pushing = Math.hypot(inputState.move.x, inputState.move.z) > 0.5
        st.leaveHeld = pushing ? st.leaveHeld + dt : 0
        if (st.leaveHeld > QUEUE.leaveHold) leaveLine()
      } else if (st.mode === 'turn') {
        if (!scanBusy || st.route.length > 1) {
          const p = st.route[0]
          player.auto = { x: p.x, z: p.z, speed: 4 }
          if (Math.hypot(p.x - pp.x, p.z - pp.z) < 0.35) {
            st.route.shift()
            if (!st.route.length) {
              st.mode = 'scan'
              st.t = 0
              scanBusy = true
              player.auto = { x: bx, z: G.scanZ + 0.45, speed: 1, face: Math.PI }
              if (agent) crowd.say(agent, 'Boarding pass, please!', 2.2)
              hud.boardingPass(dest(), queue.result)
            }
          }
        }
      } else if (st.mode === 'scan') {
        st.t += dt
        if (st.t > 1.0 && !st.scanned) {
          st.scanned = true
          gates.flashScanner(0)
          gates.flashScanner(1)
          sfx('scanOk', { vol: 0.4 })
          fx.sparkle(bx, Y + 1.3, G.scanZ, { count: 22, color: '#3dff6a', speed: 3, up: 2 })
          if (agent) crowd.say(agent, pick(['Enjoy your flight!', 'Have a nice flight!', 'Welcome aboard!']), 2.4)
        }
        if (st.t > 1.9) {
          st.scanned = false
          st.mode = 'gate'
          hud.status(null)
          st.route = [{ x: bx, z: G.doorZ + 0.4 }, { x: bx, z: G.doorZ - 1.6 }, { x: RO.x, z: RO.z + 0.3 }]
          later(0.8, () => (scanBusy = false))
        }
      } else if (st.mode === 'gate') {
        const p = st.route[0]
        player.auto = { x: p.x, z: p.z, speed: 3.2 }
        if (Math.hypot(p.x - pp.x, p.z - pp.z) < 0.4) {
          st.route.shift()
          if (!st.route.length) {
            st.mode = 'bridge'
            st.t = 0
            player.auto = null
            player.frozen = true
            hud.nowBoarding(true)
            sfx('pneumatic', { vol: 0.3 })
          }
        }
      } else if (st.mode === 'bridge') {
        st.t += dt
        if (st.t > 1.3) {
          st.mode = 'gone'
          clearHud()
          hud.boardingPass(null)
          player.frozen = false
          onBoarded?.()
        }
      }
      updateTags(dt)
    },
  }
  return api
}
