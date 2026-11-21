// The security checkpoint. Passengers who finish check-in walk through the
// "security" doorway and join the serpentine line. When called they go to an
// open lane: bag in a tray (it rides the rollers through the X-ray scanner),
// through the walk-through detector. Green: pick the tray up at the end of the
// rollers and off to the gates. Red (+ alarm): to the next VACANT mat in the
// body-search area, arms out, an officer pats them down, then off to the gates.
// The player's detector ALWAYS goes off: your bag goes to the table by your mat,
// and a timed search turns up ridiculous items (some straight from your
// check-in answers, "FOUND ON YOU!") which pile up on the table. Skip Search
// (coins) is offered from the moment it's your turn.
import { CanvasTexture, Sprite, SpriteMaterial, SRGBColorSpace, Vector3 } from 'three'
import { AIRPORT, QUEUE, SECURITY } from './config.js'
import { player, resetPlayer } from './player.js'
import { lineStepClear } from './lineBlockers.js'
import { setCameraYaw, syncYawToPlayer } from './camera.js'
import { inputState } from './input.js'
import { sfx } from './audio.js'
import { angTo, lineTurn, linesOnServer, makePath, myTicket, spotClaimer, syncRemoteLine } from './linepath.js'
import { skipLineOnServer } from './net.js'
import { paintEmoji } from './airport/paint.js'

