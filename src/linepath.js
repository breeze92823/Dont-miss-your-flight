import { QUEUE } from './config.js'
import { callMe, claimSpot, linesOnServer, meIdle, myTicket } from './net.js'

export { linesOnServer, myTicket }

// Online: ask the server whether it's your turn in `kind` (throttled, one request at a time). Each
// frame the line runs `turn.update(dt, line, entry, slot, freeKeys, onKey)`: once you stand at your
// spot among the first QUEUE.callDepth (counting the ones the server passes over as gone) with
// enough free spots for your place, it asks; onKey(key, ahead) when the server sends you to one.
export function lineTurn(kind) {
  let pending = false
  let wait = 0
  return {
    update(dt, line, entry, slot, freeKeys, onKey) {
      wait -= dt
      if (pending || wait > 0 || !entry || meIdle()) return
      const i = line.indexOf(entry)
      if (i < 0 || entry.s < slot - 0.4) return
      let ahead = 0
      for (let k = 0; k < i; k++) if (!line[k].remote?.state?.idle) ahead++
      if (ahead >= QUEUE.callDepth) return
      const keys = freeKeys()
      if (keys.length <= ahead) return
      pending = true
      wait = QUEUE.callEvery
      callMe(kind, keys).then((key) => {
        pending = false
        if (key) onKey(key, i)
      })
    },
  }
}

// Online: a free spot outside a line (search mats), asked once at a time. Offline: the first key.
export function spotClaimer() {
  let pending = false
  let wait = 0
  return {
    update(dt, keys, onKey) {
      wait -= dt
      if (!keys.length) return
      if (!linesOnServer()) return onKey(keys[0])
      if (pending || wait > 0) return
      pending = true
      wait = QUEUE.callEvery
      claimSpot(keys).then((key) => {
        pending = false
        if (key) onKey(key)
      })
    },
  }
}
// A queue path: a polyline measured by distance `s` from its start (the back of
// the line) to its end (the head of the line).
export function makePath(points) {
  const P = points.map(([x, z]) => ({ x, z }))
  const cum = [0]
  for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i].x - P[i - 1].x, P[i].z - P[i - 1].z))
  const total = cum[cum.length - 1]
  function at(s, out = {}) {
    s = Math.max(0, Math.min(total, s))
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
      const d = (a.x + dx * t - x) ** 2 + (a.z + dz * t - z) ** 2
      if (d < bd) {
        bd = d
        best = cum[i - 1] + Math.sqrt(l2) * t
      }
    }
    return best
  }
  return { P, cum, total, at, project }
}

export const angTo = (from, to, max) => {
  const d = Math.atan2(Math.sin(to - from), Math.cos(to - from))
  return Math.abs(d) <= max ? to : from + Math.sign(d) * max
}

// Real passengers (remote.js lineMembers) in a line: each takes a place in this client's copy of the
// line as { remote, s, npc: null }, at the distance `s` they actually stand at (project), so the ones
// ahead of you count for your place and bots queue behind them. Their own client walks them; this
// only keeps their entries in step. Members are re-placed by `s` every frame (they may Skip Line).
// head: the front spot's `s`. A member who stands still with free room ahead of them for
// QUEUE.stall.after s is stalled (their game froze): left out (m.stalled = true) so nobody waits
// behind them; they're back as soon as they move. (Away members never reach here: remote.js.)
//
// Online (`ticket` = your ticket from net.myTicket, the server's order, backend lines.ts): the real
// passengers (you and them) are then re-sorted into the places they take by ticket, so every client
// draws the same order whatever lag does to the positions; bot passengers keep theirs. Nobody is
// dropped for standing still (the server passes over away / idle ones itself).
export function syncRemoteLine(line, members, project, head, ticket) {
  for (let i = line.length - 1; i >= 0; i--) if (line[i].remote) line.splice(i, 1)
  const now = performance.now() / 1000
  const ST = QUEUE.stall
  for (const m of members) {
    if (m.stillT === undefined || Math.hypot(m.x - m.stillX, m.z - m.stillZ) > ST.moved) {
      m.stillX = m.x
      m.stillZ = m.z
      m.stillT = now
    }
    const e = { remote: m, s: project(m.x, m.z), npc: null }
    let i = line.findIndex((o) => o.s < e.s - 0.3)
    if (i < 0) i = line.length
    line.splice(i, 0, e)
  }
  if (ticket !== undefined) {
    const at = []
    const real = []
    for (let i = 0; i < line.length; i++) {
      const e = line[i]
      if (!e.player && !e.remote) continue
      at.push(i)
      real.push(e)
      if (e.remote) e.remote.stalled = false
    }
    const tk = (e) => (e.player ? ticket : e.remote.state?.ticket || Infinity)
    real.sort((a, b) => {
      const ta = tk(a)
      const tb = tk(b)
      return ta < tb ? -1 : ta > tb ? 1 : 0
    })
    for (let k = 0; k < at.length; k++) line[at[k]] = real[k]
    return
  }
  if (head === undefined) return
  // Front to back: the spot each one could step up to is one spacing behind the one ahead.
  let ahead = head + QUEUE.spacing
  for (let i = 0; i < line.length; i++) {
    const e = line[i]
    if (e.remote) {
      const m = e.remote
      m.stalled = ahead - QUEUE.spacing - e.s > ST.room && now - m.stillT > ST.after
      if (m.stalled) {
        line.splice(i--, 1)
        continue
      }
    }
    ahead = e.s
  }
}
