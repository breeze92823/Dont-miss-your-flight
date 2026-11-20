// Solid people in lines. Every NPC standing in a line (check-in, security,
// boarding) gets a kinematic capsule the player's character controller collides
// with, so the player can't walk through the line and cut ahead; they have to
// join at the back (or pay to skip). Kinematic bodies don't block the camera ray.
// Line NPCs don't shuffle into the player (`lineStepClear`, used by the three
// line loops). A blocker that still ends up inside the player (Skip Line
// teleports onto the head of the line, a passenger joins where you stand) stays
// off until the two are apart again, so nobody ever gets stuck inside someone.
import { RAPIER, world } from './physics.js'
import { player } from './player.js'
import { PLAYER_DIMS, QUEUE } from './config.js'

const R = QUEUE.block.radius
const HALF = QUEUE.block.height / 2
const TOUCH = R + PLAYER_DIMS.radius
const PARK = { x: 0, y: -500, z: 0 } // where unused blockers wait

// Can a line NPC step to (x1, z1)? Not if it would walk into the player standing
// ahead of it on the path: people wait for you to move instead of shuffling
// through you (otherwise their blocker would switch off and leave a gap to slip
// through). People ahead of the player never wait (the player cutting a corner
// of the serpentine would otherwise deadlock with them), and stepping away is fine.
// playerAhead: the player's distance along the path is past this NPC's.
export function lineStepClear(npc, x1, z1, playerAhead) {
  if (!playerAhead) return true
  const pp = player.position
  if (Math.abs((npc.y ?? 0) - pp.y) >= PLAYER_DIMS.height) return true
  const d1 = Math.hypot(x1 - pp.x, z1 - pp.z)
  return d1 >= TOUCH + 0.02 || d1 >= Math.hypot(npc.x - pp.x, npc.z - pp.z)
}

export function createLineBlockers(max = 64) {
  const pool = Array.from({ length: max }, () => {
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(PARK.x, PARK.y, PARK.z))
    const collider = world.createCollider(RAPIER.ColliderDesc.capsule(HALF - R, R).setFriction(0), body)
    collider.setEnabled(false)
    return { body, collider, on: false }
  })
  const ghosts = new Set() // NPCs overlapping the player: not solid until clear of them
  const npcs = []
  const pos = { x: 0, y: 0, z: 0 }

  function park(b) {
    if (!b.on) return
    b.on = false
    b.collider.setEnabled(false)
    b.body.setTranslation(PARK, false)
  }

  return {
    // sources: objects with lineNpcs(out). Call once per frame after the lines have moved.
    update(sources) {
      npcs.length = 0
      for (const s of sources) s?.lineNpcs(npcs)
      const pp = player.position
      let used = 0
      for (const n of npcs) {
        if (!n.active) continue
        const d = Math.hypot(n.x - pp.x, n.z - pp.z)
        const sameFloor = Math.abs((n.y ?? 0) - pp.y) < PLAYER_DIMS.height
        if (ghosts.has(n)) {
          if (!sameFloor || d > TOUCH + 0.15) ghosts.delete(n)
          else continue
        } else if (sameFloor && d < TOUCH - 0.05) {
          ghosts.add(n)
          continue
        }
        if (used >= pool.length) break
        const b = pool[used++]
        pos.x = n.x
        pos.y = (n.y ?? 0) + HALF
        pos.z = n.z
        b.body.setTranslation(pos, true)
        if (!b.on) {
          b.on = true
          b.collider.setEnabled(true)
        }
      }
      for (let i = used; i < pool.length; i++) park(pool[i])
      // Forget ghosts that left every line.
      if (ghosts.size) for (const g of ghosts) if (!npcs.includes(g)) ghosts.delete(g)
    },
  }
}
