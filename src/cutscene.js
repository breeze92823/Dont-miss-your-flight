// Opening cutscene (~13 s, skippable): a taxi drives up to the terminal curb
// and brakes (nose dive, brake lights, squeal, dust), the rear door swings
// open, the player climbs out with their suitcase and hops up the curb, slams
// the door, checks the time - "You're late!" - and runs for the doors while
// the taxi honks and pulls away. Then the letterbox opens and the camera
// glides into the normal chase camera at the entrance.
import { Vector3 } from 'three'
import { AIRPORT, CAMERA, SPAWN, SPAWN_FACING } from './config.js'
import { engineLoop, sfx } from './audio.js'

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)
const ease = (t) => t * t * (3 - 2 * t)
const lerp = (a, b, t) => a + (b - a) * t
const deg = (d) => (d * Math.PI) / 180

// Taxi drive-in: 16 m/s, braking from T_BRAKE to a stop at T_STOP on the stop mark.
const STOP = AIRPORT.taxiStop
const V0 = 16
const T_BRAKE = 3.4
const T_STOP = 7.0
const X0 = STOP.x + V0 * T_BRAKE + (V0 * (T_STOP - T_BRAKE)) / 2
const T_LEAVE = 11.3
const END = 13.4

function taxiX(t) {
  if (t < T_BRAKE) return X0 - V0 * t
  if (t < T_STOP) {
    const u = t - T_BRAKE
    const dec = V0 / (T_STOP - T_BRAKE)
    return X0 - V0 * T_BRAKE - (V0 * u - 0.5 * dec * u * u)
  }
  return STOP.x
}
function taxiSpeed(t) {
  if (t < T_BRAKE) return V0
  if (t < T_STOP) return V0 * (1 - (t - T_BRAKE) / (T_STOP - T_BRAKE))
  return 0
}

// Overlay poses for the avatar (character space: +X swings a limb backward).
const WATCH = { ArmL1: { x: deg(-95), z: deg(25) }, ArmL2: { x: deg(-70) }, Neck1: { x: deg(18), y: deg(-15) } }
const CLIMB = { Spine1: { x: deg(28) }, Neck1: { x: deg(-12) }, ArmR1: { x: deg(-40) }, LegL1: { x: deg(-50) }, LegL2: { x: deg(60) } }

