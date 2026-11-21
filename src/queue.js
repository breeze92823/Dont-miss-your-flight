// The check-in line. Passengers arrive on the sidewalk, walk in through the
// sliding doors, follow the serpentine lanes to the back of the line and shuffle
// forward as the head of the line is called to a free desk. At the desk the
// agent asks for the bag, it goes on the scale (live kg read-out), rides the
// belt into the wall, and the passenger heads for security. The player joins
// by walking into the QUEUE HERE zone and is then walked along the line
// (Skip Line / Board The Plane spend coins to jump ahead).
import { BoxGeometry, Mesh, MeshStandardMaterial, Vector3 } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { AIRPORT, DESTINATIONS, QUEUE, QUESTIONS } from './config.js'
import { runCheckin } from './checkin.js'
import { player, resetPlayer } from './player.js'
import { lineStepClear } from './lineBlockers.js'
import { lineTurn, linesOnServer, myTicket, syncRemoteLine } from './linepath.js'
import { skipLineOnServer } from './net.js'
import { syncYawToPlayer } from './camera.js'
import { inputState } from './input.js'
import { sfx } from './audio.js'
import { rbox } from './detail.js'

const Y = AIRPORT.walkY
const CHATTER = [
  'they asked if i packed my bag myself lol',
  'is this the line for tokyo?',
  'my flight leaves in 10 min 😬',
  'did i leave the stove on...',
  'this line is SO long',
  'first time flying!!',
  'anyone else hungry?',
  'i packed 3 hoodies',
  'nice suitcase!',
  'gate closing?? already??',
  'skip line is worth it fr',
  'window seat or nothing',
]

// --- Path along the lanes ------------------------------------------------------------------
const P = QUEUE.path.map(([x, z]) => ({ x, z }))
const cum = [0]
for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i].x - P[i - 1].x, P[i].z - P[i - 1].z))
const TOTAL = cum[cum.length - 1]
function at(s, out = {}) {
  s = Math.max(0, Math.min(TOTAL, s))
  let i = 1
  while (i < cum.length - 1 && cum[i] < s) i++
  const a = P[i - 1]
  const b = P[i]
  const t = (s - cum[i - 1]) / (cum[i] - cum[i - 1] || 1)
  out.x = a.x + (b.x - a.x) * t
  out.z = a.z + (b.z - a.z) * t
  out.yaw = Math.atan2(b.x - a.x, b.z - a.z)
  return out
}
function project(x, z) {
  let best = 0
  let bd = Infinity
  for (let i = 1; i < P.length; i++) {
    const a = P[i - 1]
    const b = P[i]
    const dx = b.x - a.x
    const dz = b.z - a.z
    const l2 = dx * dx + dz * dz
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / l2))
    const px = a.x + dx * t
    const pz = a.z + dz * t
    const d = (px - x) ** 2 + (pz - z) ** 2
    if (d < bd) {
      bd = d
      best = cum[i - 1] + Math.sqrt(l2) * t
    }
  }
  return best
}
const JZ = QUEUE.joinZone
const S_JOIN = project((JZ.x0 + JZ.x1) / 2, (JZ.z0 + JZ.z1) / 2)
const slotS = (i) => TOTAL - i * QUEUE.spacing
const rr = ([a, b]) => a + Math.random() * (b - a)
const angTo = (from, to, max) => {
  const d = Math.atan2(Math.sin(to - from), Math.cos(to - from))
  return Math.abs(d) <= max ? to : from + Math.sign(d) * max
}

