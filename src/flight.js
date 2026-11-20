// On board and beyond. "now boarding" -> you're in your seat in a full cabin: the seatbelt chime,
// "Cabin crew, prepare for takeoff!", the engines spool, the take-off roll and "Wheels up!" (camera
// tilts and shakes, gear thunks up). Then you cruise: "Seat 24E | Cruising to New York | 4:10" with
// Skip Time (coins); you can get up and walk the aisle, the crew walk up and down, people chat, a
// little turbulence now and then. Landing: chime, touchdown screech, applause, then you step out into
// the destination's street ("Welcome to New York!", coins, the city stamped as visited) with a big
// Fly Again button (or walk back into the "departures · fly again" doors) to start a new trip.
import { Vector3 } from 'three'
import { AIRPORT, CITIES, DESTINATIONS, FLIGHT, PRICES, SPAWN, SPAWN_FACING } from './config.js'
import { player, resetPlayer } from './player.js'
import { syncYawToPlayer } from './camera.js'
import { sfx, turbineLoop } from './audio.js'
import { angTo } from './linepath.js'
import { lockSeat, seating, sit, standUp } from './seating.js'
import { fmtClock as clock } from './airport/gates.js'

const rr = (a, b) => a + Math.random() * (b - a)
const pick = (a) => a[Math.floor(Math.random() * a.length)]
const ease = (t) => t * t * (3 - 2 * t)

