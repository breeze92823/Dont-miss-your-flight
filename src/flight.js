// On board and beyond. "now boarding" -> you're in your seat (your class: a First suite, a Business pod,
// a Premium recliner or an Economy seat) in the widebody cabin (airport/cabin.js): the seatbelt chime, the
// lights dim, "Cabin crew, prepare for takeoff!", the engines spool, the take-off roll and "Wheels up!"
// (camera tilts and shakes, gear thunks up, clouds stream past the windows). Then you cruise: "Seat 24E |
// Cruising to New York | 4:10" with Skip Time (coins), the moving map on every screen, mood lighting. You can
// get up and walk aft any time; forward past your class the crew stop you (cabinCrew.js: warnings, an
// upgrade offer for coins, walked back to your seat), unless you sneak up there during the meal service.
// The meal comes to your seat (stay in it!). Landing: seatbelt sign, trays stowed, sunset sky, touchdown
// screech, applause, then you step out into the destination's street ("Welcome to New York!", coins, the
// city stamped as visited) with a big Fly Again button (or walk back into the "departures · fly again"
// doors) to start a new trip.
import { Vector3 } from 'three'
import { AIRPORT, CITIES, DESTINATIONS, FLIGHT, HOME_AIRPORT, PRICES, SPAWN, SPAWN_FACING } from './config.js'
import { player, resetPlayer } from './player.js'
import { setCameraZone, syncYawToPlayer } from './camera.js'
import { sfx, turbineLoop } from './audio.js'
import { lockSeat, seating, sit, standUp } from './seating.js'
import { fmtClock as clock } from './airport/gates.js'
import { createCabinCrew } from './cabinCrew.js'

const rr = (a, b) => a + Math.random() * (b - a)
const pick = (a) => a[Math.floor(Math.random() * a.length)]
const ease = (t) => t * t * (3 - 2 * t)
const CLASS_OF = { first: 0, business: 1, premium: 2, economy: 3 }

