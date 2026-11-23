// Phase 4: the SEAT SCREEN (tunables FLIGHT.fun.screen). SCREEN (T) on the seat bar opens the seat-back
// entertainment system:
//
// MOVIES: Cloud Cats (comedy: gags, a laugh track, your neighbours clap), Shark Runway (a thriller with a
//   JUMP SCARE: the screen flashes, you scream, popcorn everywhere, the whole row jumps) and Love at 30,000
//   ft (romance: two little planes, a kiss, hearts). Each is drawn live on a canvas onto a screen on the
//   seat-back in front of you (or your pod / suite monitor), with its own synth soundtrack and subtitles; the
//   camera settles over your shoulder, headphones go on, the flight passes x`timeK`, and 🍿 POPCORN is
//   ordered from the menu (an attendant brings it; EAT it with the usual crunch). Watch one to the end:
//   coins (each film once a flight).
// GAMES (inside the screen window, touch + keys): SKY DODGE (steer a little plane between birds and storm
//   clouds, grab stars) and BAG MATCH (flip luggage tags, find the pairs). Coins by score, capped per flight.
// CAMERAS: Wing / Tail / Chase / Nose cam: the jet seen from outside (airport/skyView.js).
import { CanvasTexture, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace, Vector3 } from 'three'
import { FLIGHT } from './config.js'
import { player } from './player.js'
import { seating } from './seating.js'
import { onKey } from './input.js'
import { registerSfx, sfx } from './audio.js'
import { rbox } from './detail.js'
import './hud/seatScreen.css'

const S = FLIGHT.fun.screen
const rr = (a, b) => a + Math.random() * (b - a)
const pick = (a) => a[Math.floor(Math.random() * a.length)]
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

// --- Sounds -------------------------------------------------------------------------------------------
// One soundtrack note (the movie's instrument: o.type).
registerSfx('mNote', ({ now, out, tone }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.12, o.pan)
  tone(d, t, o.dur ?? 0.3, { type: o.type ?? 'triangle', f: o.f ?? 440, peak: 0.35, a: 0.01, vib: o.vib ?? 0, vibRate: 5 })
})
// A studio audience laughing: a crowd of "ha"s.
registerSfx('laughTrack', ({ now, out, tone, noise }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.22, o.pan)
  for (let v = 0; v < 6; v++) {
    const base = 180 + Math.random() * 260
    for (let i = 0; i < 5; i++) {
      const at = t + v * 0.04 + i * (0.14 + Math.random() * 0.04)
      tone(d, at, 0.1, { type: 'sawtooth', f: base * (1 - i * 0.03), f2: base * 0.9, peak: 0.035, a: 0.01 })
      noise('pink', d, at, 0.09, { type: 'bandpass', f: 900 + Math.random() * 600, q: 3, peak: 0.12, a: 0.01 })
    }
  }
})
// The jump scare: a crashing orchestral stab.
registerSfx('jumpScare', ({ now, out, tone, noise }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.5, o.pan)
  noise('white', d, t, 0.6, { type: 'highpass', f: 1500, peak: 0.6, a: 0.002 })
  for (const f of [92, 98, 185, 277, 415]) tone(d, t, 1.1, { type: 'sawtooth', f, f2: f * 0.94, peak: 0.08, a: 0.004 })
  tone(d, t, 0.5, { f: 60, f2: 30, peak: 0.9, a: 0.002 })
})
// Arcade blips for the mini-games.
registerSfx('arcade', ({ now, out, tone, noise }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.25, o.pan)
  if (o.kind === 'star') [988, 1319, 1976].forEach((f, i) => tone(d, t + i * 0.05, 0.08, { type: 'square', f, peak: 0.1, a: 0.002 }))
  else if (o.kind === 'hit') {
    tone(d, t, 0.3, { type: 'square', f: 220, f2: 70, peak: 0.15, a: 0.002 })
    noise('white', d, t, 0.2, { type: 'lowpass', f: 1500, peak: 0.4, a: 0.002 })
  } else if (o.kind === 'flip') tone(d, t, 0.06, { type: 'triangle', f: 720, f2: 980, peak: 0.25, a: 0.002 })
  else if (o.kind === 'match') [784, 1046, 1568].forEach((f, i) => tone(d, t + i * 0.07, 0.14, { type: 'triangle', f, peak: 0.25, a: 0.002 }))
  else if (o.kind === 'miss') tone(d, t, 0.18, { type: 'square', f: 196, f2: 160, peak: 0.1, a: 0.004 })
  else if (o.kind === 'start') [523, 659, 784, 1046].forEach((f, i) => tone(d, t + i * 0.08, 0.1, { type: 'square', f, peak: 0.09, a: 0.002 }))
  else if (o.kind === 'over') [523, 415, 330, 262].forEach((f, i) => tone(d, t + i * 0.13, 0.16, { type: 'square', f, peak: 0.09, a: 0.002 }))
})
// The screen switching on: a CRT-ish rising whine + a soft thunk.
registerSfx('screenOn', ({ now, out, tone, noise }, o) => {
  const t = now()
  const d = out(o.vol ?? 0.25, o.pan)
  tone(d, t, 0.35, { f: 4000, f2: 9000, peak: 0.04, a: 0.01 })
  tone(d, t, 0.12, { f: 130, f2: 70, peak: 0.4, a: 0.003 })
  noise('white', d, t, 0.15, { type: 'highpass', f: 5000, peak: 0.12, a: 0.003 })
})