// remote (remote.js): real passengers take places in this line and hold the desks they use.
export function createQueue({ scene, crowd, interior, fx, suitcase, hud, store, dialog, getPlayerName, toSecurity, onCheckedIn, remote = null }) {
  const desks = interior.desks
  const line = [] // front first: { npc } or { player: true }, each with .s
  const walkers = [] // NPCs on a free route: { npc, route, i, speed, done }
  const serving = [] // { npc, desk, t, dur, kg, step }
  const agents = desks.map((d) => {
    const a = crowd.add({ x: d.agent.x, z: d.agent.z, y: Y, yaw: 0, mode: 'type', bag: null, hat: true, shirt: '#1b2a52', arms: '#1b2a52', pants: '#1b2233', hatColor: '#1b2a52', name: 'agent' })
    return a
  })

  // Belt bags for NPC check-ins (simple merged shapes, one draw each, pooled).
  const strip = (g) => (g.index ? g.toNonIndexed() : g)
  // A case lying on its back: rounded shell, ribs, seam bead, carry handle, wheel stubs at the end.
  const bagGeo = mergeGeometries([
    rbox(0.42, 0.24, 0.6, 0.05, 2).translate(0, 0.12, 0),
    ...[-0.1, 0.1].map((x) => new BoxGeometry(0.05, 0.252, 0.54).translate(x, 0.12, 0)),
    new BoxGeometry(0.432, 0.242, 0.02).translate(0, 0.12, 0),
    rbox(0.28, 0.04, 0.045, 0.016, 1).translate(0, 0.26, 0.2),
    ...[-0.16, 0.16].map((x) => new BoxGeometry(0.06, 0.06, 0.05).translate(x, 0.07, -0.31)),
  ].map(strip))
  const beltBags = Array.from({ length: 8 }, () => {
    const m = new Mesh(bagGeo, new MeshStandardMaterial({ color: '#888', roughness: 0.35 }))
    m.visible = false
    m.castShadow = true
    scene.add(m)
    return { m, phase: 'off', t: 0, from: new Vector3(), to: new Vector3(), end: null }
  })
  const BAGS = ['#2b2f3a', '#e8434f', '#5cc4ff', '#a98ae6', '#5fe0a8', '#ffc531', '#7a8496', '#4c6ef5']

  const tmp = {}
  const state = {
    mode: 'free', // free | line | turn | desk | checked
    entry: null,
    desk: null,
    route: null,
    t: 0,
    kg: 0,
    step: 0,
    leaveHeld: 0,
    destIndex: 0,
  }
  let frontCooldown = 0
  const turn = lineTurn('checkin') // online: the server says when it's your turn
  let arriveIn = 1
  let chatterIn = 4

  // --- Seed: a full line + busy desks (only when there are bot passengers, PASSENGERS.bots) ---------
  const seedBots = (remote?.botShare() ?? 1) > 0
  for (let i = 0; seedBots && i < QUEUE.startInLine; i++) {
    const s = slotS(i)
    at(s, tmp)
    const npc = crowd.add({ x: tmp.x, z: tmp.z, y: Y, yaw: tmp.yaw })
    line.push({ npc, s })
  }
  if (seedBots) desks.forEach((d) => {
    const npc = crowd.add({ x: d.cust.x, z: d.cust.z, y: Y, yaw: Math.PI })
    npc.hasBag = Math.random() < 0.5
    d.busy = true
    serving.push({ npc, desk: d, t: rr([0, 4]), dur: rr(QUEUE.serveTime), kg: 8 + Math.random() * 15, step: npc.hasBag ? 0 : 3 })
  })

  function walk(npc, route, speed, done) {
    walkers.push({ npc, route, i: 0, speed, done })
  }

  function spawnArrival() {
    const side = Math.random() < 0.5 ? -1 : 1
    const x = side * (14 + Math.random() * 18)
    const npc = crowd.add({ x, z: -3.6, y: Y, yaw: Math.PI })
    if (!npc) return
    // Walk to the doors, then follow the path to the join zone, then take a place in line.
    const route = [{ x: P[0].x + (Math.random() - 0.5), z: P[0].z }]
    for (let i = 1; i < P.length && cum[i] <= S_JOIN + 0.01; i++) route.push(P[i])
    walk(npc, route, 3.1 + Math.random() * 0.6, () => {
      npc.s = project(npc.x, npc.z)
      line.push({ npc, s: npc.s })
      refreshHud()
    })
  }

  function startServe(npc, desk) {
    desk.busy = true
    walk(npc, [{ x: 12, z: -34.2 }, { x: desk.cust.x, z: -35.6 }, { x: desk.cust.x, z: desk.cust.z }], 2.8, () => {
      serving.push({ npc, desk, t: 0, dur: rr(QUEUE.serveTime), kg: 6 + Math.random() * 17, step: 0 })
    })
  }

  function launchBeltBag(from, desk, color) {
    const b = beltBags.find((b) => b.phase === 'off')
    if (!b) return
    b.m.material.color.set(color)
    b.phase = 'fly'
    b.t = 0
    b.from.copy(from)
    b.to.set(desk.scale.x, desk.scale.y, desk.scale.z)
    b.end = desk.beltEnd
    b.desk = desk
    b.m.visible = true
  }

  const sd = QUEUE.securityDoor
  function leaveToSecurity(npc, desk) {
    walk(npc, [{ x: desk.cust.x, z: -35.8 }, { x: 25.5, z: sd.z + 0.6 }, { x: sd.x - 2, z: sd.z }], 3.2, () => (toSecurity ? toSecurity(npc) : crowd.remove(npc)))
  }

  // --- HUD sync --------------------------------------------------------------------------------
  const playerIndex = () => line.findIndex((e) => e.player)
  function refreshHud() {
    if (state.mode === 'line') hud.setLine(playerIndex() + 1)
  }

  // --- Player actions ------------------------------------------------------------------------
  function join() {
    state.mode = 'line'
    state.entry = { player: true, s: project(player.position.x, player.position.z) }
    line.push(state.entry)
    state.leaveHeld = 0
    // A short line: no walk through the empty lanes, straight to your spot behind the last one.
    const target = slotS(line.length - 1)
    if (target - state.entry.s > QUEUE.shortcut) {
      state.entry.s = target
      at(target, tmp)
      teleport(tmp.x, tmp.z, tmp.yaw)
    } else sfx('pop')
    hud.big("You're in line!", 'green', 1.2)
    hud.prompt(null)
    refreshHud()
  }
  function leaveLine(msg = 'You left the line') {
    const i = line.indexOf(state.entry)
    if (i >= 0) line.splice(i, 1)
    state.entry = null
    state.mode = 'free'
    player.auto = null
    hud.setLine(null)
    hud.toast(msg)
  }
  function teleport(x, z, face) {
    fx.puff(player.position.x, player.position.y + 0.8, player.position.z, { count: 14, color: '#ffffff', size: 0.5, alpha: 0.6, life: 0.7, speed: 2 })
    resetPlayer({ x, y: Y + 0.02, z }, face)
    syncYawToPlayer()
    fx.sparkle(x, Y + 1, z, { count: 24, color: '#7cf0ff', speed: 4 })
    sfx('whoosh', { vol: 0.5, dur: 0.4 })
  }
  function goToDesk(desk, viaRoute, fromBack = false) {
    state.desk = desk
    desk.busy = true
    state.mode = 'turn'
    hud.setLine(null)
    hud.big('YOUR TURN!', 'gold', 1.6)
    sfx('fanfare')
    state.route = viaRoute ? [{ x: 12, z: -34.2 }, { x: desk.cust.x, z: -35.6 }, { x: desk.cust.x, z: desk.cust.z }] : [{ x: desk.cust.x, z: desk.cust.z }]
    // Called from 2nd / 3rd place: up the last lane to the head of the line first.
    if (fromBack) state.route.unshift(at(TOTAL, {}))
  }
  const freeDesks = () => desks.filter((d) => !d.busy && !remote?.held(`desk:${d.index}`))
  function arriveDesk() {
    state.mode = 'desk'
    const d = state.desk
    player.auto = { x: d.cust.x, z: d.cust.z, speed: 2, face: Math.PI }
    hud.status('Checking in...')
    syncYawToPlayer()
    const agent = agents[d.index]
    runCheckin({
      dialog,
      crowd,
      agent,
      desk: d,
      suitcase,
      store,
      fx,
      player: player.renderPosition,
      destIndex: state.destIndex,
      playerName: getPlayerName(),
      setDest: (i) => {
        state.destIndex = i
        store.set('dest', i)
        interior.setFlight(i, null)
      },
    }).then((result) => {
      const pp = player.position
      agent.mode = 'type'
      d.busy = false
      state.mode = 'checked'
      state.result = result
      player.auto = null
      hud.status(null)
      hud.big('CHECKED IN!', 'green', 1.8)
      sfx('fanfare')
      fx.confetti(pp.x, pp.y + 2, pp.z, 50)
      store.addCoins(QUEUE.reward, { x: pp.x, y: pp.y + 1.6, z: pp.z })
      interior.setFlight(state.destIndex, 'checked in')
      hud.boardingPass(DESTINATIONS[state.destIndex], result)
      onCheckedIn?.(result)
    })
  }

  const api = {
    get mode() {
      return state.mode
    },
    get destIndex() {
      return state.destIndex
    },
    get result() {
      return state.result
    },
    // Dev/testing: jump straight to "checked in" with the given answers.
    devCheckIn(tags = [], classId = 'economy', seat = null) {
      const seats = { first: '1E', business: '4F', premium: '8D', economy: '13A' }
      state.mode = 'checked'
      state.result = { tags: new Set(tags), cls: classId.toUpperCase(), classId, seat: seat ?? seats[classId] ?? '13A', dest: state.destIndex }
      suitcase.show(false)
    },
    // Security cleared / a new trip: back to square one with a fresh bag.
    resetTrip() {
      state.mode = 'free'
      state.result = null
      suitcase.reset()
      hud.boardingPass(null)
      interior.setFlight(state.destIndex, null)
    },
    lineLength: () => line.length,
    // For the other passengers (net trip): standing in this line / the desk you hold.
    get inLine() {
      return state.mode === 'line'
    },
    get hold() {
      return (state.mode === 'turn' || state.mode === 'desk') && state.desk ? `desk:${state.desk.index}` : ''
    },
    // NPCs standing in the check-in line (solid to the player, see lineBlockers.js).
    // solidOnly: just the bots (real passengers are never solid: the server keeps the order).
    lineNpcs(out, solidOnly = false) {
      for (const e of line) if (e.npc || (e.remote && !solidOnly)) out.push(e.npc ?? e.remote)
      return out
    },
    skipLine() {
      if (state.mode !== 'line') return false
      const i = line.indexOf(state.entry)
      line.splice(i, 1)
      line.unshift(state.entry)
      state.entry.s = TOTAL
      at(TOTAL, tmp)
      teleport(tmp.x, tmp.z, tmp.yaw)
      skipLineOnServer('checkin')
      // Whoever stood at the front shuffles back one place (they don't teleport).
      refreshHud()
      return true
    },
    fastTrack() {
      if (state.mode === 'checked' || state.mode === 'turn' || state.mode === 'desk') return false
      if (state.mode === 'line') {
        const i = line.indexOf(state.entry)
        if (i >= 0) line.splice(i, 1)
        state.entry = null
      }
      const free = freeDesks()
      const desk = free.length ? free[Math.floor(Math.random() * free.length)] : desks[desks.length - 1]
      teleport(desk.cust.x, desk.cust.z + 1.2, Math.PI)
      goToDesk(desk, false)
      return true
    },
    // A new flight: you get a fresh suitcase and have to check in again.
    newFlight(index) {
      state.destIndex = index
      interior.setFlight(index, null)
      if (state.mode === 'checked') {
        state.mode = 'free'
        suitcase.reset()
        hud.boardingPass(null)
      }
    },
    // Positions that should open the doors / scare pigeons.
    actors(out) {
      for (const w of walkers) if (w.npc.z > -16) out.push(w.npc)
      return out
    },
    update(dt, t) {
      // --- Arrivals ---
      arriveIn -= dt
      let approaching = 0
      for (const w of walkers) if (!w.npc.leaving) approaching++
      if (arriveIn <= 0) {
        arriveIn = rr(QUEUE.arriveEvery)
        // Bot passengers only fill in while real ones are few (remote.botShare).
        if (line.length + approaching < QUEUE.maxInLine && Math.random() < (remote?.botShare() ?? 1)) spawnArrival()
      }

      // --- Real passengers take their places in the line ---
      const online = linesOnServer()
      if (remote) syncRemoteLine(line, remote.lineMembers('checkin'), project, TOTAL, online ? myTicket('checkin') : undefined)

      // --- Line shuffles forward ---
      // (never closer than `spacing` to the one ahead, and nobody walks into the player)
      const playerS = project(player.position.x, player.position.z)
      for (let i = 0; i < line.length; i++) {
        const e = line[i]
        const target = slotS(i)
        if (e.player || e.remote) continue
        const gap = target - e.s
        const speed = gap > 3 ? 3.3 : QUEUE.lineSpeed
        let ds = Math.max(-speed * dt, Math.min(gap, speed * dt))
        if (ds > 0 && i > 0) ds = Math.min(ds, Math.max(0, line[i - 1].s - QUEUE.spacing - e.s))
        const n = e.npc
        at(e.s + ds, tmp)
        if (!lineStepClear(n, tmp.x, tmp.z, playerS > e.s)) {
          n.speed = 0 // the player is in the way: wait
          continue
        }
        e.s += ds
        n.x = tmp.x
        n.z = tmp.z
        n.speed = Math.abs(ds) / dt
        n.yaw = angTo(n.yaw, tmp.yaw, dt * 7)
      }

      // --- Head of the line goes to a free desk ---
      // (online only bots are sent from here: the server calls the real passengers, below)
      frontCooldown -= dt
      const head = line[0]
      if (head && !head.remote && (head.npc || !online) && frontCooldown <= 0 && head.s >= TOTAL - 0.15) {
        const free = freeDesks()
        if (free.length && (!head.player || state.mode === 'line')) {
          const desk = free[Math.floor(Math.random() * free.length)]
          line.shift()
          frontCooldown = 0.7
          if (head.player) {
            state.entry = null
            goToDesk(desk, true)
          } else startServe(head.npc, desk)
          refreshHud()
        }
      }
      if (online && state.mode === 'line') {
        const i = line.indexOf(state.entry)
        turn.update(dt, line, state.entry, slotS(i), () => freeDesks().map((d) => `desk:${d.index}`), (key, place) => {
          if (state.mode !== 'line') return
          const k = line.indexOf(state.entry)
          if (k >= 0) line.splice(k, 1)
          state.entry = null
          goToDesk(desks[+key.split(':')[1]] ?? desks[0], true, place > 0)
          refreshHud()
        })
      }

      // --- Free walkers ---
      for (let i = walkers.length - 1; i >= 0; i--) {
        const w = walkers[i]
        const n = w.npc
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

      // --- NPCs at desks ---
      for (let i = serving.length - 1; i >= 0; i--) {
        const s = serving[i]
        const n = s.npc
        s.t += dt
        n.yaw = angTo(n.yaw, Math.PI, dt * 6)
        n.speed = 0
        const agent = agents[s.desk.index]
        if (s.step === 0 && s.t > 0.3) {
          s.step = 1
          agent.mode = 'wave'
          if (Math.random() < 0.5) crowd.say(agent, 'Next! Pop your bag on the scale.', 2.2)
        }
        if (s.step === 1 && s.t > 1.2) {
          s.step = 2
          agent.mode = 'type'
          if (n.hasBag) {
            n.hasBag = false
            launchBeltBag(new Vector3(n.x - 0.4, Y + 0.3, n.z), s.desk, BAGS[Math.floor(Math.random() * BAGS.length)])
          }
        }
        if (s.step === 2 && s.t > 2.6) {
          s.step = 3
          if (Math.random() < 0.35) crowd.say(agent, `${Math.round(s.kg)} kg. Perfect!`, 2)
          else if (Math.random() < 0.6) {
            const q = QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)]
            crowd.say(agent, q[2][Math.floor(Math.random() * 3)][1], 2.4)
          }
        }
        if (s.t > s.dur) {
          serving.splice(i, 1)
          s.desk.busy = false
          n.leaving = true
          leaveToSecurity(n, s.desk)
        }
      }

      // --- Belt bags ---
      for (const b of beltBags) {
        if (b.phase === 'off') continue
        b.t += dt
        if (b.phase === 'fly') {
          const k = Math.min(1, b.t / 0.5)
          b.m.position.lerpVectors(b.from, b.to, k)
          b.m.position.y += Math.sin(k * Math.PI) * 0.6
          b.m.rotation.set(0, k * Math.PI, 0)
          if (k >= 1) {
            b.phase = 'scale'
            b.t = 0
          }
        } else if (b.phase === 'scale') {
          if (b.t > 1.4) b.phase = 'belt'
        } else {
          b.m.position.z -= dt * 1.4
          if (b.m.position.z < b.end.z + 0.3) {
            b.phase = 'off'
            b.m.visible = false
          }
        }
      }

      // --- Chatter ---
      chatterIn -= dt
      if (chatterIn <= 0) {
        chatterIn = 4 + Math.random() * 5
        const e = line[Math.floor(Math.random() * line.length)]
        if (e?.npc) crowd.say(e.npc, CHATTER[Math.floor(Math.random() * CHATTER.length)], 3.2)
      }

      // --- The player ---
      const pp = player.position
      if (state.mode === 'free') {
        if (pp.x > JZ.x0 && pp.x < JZ.x1 && pp.z > JZ.z0 && pp.z < JZ.z1 && suitcase.state === 'follow') join()
      } else if (state.mode === 'line') {
        const i = line.indexOf(state.entry)
        if (i !== state.shownAt) {
          state.shownAt = i // real passengers ahead joined / left: a new Position In Line
          refreshHud()
        }
        const target = slotS(i)
        // The carrot runs ahead of the player along the lanes, never far ahead.
        const real = project(pp.x, pp.z)
        state.entry.s = Math.min(target, state.entry.s + QUEUE.autoSpeed * dt, real + 1.6)
        at(state.entry.s, tmp)
        player.auto = { x: tmp.x, z: tmp.z, speed: QUEUE.autoSpeed, face: tmp.yaw }
        // Pushing the stick for a moment steps out of line.
        const pushing = Math.hypot(inputState.move.x, inputState.move.z) > 0.5
        state.leaveHeld = pushing ? state.leaveHeld + dt : 0
        if (state.leaveHeld > QUEUE.leaveHold) leaveLine()
      } else if (state.mode === 'turn') {
        const p = state.route[0]
        player.auto = { x: p.x, z: p.z, speed: 4.5 }
        if (Math.hypot(p.x - pp.x, p.z - pp.z) < 0.35) {
          state.route.shift()
          if (!state.route.length) arriveDesk()
        }
      } else if (state.mode === 'desk') {
        player.auto = { x: state.desk.cust.x, z: state.desk.cust.z, speed: 2, face: Math.PI }
      }
    },
  }
  return api
}

export { TOTAL as QUEUE_PATH_LENGTH, at as queuePathAt }
export function securityNear(x, z) {
  return Math.abs(x - QUEUE.securityDoor.x) < 4 && Math.abs(z - QUEUE.securityDoor.z) < 4
}