const Y = AIRPORT.walkY
const SEC = SECURITY
const PATH = makePath(SEC.path)
const JZ = SEC.joinZone
const S_JOIN = PATH.project((JZ.x0 + JZ.x1) / 2, (JZ.z0 + JZ.z1) / 2)
const slotS = (i) => PATH.total - i * QUEUE.spacing
const rr = ([a, b]) => a + Math.random() * (b - a)
const pick = (a) => a[Math.floor(Math.random() * a.length)]
const clock = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`
const GX = 89.5 // walkway east of the search area, up to the gates
export const TPOSE = { ArmL1: { x: -0.05, z: 1.45 }, ArmR1: { x: -0.05, z: -1.45 }, ArmL2: { x: 0 }, ArmR2: { x: 0 } }
const REACH = { ArmL1: { x: -1.2, z: 0.15 }, ArmR1: { x: -1.2, z: -0.15 }, ArmL2: { x: -0.2 }, ArmR2: { x: -0.2 }, Spine1: { x: 0.25 } }

// remote (remote.js): real passengers take places in this line and hold the lanes / mats they use.
export function createSecurity({ scene, crowd, hall, interior, fx, hud, store, queue, onGates = null, remote = null }) {
  const gone = (npc) => (onGates ? onGates(npc) : crowd.remove(npc))
  const D = hud.dialog
  const tmp = {}
  const v1 = new Vector3()
  const lanes = hall.lanes
  const mats = hall.mats
  const open = lanes.filter((l) => l.open)
  const line = []
  const walkers = []
  const searches = [] // NPCs on a mat: { npc, mat, t, dur }
  const state = { mode: 'off', entry: null, lane: null, mat: null, route: null, t: 0, items: [], found: 0, leaveHeld: 0, pose: null, tray: null }
  let pack = null // { mesh, setWorn(on) } from main.js (the player's backpack)
  let arriveIn = 2
  let frontCooldown = 0
  const turn = lineTurn('security') // online: the server says when it's your turn
  const matClaim = spotClaimer() // online: the server hands out the search mats
  let chatterIn = 5
  let camRef = null
  const timers = [] // game-time callbacks (setTimeout would stall in a throttled tab)
  const later = (sec, fn) => timers.push({ t: sec, fn })

  // --- Staff: an officer on every mat, an operator at each open scanner's screen ---------------
  const officer = (x, z, yaw) => crowd.add({ x, z, y: Y, yaw, bag: null, pack: false, print: true, hat: true, hatColor: '#15171c', shirt: '#1b1d22', arms: '#1b1d22', pants: '#15171c', name: 'security' })
  for (const m of mats) {
    m.officer = officer(m.post.x, m.post.z, -Math.PI / 2)
    m.officer.mode = 'idle'
  }
  for (const l of open) {
    const op = officer(64.4, l.bz + 1.1, Math.PI / 2)
    if (op) op.mode = 'type'
  }

  // --- Trays riding the conveyor ------------------------------------------------------------------
  function launchTray(lane, bag = null) {
    const tr = hall.trays.find((t) => t.phase === 'off')
    if (!tr) return null
    tr.phase = 'ride'
    tr.lane = lane
    tr.t = 0
    tr.g.visible = true
    tr.g.position.set(60.6, Y + 0.95, lane.bz)
    tr.g.rotation.set(0, Math.PI / 2, 0)
    for (const it of tr.items) it.visible = !bag
    if (bag) {
      bag.position.set(0, 0, 0)
      bag.rotation.set(-Math.PI / 2, 0, 0) // lying on its back in the tray
      bag.visible = true
      tr.bagSlot.add(bag)
    }
    return tr
  }
  function updateTrays(dt) {
    for (const tr of hall.trays) {
      if (tr.phase === 'off') continue
      const p = tr.g.position
      if (tr.phase === 'ride') {
        // A pause inside the scanner (the monitor shows it), then out to the end of the rollers.
        const inScanner = p.x > 66.2 && p.x < 67.4
        if (inScanner && tr.t < 1.1) {
          if (tr.t === 0 && camRef && camRef.position.distanceTo(p) < 25) sfx('scanHum', { vol: 0.08 })
          tr.t += dt
        } else p.x += dt * 1.6
        if (p.x > SEC.trayEndX) {
          p.x = SEC.trayEndX
          tr.phase = 'wait'
          tr.t = 0
        }
      } else if (tr.phase === 'wait') {
        tr.t += dt
        if (tr.t > 20 && !tr.bagSlot.children.length) tr.phase = 'off'
      }
      if (tr.phase === 'off') tr.g.visible = false
    }
  }

  // --- Things flying through the air: found items onto the table, the bag to the table and back ---
  const flights = []
  function fly(obj, to, { dur = 0.7, arc = 0.8, spin = 0, done } = {}) {
    obj.updateMatrixWorld(true)
    const from = obj.getWorldPosition(new Vector3())
    if (obj.parent !== scene) scene.attach(obj)
    flights.push({ obj, from, to: to.clone(), t: 0, dur, arc, spin, done })
  }
  function updateFlights(dt) {
    for (let i = flights.length - 1; i >= 0; i--) {
      const f = flights[i]
      f.t = Math.min(1, f.t + dt / f.dur)
      const e = f.t * f.t * (3 - 2 * f.t)
      f.obj.position.lerpVectors(f.from, f.to, e)
      f.obj.position.y += Math.sin(f.t * Math.PI) * f.arc
      if (f.spin) f.obj.rotation.y += f.spin * dt
      if (f.t >= 1) {
        flights.splice(i, 1)
        f.done?.()
      }
    }
  }
  // Emoji sprites for found items: they pop out of a pocket, then land on the mat's table.
  const itemSprites = Array.from({ length: 6 }, () => {
    const t = new CanvasTexture(paintEmoji('🦆'))
    t.colorSpace = SRGBColorSpace
    const sp = new Sprite(new SpriteMaterial({ map: t, transparent: true, depthWrite: false }))
    sp.visible = false
    sp.renderOrder = 22
    sp.scale.set(0.45, 0.45, 1)
    scene.add(sp)
    return { sp, t }
  })
  function popItem(i, icon, from, to) {
    const it = itemSprites[i % itemSprites.length]
    it.t.image = paintEmoji(icon)
    it.t.needsUpdate = true
    it.sp.position.copy(from)
    it.sp.scale.set(0.15, 0.15, 1)
    it.sp.visible = true
    // Up out of the pocket and big, then down onto the table.
    const up = from.clone()
    up.y += 1.1
    flights.push({ obj: it.sp, from: from.clone(), to: up, t: 0, dur: 0.45, arc: 0, done: () => fly(it.sp, to, { dur: 0.6, arc: 0.6, done: () => sfx('thud', { vol: 0.15 }) }) })
    const grow = setInterval(() => {
      const s = Math.min(0.5, it.sp.scale.x + 0.05)
      it.sp.scale.set(s, s, 1)
      if (s >= 0.5) clearInterval(grow)
    }, 16)
  }
  function clearTableItems(mat) {
    itemSprites.forEach((it, i) => {
      if (!it.sp.visible) return
      setTimeout(() => {
        fly(it.sp, new Vector3(mat.bin.x, mat.bin.y + 0.2, mat.bin.z), { dur: 0.5, arc: 0.5, done: () => (it.sp.visible = false) })
      }, i * 90)
    })
  }

  // --- NPC flow ----------------------------------------------------------------------------------------
  function walk(npc, route, speed, done) {
    walkers.push({ npc, route, i: 0, speed, done })
  }
  const toGates = (from) => [{ x: GX, z: from }, { x: GX, z: SEC.gates.z }, { x: SEC.gates.x - 0.4, z: SEC.gates.z }]
  function joinLine(npc) {
    if (line.length >= SEC.maxInLine) {
      // Line full: straight through a quiet lane so the hall keeps flowing.
      walk(npc, [{ x: 58.2, z: -43 }, { x: SEC.corridorX, z: -43 }, ...toGates(-43)], 3, () => gone(npc))
      return
    }
    line.push({ npc, s: PATH.project(npc.x, npc.z) })
    refreshHud()
  }
  // Called by the check-in queue when an NPC walks off to security.
  function adopt(npc) {
    npc.leaving = false
    if (Math.random() < 0.6) npc.hasPack = true
    const route = [{ x: SEC.door.x - 2, z: SEC.door.z }]
    for (let i = 1; i < PATH.P.length && PATH.cum[i] <= S_JOIN + 0.01; i++) route.push(PATH.P[i])
    walk(npc, route, 3.1, () => joinLine(npc))
  }
  const freeMats = (z) => mats.filter((m) => !m.busy && !remote?.held(`mat:${mats.indexOf(m)}`)).sort((a, b) => Math.abs(a.z - z) - Math.abs(b.z - z))
  const freeMat = (z) => freeMats(z)[0] ?? null

  function startLane(npc, lane) {
    lane.busy = true
    walk(npc, [{ x: 58.2, z: lane.z }, { x: SEC.trayX, z: lane.z }], 2.8, () => {
      npc.speed = 0
      npc.yaw = 0
      const hadPack = npc.hasPack
      const tr = launchTray(lane)
      if (hadPack) npc.hasPack = false
      later(0.9, () => {
        const mat = Math.random() < 0.55 ? freeMat(lane.z) : null
        if (mat) mat.busy = true // reserved now, so nobody else is sent to it
        walk(npc, [{ x: SEC.detectorX + 0.9, z: lane.z }], 2.4, () => {
          lane.busy = false
          if (mat) {
            lane.alarmT = 1.2
            detectorSound(lane, true)
            walk(npc, [{ x: SEC.laneEndX + 0.6, z: lane.z }, { x: SEC.corridorX, z: lane.z }, { x: SEC.corridorX, z: mat.z }, { x: mat.x, z: mat.z }], 2.4, () => {
              npc.mode = 'tpose'
              npc.yaw = Math.PI / 2
              mat.officer.mode = 'pat'
              searches.push({ npc, mat, t: 0, dur: rr(SEC.checkTime), tr, hadPack })
              crowd.say(mat.officer, pick(SEC.officerLines), 2.6)
              if (Math.random() < 0.4) setTimeout(() => crowd.say(npc, pick(SEC.passengerLines), 2.6), 1400)
            })
          } else {
            lane.clearT = 0.8
            detectorSound(lane, false)
            // Grab the tray at the end of the rollers, then off to the gates.
            walk(npc, [{ x: SEC.trayEndX - 0.2, z: lane.z + 0.9 }], 2.6, () => {
              if (tr) tr.phase = 'off'
              if (hadPack) npc.hasPack = true
              walk(npc, [{ x: SEC.corridorX, z: lane.z + 0.9 }, { x: SEC.corridorX, z: SEC.exitZ }, ...toGates(SEC.exitZ)], 3, () => gone(npc))
            })
          }
        })
      })
    })
  }
  function updateSearches(dt) {
    for (let i = searches.length - 1; i >= 0; i--) {
      const s = searches[i]
      s.t += dt
      circleOfficer(s.mat, s.npc, s.t)
      s.mat.timer.set(Math.max(0, s.dur - s.t))
      if (Math.random() < dt * 3) sfx('pat', { vol: patVol(s.npc) })
      if (!s.said && s.t > s.dur * 0.5) {
        s.said = true
        if (Math.random() < 0.5) crowd.say(s.mat.officer, pick(SEC.officerFinds), 2.4)
      }
      if (s.t > s.dur) {
        searches.splice(i, 1)
        s.npc.mode = 'idle'
        s.mat.timer.set(null)
        returnOfficer(s.mat)
        if (s.tr) s.tr.phase = 'off'
        if (s.hadPack) s.npc.hasPack = true
        const m = s.mat
        walk(s.npc, toGates(m.z), 3, () => gone(s.npc))
        later(1.5, () => (m.busy = false))
      }
    }
  }
  function circleOfficer(mat, target, t) {
    const o = mat.officer
    const a = Math.PI + Math.sin(t * 0.6) * 1.6
    const ox = target.x - Math.cos(a) * 0.85
    const oz = target.z + Math.sin(a) * 0.85
    o.x += (ox - o.x) * 0.1
    o.z += (oz - o.z) * 0.1
    o.speed = Math.hypot(ox - o.x, oz - o.z) * 6
    o.yaw = Math.atan2(target.x - o.x, target.z - o.z)
    if (o.mode !== 'hold') o.mode = 'pat'
  }
  function returnOfficer(mat) {
    const o = mat.officer
    o.mode = 'idle'
    walk(o, [{ x: mat.post.x, z: mat.post.z }], 2, () => (o.yaw = -Math.PI / 2))
  }
  const patVol = (n) => (camRef ? Math.max(0, 0.18 - camRef.position.distanceTo(v1.set(n.x, 1, n.z)) * 0.01) : 0.1)
  function detectorSound(L, alarm) {
    const d = camRef ? camRef.position.distanceTo(v1.set(SEC.detectorX, 2, L.z)) : 20
    sfx(alarm ? 'alarm' : 'clearBeep', { vol: Math.max(0.03, 0.35 - d * 0.012) })
  }

  // --- Seed: a busy hall (only when there are bot passengers, PASSENGERS.bots) ---------------------------
  const seedBots = (remote?.botShare() ?? 1) > 0
  for (let i = 0; seedBots && i < SEC.startInLine; i++) {
    PATH.at(slotS(i), tmp)
    const npc = crowd.add({ x: tmp.x, z: tmp.z, y: Y, yaw: tmp.yaw, bag: null, pack: Math.random() < 0.65 ? undefined : false })
    if (npc) {
      if (npc.hasPack === false && Math.random() < 0.5) npc.hasPack = true
      line.push({ npc, s: slotS(i) })
    }
  }
  // Two mats already busy.
  for (const m of seedBots ? [mats[0], mats[3]] : []) {
    const npc = crowd.add({ x: m.x, z: m.z, y: Y, yaw: Math.PI / 2, bag: null, pack: false })
    if (!npc) continue
    m.busy = true
    npc.mode = 'tpose'
    m.officer.mode = 'pat'
    searches.push({ npc, mat: m, t: Math.random() * 3, dur: rr(SEC.checkTime) + 4, tr: null, hadPack: Math.random() < 0.6 })
  }

  // --- Player ---------------------------------------------------------------------------------------------
  const playerIndex = () => line.findIndex((e) => e.player)
  function refreshHud() {
    if (state.mode !== 'line') return
    const i = playerIndex()
    hud.setLine(i + 1)
    hud.status(i <= 1 ? "You're next!" : null)
  }
  function teleport(x, z, face) {
    fx.puff(player.position.x, player.position.y + 0.8, player.position.z, { count: 14, color: '#ffffff', size: 0.5, alpha: 0.6, life: 0.7, speed: 2 })
    resetPlayer({ x, y: Y + 0.02, z }, face)
    syncYawToPlayer()
    fx.sparkle(x, Y + 1, z, { count: 24, color: '#7cf0ff', speed: 4 })
    sfx('whoosh', { vol: 0.5, dur: 0.4 })
  }
  function join() {
    state.mode = 'line'
    state.entry = { player: true, s: PATH.project(player.position.x, player.position.z) }
    line.push(state.entry)
    state.leaveHeld = 0
    // A short line: no walk through the empty lanes, straight to your spot behind the last one.
    const target = slotS(line.length - 1)
    if (target - state.entry.s > QUEUE.shortcut) {
      state.entry.s = target
      PATH.at(target, tmp)
      teleport(tmp.x, tmp.z, tmp.yaw)
    } else sfx('pop')
    hud.big("You're in line!", 'green', 1.2)
    refreshHud()
  }
  function leaveLine() {
    const i = line.indexOf(state.entry)
    if (i >= 0) line.splice(i, 1)
    state.entry = null
    state.mode = 'free'
    player.auto = null
    hud.setLine(null)
    hud.status(null)
    hud.toast('You left the line')
  }
  function label(text) {
    D.search.label(text)
  }
  const freeLanes = () => open.filter((l) => !l.busy && !remote?.held(`lane:${lanes.indexOf(l)}`))
  function goToLane(lane, fromBack = false) {
    state.lane = lane
    lane.busy = true
    state.mode = 'turn'
    hud.setLine(null)
    hud.status(null)
    hud.big('YOUR TURN!', 'gold', 1.6)
    sfx('fanfare')
    D.search.show(SEC.skipSearch, skipSearch, { bar: false })
    label("You're up!")
    state.route = [{ x: 58.2, z: lane.z }, { x: SEC.trayX, z: lane.z }]
    // Called from 2nd / 3rd place: along the last lane to the head of the line first.
    if (fromBack) state.route.unshift(PATH.at(PATH.total, {}))
  }
  function pickItems() {
    const tags = queue.result?.tags ?? new Set()
    const tagged = SEC.items.filter((it) => it.tag && tags.has(it.tag))
    const rest = SEC.items.filter((it) => !tagged.includes(it) && !it.tag)
    const others = SEC.items.filter((it) => !tagged.includes(it) && it.tag)
    const shuffle = (a) => a.sort(() => Math.random() - 0.5)
    return [...shuffle(tagged), ...shuffle(rest), ...shuffle(others)].slice(0, 5)
  }
  function bagToTable(mat) {
    // The bag leaves the tray (wherever it is on the rollers) and lands on the table by your mat.
    const tr = state.tray
    if (!pack?.mesh || !tr || !tr.bagSlot.children.length) return
    fly(pack.mesh, v1.set(mat.table.x - 0.55, mat.table.y + 0.12, mat.table.z), { dur: 0.8, arc: 1.2, done: () => sfx('thud', { vol: 0.2 }) })
    tr.phase = 'off'
    tr.g.visible = false
  }
  function startSearch() {
    const M = state.mat
    state.mode = 'search'
    state.t = 0
    state.items = pickItems()
    state.found = 0
    state.pose = TPOSE
    player.auto = { x: M.x, z: M.z, speed: 2, face: Math.PI / 2 }
    M.officer.mode = 'pat'
    crowd.say(M.officer, 'Step onto the mat. Arms out!', 2.6)
    setCameraYaw(2.55, 0.32) // front-left of the mat, clear of the railings
    bagToTable(M)
    D.search.show(SEC.skipSearch, skipSearch, { bar: true })
    hud.status(null)
  }
  function skipSearch() {
    if (!['turn', 'tray', 'detector', 'wait', 'tomat', 'search'].includes(state.mode)) return
    if (!store.spend(SEC.skipSearch)) return
    sfx('coin')
    if (state.mode !== 'search') {
      // Not searched yet: straight past the checkpoint.
      if (state.lane) state.lane.busy = false
      if (state.mat) state.mat.busy = false
      state.mat = null
      teleport(SEC.corridorX, state.lane?.z ?? -26, Math.PI / 2)
    }
    endSearch(true)
  }
  function endSearch(skipped) {
    const M = state.mat
    state.mode = 'cleared'
    state.pose = null
    player.auto = null
    D.search.hide()
    hud.status(null)
    if (state.lane) state.lane.busy = false
    const pp = player.position
    if (M) {
      M.timer.set(null)
      returnOfficer(M)
      const last = state.items[Math.max(0, state.found - 1)]
      crowd.say(M.officer, skipped || !last ? 'Fine, fine. Off you go!' : `Okay... you're free to go. I'm keeping the ${last.name.replace(/^(A |An |The |One |Forty |More )/i, '').toLowerCase()}.`, 3.2)
      clearTableItems(M)
      later(1.5, () => (M.busy = false))
    }
    hud.big('ALL CLEAR!', 'green', 1.8)
    sfx('fanfare')
    fx.confetti(pp.x, pp.y + 2, pp.z, 50)
    store.addCoins(SEC.reward, { x: pp.x, y: pp.y + 1.6, z: pp.z })
    // Your bag comes back to you (from the table, or straight out of the tray).
    if (pack?.mesh) {
      const tr = state.tray
      if (tr && tr.bagSlot.children.length) {
        tr.phase = 'off'
        tr.g.visible = false
      }
      if (pack.mesh.visible && !pack.worn()) {
        later(0.6, () => {
          fly(pack.mesh, v1.set(player.position.x, player.position.y + 1.2, player.position.z), {
            dur: 0.7,
            arc: 1,
            done: () => {
              pack.mesh.visible = false
              pack.setWorn(true)
              sfx('pop')
              fx.sparkle(player.position.x, player.position.y + 1.3, player.position.z, { count: 12, color: '#7cf0ff', speed: 2 })
            },
          })
        })
      }
    }
    state.tray = null
  }

  // --- Door between check-in and security ---------------------------------------------------------------
  let doorK = 0
  let doorWant = 0
  function updateDoor(dt) {
    const sd = SEC.door
    let near = false
    for (const w of walkers) if (Math.abs(w.npc.x - sd.x) < 4 && Math.abs(w.npc.z - sd.z) < 3.5) near = true
    const pp = player.position
    if (Math.abs(pp.x - sd.x) < 4.5 && Math.abs(pp.z - sd.z) < 3.5 && queue.mode === 'checked') near = true
    const want = near ? 1 : 0
    if (want !== doorWant) {
      doorWant = want
      const d = camRef ? camRef.position.distanceTo(v1.set(sd.x, 2, sd.z)) : 30
      sfx('slide', { vol: Math.max(0, 0.4 - d * 0.015) })
    }
    doorK += Math.sign(doorWant - doorK) * Math.min(Math.abs(doorWant - doorK), dt * 1.9)
    interior.secDoor.set(doorK)
  }

  const inHall = (x, z) => x > SEC.hall.x0 - 0.2 && x < SEC.hall.x1 && z < SEC.hall.z0 && z > SEC.hall.z1

  const api = {
    adopt,
    // For the other passengers (net trip): standing in this line / the lane or mat you hold.
    get inLine() {
      return state.mode === 'line'
    },
    get hold() {
      if (['turn', 'tray', 'detector'].includes(state.mode) && state.lane) return `lane:${lanes.indexOf(state.lane)}`
      if (['wait', 'tomat', 'search'].includes(state.mode) && state.mat) return `mat:${mats.indexOf(state.mat)}`
      return ''
    },
    setPack(p) {
      pack = p
    },
    get mode() {
      return state.mode
    },
    get pose() {
      return state.pose
    },
    // NPCs standing in the security line (solid to the player, see lineBlockers.js).
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
      state.entry.s = PATH.total
      PATH.at(PATH.total, tmp)
      teleport(tmp.x, tmp.z, tmp.yaw)
      skipLineOnServer('security')
      refreshHud()
      return true
    },
    // Board The Plane while checked in: straight past security.
    fastTrack() {
      if (state.mode === 'line') leaveLine()
      if (['turn', 'tray', 'detector', 'wait', 'tomat', 'search'].includes(state.mode)) {
        if (state.mode !== 'search') teleport(SEC.corridorX, state.lane?.z ?? -26, Math.PI / 2)
        endSearch(true)
        return true
      }
      teleport(GX - 1, -28, Math.PI / 2)
      state.mode = 'cleared'
      hud.big('FAST TRACK!', 'gold', 1.4)
      return true
    },
    reset() {
      if (state.mode === 'line') leaveLine()
      state.mode = 'off'
      state.pose = null
      hud.setLine(null)
      D.search.hide()
    },
    prompts() {
      const pp = player.position
      if (queue.mode !== 'checked') return null
      if (state.mode === 'cleared') return { prompt: 'Head to the gates!', hint: null }
      if (state.mode === 'free' || state.mode === 'off') {
        if (inHall(pp.x, pp.z)) return { prompt: 'Walk to the queue!', hint: 'Walk to the line to join it!' }
        return { prompt: 'Head to security! →', hint: null }
      }
      return { prompt: null, hint: null }
    },
    actors(out) {
      for (const w of walkers) if (w.npc.z > -16 && w.npc.x < 30) out.push(w.npc)
      return out
    },
    update(dt, t, camera) {
      camRef = camera
      for (let i = timers.length - 1; i >= 0; i--) {
        timers[i].t -= dt
        if (timers[i].t <= 0) timers.splice(i, 1)[0].fn()
      }
      updateDoor(dt)
      updateTrays(dt)
      updateFlights(dt)
      if (queue.mode === 'checked' && state.mode === 'off') state.mode = 'free'
      if (queue.mode !== 'checked' && state.mode !== 'off') api.reset()
      hall.marker.visible = state.mode === 'free'

      // Extra arrivals keep the hall busy when check-in is slow.
      arriveIn -= dt
      if (arriveIn <= 0) {
        arriveIn = rr(SEC.arriveEvery) * 2
        if (line.length < SEC.maxInLine - 4 && Math.random() < (remote?.botShare() ?? 1)) {
          const npc = crowd.add({ x: SEC.door.x - 3, z: SEC.door.z + 1, y: Y, yaw: Math.PI / 2, bag: null })
          if (npc) adopt(npc)
        }
      }

      // Real passengers take their places in the line.
      const online = linesOnServer()
      if (remote) syncRemoteLine(line, remote.lineMembers('security'), PATH.project, PATH.total, online ? myTicket('security') : undefined)
      // Line shuffles forward (never closer than `spacing` to the one ahead, and nobody walks into the player).
      const playerS = PATH.project(player.position.x, player.position.z)
      for (let i = 0; i < line.length; i++) {
        const e = line[i]
        if (e.player || e.remote) continue
        const gap = slotS(i) - e.s
        const speed = gap > 3 ? 3.3 : QUEUE.lineSpeed
        let ds = Math.max(-speed * dt, Math.min(gap, speed * dt))
        if (ds > 0 && i > 0) ds = Math.min(ds, Math.max(0, line[i - 1].s - QUEUE.spacing - e.s))
        PATH.at(e.s + ds, tmp)
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
      // Head of the line to a free open lane (online only bots: the server calls real passengers, below).
      frontCooldown -= dt
      const head = line[0]
      if (head && !head.remote && (head.npc || !online) && frontCooldown <= 0 && head.s >= PATH.total - 0.15) {
        const free = freeLanes()
        if (free.length) {
          const lane = pick(free)
          line.shift()
          frontCooldown = 1
          if (head.player) {
            state.entry = null
            goToLane(lane)
          } else startLane(head.npc, lane)
          refreshHud()
        }
      }
      if (online && state.mode === 'line') {
        const i = line.indexOf(state.entry)
        turn.update(dt, line, state.entry, slotS(i), () => freeLanes().map((l) => `lane:${lanes.indexOf(l)}`), (key, place) => {
          if (state.mode !== 'line') return
          const k = line.indexOf(state.entry)
          if (k >= 0) line.splice(k, 1)
          state.entry = null
          goToLane(lanes[+key.split(':')[1]] ?? open[0], place > 0)
          refreshHud()
        })
      }
      // Walkers.
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
      updateSearches(dt)
      chatterIn -= dt
      if (chatterIn <= 0) {
        chatterIn = 5 + Math.random() * 6
        const e = pick(line)
        if (e?.npc) crowd.say(e.npc, pick(SEC.passengerLines), 3)
      }
      hall.setTimer(Math.max(0, line.length * 2.2 + (open.every((l) => l.busy) ? 4 : 0) - (t % 2.2)))

      // --- The player ---
      const pp = player.position
      if (state.mode === 'free') {
        if (pp.x > JZ.x0 && pp.x < JZ.x1 && pp.z > JZ.z0 && pp.z < JZ.z1) join()
      } else if (state.mode === 'line') {
        const i = line.indexOf(state.entry)
        if (i !== state.shownAt) {
          state.shownAt = i // real passengers ahead joined / left: a new Position In Line
          refreshHud()
        }
        const real = PATH.project(pp.x, pp.z)
        state.entry.s = Math.min(slotS(i), state.entry.s + QUEUE.autoSpeed * dt, real + 1.6)
        PATH.at(state.entry.s, tmp)
        player.auto = { x: tmp.x, z: tmp.z, speed: QUEUE.autoSpeed, face: tmp.yaw }
        const pushing = Math.hypot(inputState.move.x, inputState.move.z) > 0.5
        state.leaveHeld = pushing ? state.leaveHeld + dt : 0
        if (state.leaveHeld > QUEUE.leaveHold) leaveLine()
      } else if (state.mode === 'turn') {
        const p = state.route[0]
        player.auto = { x: p.x, z: p.z, speed: 4 }
        if (Math.hypot(p.x - pp.x, p.z - pp.z) < 0.35) {
          state.route.shift()
          if (!state.route.length) {
            // Bag into a tray on the rollers.
            state.mode = 'tray'
            state.t = 0
            state.pose = REACH
            player.auto = { x: SEC.trayX, z: state.lane.z, speed: 2, face: 0 }
            label('Put your bag in a tray...')
          }
        }
      } else if (state.mode === 'tray') {
        state.t += dt
        if (state.t > 0.45 && !state.tray) {
          state.tray = launchTray(state.lane, pack?.mesh ?? null)
          pack?.setWorn(false)
          sfx('select')
        }
        if (state.t > 1.1) {
          state.pose = null
          state.mode = 'detector'
          label('Walk through the scanner...')
        }
      } else if (state.mode === 'detector') {
        const L = state.lane
        player.auto = { x: SEC.detectorX + 1.0, z: L.z, speed: 2.2 }
        if (pp.x > SEC.detectorX - 0.2 && !state.beeped) {
          state.beeped = true
          L.alarmT = 2
          detectorSound(L, true)
          D.flash()
          hud.big('BEEP BEEP!', 'gold', 1.1)
          fx.sparkle(SEC.detectorX, Y + 2.6, L.z, { count: 16, color: '#ff4040', speed: 3, up: 2 })
        }
        if (Math.abs(pp.x - (SEC.detectorX + 1.0)) < 0.3) {
          state.beeped = false
          L.busy = false
          state.mode = 'wait'
        }
      } else if (state.mode === 'wait') {
        // Off to the nearest vacant search mat (or wait for one; online the server hands them out).
        const free = freeMats(state.lane.z)
        matClaim.update(dt, free.map((m) => `mat:${mats.indexOf(m)}`), (key) => {
          if (state.mode !== 'wait') return
          const mat = mats[+key.split(':')[1]]
          if (!mat) return
          mat.busy = true
          state.mat = mat
          state.mode = 'tomat'
          state.route = [{ x: SEC.laneEndX + 0.6, z: state.lane.z }, { x: SEC.corridorX, z: state.lane.z }, { x: SEC.corridorX, z: mat.z }, { x: mat.x, z: mat.z }]
          label('Head to a free search mat...')
          crowd.say(mat.officer, pick(['Over here!', 'This way, please!', 'Beep beep. You know what that means.']), 2.4)
          mat.officer.mode = 'wave'
        })
        if (state.mode === 'wait') {
          player.auto = { x: SEC.laneEndX + 0.2, z: state.lane.z, speed: 2 }
          if (!free.length) label('Waiting for a free search area...')
        }
      } else if (state.mode === 'tomat') {
        const p = state.route[0]
        player.auto = { x: p.x, z: p.z, speed: 4 }
        if (Math.hypot(p.x - pp.x, p.z - pp.z) < 0.35) {
          state.route.shift()
          if (!state.route.length) startSearch()
        }
      } else if (state.mode === 'search') {
        const M = state.mat
        state.t += dt
        const T = SEC.searchTime
        const left = Math.max(0, T - state.t)
        D.search.update(left, Math.min(1, state.t / T))
        M.timer.set(left)
        circleOfficer(M, { x: pp.x, z: pp.z }, state.t)
        if (Math.random() < dt * 3) sfx('pat', { vol: 0.12 })
        const at = [0.08, 0.27, 0.46, 0.65, 0.84]
        if (state.found < state.items.length && state.t / T > at[state.found]) {
          const it = state.items[state.found]
          const k = state.found
          state.found++
          D.search.found(it, state.found)
          crowd.say(M.officer, it.line, 4)
          M.officer.mode = 'hold'
          setTimeout(() => M.officer.mode === 'hold' && (M.officer.mode = 'pat'), 1300)
          popItem(k, it.icon, v1.set(pp.x, pp.y + 1.2, pp.z).clone(), new Vector3(M.table.x - 0.1 + (k % 3) * 0.4, M.table.y + 0.25, M.table.z + (k < 3 ? -0.15 : 0.2)))
          fx.sparkle(pp.x, pp.y + 1.5, pp.z, { count: 14, color: '#ffd84a', speed: 3, up: 3 })
        }
        if (state.t >= T) endSearch(false)
      } else if (state.mode === 'cleared') {
        // Free to roam; heading to the gates is the next step.
      }
    },
  }
  return api
}

export const securityLength = PATH.total
