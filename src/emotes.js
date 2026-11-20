// Bloxity emotes (docs.bloxity.io HTML5 > Emotes): the portal's emote wheel sends a catalogue id;
// the clip ({ len, loop, tracks: { Bone: [[timeSec, xDeg, yDeg, zDeg], ...] } }) is played on the
// avatar's bones as degree deltas over the bind pose (Euler XYZ, right-multiplied onto the bind
// quaternion), keys eased with smoothstep, held before the first / after the last key, looped on
// time % len. Bones the rig lacks are ignored; untracked bones keep the locomotion pose. Runs after
// the animator each frame, so it wins while playing and blends out when stopped (moving stops it).
// One player per avatar: the local player's and every remote passenger's.
import { Euler, Quaternion } from 'three'
import { EMOTES } from './config.js'
import { emoteClip } from './bloxity.js'

const DEG = Math.PI / 180
const ease = (s) => s * s * (3 - 2 * s)
const euler = new Euler(0, 0, 0, 'XYZ')
const qd = new Quaternion()
const qt = new Quaternion()

function sample(keys, t, out) {
  if (!keys.length) return false
  if (t <= keys[0][0]) {
    out[0] = keys[0][1]
    out[1] = keys[0][2]
    out[2] = keys[0][3]
    return true
  }
  const last = keys[keys.length - 1]
  if (t >= last[0]) {
    out[0] = last[1]
    out[1] = last[2]
    out[2] = last[3]
    return true
  }
  let i = 1
  while (i < keys.length - 1 && keys[i][0] <= t) i++
  const a = keys[i - 1]
  const b = keys[i]
  const s = ease(Math.min(1, Math.max(0, (t - a[0]) / (b[0] - a[0] || 1))))
  out[0] = a[1] + (b[1] - a[1]) * s
  out[1] = a[2] + (b[2] - a[2]) * s
  out[2] = a[3] + (b[3] - a[3]) * s
  return true
}

export function createEmotePlayer() {
  let id = ''
  let clip = null
  let t = 0
  let w = 0 // blend weight 0..1
  let bindOf = null // root -> Map(bone -> bind quaternion)
  let boundRoot = null
  let loadSeq = 0
  const v = [0, 0, 0]

  function bindsFor(root, animator) {
    if (boundRoot === root && bindOf) return bindOf
    boundRoot = root
    bindOf = new Map()
    const rest = new Map((animator?.rig?.bindings ?? []).map((b) => [b.bone, b.rest]))
    for (const name in root.nodes ?? {}) {
      const bone = root.nodes[name]
      if (bone?.isBone || bone?.isObject3D) bindOf.set(name, rest.get(bone) ?? bone.quaternion.clone())
    }
    return bindOf
  }

  return {
    get id() {
      return id
    },
    get playing() {
      return !!clip && w > 0
    },
    // Starts the catalogue emote `next` ('' = stop). Unknown ids are ignored silently.
    async play(next) {
      const seq = ++loadSeq
      if (!next) return void (id = '')
      const c = await emoteClip(next)
      if (seq !== loadSeq || !c?.tracks) return
      id = next
      clip = c
      t = 0
    },
    stop() {
      loadSeq++
      id = ''
    },
    // After animator.update: poses the tracked bones. `speed` (m/s) above EMOTES.stopSpeed stops it;
    // returns true when movement stopped a playing emote (so the caller can report it).
    apply(root, animator, dt, speed = 0) {
      let stopped = false
      if (id && speed > EMOTES.stopSpeed) {
        id = ''
        stopped = true
      }
      w = Math.max(0, Math.min(1, w + (id ? dt : -dt) / EMOTES.blendIn))
      if (!clip || w <= 0 || !root?.nodes) {
        if (!id && w <= 0) clip = null
        return stopped
      }
      t += dt
      const len = Math.max(0.01, clip.len || 1)
      const time = clip.loop ? t % len : Math.min(t, len)
      if (!clip.loop && t > len) id = '' // a one-shot blends out once done
      const binds = bindsFor(root, animator)
      for (const name in clip.tracks) {
        const bone = root.nodes[name]
        const bind = binds.get(name)
        if (!bone || !bind || !sample(clip.tracks[name], time, v)) continue
        euler.set(v[0] * DEG, v[1] * DEG, v[2] * DEG, 'XYZ')
        qt.copy(bind).multiply(qd.setFromEuler(euler))
        bone.quaternion.slerp(qt, ease(w))
      }
      return stopped
    },
  }
}