// --- The movies (drawn on a 320x180 canvas) -----------------------------------------------------------
const W = 320
const H = 180
function sky(ctx, top, bottom) {
  const g = ctx.createLinearGradient(0, 0, 0, H)
  g.addColorStop(0, top)
  g.addColorStop(1, bottom)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
}
function cloud(ctx, x, y, s, col = '#ffffff') {
  ctx.fillStyle = col
  ctx.beginPath()
  ctx.arc(x, y, 14 * s, 0, 7)
  ctx.arc(x + 16 * s, y - 8 * s, 16 * s, 0, 7)
  ctx.arc(x + 34 * s, y, 13 * s, 0, 7)
  ctx.arc(x + 17 * s, y + 5 * s, 14 * s, 0, 7)
  ctx.fill()
}
function text(ctx, s, x, y, size, col = '#fff', stroke = '#1a1d26') {
  ctx.font = `700 ${size}px Fredoka, Arial, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineWidth = Math.max(2, size / 6)
  ctx.strokeStyle = stroke
  ctx.strokeText(s, x, y)
  ctx.fillStyle = col
  ctx.fillText(s, x, y)
}
function cat(ctx, x, y, s, col, t, blink) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(s, s)
  ctx.fillStyle = col
  ctx.beginPath()
  ctx.ellipse(0, 0, 16, 11, 0, 0, 7) // body
  ctx.fill()
  ctx.strokeStyle = col
  ctx.lineWidth = 4
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(-14, -2)
  ctx.quadraticCurveTo(-26, -10 + Math.sin(t * 6) * 6, -22, -22)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(12, -12, 10, 0, 7) // head
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(5, -19)
  ctx.lineTo(7, -29)
  ctx.lineTo(12, -21)
  ctx.moveTo(13, -21)
  ctx.lineTo(19, -29)
  ctx.lineTo(20, -17)
  ctx.fill()
  ctx.fillStyle = '#1a1d26'
  for (const ex of [9, 16]) {
    ctx.beginPath()
    ctx.ellipse(ex, -13, 1.6, blink ? 0.4 : 2.2, 0, 0, 7)
    ctx.fill()
  }
  ctx.fillStyle = '#ff8fa3'
  ctx.beginPath()
  ctx.arc(12.5, -9, 1.5, 0, 7)
  ctx.fill()
  ctx.restore()
}
function plane(ctx, x, y, s, body, accent, rot = 0) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(rot)
  ctx.scale(s, s)
  ctx.fillStyle = body
  ctx.beginPath()
  ctx.ellipse(0, 0, 22, 6, 0, 0, 7)
  ctx.fill()
  ctx.fillStyle = accent
  ctx.beginPath()
  ctx.moveTo(-4, 0)
  ctx.lineTo(-12, 14)
  ctx.lineTo(-6, 14)
  ctx.lineTo(6, 0)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(-17, -2)
  ctx.lineTo(-24, -14)
  ctx.lineTo(-19, -14)
  ctx.lineTo(-12, -2)
  ctx.fill()
  ctx.fillStyle = '#bfe6ff'
  for (let i = 0; i < 4; i++) ctx.fillRect(-6 + i * 5, -2.5, 3, 2.5)
  ctx.beginPath()
  ctx.fillStyle = '#1a1d26'
  ctx.arc(18, -1.5, 1.4, 0, 7)
  ctx.fill()
  ctx.restore()
}
// Sky Dodge's plane, seen from above (nose up).
function topPlane(ctx, x, y, s, tilt) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(tilt)
  ctx.scale(s, s)
  ctx.fillStyle = 'rgba(0,0,0,0.18)'
  ctx.beginPath()
  ctx.ellipse(6, 10, 22, 8, 0, 0, 7)
  ctx.fill()
  ctx.fillStyle = '#1c8cf0'
  ctx.beginPath() // swept wings
  ctx.moveTo(-3, -2)
  ctx.lineTo(-24, 8)
  ctx.lineTo(-24, 12)
  ctx.lineTo(-3, 6)
  ctx.lineTo(3, 6)
  ctx.lineTo(24, 12)
  ctx.lineTo(24, 8)
  ctx.lineTo(3, -2)
  ctx.fill()
  ctx.beginPath() // tailplane
  ctx.moveTo(-2, 14)
  ctx.lineTo(-10, 20)
  ctx.lineTo(10, 20)
  ctx.lineTo(2, 14)
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.beginPath() // fuselage
  ctx.ellipse(0, 3, 4.5, 19, 0, 0, 7)
  ctx.fill()
  ctx.fillStyle = '#bfe6ff'
  ctx.beginPath()
  ctx.ellipse(0, -11, 2.6, 3.4, 0, 0, 7)
  ctx.fill()
  ctx.fillStyle = '#e8434f'
  ctx.fillRect(-4.5, 4, 9, 2)
  ctx.restore()
}
function heart(ctx, x, y, s, col = '#ff4b6b') {
  ctx.fillStyle = col
  ctx.beginPath()
  ctx.moveTo(x, y + 6 * s)
  ctx.bezierCurveTo(x - 12 * s, y - 2 * s, x - 6 * s, y - 12 * s, x, y - 5 * s)
  ctx.bezierCurveTo(x + 6 * s, y - 12 * s, x + 12 * s, y - 2 * s, x, y + 6 * s)
  ctx.fill()
}
function subtitle(ctx, s) {
  if (!s) return
  ctx.font = '600 11px Fredoka, Arial, sans-serif'
  const w = ctx.measureText(s).width + 14
  ctx.fillStyle = 'rgba(0,0,0,0.55)'
  ctx.fillRect(W / 2 - w / 2, H - 24, w, 18)
  ctx.fillStyle = '#fff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(s, W / 2, H - 15)
}
const lineAt = (lines, t) => lines.find(([a, b]) => t >= a && t < b)?.[2] ?? ''
function credits(ctx, t, m) {
  ctx.fillStyle = '#0b0d14'
  ctx.fillRect(0, 0, W, H)
  if (t < 2.2) return text(ctx, 'THE END', W / 2, H / 2, 34, '#ffd84a')
  const y = H + 10 - (t - 2.2) * 40
  const rows = [m.name, '', 'Directed by A. Cloud', 'Starring YOU (in seat ' + (m.seat ?? '24E') + ')', 'Snacks by the galley crew', '', 'skyhop air pictures']
  rows.forEach((r, i) => text(ctx, r, W / 2, y + i * 18, i ? 12 : 16, i === rows.length - 1 ? '#7ad8ff' : '#fff'))
}

const MOVIES = {
  cats: {
    music: { beat: 0.25, type: 'triangle', notes: [523, 659, 784, 659, 587, 698, 880, 698, 523, 659, 784, 1046, 988, 784, 659, 587] },
    events: [[13, 'laugh'], [23, 'laugh'], [34, 'cheer'], [38, 'laugh']],
    lines: [[5, 9, 'Mittens: This cloud is MINE.'], [9, 12, 'Biscuit: Not for long!'], [12.5, 16, 'Biscuit: *boing* ...I meant to do that.'], [19, 22, 'Mittens: Ah... ah... ACHOO!'], [23, 27, 'Biscuit: You made it RAIN on me!'], [30, 34, 'Both: A PLANE! Free ride!'], [36, 41, 'Pilot: ...why are there cats on my wing?']],
    draw(ctx, t) {
      if (t < 4) {
        sky(ctx, '#ff9ac8', '#ffd6e8')
        for (let i = 0; i < 9; i++) {
          ctx.fillStyle = 'rgba(255,255,255,0.5)'
          ctx.beginPath()
          ctx.arc(30 + i * 34, 150 - ((t * 30 + i * 20) % 140), 4, 0, 7)
          ctx.fill()
        }
        text(ctx, 'CLOUD CATS', W / 2, H / 2 - 6, 38 + Math.sin(t * 5) * 2, '#ffffff', '#c8246e')
        text(ctx, 'a skyhop air original', W / 2, H / 2 + 28, 12, '#fff', '#c8246e')
        return
      }
      sky(ctx, '#6ec6ff', '#d8f1ff')
      const sx = (t * 14) % 420
      for (let i = 0; i < 4; i++) cloud(ctx, ((i * 110 - sx + 420) % 420) - 60, 40 + (i % 2) * 20, 0.8, 'rgba(255,255,255,0.7)')
      // two big clouds with the cats on top
      const ax = 70
      const bx = 210
      cloud(ctx, ax - 20, 120, 1.6)
      cloud(ctx, bx - 20, 110, 1.5)
      const blink = t % 3.2 < 0.15
      // Mittens (orange)
      let my = 95 + Math.abs(Math.sin(t * 3)) * -4
      if (t > 19 && t < 22) my += Math.sin(t * 30) * 1.5 // about to sneeze
      cat(ctx, ax + 10, my, 1.1, '#ff9a3a', t, blink)
      // Biscuit (grey): jumps at 12, misses, bounces off a little cloud, back up
      let bxx = bx + 10
      let by = 86
      if (t > 11 && t < 15) {
        const k = (t - 11) / 4
        bxx = bx + 10 - k * 120
        by = 86 - Math.sin(k * Math.PI) * 40 + (k > 0.6 ? (k - 0.6) * 220 : 0)
      } else if (t >= 15 && t < 17) {
        const k = (t - 15) / 2
        bxx = bx - 110 + k * 120
        by = 175 - Math.sin(k * Math.PI) * 120
      }
      cat(ctx, bxx, by, 1.05, '#9aa4b6', t + 1, blink)
      if (t > 22 && t < 27) {
        // the sneeze turned Mittens' cloud into rain over Biscuit
        cloud(ctx, bx - 10, 50, 1, '#7d8aa3')
        ctx.strokeStyle = '#4a8fe0'
        ctx.lineWidth = 2
        for (let i = 0; i < 14; i++) {
          const rx = bx - 10 + (i * 7) % 50
          const ry = 62 + ((t * 120 + i * 23) % 50)
          ctx.beginPath()
          ctx.moveTo(rx, ry)
          ctx.lineTo(rx - 2, ry + 6)
          ctx.stroke()
        }
      }
      if (t > 29 && t < 44) {
        // a skyhop air jet flies through: the cats ride its wing
        const k = (t - 29) / 15
        const px = -80 + k * 480
        plane(ctx, px, 60, 2.2, '#ffffff', '#1c8cf0')
        if (t > 32) {
          cat(ctx, px - 30, 46, 0.6, '#ff9a3a', t, blink)
          cat(ctx, px - 10, 46, 0.6, '#9aa4b6', t + 1, blink)
        }
      }
      subtitle(ctx, lineAt(this.lines, t))
    },
  },
  shark: {
    music: { beat: 0.5, type: 'sawtooth', notes: [82, 87, 0, 0, 82, 87, 0, 0, 82, 87, 82, 87, 82, 87, 82, 87] },
    events: [[30, 'scare'], [40, 'cheer']],
    lines: [[5, 9, 'Tower: Flight 12, hold short. Something is on the runway.'], [10, 14, 'Pilot: Something? Like... a goose?'], [16, 20, 'Tower: Bigger. Much bigger.'], [22, 27, 'Pilot: I don\'t see anyth-'], [33, 38, 'Pilot: FULL THRUST! GO GO GO!'], [39, 43, 'Tower: ...cleared for take-off. Phew.']],
    draw(ctx, t) {
      if (t < 4) {
        ctx.fillStyle = '#05070c'
        ctx.fillRect(0, 0, W, H)
        text(ctx, 'SHARK RUNWAY', W / 2, H / 2, 36, '#ff2a3a', '#000')
        ctx.fillStyle = '#ff2a3a'
        for (let i = 0; i < 6; i++) ctx.fillRect(70 + i * 34, H / 2 + 16, 3, 6 + ((t * 9 + i * 3) % 14))
        return
      }
      if (t > 30 && t < 31.6) {
        // JUMP SCARE
        ctx.fillStyle = Math.floor(t * 20) % 2 ? '#ff1a2a' : '#000'
        ctx.fillRect(0, 0, W, H)
        ctx.fillStyle = '#7d8aa3'
        ctx.beginPath()
        ctx.ellipse(W / 2, H / 2 + 10, 170, 120, 0, 0, 7)
        ctx.fill()
        ctx.fillStyle = '#3a0a10'
        ctx.beginPath()
        ctx.ellipse(W / 2, H / 2 + 30, 120, 60, 0, 0, 7)
        ctx.fill()
        ctx.fillStyle = '#ffffff'
        for (let i = 0; i < 12; i++) {
          const x = W / 2 - 110 + i * 20
          ctx.beginPath()
          ctx.moveTo(x, H / 2 - 22)
          ctx.lineTo(x + 10, H / 2 + 6)
          ctx.lineTo(x + 20, H / 2 - 22)
          ctx.moveTo(x, H / 2 + 82)
          ctx.lineTo(x + 10, H / 2 + 56)
          ctx.lineTo(x + 20, H / 2 + 82)
          ctx.fill()
        }
        ctx.fillStyle = '#000'
        for (const s of [-1, 1]) {
          ctx.beginPath()
          ctx.arc(W / 2 + s * 100, H / 2 - 44, 12, 0, 7)
          ctx.fill()
        }
        return
      }
      sky(ctx, '#050a1e', '#1a2448')
      ctx.fillStyle = '#fff'
      for (let i = 0; i < 30; i++) ctx.fillRect((i * 97) % W, (i * 41) % 70, 1.2, 1.2)
      // the runway in perspective
      ctx.fillStyle = '#20242e'
      ctx.beginPath()
      ctx.moveTo(W / 2 - 18, 82)
      ctx.lineTo(W / 2 + 18, 82)
      ctx.lineTo(W + 60, H)
      ctx.lineTo(-60, H)
      ctx.fill()
      ctx.fillStyle = '#e8e8e8'
      for (let i = 0; i < 6; i++) {
        const k = ((i / 6 + t * 0.15) % 1) ** 2
        const y = 82 + k * (H - 82)
        ctx.fillRect(W / 2 - 1 - k * 4, y, 2 + k * 8, 2 + k * 10)
      }
      for (let i = 0; i < 8; i++) {
        const k = (i / 8) ** 2
        const y = 82 + k * (H - 82)
        const dx = 18 + k * (W / 2 + 60 - 18)
        ctx.fillStyle = Math.floor(t * 3 + i) % 2 ? '#ffd84a' : '#ff9a3a'
        ctx.fillRect(W / 2 - dx - 2, y, 3, 3)
        ctx.fillRect(W / 2 + dx - 1, y, 3, 3)
      }
      // the fin: crossing the runway, closer every pass
      if (t < 30) {
        const k = Math.min(1, (t - 4) / 26)
        const sc = 0.4 + k * 2.2
        const fx = W / 2 + Math.sin(t * (0.8 + k)) * (40 + k * 90)
        const fy = 96 + k * 60
        ctx.fillStyle = '#6b7690'
        ctx.beginPath()
        ctx.moveTo(fx - 12 * sc, fy)
        ctx.quadraticCurveTo(fx - 2 * sc, fy - 26 * sc, fx + 8 * sc, fy - 28 * sc)
        ctx.lineTo(fx + 12 * sc, fy)
        ctx.fill()
        ctx.strokeStyle = 'rgba(255,255,255,0.35)'
        ctx.beginPath()
        ctx.ellipse(fx, fy + 1, 16 * sc, 2 * sc, 0, 0, 7)
        ctx.stroke()
      } else {
        // the jet roars off, the shark left behind
        const k = Math.min(1, (t - 31.6) / 8)
        plane(ctx, W / 2 + k * 30, 140 - k * 120, 3 - k * 2, '#ffffff', '#1c8cf0', -0.25)
      }
      subtitle(ctx, lineAt(this.lines, t))
    },
  },
  love: {
    music: { beat: 0.3, type: 'sine', notes: [523, 659, 784, 988, 880, 784, 659, 587, 523, 659, 784, 1046, 988, 880, 784, 659] },
    events: [[34, 'kiss']],
    lines: [[5, 9, 'Blue: What a lonely sky...'], [11, 15, 'Pink: Hello there, sailor.'], [16, 20, 'Blue: Is this airspace taken?'], [21, 25, 'Pink: Only if you like window seats.'], [27, 31, 'Blue: I\'d fly anywhere with you.'], [36, 42, 'Both: ...forever cruising. ❤']],
    draw(ctx, t) {
      sky(ctx, '#ff7a5a', '#ffd38a')
      ctx.fillStyle = 'rgba(255,240,180,0.9)'
      ctx.beginPath()
      ctx.arc(W / 2, 140, 34, 0, 7)
      ctx.fill()
      for (let i = 0; i < 5; i++) cloud(ctx, ((i * 90 - t * 8) % 450 + 450) % 450 - 60, 120 + (i % 2) * 22, 1, 'rgba(255,200,190,0.75)')
      if (t < 4) {
        text(ctx, 'LOVE AT 30,000 FT', W / 2, H / 2 - 8, 28, '#fff', '#c8246e')
        heart(ctx, W / 2, H / 2 + 26, 1.6 + Math.sin(t * 6) * 0.2)
        return
      }
      const k = Math.min(1, (t - 4) / 30)
      const bx = 40 + k * 100 + Math.sin(t * 1.3) * (1 - k) * 30
      const by = 60 + Math.sin(t * 1.7) * 18 * (1 - k)
      const px = 280 - k * 100 + Math.sin(t * 1.1) * (1 - k) * 30
      const py = 70 + Math.cos(t * 1.4) * 18 * (1 - k)
      plane(ctx, bx, by, 1.4, '#ffffff', '#1c8cf0')
      ctx.save()
      ctx.translate(px, py)
      ctx.scale(-1, 1)
      plane(ctx, 0, 0, 1.4, '#ffe6f0', '#ff4b8b')
      ctx.restore()
      for (let i = 1; i < 6; i++) {
        ctx.fillStyle = `rgba(255,255,255,${0.4 - i * 0.06})`
        ctx.beginPath()
        ctx.arc(bx - 30 - i * 9, by + Math.sin(t * 4 - i) * 2, 3, 0, 7)
        ctx.arc(px + 30 + i * 9, py + Math.cos(t * 4 - i) * 2, 3, 0, 7)
        ctx.fill()
      }
      if (t > 33.5) {
        const h = Math.min(1, (t - 33.5) / 0.6)
        heart(ctx, (bx + px) / 2, (by + py) / 2 - 20, 2.6 * h + Math.sin(t * 8) * 0.15)
        for (let i = 0; i < 10; i++) heart(ctx, (i * 37 + t * 20) % W, H - ((t - 33.5) * 40 + i * 23) % H, 0.5, 'rgba(255,90,140,0.8)')
      }
      subtitle(ctx, lineAt(this.lines, t))
    },
  },
}

// --- Mini-game art (emoji on a canvas) -----------------------------------------------------------------
const TAGS = ['🧳', '🎒', '🛂', '🗺️', '🥨', '🛩️']

// seat screen + its 3D monitor. neighbours: { npcs(), setPhones() }. sky: airport/skyView.js.
export function createSeatScreen({ scene, cabin, hud, store, fx, trip, rules, inflight, neighbours, sky, headPos = () => false, sayMe = () => {}, shake = () => {}, hooks = {} }) {
  const F = cabin.floorY
  const st = {
    phase: 'off',
    t: 0,
    movie: null, // { id, m, t, seat, beat, ev, view }
    seen: new Set(),
    cam: null, // outside camera id
    game: null,
    gameCoins: 0,
  }
  const timers = []
  const later = (t, fn) => timers.push({ t, fn })

  // The 3D monitor: a bezel + the canvas screen, placed in front of whoever watches.
  const cnv = document.createElement('canvas')
  cnv.width = W
  cnv.height = H
  const ctx = cnv.getContext('2d')
  const tex = new CanvasTexture(cnv)
  tex.colorSpace = SRGBColorSpace
  const mon = new Group()
  const bezel = new Mesh(rbox(1, 1, 0.03, 0.012, 1), new MeshStandardMaterial({ color: '#14161c', roughness: 0.4 }))
  bezel.position.z = -0.016
  const scr = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ map: tex, toneMapped: false }))
  mon.add(bezel, scr)
  mon.visible = false
  scene.add(mon)
  let drawT = 0
  function placeMonitor(s) {
    let w = 0.42
    let h = 0.25
    if (s.cls === 0) {
      mon.position.set(s.x, F + 1.0, s.z - 1.468 + 0.02)
      w = 0.8
      h = 0.46
      mon.rotation.set(0, 0, 0)
    } else if (s.cls === 1) {
      mon.position.set(s.x, F + 1.18, s.z - 1.178 + 0.02)
      w = 0.47
      h = 0.28
      mon.rotation.set(0, 0, 0)
    } else {
      const ahead = cabin.seats.find((q) => q.row === s.row - 1 && q.letter === s.letter && q.cls === s.cls)
      if (ahead) {
        const prem = s.cls === 2
        mon.position.set(s.x, F + (prem ? 1.2176 : 1.128), ahead.z + (prem ? 0.5575 : 0.493) + 0.012)
        mon.rotation.set(prem ? 0.16 : 0.12, 0, 0)
        if (prem) {
          w = 0.46
          h = 0.27
        }
      } else {
        // a bulkhead row: a fold-out screen on an arm
        mon.position.set(s.x, F + 1.28, s.z - 0.95)
        mon.rotation.set(0, 0, 0)
      }
    }
    scr.scale.set(w, h, 1)
    bezel.scale.set(w + 0.03, h + 0.03, 1)
    mon.visible = true
  }

  // --- The seat bar button ---------------------------------------------------------------------------
  const bar = hud.root.querySelector('.seatbar') // (on phones it lives in a side dock)
  const btn = document.createElement('button')
  btn.className = 'sb-btn sb-tv'
  btn.innerHTML = '<span class="sb-ico">📺</span><span class="sb-l">SCREEN</span><span class="sb-k">T</span>'
  btn.addEventListener('pointerdown', (e) => e.stopPropagation())
  btn.addEventListener('click', (e) => {
    e.stopPropagation()
    toggle()
  })
  bar?.insertBefore(btn, bar.querySelector('.sb-buff'))
  // Phones: the context buttons (rules.js' rule bar) and the seat bar leave the middle of the screen for
  // two side docks (left: context, right: seat bar), so the cabin and your avatar stay in view. Desktop /
  // tablets keep them above Skip Time.
  const dockL = document.createElement('div')
  dockL.className = 'fdock fdock-l'
  const dockR = document.createElement('div')
  dockR.className = 'fdock fdock-r'
  hud.root.append(dockL, dockR)
  const phone = matchMedia('(max-width: 700px), (max-height: 560px)')
  function placeDocks() {
    const rb = hud.root.querySelector('.rulebar')
    const sb = hud.root.querySelector('.seatbar')
    if (!rb || !sb) return
    if (phone.matches) {
      dockL.appendChild(rb)
      dockR.appendChild(sb)
    } else hud.actSlot.append(rb, sb)
  }
  phone.addEventListener?.('change', placeDocks)
  placeDocks()
  // While you watch through your own eyes (or an outside camera) the HUD folds away into this slim bar.
  const tvBar = document.createElement('div')
  tvBar.className = 'tv-bar'
  hud.root.appendChild(tvBar)
  let tvBarKey = ''
  function barButtons() {
    if (st.cam) return [['⬅️', 'BACK', 'green', stopCam], ['🔄', 'NEXT CAM', 'blue', nextCam]]
    const list = [['⏹️', 'STOP', 'red', () => stopMovie()], ['🍿', 'POPCORN', 'green', orderPopcorn]]
    if (document.querySelector('.sb-eat.show')) list.push(['🍴', 'EAT', 'pink', () => inflight.eat?.()])
    list.push(['👁️', 'VIEW', 'blue', () => (st.movie.view = 'side')])
    return list
  }
  function stepBar() {
    const on = !!(st.cam || st.movie?.view === 'pov')
    hud.root.classList.toggle('watching', on)
    document.body.classList.toggle('watching', on)
    if (!on) return
    const list = barButtons()
    const key = list.map((b) => b[1]).join('|')
    if (key === tvBarKey) return
    tvBarKey = key
    tvBar.innerHTML = ''
    for (const [icon, label, cls, fn] of list) {
      const b = document.createElement('button')
      b.className = `tvb ${cls}`
      b.innerHTML = `<span>${icon}</span>${label}`
      b.addEventListener('pointerdown', (e) => e.stopPropagation())
      b.addEventListener('click', (e) => {
        e.stopPropagation()
        sfx('click')
        fn()
      })
      tvBar.appendChild(b)
    }
  }
  const planeSeat = () => seating.seat && seating.seat.cls != null && seating.seat.lounge == null
  function toggle() {
    if (st.phase !== 'cruise' || !planeSeat()) return
    if (st.movie) return stopMovie()
    if (st.cam) return stopCam()
    openScreen()
  }
  onKey('KeyT', toggle)

  // --- The window: Movies / Games / Cameras ------------------------------------------------------------
  function openScreen(tab = 'movies') {
    sfx('screenOn', { vol: 0.3 })
    const body = hud.openWin('Seat Screen', 'w-tv', 'blue')
    body.innerHTML = `<div class="tv-tabs"></div><div class="tv-page"></div>`
    const tabs = body.querySelector('.tv-tabs')
    const page = body.querySelector('.tv-page')
    const TABS = [['movies', '🎬 Movies'], ['games', '🎮 Games'], ['cams', '📷 Cameras']]
    const show = (id) => {
      sfx('menuFlip', { vol: 0.3 })
      for (const b of tabs.children) b.classList.toggle('on', b.dataset.id === id)
      page.innerHTML = ''
      if (id === 'movies') moviesPage(page)
      else if (id === 'games') gamesPage(page)
      else camsPage(page)
    }
    for (const [id, label] of TABS) {
      const b = document.createElement('button')
      b.className = 'tv-tab'
      b.dataset.id = id
      b.textContent = label
      b.addEventListener('pointerdown', (e) => e.stopPropagation())
      b.addEventListener('click', (e) => {
        e.stopPropagation()
        show(id)
      })
      tabs.appendChild(b)
    }
    for (const b of tabs.children) b.classList.toggle('on', b.dataset.id === tab)
    if (tab === 'movies') moviesPage(page)
    else if (tab === 'games') gamesPage(page)
    else camsPage(page)
  }
  const card = (page, html, onTap) => {
    const c = document.createElement('button')
    c.className = 'tv-card'
    c.innerHTML = html
    c.addEventListener('pointerdown', (e) => e.stopPropagation())
    c.addEventListener('click', (e) => {
      e.stopPropagation()
      onTap()
    })
    page.appendChild(c)
    return c
  }
  function moviesPage(page) {
    const grid = document.createElement('div')
    grid.className = 'tv-grid'
    page.appendChild(grid)
    for (const m of S.movies) {
      const poster = document.createElement('canvas')
      poster.width = W
      poster.height = H
      MOVIES[m.id].draw(poster.getContext('2d'), m.id === 'shark' ? 18 : 33.8)
      const c = card(grid, `<span class="tv-genre">${m.genre}</span><span class="tv-name">${m.icon} ${m.name}</span><span class="tv-desc">${m.desc}</span><span class="tv-go">${st.seen.has(m.id) ? '✓ Watched · ' : ''}▶ WATCH</span>`, () => {
        hud.closeWin()
        startMovie(m)
      })
      poster.className = 'tv-poster'
      c.prepend(poster)
    }
    const tip = document.createElement('p')
    tip.className = 'tv-tip'
    tip.textContent = `Watch one to the end: +${S.filmCoins} coins. Time flies x${S.timeK} while you watch!`
    page.appendChild(tip)
  }
  function gamesPage(page) {
    const left = Math.max(0, S.gameCap - st.gameCoins)
    const grid = document.createElement('div')
    grid.className = 'tv-grid two'
    page.appendChild(grid)
    card(grid, '<span class="tv-big">🛩️</span><span class="tv-name">Sky Dodge</span><span class="tv-desc">Steer between birds and storm clouds, grab the stars!</span><span class="tv-go">▶ PLAY</span>', () => dodge(page))
    card(grid, '<span class="tv-big">🧳</span><span class="tv-name">Bag Match</span><span class="tv-desc">Flip the luggage tags and find every pair.</span><span class="tv-go">▶ PLAY</span>', () => match(page))
    const tip = document.createElement('p')
    tip.className = 'tv-tip'
    tip.textContent = left > 0 ? `Coins left to win this flight: ${left}` : 'You won every coin this flight. Play for fun!'
    page.appendChild(tip)
  }
  function camsPage(page) {
    const grid = document.createElement('div')
    grid.className = 'tv-grid cams'
    page.appendChild(grid)
    for (const c of S.cams) card(grid, `<span class="tv-big">${c.icon}</span><span class="tv-name">${c.name}</span>`, () => {
      hud.closeWin()
      startCam(c.id)
    })
    const tip = document.createElement('p')
    tip.className = 'tv-tip'
    tip.textContent = 'Live from the outside of the plane!'
    page.appendChild(tip)
  }
  function payGame(coins) {
    const n = Math.max(0, Math.min(coins, S.gameCap - st.gameCoins))
    if (n > 0) {
      st.gameCoins += n
      const p = player.renderPosition
      store.addCoins(n, { x: p.x, y: p.y + 1.6, z: p.z })
    }
    return n
  }

  // --- Movies -------------------------------------------------------------------------------------------
  function startMovie(m) {
    const s = seating.seat
    if (!s) return
    stopCam()
    const mv = MOVIES[m.id]
    st.movie = { id: m.id, m: { ...m, seat: s.code }, mv, t: 0, seat: s, beat: 0, noteI: 0, ev: 0, view: 'pov' }
    placeMonitor(s)
    if (!headPos(hp)) hp.set(s.x, s.y + 1.25, s.z)
    neighbours.setPhones?.(true, 'movie')
    sfx('screenOn', { vol: 0.3 })
    sfx('headphones', { vol: 0.3 })
    hooks.timeScale?.(S.timeK, 'movie')
    hud.toast(`🎬 Now showing: ${m.name}. Grab some 🍿 POPCORN!`)
  }
  function stopMovie(done = false) {
    const mv = st.movie
    if (!mv) return
    st.movie = null
    mon.visible = false
    hooks.timeScale?.(1, 'movie')
    neighbours.setPhones?.(false)
    sfx('headphones', { vol: 0.25, off: true })
    if (done && !st.seen.has(mv.id)) {
      st.seen.add(mv.id)
      hud.big('🎬 FILM BUFF!', 'gold', 1.8)
      sfx('cheer', { vol: 0.25 })
      const p = player.renderPosition
      store.addCoins(S.filmCoins, { x: p.x, y: p.y + 1.6, z: p.z })
    }
  }
  function movieEvent(kind) {
    const s = st.movie.seat
    const pals = neighbours.npcs?.() ?? []
    if (kind === 'laugh') {
      sfx('laughTrack', { vol: 0.2 })
      later(0.4, () => sayMe(pick(['HAHAHA!', 'Hehehe!', 'LOL!', '😂']), 1.4))
      for (const n of pals) if (Math.random() < 0.5) n.data.clap = 1.2
    } else if (kind === 'cheer') {
      sfx('cheer', { vol: 0.22 })
      for (const n of pals) n.data.clap = 1.5
    } else if (kind === 'scare') {
      sfx('jumpScare', { vol: 0.5 })
      later(0.08, () => sfx('scream', { vol: 0.35 }))
      sayMe('AAAAH!', 1.6)
      shake(0.25, 0.5)
      hud.big('😱 JUMP SCARE!', 'red', 1.4)
      // popcorn everywhere
      for (let i = 0; i < 4; i++) fx.sparkle(s.x, s.y + 1.1, s.z - 0.4, { count: 10, color: i % 2 ? '#fff6d8' : '#ffe08a', size: 0.12, speed: 3.5, up: 3, life: 1.1, grav: 7 })
      for (const n of pals) n.scare = 1.2
      neighbours.startle?.()
    } else if (kind === 'kiss') {
      sfx('mmm', { vol: 0.3 })
      sfx('chime', { vol: 0.25 })
      for (let i = 0; i < 12; i++) later(i * 0.1, () => fx.trail(s.x + rr(-0.4, 0.4), s.y + 1.4, s.z - 0.6, { glow: true, color: pick(['#ff4b6b', '#ff8ab0', '#ffd6e8']), size: 0.14, size1: 0.05, alpha: 1, life: 1.4, vx: rr(-0.2, 0.2), vy: 0.7, vz: rr(0.1, 0.4), grav: -0.1 }))
      sayMe('Awww! 🥹', 1.6)
    }
  }
  function stepMovie(dt) {
    const mv = st.movie
    if (!mv) return
    if (seating.seat !== mv.seat || st.phase !== 'cruise') return stopMovie()
    mv.t += dt
    // the soundtrack (quiet through the headphones), not over the credits
    const mu = mv.mv.music
    if (mv.t < S.movieTime - 4) {
      mv.beat -= dt
      if (mv.beat <= 0) {
        mv.beat += mu.beat
        const f = mu.notes[mv.noteI++ % mu.notes.length]
        if (f) sfx('mNote', { f, type: mu.type, vol: mv.id === 'shark' ? 0.16 : 0.08, dur: mu.beat * (mv.id === 'shark' ? 1.6 : 1.2), vib: mv.id === 'love' ? 5 : 0 })
      }
    }
    while (mv.ev < mv.mv.events.length && mv.t >= mv.mv.events[mv.ev][0]) movieEvent(mv.mv.events[mv.ev++][1])
    drawT -= dt
    if (drawT <= 0) {
      drawT = 1 / 24
      if (mv.t > S.movieTime - 4) credits(ctx, mv.t - (S.movieTime - 4), mv.m)
      else mv.mv.draw(ctx, mv.t)
      tex.needsUpdate = true
    }
    // the screen's glow on your face: a faint flicker in its colours
    if (Math.random() < dt * 2) {
      const d = ctx.getImageData(W / 2, H / 2, 1, 1).data
      fx.trail(mon.position.x, mon.position.y, mon.position.z + 0.05, { glow: true, color: `rgb(${d[0]},${d[1]},${d[2]})`, size: 0.5, size1: 0.6, alpha: 0.05, life: 0.4, vx: 0, vy: 0, vz: 0.3, grav: 0 })
    }
    if (mv.t >= S.movieTime) stopMovie(true)
  }
  function orderPopcorn() {
    const s = seating.seat
    if (!s) return
    inflight.orderId?.('popcorn')
  }

  // --- Outside cameras ------------------------------------------------------------------------------------
  function startCam(id) {
    st.cam = id
    sky.show(true)
    sfx('screenOn', { vol: 0.25 })
    hud.toast(`📷 ${S.cams.find((c) => c.id === id)?.name}: live from outside!`)
  }
  function stopCam() {
    if (!st.cam) return
    st.cam = null
    sky.show(false)
  }
  function nextCam() {
    const i = S.cams.findIndex((c) => c.id === st.cam)
    startCam(S.cams[(i + 1) % S.cams.length].id)
  }

  // --- Mini-game: SKY DODGE ------------------------------------------------------------------------------
  function dodge(page) {
    page.innerHTML = `<div class="tv-game"><canvas class="tv-cnv" width="300" height="400"></canvas><div class="tv-ghud"><span class="g-score">⭐ 0</span><span class="g-lives">❤️❤️❤️</span><span class="g-time"></span></div><div class="tv-ctrl"><button class="tv-l">◀</button><button class="tv-r">▶</button></div></div>`
    const c = page.querySelector('canvas')
    const g = { kind: 'dodge', c, ctx: c.getContext('2d'), x: 0.5, tx: 0.5, dir: 0, t: 0, score: 0, lives: 3, items: [], spawn: 0.6, hitT: 0, over: false, page }
    st.game = g
    sfx('arcade', { kind: 'start', vol: 0.3 })
    const setT = (e) => {
      const r = c.getBoundingClientRect()
      g.tx = clamp((e.clientX - r.left) / r.width, 0.06, 0.94)
    }
    c.addEventListener('pointerdown', (e) => {
      e.stopPropagation()
      setT(e)
    })
    c.addEventListener('pointermove', (e) => {
      if (e.buttons || e.pointerType !== 'mouse') setT(e)
    })
    for (const [cls, d] of [['.tv-l', -1], ['.tv-r', 1]]) {
      const b = page.querySelector(cls)
      b.addEventListener('pointerdown', (e) => {
        e.stopPropagation()
        g.dir = d
      })
      for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => (g.dir = 0))
    }
  }
  function stepDodge(g, dt) {
    if (g.over) return
    g.t += dt
    g.hitT = Math.max(0, g.hitT - dt)
    if (g.dir) g.tx = clamp(g.tx + g.dir * dt * 1.1, 0.06, 0.94)
    g.x += (g.tx - g.x) * Math.min(1, dt * 10)
    const speed = 0.32 + g.t * 0.012
    g.spawn -= dt
    if (g.spawn <= 0) {
      g.spawn = Math.max(0.28, 0.7 - g.t * 0.01) * rr(0.7, 1.2)
      const r = Math.random()
      g.items.push({ x: rr(0.08, 0.92), y: -0.05, kind: r < 0.3 ? 'star' : r < 0.65 ? 'bird' : 'storm', w: Math.sin(Math.random() * 6) })
    }
    for (let i = g.items.length - 1; i >= 0; i--) {
      const it = g.items[i]
      it.y += dt * speed * (it.kind === 'bird' ? 1.2 : 1)
      if (it.kind === 'bird') it.x = clamp(it.x + Math.sin(g.t * 3 + it.w * 5) * dt * 0.15, 0.05, 0.95)
      if (Math.abs(it.y - 0.86) < 0.05 && Math.abs(it.x - g.x) < 0.09) {
        g.items.splice(i, 1)
        if (it.kind === 'star') {
          g.score += 5
          sfx('arcade', { kind: 'star', vol: 0.25 })
        } else if (g.hitT <= 0) {
          g.lives--
          g.hitT = 1
          sfx('arcade', { kind: 'hit', vol: 0.3 })
          if (g.lives <= 0) endDodge(g)
        }
        continue
      }
      if (it.y > 1.08) g.items.splice(i, 1)
    }
    if (Math.floor(g.t) > Math.floor(g.t - dt)) g.score += 1 // survival points
    if (g.t >= S.dodgeTime) endDodge(g)
    drawDodge(g)
  }
  function drawDodge(g) {
    const x = g.ctx
    const w = g.c.width
    const h = g.c.height
    const sg = x.createLinearGradient(0, 0, 0, h)
    sg.addColorStop(0, '#3a8ef0')
    sg.addColorStop(1, '#bfe6ff')
    x.fillStyle = sg
    x.fillRect(0, 0, w, h)
    x.fillStyle = 'rgba(255,255,255,0.5)'
    for (let i = 0; i < 6; i++) {
      const yy = ((g.t * 60 + i * 80) % (h + 60)) - 30
      x.beginPath()
      x.ellipse((i * 71) % w, yy, 34, 12, 0, 0, 7)
      x.fill()
    }
    x.textAlign = 'center'
    x.textBaseline = 'middle'
    x.font = '30px serif'
    for (const it of g.items) x.fillText(it.kind === 'star' ? '⭐' : it.kind === 'bird' ? '🐦' : '⛈️', it.x * w, it.y * h)
    if (g.hitT <= 0 || Math.floor(g.t * 12) % 2) {
      topPlane(x, g.x * w, 0.86 * h, 1.25, (g.tx - g.x) * 1.6)
      // contrails
      x.fillStyle = 'rgba(255,255,255,0.6)'
      for (let i = 1; i < 6; i++) {
        x.beginPath()
        x.arc(g.x * w - 20 + Math.sin(g.t * 9 + i) * 0.5, 0.86 * h + 14 + i * 7, 2.4 - i * 0.3, 0, 7)
        x.arc(g.x * w + 20 + Math.sin(g.t * 9 + i) * 0.5, 0.86 * h + 14 + i * 7, 2.4 - i * 0.3, 0, 7)
        x.fill()
      }
    }
    const pg = g.page
    pg.querySelector('.g-score').textContent = `⭐ ${g.score}`
    pg.querySelector('.g-lives').textContent = '❤️'.repeat(Math.max(0, g.lives)) + '🖤'.repeat(3 - Math.max(0, g.lives))
    pg.querySelector('.g-time').textContent = `${Math.max(0, Math.ceil(S.dodgeTime - g.t))}s`
    if (g.over) {
      x.fillStyle = 'rgba(0,0,0,0.5)'
      x.fillRect(0, 0, w, h)
    }
  }
  function endDodge(g) {
    g.over = true
    drawDodge(g)
    const won = payGame(Math.floor(g.score / 3))
    sfx('arcade', { kind: g.lives > 0 ? 'match' : 'over', vol: 0.3 })
    gameOver(g.page, g.lives > 0 ? 'YOU MADE IT!' : 'GAME OVER', `Score ${g.score}`, won, () => dodge(g.page))
  }

  // --- Mini-game: BAG MATCH -------------------------------------------------------------------------------
  function match(page) {
    const deck = [...TAGS, ...TAGS].sort(() => Math.random() - 0.5)
    page.innerHTML = `<div class="tv-match"><div class="tv-ghud"><span class="g-moves">Moves 0</span><span class="g-pairs">Pairs 0/6</span></div><div class="mt-grid"></div></div>`
    const grid = page.querySelector('.mt-grid')
    const g = { kind: 'match', moves: 0, pairs: 0, open: [], lock: false, page }
    st.game = g
    sfx('arcade', { kind: 'start', vol: 0.3 })
    deck.forEach((e) => {
      const b = document.createElement('button')
      b.className = 'mt-card'
      b.innerHTML = `<span class="mt-back">✈</span><span class="mt-face">${e}</span>`
      b.dataset.e = e
      b.addEventListener('pointerdown', (ev) => ev.stopPropagation())
      b.addEventListener('click', (ev) => {
        ev.stopPropagation()
        if (g.lock || b.classList.contains('up')) return
        b.classList.add('up')
        sfx('arcade', { kind: 'flip', vol: 0.3 })
        g.open.push(b)
        if (g.open.length < 2) return
        g.moves++
        page.querySelector('.g-moves').textContent = `Moves ${g.moves}`
        const [a, c] = g.open
        g.open = []
        if (a.dataset.e === c.dataset.e) {
          g.pairs++
          later(0.15, () => {
            sfx('arcade', { kind: 'match', vol: 0.3 })
            a.classList.add('done')
            c.classList.add('done')
          })
          page.querySelector('.g-pairs').textContent = `Pairs ${g.pairs}/6`
          if (g.pairs === 6) later(0.8, () => {
            const won = payGame(Math.max(4, 22 - Math.max(0, g.moves - 6) * 2))
            sfx('fanfare', { vol: 0.3 })
            gameOver(page, 'ALL MATCHED!', `${g.moves} moves`, won, () => match(page))
          })
        } else {
          g.lock = true
          later(0.75, () => {
            sfx('arcade', { kind: 'miss', vol: 0.25 })
            a.classList.remove('up')
            c.classList.remove('up')
            g.lock = false
          })
        }
      })
      grid.appendChild(b)
    })
  }
  function gameOver(page, title, line, won, again) {
    if (!page.isConnected) return
    const o = document.createElement('div')
    o.className = 'tv-over'
    o.innerHTML = `<b>${title}</b><span>${line}</span><span class="tv-won">${won > 0 ? `+${won} coins!` : 'No coins left this flight'}</span>`
    const row = document.createElement('div')
    row.className = 'row'
    for (const [label, fn, cls] of [['Again', again, 'green'], ['Back', () => gamesPage((page.innerHTML = '', page)), 'grey']]) {
      const b = document.createElement('button')
      b.className = `btn ${cls}`
      b.textContent = label
      b.addEventListener('pointerdown', (e) => e.stopPropagation())
      b.addEventListener('click', (e) => {
        e.stopPropagation()
        fn()
      })
      row.appendChild(b)
    }
    o.appendChild(row)
    page.querySelector('.tv-game, .tv-match')?.appendChild(o)
    if (won > 0) fx.sparkle(player.renderPosition.x, player.renderPosition.y + 1.8, player.renderPosition.z, { count: 14, color: '#ffd84a', size: 0.2, speed: 2, up: 2, life: 0.8, grav: 4 })
  }
  // Keys steer Sky Dodge while it runs (caught before the game's own input sees them).
  const keyDir = { ArrowLeft: -1, KeyA: -1, ArrowRight: 1, KeyD: 1 }
  window.addEventListener('keydown', (e) => {
    const g = st.game
    if (g?.kind !== 'dodge' || g.over || !g.c.isConnected || !(e.code in keyDir)) return
    g.dir = keyDir[e.code]
    e.preventDefault()
    e.stopImmediatePropagation()
  }, true)
  window.addEventListener('keyup', (e) => {
    const g = st.game
    if (g?.kind === 'dodge' && keyDir[e.code] === g.dir) g.dir = 0
  }, true)

  // --- Context buttons while watching / looking outside ---------------------------------------------
  rules.addActions(() => {
    if (st.phase !== 'cruise') return []
    if (st.movie) {
      const list = [{ icon: '⏹️', label: 'STOP MOVIE', key: 'T', fn: () => stopMovie(), cls: 'red', only: true, pri: 6 }]
      list.push({ icon: '🍿', label: 'POPCORN', fn: orderPopcorn, cls: 'green', only: true, pri: 5 })
      const next = { pov: 'side', side: 'wide', wide: 'pov' }
      const name = { pov: 'SIDE VIEW', side: 'WIDE VIEW', wide: 'SCREEN VIEW' }
      list.push({ icon: '👁️', label: name[st.movie.view], fn: () => (st.movie.view = next[st.movie.view]), cls: 'blue', only: true, pri: 1 })
      return list
    }
    if (st.cam) {
      return [
        { icon: '⬅️', label: 'BACK', key: 'T', fn: stopCam, cls: 'green', only: true, pri: 6 },
        { icon: '🔄', label: 'NEXT CAM', fn: nextCam, cls: 'blue', only: true, pri: 5 },
      ]
    }
    return []
  })

  const look = { x: 0, y: 0, z: 0 }
  const hp = new Vector3()
  const hp2 = new Vector3()
  return {
    st,
    get watching() {
      return !!st.movie
    },
    // The screen view looks through your eyes: main doesn't draw your avatar then.
    get pov() {
      return st.movie?.view === 'pov'
    },
    get outside() {
      return !!st.cam
    },
    // Drives the camera over your shoulder during a movie, or outside on a camera view.
    camera(cam) {
      if (st.cam) {
        sky.camera(cam, st.cam)
        return true
      }
      const mv = st.movie
      if (!mv || mv.view === 'wide') return false
      const s = mv.seat
      const side = s.aisleX > s.x ? 1 : -1
      const p = mon.position
      // your head (kept from the last frame the avatar was drawn: it's hidden in the screen view)
      if (headPos(hp2)) hp.copy(hp2)
      if (mv.view === 'pov') {
        // through your eyes (your avatar isn't drawn): straight at the screen, framed to fit any aspect,
        // with a little breathing sway
        const vf = (50 * Math.PI) / 360
        const hf = Math.atan(Math.tan(vf) * cam.aspect)
        const d = Math.max((scr.scale.y * 1.5) / (2 * Math.tan(vf)), (scr.scale.x * 1.2) / (2 * Math.tan(hf)))
        const r = mon.rotation.x
        cam.position.set(p.x, p.y - Math.sin(r) * d + 0.04 + Math.sin(st.t * 1.3) * 0.004, p.z + Math.cos(r) * d)
        look.x = p.x
        look.y = p.y - d * 0.07 // a touch above centre, clear of the slim bar at the bottom
        look.z = p.z
        cam.fov = 50
      } else {
        // from the aisle: your profile and the screen
        cam.position.set(s.aisleX + side * 0.15, hp.y + 0.35, s.z + 0.35)
        look.x = (p.x + hp.x) / 2
        look.y = (p.y + hp.y) / 2
        look.z = (p.z + hp.z) / 2
        cam.fov = 60
      }
      cam.up.set(0, 1, 0)
      cam.lookAt(look.x, look.y, look.z)
      cam.updateProjectionMatrix()
      return true
    },
    board() {
      st.phase = 'takeoff'
      st.seen.clear()
      st.gameCoins = 0
    },
    setPhase(p) {
      st.phase = p
      if (p !== 'cruise') {
        stopMovie()
        stopCam()
        hud.closeWinIf?.('w-tv')
        st.game = null
      }
    },
    clear() {
      stopMovie()
      stopCam()
      st.phase = 'off'
      st.game = null
      timers.length = 0
    },
    update(dt) {
      st.t += dt
      for (let i = timers.length - 1; i >= 0; i--) {
        const tm = timers[i]
        tm.t -= dt
        if (tm.t <= 0) {
          timers.splice(i, 1)
          tm.fn()
        }
      }
      // the SCREEN button shows in plane seats during the cruise
      const showBtn = st.phase === 'cruise' && planeSeat()
      if (btn._shown !== showBtn) {
        btn._shown = showBtn
        btn.classList.toggle('show', showBtn)
      }
      btn.classList.toggle('on', !!(st.movie || st.cam))
      stepMovie(dt)
      stepBar()
      sky.update(dt)
      if (st.cam && (!planeSeat() || st.phase !== 'cruise')) stopCam()
      const g = st.game
      if (g?.kind === 'dodge') {
        if (!g.c.isConnected) st.game = null
        else stepDodge(g, dt)
      }
    },
  }
}