export function createFlight({ crowd, cabin, city, hud, store, queue, fx, onFlyAgain, onArrived, botShare = () => 1 }) {
  const CB = FLIGHT.cabin
  const F = cabin.floorY
  const st = { mode: 'off', t: 0, cut: null, left: FLIGHT.cruiseTime, seat: null, code: '24E', said: 0, shake: 0, turbIn: 40, crewIn: 3, chatIn: 5, hornIn: 3, near: false }
  const pax = []
  const peds = []
  let crew = null
  let crewWalk = null
  let drone = null
  const look = new Vector3()
  const pos = new Vector3()
  const dest = () => DESTINATIONS[queue.destIndex] ?? DESTINATIONS[0]

  function clearPax() {
    for (const n of pax) crowd.remove(n)
    pax.length = 0
    for (const s of cabin.seats) s.npc = null
    if (crew) crowd.remove(crew)
    crew = null
  }
  function fillCabin(mySeat) {
    clearPax()
    // Busier around you, thinner toward the ends; nobody in your seat.
    const seats = cabin.seats.filter((s) => s !== mySeat).sort((a, b) => Math.abs(a.row - mySeat.row) - Math.abs(b.row - mySeat.row) + (Math.random() - 0.5) * 14)
    // Real passengers on this flight take seats too: bots only fill the rest (botShare).
    for (const s of seats.slice(0, Math.round(FLIGHT.passengers * botShare()))) {
      const n = crowd.add({ x: s.x, z: s.z, y: s.y - 0.555, yaw: Math.PI, bag: null, pack: false })
      if (!n) break
      n.mode = 'sit'
      n.data.phone = Math.random() < 0.3
      s.npc = n
      pax.push(n)
    }
    const c = cabin.crewSpot
    crew = crowd.add({ x: c.x, z: c.z, y: F, yaw: c.yaw, bag: null, pack: false, shirt: '#1d2b52', arms: '#1d2b52', pants: '#16203d', hat: true, hatColor: '#16203d', name: 'cabin crew' })
    crewWalk = { dir: 1, pause: 4 }
  }
  function seatMe(locked) {
    const s = st.seat
    // the body waits in the aisle beside your row; the avatar is drawn in the seat
    sit(s, { x: CB.x, y: F + 0.02, z: s.z }, { locked, quiet: !!locked, cam: { x: CB.x, z: s.z + 0.4 } })
  }

  // --- Boarding -> take-off ----------------------------------------------------------------------------
  function board() {
    const d = dest()
    st.code = queue.result?.seat ?? '24E'
    st.seat = cabin.seatFor(st.code)
    cabin.setVisible(true)
    fillCabin(st.seat)
    seatMe(true)
    hud.showBoard(false)
    hud.setMode('cutscene')
    hud.cine.bars(true)
    hud.cine.skip(true)
    hud.cine.onSkip(() => endTakeoff())
    st.mode = 'takeoff'
    st.cut = { t: 0, said: 0 }
    drone ??= turbineLoop()
    drone.set(0.16, 0.15, 1)
    setTimeout(() => hud.nowBoarding(false), 500)
    void d
  }
  function takeoffCam(camera, c) {
    const S = st.seat
    if (c.t < 4.6) {
      // down the aisle, a few rows behind you, looking toward the galley
      const z = cabin.rowZ(Math.min(FLIGHT.rows, S.row + 4))
      pos.set(CB.x + 0.05, F + 1.95, z)
      look.set(CB.x, F + 1.35, cabin.zFront)
      camera.position.copy(pos)
      camera.lookAt(look)
    } else {
      // from the back, high, tilted up with the climb
      const k = ease(Math.min(1, (c.t - 4.6) / 2))
      pos.set(CB.x + 1.1, F + 2.35, cabin.zBack - 0.9)
      look.set(CB.x - 0.3, F + 1.2 + k * 0.5, cabin.zFront)
      camera.position.copy(pos)
      camera.lookAt(look)
      camera.rotateZ(-0.05 * k)
    }
    if (st.shake > 0) {
      camera.position.x += (Math.random() - 0.5) * st.shake * 0.06
      camera.position.y += (Math.random() - 0.5) * st.shake * 0.06
    }
    camera.fov = 62
    camera.updateProjectionMatrix()
  }
  function updateTakeoff(dt) {
    const c = st.cut
    c.t += dt
    if (c.t > 0.8 && c.said < 1) {
      c.said = 1
      sfx('bingBong')
      hud.cine.subtitle('Cabin crew, prepare for takeoff!')
      if (crew) crew.mode = 'wave'
    }
    if (c.t > 3 && c.said < 2) {
      c.said = 2
      if (crew) crew.mode = 'idle'
    }
    if (c.t > 4.6 && c.said < 3) {
      c.said = 3
      hud.cine.subtitle('Wheels up!')
      sfx('rumble', { dur: 6, vol: 0.45 })
    }
    if (c.t > 8.6 && c.said < 4) {
      c.said = 4
      sfx('gear', { vol: 0.5 })
    }
    const rpm = c.t < 4.6 ? 0.2 + c.t * 0.05 : Math.min(1, 0.45 + (c.t - 4.6) * 0.2)
    drone?.set(0.18 + rpm * 0.18, rpm, 0.85)
    st.shake = c.t > 4.6 && c.t < 9.2 ? 0.6 + (c.t - 4.6) * 0.1 : Math.max(0, st.shake - dt)
    if (c.t > 10.4) endTakeoff()
  }
  function endTakeoff() {
    if (st.mode !== 'takeoff') return
    st.cut = null
    hud.nowBoarding(false)
    hud.cine.subtitle(null)
    hud.cine.bars(false)
    hud.cine.skip(false)
    hud.setMode('play')
    lockSeat(false)
    st.mode = 'cruise'
    st.left = FLIGHT.cruiseTime
    st.shake = 0
    syncYawToPlayer()
    cruiseHud()
    hud.toast('Seatbelt sign is off: walk around or sit back and relax!')
  }
  function cruiseLabel() {
    return `Seat ${st.code}  |  Cruising to ${dest().name}  |  ${clock(st.left)}`
  }
  function cruiseHud() {
    hud.action({ label: cruiseLabel(), text: 'Skip Time', color: 'blue', price: PRICES.skipTime, onTap: skipTime })
  }
  function skipTime() {
    if (st.mode !== 'cruise') return
    hud.confirm('Skip Time', PRICES.skipTime, () => {
      st.left = 0
    }, `Skip the rest of the flight and land in ${dest().name} now.`)
  }

  // --- Landing -> the city ------------------------------------------------------------------------------
  function land() {
    st.mode = 'landing'
    st.cut = { t: 0, said: 0 }
    hud.action(null)
    if (!seating.active) {
      fx.puff(player.position.x, player.position.y + 0.8, player.position.z, { count: 10, color: '#ffffff', size: 0.4, alpha: 0.5, life: 0.6 })
    } else standUp()
    seatMe(true)
    hud.setMode('cutscene')
    hud.cine.bars(true)
    hud.cine.skip(true)
    hud.cine.onSkip(() => arrive())
  }
  function updateLanding(dt) {
    const c = st.cut
    c.t += dt
    if (c.t > 0.5 && c.said < 1) {
      c.said = 1
      sfx('bingBong')
      hud.cine.subtitle('Cabin crew, prepare for landing!')
    }
    if (c.t > 3.6 && c.said < 2) {
      c.said = 2
      sfx('touchdown', { vol: 0.55 })
      st.shake = 1.4
      hud.cine.subtitle(`Welcome to ${dest().name}!`)
    }
    if (c.t > 4.6 && c.said < 3) {
      c.said = 3
      sfx('cheer', { vol: 0.4 })
      for (const n of pax) if (Math.random() < 0.5) n.data.stretch = 1.4
    }
    if (c.t > 6.6 && c.said < 4) {
      c.said = 4
      hud.nowBoarding(true, `arriving in ${dest().name.toLowerCase()}`)
    }
    st.shake = Math.max(0, st.shake - dt * 0.7)
    drone?.set(0.22, c.t < 3.6 ? 0.55 : Math.max(0.1, 0.8 - (c.t - 3.6) * 0.25), 0.85)
    if (c.t > 7.8) arrive()
  }
  function arrive() {
    if (st.mode !== 'landing') return
    st.cut = null
    const d = dest()
    lockSeat(false)
    if (seating.active) standUp()
    clearPax()
    cabin.setVisible(false)
    drone?.set(0, 0, 1)
    hud.nowBoarding(true, `arriving in ${d.name.toLowerCase()}`)
    city.build(d.code)
    const sp = city.spawn()
    resetPlayer({ x: sp.x, y: sp.y, z: sp.z }, 0)
    syncYawToPlayer()
    spawnPeds()
    hud.cine.subtitle(null)
    hud.cine.bars(false)
    hud.cine.skip(false)
    hud.setMode('play')
    st.mode = 'city'
    setTimeout(() => {
      hud.nowBoarding(false)
      hud.big(`WELCOME TO ${d.name.toUpperCase()}!`, 'gold', 2.4)
      sfx('fanfare')
      const p = player.position
      fx.confetti(p.x, p.y + 3, p.z, 70)
      store.addCoins(FLIGHT.reward, { x: p.x, y: p.y + 1.6, z: p.z })
      if (store.visit(d.code)) setTimeout(() => hud.toast(`${d.name} stamped in your Destinations!`), 1600)
      store.addFlight()
      onArrived?.(d)
    }, 600)
    hud.action({ label: `Welcome to ${d.name}!`, text: 'Fly Again', color: 'green', onTap: flyAgain })
  }
  function spawnPeds() {
    for (const n of peds) crowd.remove(n.npc)
    peds.length = 0
    const O = city.origin
    for (let i = 0; i < 12; i++) {
      const side = i % 2 ? 1 : -1
      const z = rr(-4, 140)
      const n = crowd.add({ x: O.x + side * rr(8.6, 11), z: O.z + z, y: O.y + 0.2, yaw: 0, bag: Math.random() < 0.3 ? undefined : null })
      if (n) peds.push({ npc: n, dir: Math.random() < 0.5 ? 1 : -1, speed: rr(1.3, 2.2), side })
    }
  }
  function flyAgain() {
    if (st.mode !== 'city') return
    st.mode = 'leaving'
    hud.action(null)
    hud.nowBoarding(true, 'heading back to the airport')
    sfx('whoosh', { vol: 0.4, dur: 0.8 })
    setTimeout(() => {
      for (const n of peds) crowd.remove(n.npc)
      peds.length = 0
      city.clear()
      resetPlayer(SPAWN, SPAWN_FACING)
      syncYawToPlayer()
      queue.resetTrip()
      onFlyAgain?.()
      hud.showBoard(true)
      st.mode = 'off'
      setTimeout(() => {
        hud.nowBoarding(false)
        hud.big('FLY AGAIN!', 'green', 1.6)
        sfx('chime')
        hud.toast('Check in for your next flight: pick a new destination at the desk!')
      }, 500)
    }, 1700)
  }

  // --- Cruise life -----------------------------------------------------------------------------------------
  function updateCrew(dt) {
    if (!crew || !crewWalk) return
    const w = crewWalk
    if (w.pause > 0) {
      w.pause -= dt
      crew.speed = 0
      if (w.pause <= 0 && Math.random() < 0.5) crowd.say(crew, pick(FLIGHT.crewLines), 2.6)
      return
    }
    const target = w.dir > 0 ? cabin.rowZ(FLIGHT.rows) : cabin.rowZ(1) - 0.6
    const dz = target - crew.z
    const step = Math.min(Math.abs(dz), 1.1 * dt)
    crew.z += Math.sign(dz) * step
    crew.x = CB.x
    crew.speed = step / dt
    crew.yaw = angTo(crew.yaw, w.dir > 0 ? 0 : Math.PI, dt * 6)
    if (Math.abs(dz) < 0.05) {
      w.dir = -w.dir
      w.pause = rr(3, 6)
    } else if (Math.random() < dt * 0.08) w.pause = rr(1.5, 3)
  }

  return {
    board,
    get mode() {
      return st.mode
    },
    get active() {
      return st.mode !== 'off'
    },
    inCabin: () => ['takeoff', 'cruise', 'landing'].includes(st.mode),
    inCity: () => st.mode === 'city' || st.mode === 'leaving',
    camera(camera) {
      if (!st.cut) return false
      takeoffCam(camera, st.cut)
      return true
    },
    update(dt) {
      if (st.mode === 'takeoff') updateTakeoff(dt)
      else if (st.mode === 'landing') updateLanding(dt)
      else if (st.mode === 'cruise') {
        st.left = Math.max(0, st.left - dt)
        hud.actionLabel(cruiseLabel())
        drone?.set(0.2, 0.62, 1)
        updateCrew(dt)
        // back to your seat: walk up to it
        const s = st.seat
        if (!seating.active && seating.cooldown <= 0 && Math.abs(player.position.z - s.z) < 0.5 && Math.abs(player.position.x - CB.x) < 0.9) seatMe(false)
        st.chatIn -= dt
        if (st.chatIn <= 0) {
          st.chatIn = rr(4, 9)
          const n = pick(pax)
          if (n) crowd.say(n, pick(FLIGHT.cabinLines), 3)
        }
        st.turbIn -= dt
        if (st.turbIn <= 0) {
          st.turbIn = rr(35, 60)
          sfx('bingBong', { vol: 0.25 })
          sfx('rumble', { dur: 1.6, vol: 0.18 })
          hud.toast('A little turbulence... hold on!')
          for (const n of pax) if (Math.random() < 0.4) n.scare = 0.6
        }
        if (st.left <= 0) land()
      } else if (st.mode === 'city') {
        const O = city.origin
        const pp = player.position
        const b = city.built
        const near = b && Math.abs(pp.x - b.door.x) < 3 && pp.z - b.door.z < 4.5
        city.update(dt, near)
        if (b && Math.abs(pp.x - b.door.x) < 1.6 && pp.z - b.door.z < 1.4) flyAgain()
        for (const p of peds) {
          const n = p.npc
          n.z += p.dir * p.speed * dt
          n.speed = p.speed
          n.yaw = p.dir > 0 ? 0 : Math.PI
          if (n.z > O.z + 150) p.dir = -1
          if (n.z < O.z - 4) p.dir = 1
        }
        st.hornIn -= dt
        if (st.hornIn <= 0) {
          st.hornIn = rr(4, 11)
          sfx('carHorn', { vol: 0.08, f: pick([380, 415, 466]), dur: pick([0.18, 0.3, 0.5]), pan: Math.random() * 1.4 - 0.7 })
        }
        void CITIES
      } else if (st.mode === 'leaving') city.update(dt, false)
    },
    // Indoors for the ambience mix (the cabin).
    indoor: () => ['takeoff', 'cruise', 'landing'].includes(st.mode),
  }
}
void AIRPORT