export function createCutscene({ camera, exterior, hud, fx, suitcase }) {
  const taxi = exterior.taxi
  const door = taxi.door
  const engine = engineLoop()
  const actor = { x: 0, y: 0, z: 0, facing: Math.PI, speed: 0, grounded: true, vy: 0, visible: false, overlay: null, overlayWeight: 0, indoor: false }
  const cam = { pos: new Vector3(), look: new Vector3(), fov: 50 }
  const tmp = new Vector3()
  let t = 0
  let shake = 0
  let pitch = 0
  let pitchV = 0
  let doorAngle = 0
  let doorTarget = 0
  let doorV = 0
  let leaveX = STOP.x
  let leaveZ = STOP.z
  let leaveV = 0
  let shot = -1
  let done = false
  const events = []
  const at = (time, fn) => events.push({ time, fn })

  // --- Timeline events ---------------------------------------------------------------------
  at(0.0, () => {
    hud.cine.bars(true)
    hud.cine.skip(true)
  })
  at(0.6, () => hud.cine.title(true))
  at(3.3, () => hud.cine.title(false))
  at(T_BRAKE + 0.1, () => sfx('brake', { vol: 0.55 }))
  at(T_STOP, () => {
    for (const s of [-1, 1]) {
      tmp.set(s * 0.82, 0.1, 1.45)
      taxi.root.localToWorld(tmp)
      fx.puff(tmp.x, 0.15, tmp.z, { count: 7, color: '#cfc8bd', size: 0.4, grow: 3, alpha: 0.4, life: 1.2, speed: 1.2 })
    }
  })
  at(7.9, () => {
    doorTarget = 1.15
    sfx('doorOpen', { vol: 0.7 })
  })
  at(8.25, () => (actor.visible = true))
  at(8.7, () => {
    suitcase.show(true)
    suitcase.reset()
  })
  at(9.75, () => {
    sfx('land', { vol: 0.45 })
    fx.puff(actor.x, AIRPORT.walkY + 0.05, actor.z, { count: 6, size: 0.3, alpha: 0.35, life: 0.7 })
  })
  at(10.25, () => {
    doorTarget = 0
  })
  at(10.45, () => {
    sfx('doorSlam', { vol: 0.9 })
    shake = 0.12
    pitchV += 0.25
    tmp.set(-1.0, 0.9, -0.7)
    taxi.root.localToWorld(tmp)
    fx.puff(tmp.x, tmp.y, tmp.z, { count: 8, color: '#ffffff', size: 0.25, grow: 2.5, alpha: 0.3, life: 0.6, speed: 1.4, up: 0.2 })
  })
  at(10.95, () => {
    hud.cine.subtitle("You're late!")
    sfx('sting')
  })
  for (let k = 0; k < 6; k++) at(11.05 + k * 0.33, () => sfx('tick', { vol: 0.25 }))
  at(T_LEAVE, () => sfx('horn', { vol: 0.25 }))
  at(11.9, () => sfx('whoosh', { vol: 0.25, dur: 0.5 }))

  // --- Shots ---------------------------------------------------------------------------------
  // Each returns camera position / look-at / fov for local time u (0..1) within the shot.
  const shots = [
    {
      // Arrival: low on the sidewalk, looking down the drop-off lane as the taxi comes in.
      from: 0,
      to: T_BRAKE,
      cam(u) {
        cam.pos.set(lerp(-6.5, -4.5, u), lerp(1.4, 1.9, u), lerp(-2.2, -1.6, u))
        const tx = taxiX(t)
        cam.look.set(lerp(30, tx, 0.5), 1.6, lerp(3, 2, u))
        cam.fov = 52
      },
    },
    {
      // Pull-in: chasing the taxi from behind and to the side as it brakes.
      from: T_BRAKE,
      to: 7.7,
      cam(u) {
        const tx = taxiX(t)
        cam.pos.set(tx + lerp(10, 7.2, ease(u)), lerp(2.8, 2.1, u), lerp(4.6, 4.0, u))
        cam.look.set(tx - 2.5, 0.9, 0.6)
        cam.fov = 50
      },
    },
    {
      // Door: from the sidewalk, the door swings open and the passenger climbs out.
      from: 7.7,
      to: 10.8,
      cam(u) {
        cam.pos.set(lerp(4.4, 4.7, u), lerp(1.35, 1.6, u), lerp(-5.6, -5.2, u))
        cam.look.set(lerp(6.0, actor.x, 0.5 * u), lerp(1.0, 1.2, u), lerp(1.0, actor.z, 0.5 * u))
        cam.fov = 46
      },
    },
    {
      // "You're late!": low by the entrance, facing the passenger, then following the dash.
      from: 10.8,
      to: END,
      cam(u) {
        cam.pos.set(lerp(-1.6, -1.2, u), lerp(1.0, 1.5, u), lerp(-9.6, -10.3, u))
        cam.look.set(actor.x, actor.y + 1.3, actor.z)
        cam.fov = lerp(42, 50, ease(u))
      },
    },
  ]

  // --- Actor (the player's avatar) path -----------------------------------------------------------
  const exitX = STOP.x + 0.75 // rear door, world x
  function updateActor(dt) {
    const Y = AIRPORT.walkY
    let nx = actor.x
    let ny = actor.y
    let nz = actor.z
    actor.overlay = null
    actor.overlayWeight = 0
    actor.grounded = true
    if (t < 8.25) {
      nx = exitX
      ny = 0.25
      nz = STOP.z
      actor.facing = Math.PI
    } else if (t < 9.25) {
      // Slide across the seat and step down onto the road.
      const u = ease(clamp((t - 8.25) / 1.0, 0, 1))
      nx = exitX
      nz = lerp(STOP.z + 0.1, STOP.z - 1.45, u)
      ny = lerp(0.3, 0, clamp((u - 0.6) / 0.4, 0, 1))
      actor.facing = Math.PI
      actor.overlay = CLIMB
      actor.overlayWeight = 1 - u
    } else if (t < 9.75) {
      // Hop up the curb.
      const u = clamp((t - 9.25) / 0.5, 0, 1)
      nx = lerp(exitX, exitX - 0.1, u)
      nz = lerp(STOP.z - 1.45, -1.3, u)
      ny = lerp(0, Y, u) + Math.sin(u * Math.PI) * 0.45
      actor.grounded = false
      actor.vy = Math.cos(u * Math.PI) * 4
      if (u > 0.02 && actor._hop !== true) {
        actor._hop = true
        sfx('hop', { vol: 0.3 })
      }
    } else if (t < 11.7) {
      // Turn round toward the terminal, check the watch.
      nx = exitX - 0.1
      nz = -1.3
      ny = Y
      const want = Math.atan2(SPAWN.x - nx, SPAWN.z - nz)
      actor.facing += Math.atan2(Math.sin(want - actor.facing), Math.cos(want - actor.facing)) * Math.min(1, dt * 6)
      const w = clamp((t - 10.55) / 0.3, 0, 1) * clamp((11.6 - t) / 0.25, 0, 1)
      actor.overlay = WATCH
      actor.overlayWeight = w
    } else {
      // Dash for the doors.
      const u = clamp((t - 11.7) / (END - 0.25 - 11.7), 0, 1)
      const k = u < 0.85 ? u : 0.85 + (u - 0.85) * 0.6
      nx = lerp(exitX - 0.1, SPAWN.x, Math.min(1, k / 0.94))
      nz = lerp(-1.3, SPAWN.z, Math.min(1, k / 0.94))
      ny = Y
      actor.facing = lerp(actor.facing, SPAWN_FACING, Math.min(1, dt * (u > 0.8 ? 8 : 2)))
    }
    actor.speed = dt > 0 ? Math.hypot(nx - actor.x, nz - actor.z) / dt : 0
    if (!actor.grounded) actor.speed = Math.min(actor.speed, 2)
    actor.x = nx
    actor.y = ny
    actor.z = nz
  }

  // --- Taxi -------------------------------------------------------------------------------------------
  let lastX = X0
  function updateTaxi(dt) {
    const r = taxi.root
    let speed
    if (t < T_LEAVE) {
      const x = taxiX(t)
      speed = taxiSpeed(t)
      r.position.set(x, 0, STOP.z)
      r.rotation.y = -Math.PI / 2
      // Brake dive: body pitches while decelerating, then springs back.
      const braking = t > T_BRAKE && t < T_STOP ? 1 : 0
      const want = braking * 0.045
      pitchV += ((want - pitch) * 90 - pitchV * 7) * dt
      pitch += pitchV * dt
      taxi.setBrake(t > T_BRAKE && t < T_LEAVE + 0.4 ? 1 : 0)
    } else {
      // Pull out into the middle lane and away.
      leaveV = Math.min(17, leaveV + dt * 5.5)
      leaveX -= leaveV * dt
      const u = clamp((STOP.x - leaveX) / 14, 0, 1)
      const nz = STOP.z + 4 * ease(u)
      const dz = nz - leaveZ
      leaveZ = nz
      r.position.set(leaveX, 0, leaveZ)
      r.rotation.y = Math.atan2(-leaveV * dt, dz) || -Math.PI / 2
      speed = leaveV
      pitchV += ((-0.025 * Math.min(1, leaveV / 6) - pitch) * 60 - pitchV * 6) * dt
      pitch += pitchV * dt
      taxi.setBrake(0)
      for (const w of taxi.wheels) if (w.position.z > 0) {
        w.rotation.order = 'YXZ'
        w.rotation.y = dz > 0.001 ? 0.25 : 0
      }
    }
    taxi.body.rotation.x = pitch
    const dist = Math.abs(r.position.x - lastX) + 0
    lastX = r.position.x
    for (const w of taxi.wheels) w.rotation.x += dist / taxi.wheelRadius
    // Exhaust: idle puffs + more when revving.
    tmp.set(0.55, 0.3, -2.45)
    r.localToWorld(tmp)
    if (Math.random() < dt * (speed < 1 ? 7 : 3)) fx.trail(tmp.x, tmp.y, tmp.z, { size: 0.18, size1: 0.9, life: 1.2, alpha: 0.22, color: '#bdbdbd', vy: 0.4, drag: 2 })
    // Engine sound: revs follow speed; louder near the camera.
    const d = camera.position.distanceTo(r.position)
    const rev = clamp(speed / 16, 0, 1) * (t > T_LEAVE ? 1.2 : 1)
    tmp.copy(r.position).project(camera)
    engine.set(0.15 + rev * 0.85, clamp(9 / (d + 6), 0, 0.9) * 0.6, clamp(tmp.x, -1, 1) * 0.7)
    // The door: spring toward its target angle (overshoots a little on opening).
    doorV += ((doorTarget - doorAngle) * 120 - doorV * 12) * dt
    doorAngle += doorV * dt
    if (doorTarget === 0 && doorAngle < 0) {
      doorAngle = 0
      doorV = 0
    }
    door.rotation.y = doorAngle
  }

  function placeCamera(dt) {
    const s = shots.findIndex((s) => t >= s.from && t < s.to)
    const i = s < 0 ? shots.length - 1 : s
    if (i !== shot) {
      shot = i
      if (i > 0) sfx('whoosh', { vol: 0.12, dur: 0.3 })
    }
    const S = shots[i]
    S.cam(clamp((t - S.from) / (S.to - S.from), 0, 1))
    // Handheld feel + impact shake.
    shake = Math.max(0, shake - dt * 0.4)
    const n = 0.025 + shake
    camera.position.set(cam.pos.x + Math.sin(t * 1.3) * n, cam.pos.y + Math.sin(t * 1.9 + 1) * n * 0.6 + Math.sin(t * 37) * shake * 0.3, cam.pos.z + Math.cos(t * 1.1) * n)
    camera.lookAt(cam.look)
    if (Math.abs(camera.fov - cam.fov) > 0.01) {
      camera.fov = cam.fov
      camera.updateProjectionMatrix()
    }
  }

  function finish() {
    if (done) return
    done = true
    engine.stop()
    hud.cine.title(false)
    hud.cine.subtitle(null)
    hud.cine.skip(false)
    hud.cine.bars(false)
    taxi.root.visible = false
    door.rotation.y = 0
    actor.visible = true
    actor.x = SPAWN.x
    actor.y = SPAWN.y
    actor.z = SPAWN.z
    actor.facing = SPAWN_FACING
    actor.speed = 0
    actor.overlay = null
    camera.fov = CAMERA.fov
    camera.updateProjectionMatrix()
  }

  suitcase.show(false)
  hud.cine.onSkip(() => {
    if (done) return
    hud.cine.fade(1, 180)
    setTimeout(() => {
      t = END
      finish()
      suitcase.reset()
      suitcase.show(true)
      hud.cine.fade(0, 350)
    }, 190)
  })

  return {
    actor,
    get done() {
      return done
    },
    update(dt) {
      if (done) return
      t += dt
      for (const e of events) if (!e.fired && t >= e.time) {
        e.fired = true
        e.fn()
      }
      updateTaxi(dt)
      updateActor(dt)
      placeCamera(dt)
      if (t >= END) finish()
    },
  }
}