// seatTaken(seat): a real passenger is already sitting there (the cabin is shared by every flight).
// others(): the real passengers drawn in the cabin (they part the curtains too).
export function createFlight({ scene, crowd, cabin, city, hud, store, queue, fx, onFlyAgain, onArrived, botShare = () => 1, seatTaken = () => false, others = () => [] }) {
  const F = cabin.floorY
  const st = { mode: 'off', t: 0, cut: null, left: FLIGHT.cruiseTime, seat: null, code: '24E', cls: 3, moved: null, shake: 0, turbIn: 40, chatIn: 5, hornIn: 3, cruiseT: 0, offer: null, beltT: 0, turbBelt: 0 }
  const pax = []
  const peds = []
  let drone = null
  const look = new Vector3()
  const pos = new Vector3()
  const dest = () => DESTINATIONS[queue.destIndex] ?? DESTINATIONS[0]
  const free = (s) => s && !s.npc && !seatTaken(s)

  // What the crew needs to know about you (and can do to you).
  const trip = {
    get seat() {
      return st.seat
    },
    get cls() {
      return st.cls
    },
    get code() {
      return st.code
    },
    get tags() {
      return queue.result?.tags
    },
    returnToSeat(belted) {
      if (seating.active) standUp()
      seatMe(true)
      st.beltT = belted
    },
    upgradeTo(k) {
      const mine = st.seat
      const s = cabin.seatsOf(k).filter(free).sort((a, b) => Math.abs(a.x - mine.x) - Math.abs(b.x - mine.x) + (a.row - b.row) * 0.01)[0]
      if (!s) return null
      st.seat = s
      st.code = s.code
      st.cls = k
      const c = FLIGHT.classes[k]
      if (queue.result) {
        queue.result.cls = c.name.toUpperCase()
        queue.result.classId = c.id
        queue.result.seat = s.code
      }
      fx.sparkle(s.x, s.y + 1.2, s.z, { count: 30, color: c.color, size: 0.3, speed: 2, up: 2, life: 1.4, grav: 1 })
      if (!st.offer) cruiseHud()
      return s.code
    },
    // The crew's upgrade offer takes over the action button for a while (null gives Skip Time back).
    offer(cfg) {
      st.offer = cfg
      if (cfg) hud.action(cfg)
      else if (st.mode === 'cruise') cruiseHud()
    },
  }
  const crew = createCabinCrew({ scene, crowd, cabin, hud, store, fx, trip })

  function clearPax() {
    for (const n of pax) crowd.remove(n)
    pax.length = 0
    for (const s of cabin.seats) s.npc = null
  }
  function fillCabin(mySeat) {
    clearPax()
    // Busier around you, thinner toward the ends; nobody in your seat. Real passengers on this flight take
    // seats too: bots only fill the rest (botShare; none at all with PASSENGERS.bots off).
    const n = Math.round(FLIGHT.passengers * botShare())
    if (n <= 0) return
    const seats = cabin.seats.filter((s) => s !== mySeat && !seatTaken(s)).sort((a, b) => Math.abs(a.z - mySeat.z) - Math.abs(b.z - mySeat.z) + (Math.random() - 0.5) * 14)
    for (const s of seats.slice(0, n)) {
      const p = crowd.add({ x: s.x, z: s.z, y: s.y - 0.555, yaw: Math.PI, bag: null, pack: false })
      if (!p) break
      p.mode = 'sit'
      p.data.phone = Math.random() < 0.3
      s.npc = p
      pax.push(p)
    }
  }
  // The body waits in the aisle beside the row; the avatar is drawn in the seat.
  function sitIn(s, locked) {
    sit(s, { x: s.aisleX, y: F + 0.02, z: s.z }, { locked, quiet: !!locked, cam: { x: s.aisleX, z: s.z + 0.4 } })
  }
  const seatMe = (locked) => sitIn(st.seat, locked)

  // --- Boarding -> take-off ----------------------------------------------------------------------------
  function board() {
    const d = dest()
    st.moved = null
    st.cls = CLASS_OF[queue.result?.classId] ?? 3
    st.code = queue.result?.seat ?? '24E'
    st.seat = cabin.seatFor(st.code)
    if (!st.seat || st.seat.cls !== st.cls) st.seat = cabin.seatsOf(st.cls)[0]
    // Someone from another flight already sits there: the crew moves you to the nearest free seat (your
    // class first).
    if (seatTaken(st.seat)) {
      const mine = st.seat
      const near = (a, b) => Math.abs(a.z - mine.z) * 3 + Math.abs(a.x - mine.x) - (Math.abs(b.z - mine.z) * 3 + Math.abs(b.x - mine.x))
      const s = cabin.seatsOf(st.cls).filter(free).sort(near)[0] ?? cabin.seats.filter((q) => q.cls >= st.cls && free(q)).sort(near)[0]
      if (s) {
        st.moved = st.code
        st.seat = s
        st.cls = s.cls
      }
    }
    st.code = st.seat.code
    cabin.setVisible(true)
    cabin.setMood('board')
    cabin.setSeatbelt(true)
    cabin.setSky(0)
    cabin.setRoute(HOME_AIRPORT.code, d.code, d.color)
    cabin.setProgress(0, `${HOME_AIRPORT.name} to ${d.name}`)
    fillCabin(st.seat)
    crew.start()
    seatMe(true)
    setCameraZone({ maxDistance: 5.2, maxPitch: 0.75 })
    hud.showBoard(false)
    hud.setMode('cutscene')
    hud.cine.bars(true)
    hud.cine.skip(true)
    hud.cine.onSkip(() => endTakeoff())
    st.mode = 'takeoff'
    st.cut = { t: 0, said: 0 }
    st.cruiseT = 0
    drone ??= turbineLoop()
    drone.set(0.16, 0.15, 1)
    setTimeout(() => hud.nowBoarding(false), 500)
  }
  function takeoffCam(camera, c) {
    const S = st.seat
    const ax = S.aisleX
    if (c.t < 4.6) {
      // down the aisle, a few rows behind you, looking toward the nose
      pos.set(ax + 0.05, F + 1.95, Math.min(cabin.zBack - 1.2, S.z + 3.2))
      look.set(ax, F + 1.35, cabin.zFront)
      camera.position.copy(pos)
      camera.lookAt(look)
    } else {
      // further back and high, tilted up with the climb
      const k = ease(Math.min(1, (c.t - 4.6) / 2))
      pos.set(ax + (ax > 0 ? -0.9 : 0.9), F + 2.5, Math.min(cabin.zBack - 1.2, S.z + 7))
      look.set(ax * 0.6, F + 1.2 + k * 0.5, cabin.zFront)
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
      cabin.setMood('dim')
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
    cabin.setSky(c.t < 4.6 ? 0 : Math.max(0.03, 0.4 - (c.t - 4.6) * 0.06))
    cabin.setProgress(Math.min(0.03, c.t * 0.003), `Climbing out of ${HOME_AIRPORT.name}`)
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
    st.cruiseT = 0
    cabin.setMood('cruise')
    cabin.setSky(0.03)
    cabin.setSeatbelt(false)
    sfx('ding', { vol: 0.35 })
    syncYawToPlayer()
    cruiseHud()
    hud.toast(`Seatbelt sign is off! Welcome to ${FLIGHT.classes[st.cls].name}: walk aft any time, but stay out of the cabins ahead.`)
    if (st.moved) setTimeout(() => hud.toast(`Someone was in ${st.moved}: the crew moved you to ${st.code}.`), 2500)
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
    st.offer = null
    hud.action(null)
    if (!seating.active) {
      fx.puff(player.position.x, player.position.y + 0.8, player.position.z, { count: 10, color: '#ffffff', size: 0.4, alpha: 0.5, life: 0.6 })
    } else standUp()
    seatMe(true)
    cabin.setMood('landing')
    cabin.setSeatbelt(true)
    cabin.setSky(0.12)
    crew.stowMeals()
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
      hud.cine.subtitle('Cabin crew, prepare for landing! Please stow your tray tables.')
    }
    if (c.t > 3.6 && c.said < 2) {
      c.said = 2
      sfx('touchdown', { vol: 0.55 })
      st.shake = 1.4
      cabin.setSky(0)
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
    cabin.setProgress(Math.min(1, 0.96 + c.t * 0.006), `Arriving in ${dest().name}`)
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
    crew.stop()
    cabin.setVisible(false)
    cabin.setSeatbelt(false)
    setCameraZone(null)
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
  // Walk into any free seat to sit in it (your own, or one you sneak into); move / jump to stand.
  function trySit() {
    if (seating.active || seating.cooldown > 0 || crew.escorting) return
    const pp = player.position
    // your own seat: from the aisle beside your row
    const s = st.seat
    if (Math.abs(pp.z - s.z) < 0.5 && Math.abs(pp.x - s.aisleX) < 0.6) return seatMe(false)
    let best = null
    let bd = 0.42
    for (const q of cabin.seats) {
      const d = Math.hypot(pp.x - q.x, pp.z - q.z)
      if (d < bd && free(q)) {
        bd = d
        best = q
      }
    }
    if (best) sitIn(best, false)
  }
  function turbulence() {
    sfx('bingBong', { vol: 0.25 })
    sfx('rumble', { dur: 1.6, vol: 0.18 })
    cabin.setSeatbelt(true)
    st.turbBelt = 6
    hud.toast('A little turbulence... the seatbelt sign is on!')
    for (const n of pax) if (Math.random() < 0.4) n.scare = 0.6
    const pp = player.position
    fx.puff(pp.x, pp.y + 2.4, pp.z, { count: 6, size: 0.4, spread: 1.2, up: -0.3, speed: 0.4, life: 1.2, alpha: 0.12, color: '#ffffff' })
    setTimeout(() => sfx('clink', { vol: 0.12 }), 300)
  }

  return {
    board,
    get mode() {
      return st.mode
    },
    get active() {
      return st.mode !== 'off'
    },
    get seat() {
      return st.seat
    },
    get cls() {
      return st.cls
    },
    crew,
    inCabin: () => ['takeoff', 'cruise', 'landing'].includes(st.mode),
    inCity: () => st.mode === 'city' || st.mode === 'leaving',
    camera(camera) {
      if (!st.cut) return false
      takeoffCam(camera, st.cut)
      return true
    },
    update(dt) {
      const inCabin = st.mode === 'takeoff' || st.mode === 'cruise' || st.mode === 'landing'
      if (inCabin) {
        cabin.update(dt)
        crew.update(dt, st.mode, st.cruiseT, others())
      }
      if (st.mode === 'takeoff') updateTakeoff(dt)
      else if (st.mode === 'landing') updateLanding(dt)
      else if (st.mode === 'cruise') {
        st.cruiseT += dt
        st.left = Math.max(0, st.left - dt)
        if (!st.offer) hud.actionLabel(cruiseLabel())
        cabin.setProgress(0.03 + 0.93 * (1 - st.left / FLIGHT.cruiseTime), `${dest().name} · ${clock(st.left)} to go`)
        drone?.set(0.2, 0.62, 1)
        // the escort's seatbelt: locked in your seat for a while
        if (st.beltT > 0) {
          st.beltT -= dt
          if (st.beltT <= 0 && seating.seat === st.seat) lockSeat(false)
        }
        if (st.turbBelt > 0) {
          st.turbBelt -= dt
          if (st.turbBelt <= 0 && st.beltT <= 0) {
            cabin.setSeatbelt(false)
            sfx('ding', { vol: 0.2 })
          }
        }
        trySit()
        st.chatIn -= dt
        if (st.chatIn <= 0) {
          st.chatIn = rr(4, 9)
          const n = pick(pax)
          if (n) crowd.say(n, pick(FLIGHT.cabinLines), 3)
        }
        st.turbIn -= dt
        if (st.turbIn <= 0) {
          st.turbIn = rr(45, 70)
          turbulence()
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
