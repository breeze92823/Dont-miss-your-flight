// The other real players, drawn as fellow passengers. Every client in the room is on the server's
// roster (net.room.state.players, backend presence.ts); each one is drawn here with their own
// Bloxity look (base rig + equipped cosmetics + proportions), walk cycle, name tag (gold for VIP),
// job hat, backpack and suitcase in hand, sitting / T-posing at security / knocked out as they report,
// the emote they play, and their chat bubble. Positions are drawn REMOTE.delay behind real time,
// interpolated between the poses they send ~10 a second.
//
// Where they are decides who sees them: the airport is shared by everyone, and so is the cabin (one
// shared plane in the air, whatever the destination: their name tag says where they get off); the
// arrival city only shows passengers who landed in the same city (same zone + destination).
//
// The lines: a passenger standing in the check-in / security / boarding line takes a place in every
// client's copy of that line (queue.js, security.js, boarding.js read `lineMembers`; online in the
// server's ticket order), and the desk / lane / mat / scanner they use is held (`holds`) so no one
// else is sent to it (an idle passenger's spot isn't). Bot passengers fill
// in only if PASSENGERS.bots is on, and then only while there are few real ones (`botShare`).
import { Group, Vector3 } from 'three'
import { DESTINATIONS, PASSENGERS, PLAYER_DIMS, REMOTE, SUITCASES } from './config.js'
import { net } from './net.js'
import { playerInRoom, playerJoined, skinTextureUrlFor } from './bloxity.js'
import { buildDefaultCharacter, loadBaseCharacter } from './avatar/character.js'
import { applyProportions, attachEquippedAccessories } from './avatar/loader.js'
import { disposeAnimator, makeAnimator } from './avatar/animator.js'
import { makeBackpack, makeHat, makeSuitcaseModel, wearHat, wearOnBack } from './suitcase.js'
import { label } from './propkit.js'
import { SIT } from './seating.js'
import { TPOSE } from './security.js'
import { createEmotePlayer } from './emotes.js'

const CARRY = { ArmR1: { x: 0.55, z: -0.1 }, ArmR2: { x: 0.15 } }
const KO = { Spine1: { x: -1.3 }, ArmL1: { z: 1.2 }, ArmR1: { z: -1.2 }, LegL1: { x: 0.1 }, LegR1: { x: -0.1 } }
const OVERLAYS = { sit: SIT, tpose: TPOSE, ko: KO }
const suitcaseColor = (id) => (SUITCASES.find((s) => s.id === id) ?? SUITCASES[0]).color
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a))

