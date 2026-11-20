// Sitting down (gate seats, Sky Lounge armchairs, your seat on the plane). Walk into a free seat to
// sit; move or jump to stand up. While seated the body waits at the seat's stand point (out of the
// furniture's colliders) and is frozen; main.js draws the avatar on the seat with the SIT pose.
// update() runs before the physics step so a jump press still makes you hop out of the chair.
import { inputState } from './input.js'
import { player, resetPlayer } from './player.js'
import { syncYawToPlayer } from './camera.js'
import { sfx } from './audio.js'

const deg = (d) => (d * Math.PI) / 180
// Overlay pose (character space: +X swings a limb backward): thighs forward, shins down, hands on lap.
export const SIT = {
  LegL1: { x: deg(-88) },
  LegR1: { x: deg(-88) },
  LegL2: { x: deg(84) },
  LegR2: { x: deg(84) },
  ArmL1: { x: deg(-32), z: deg(6) },
  ArmR1: { x: deg(-32), z: deg(-6) },
  ArmL2: { x: deg(-28) },
  ArmR2: { x: deg(-28) },
  Spine1: { x: deg(-4) },
}
// Hip height of the avatar above its feet (m): the seat point is the cushion top.
const HIP = 0.9

export const seating = {
  seat: null, // { x, y, z, yaw } the cushion
  stand: null, // { x, y, z } where the body waits
  locked: false, // take-off / landing: no getting up
  cooldown: 0,
  onStand: null,
  get active() {
    return !!this.seat
  },
}

// cam: optional { x, z } the camera should orbit instead of the cushion (the cabin's aisle, so the
// chase cam never ends up inside the overhead bins).
export function sit(seat, stand, { locked = false, onStand = null, quiet = false, cam = null } = {}) {
  seating.seat = seat
  seating.cam = cam
  seating.stand = stand
  seating.locked = locked
  seating.onStand = onStand
  resetPlayer({ x: stand.x, y: stand.y, z: stand.z }, seat.yaw)
  syncYawToPlayer()
  player.auto = null
  player.frozen = true
  if (!quiet) sfx('sit', { vol: 0.4 })
}

export function standUp() {
  if (!seating.seat) return
  const cb = seating.onStand
  seating.seat = null
  seating.stand = null
  seating.locked = false
  seating.onStand = null
  seating.cooldown = 1.4
  player.frozen = false
  cb?.()
}

export function lockSeat(on) {
  seating.locked = on
}

// Before the physics step.
export function updateSeating(dt) {
  seating.cooldown = Math.max(0, seating.cooldown - dt)
  if (!seating.seat || seating.locked) return
  if (Math.hypot(inputState.move.x, inputState.move.z) > 0.5 || inputState.jump) standUp()
}

// After the avatar is placed: move the camera's follow point to the seat's anchor, if it has one.
export function seatCamera() {
  const c = seating.seat && seating.cam
  if (!c) return
  player.renderPosition.x = c.x
  player.renderPosition.z = c.z
}

// After interpolation: draw the avatar on the cushion (camera + avatar follow renderPosition).
export function seatRender() {
  const s = seating.seat
  if (!s) return false
  const r = player.renderPosition
  r.x = s.x
  r.y = s.y + 0.08 - HIP
  r.z = s.z
  player.facing = s.yaw
  return true
}