// me: () => { zone, dest } of the local player (who to show in the cabin / city).
export function createRemotePassengers({ scene, crowd, me }) {
  const people = new Map() // sessionId -> passenger
  const lines = { checkin: [], security: [], boarding: [] }
  const holds = new Set()
  let roomRef = null
  let clock = 0
  let airportCount = 0

  function sameScene(s, mine) {
    if (s.zone !== mine.zone) return false
    return s.zone !== 'city' || s.dest === mine.dest
  }
  // Name tag text: in the cabin it adds where they're flying to ("Bob · Tokyo").
  function tagText(s) {
    const to = s.zone === 'cabin' ? DESTINATIONS[s.dest]?.name : ''
    return `${s.vip ? '★ ' : ''}${s.username || 'Passenger'}${to ? ` · ${to}` : ''}${s.away ? ' (away)' : s.idle ? ' (idle)' : ''}`
  }

  // --- One passenger -----------------------------------------------------------------------------
  function create(sid, s, announce) {
    const group = new Group()
    group.rotation.order = 'YXZ'
    group.visible = false
    scene.add(group)
    const tag = label(tagText(s), 0.32, { color: s.away || s.idle ? '#a9b2c2' : s.vip ? '#ffd23f' : '#ffffff' })
    tag.visible = false
    tag.renderOrder = 19
    scene.add(tag)
    const bag = makeSuitcaseModel(suitcaseColor(s.suitcase))
    bag.root.visible = false
    scene.add(bag.root)
    const p = {
      sid,
      group,
      tag,
      tagText: tagText(s),
      bag,
      bagColor: s.suitcase,
      avatar: null,
      animator: null,
      hat: null,
      hatKind: '',
      pack: makeBackpack(),
      look: null, // the avatar JSON loaded (null = not yet)
      gen: 0,
      emote: createEmotePlayer(),
      emoteId: '',
      // Interpolation buffer: [{ t, x, y, z, yaw, speed }]
      buf: [],
      last: '',
      // Drawn state (also what lines / blockers / doors read).
      x: s.x,
      y: s.y,
      z: s.z,
      yaw: s.yaw,
      speed: 0,
      active: true,
      shown: false,
      uid: s.uid,
      name: s.username,
      state: s,
    }
    setAvatar(p, buildDefaultCharacter())
    loadLook(p, s.avatar)
    people.set(sid, p)
    if (announce) playerJoined(s.username)
    else playerInRoom(s.username)
    return p
  }

  function setAvatar(p, next) {
    if (p.avatar) p.group.remove(p.avatar)
    disposeAnimator(p.animator)
    p.avatar = next
    p.group.add(next)
    p.animator = makeAnimator(next)
    next.rotation.set(0, 0, 0)
    next.position.y = 0
    p.hat?.parent?.remove(p.hat)
    p.hat = null
    p.hatKind = ''
    p.pack.parent?.remove(p.pack)
    p.group.position.set(0, 0, 0)
    p.group.rotation.set(0, 0, 0)
    wearOnBack(next, p.pack, p.group)
  }

  async function loadLook(p, json) {
    p.look = json || ''
    const gen = ++p.gen
    let look = null
    try {
      look = json ? JSON.parse(json) : null
    } catch {
      look = null
    }
    try {
      const root = await loadBaseCharacter()
      if (gen !== p.gen || !p.active) return
      const equipped = look?.equipped && typeof look.equipped === 'object' ? look.equipped : null
      if (equipped) await attachEquippedAccessories(root, equipped, { skinTextureUrl: skinTextureUrlFor(equipped) })
      if (gen !== p.gen || !p.active) return
      applyProportions(root, look?.proportions ?? null)
      setAvatar(p, root)
    } catch (err) {
      console.warn('[remote] avatar load failed; default look', err)
    }
  }

  function dispose(p) {
    p.active = false
    p.gen++
    disposeAnimator(p.animator)
    scene.remove(p.group, p.tag, p.bag.root)
    p.tag.material.map?.dispose()
    p.tag.material.dispose()
  }

  // --- Sync from the roster -----------------------------------------------------------------------------
  function sync() {
    const room = net.room
    if (room !== roomRef) {
      // New room (or none): everyone is new.
      for (const p of people.values()) dispose(p)
      people.clear()
      roomRef = room
    }
    if (!room?.state?.players) return
    const seen = new Set()
    const first = !people.size && clock < 2
    room.state.players.forEach((s, sid) => {
      if (sid === room.sessionId) return
      seen.add(sid)
      let p = people.get(sid)
      if (!p) p = create(sid, s, !first)
      p.state = s
      p.uid = s.uid
      p.name = s.username
      // A new pose sample when the reported one changed.
      const key = `${s.x}|${s.y}|${s.z}|${s.yaw}|${s.speed}`
      if (key !== p.last) {
        p.last = key
        p.buf.push({ t: clock, x: s.x, y: s.y, z: s.z, yaw: s.yaw, speed: s.speed })
        if (p.buf.length > 20) p.buf.shift()
      }
    })
    for (const [sid, p] of people) {
      if (seen.has(sid)) continue
      dispose(p)
      people.delete(sid)
    }
  }

  // Position at render time (REMOTE.delay behind): between the two samples around it.
  function interpolate(p) {
    const b = p.buf
    if (!b.length) return
    const t = clock - REMOTE.delay
    while (b.length > 2 && b[1].t <= t) b.shift()
    const a = b[0]
    const c = b[1]
    if (!c || t <= a.t) {
      // Only one sample (or not yet due): ease toward the newest.
      const n = b[b.length - 1]
      const k = Math.min(1, 0.25)
      p.x += (n.x - p.x) * k
      p.y += (n.y - p.y) * k
      p.z += (n.z - p.z) * k
      p.yaw += wrap(n.yaw - p.yaw) * k
      p.speed = n.speed
      return
    }
    const k = Math.min(1, (t - a.t) / (c.t - a.t || 1))
    p.x = a.x + (c.x - a.x) * k
    p.y = a.y + (c.y - a.y) * k
    p.z = a.z + (c.z - a.z) * k
    p.yaw = a.yaw + wrap(c.yaw - a.yaw) * k
    p.speed = a.speed + (c.speed - a.speed) * k
    // Teleports (Skip Line, respawn, boarding): snap.
    if (Math.hypot(c.x - a.x, c.z - a.z) > 8) {
      p.x = c.x
      p.y = c.y
      p.z = c.z
    }
  }

  const camPos = new Vector3()
  const order = []
  const animIn = { grounded: true, speed: 0, verticalVelocity: 0, turn: 0, overlay: null, overlayWeight: 0 }

  function draw(p, dt) {
    const s = p.state
    const g = p.group
    g.visible = true
    g.position.set(p.x, p.y, p.z)
    g.rotation.set(0, p.yaw, 0)
    // Look changes.
    if (s.avatar !== p.look) loadLook(p, s.avatar)
    if (s.hat !== p.hatKind && p.avatar) {
      p.hat?.parent?.remove(p.hat)
      p.hat = null
      p.hatKind = s.hat
      if (s.hat) {
        p.animator?.rig.resetToBindPose()
        p.avatar.rotation.set(0, 0, 0)
        p.avatar.position.y = 0
        p.hat = makeHat(s.hat)
        wearHat(p.avatar, p.hat, g)
      }
    }
    p.pack.visible = s.pack
    if (s.suitcase !== p.bagColor) {
      p.bagColor = s.suitcase
      p.bag.shellMat.color.set(suitcaseColor(s.suitcase))
    }
    const text = tagText(s)
    if (text !== p.tagText) {
      p.tagText = text
      scene.remove(p.tag)
      p.tag.material.map?.dispose()
      p.tag.material.dispose()
      p.tag = label(text, 0.32, { color: s.away || s.idle ? '#a9b2c2' : s.vip ? '#ffd23f' : '#ffffff' })
      p.tag.renderOrder = 19
      scene.add(p.tag)
    }
    // Animation: walk cycle + the reported overlay (sit / security T-pose / knocked out / carrying).
    animIn.grounded = s.grounded
    animIn.speed = s.anim === 'sit' ? 0 : p.speed
    animIn.verticalVelocity = 0
    const over = OVERLAYS[s.anim]
    if (over) {
      animIn.overlay = over
      animIn.overlayWeight = 1
    } else if (s.bag) {
      animIn.overlay = CARRY
      animIn.overlayWeight = Math.min(1, p.speed / 2.5)
    } else {
      animIn.overlay = null
      animIn.overlayWeight = 0
    }
    p.animator?.update(dt, animIn)
    if (s.emote !== p.emoteId) {
      p.emoteId = s.emote
      if (s.emote) p.emote.play(s.emote)
      else p.emote.stop()
    }
    p.emote.apply(p.avatar, p.animator, dt, 0) // their own client stops it on movement
    // Suitcase: behind-right while walking, beside them standing.
    const showBag = s.bag && s.anim !== 'sit'
    p.bag.root.visible = showBag
    if (showBag) {
      const moving = Math.min(1, p.speed / 3)
      const lx = -0.42 - 0.22 * (1 - moving)
      const lz = -0.85 * moving + 0.05 * (1 - moving)
      const c = Math.cos(p.yaw)
      const sn = Math.sin(p.yaw)
      p.bag.root.position.set(p.x + lx * c + lz * sn, p.y, p.z - lx * sn + lz * c)
      p.bag.root.rotation.set(moving * 0.72, p.yaw, 0, 'YXZ')
      p.bag.handle.position.y = 0.62 + 0.5 * (0.55 + 0.45 * Math.max(moving, 0.6))
    }
  }

  function hide(p) {
    p.group.visible = false
    p.tag.visible = false
    p.bag.root.visible = false
  }

  return {
    // Every frame, before the lines update (they read lineMembers / holds).
    update(dt, camera) {
      clock += dt
      sync()
      const mine = me()
      camera.getWorldPosition(camPos)
      for (const k in lines) lines[k].length = 0
      holds.clear()
      airportCount = 0
      order.length = 0
      for (const p of people.values()) {
        interpolate(p)
        const s = p.state
        if (s.zone === 'airport') airportCount++
        const here = sameScene(s, mine)
        p.shown = here
        if (!here) {
          hide(p)
          continue
        }
        // Shared lines and held spots (airport only). Away passengers (their game stopped) hold nothing:
        // nobody waits behind them.
        // Idle ones (no input for a minute) keep their place in line but hold no spot.
        if (s.zone === 'airport' && !s.away) {
          if (lines[s.line]) lines[s.line].push(p)
          if (s.hold && !s.idle) holds.add(s.hold)
        }
        const d = Math.hypot(p.x - camPos.x, p.z - camPos.z)
        if (d > REMOTE.drawDist) {
          hide(p)
          continue
        }
        order.push([d, p])
      }
      order.sort((a, b) => a[0] - b[0])
      for (let i = 0; i < order.length; i++) {
        const [d, p] = order[i]
        if (i >= REMOTE.maxDrawn) {
          hide(p)
          continue
        }
        draw(p, dt)
        p.tag.visible = d < REMOTE.tagDist && p.state.anim !== 'ko'
        p.tag.position.set(p.x, p.y + PLAYER_DIMS.height + 0.45, p.z)
      }
    },
    // Real passengers standing in `kind` line (checkin | security | boarding): [{ x, y, z, state }]
    // (state.ticket = their place in the server's order, state.idle = passed over).
    lineMembers: (kind) => lines[kind] ?? [],
    // Spots in use by real passengers: "desk:N", "lane:N", "mat:N", "scan".
    held: (key) => holds.has(key),
    // Share of the usual bot passengers that should still arrive (1 = all, 0 = none).
    botShare: () => (PASSENGERS.bots ? Math.max(0, 1 - airportCount / Math.max(1, PASSENGERS.fullAt)) : 0),
    count: () => people.size,
    // Is a real passenger sitting in this cabin seat? (their latest reported pose, any destination)
    seatTaken(seat) {
      for (const p of people.values()) {
        const s = p.state
        if (s.zone === 'cabin' && s.anim === 'sit' && !s.away && Math.abs(s.x - seat.x) < 0.3 && Math.abs(s.z - seat.z) < 0.3) return true
      }
      return false
    },
    // Shown passengers near the doors etc. (exterior.update actors) and for name lookups.
    actors(out) {
      for (const p of people.values()) if (p.shown && p.group.visible) out.push(p)
      return out
    },
    // Chat bubble over a passenger: by Bloxity user id, else by name.
    find(userId, username) {
      for (const p of people.values()) if (p.shown && ((userId && p.uid === userId) || (!userId && username && p.name === username))) return p
      return null
    },
    say(p, text) {
      crowd.say(p, text, 4)
    },
  }
}
