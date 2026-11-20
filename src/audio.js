// Procedural audio: one AudioContext, everything synthesised at runtime (no files).
//
// Graph:  sfx ──┬───────────────────────────┐
//               └─ reverb send ─ convolver ─┤
//         amb (outdoor bed / indoor hall) ──┼─ master ─ compressor ─ out
//         loops (engine, wheels, jets) ─────┘
// Browsers only start audio after a user gesture, so the context is created at
// once but may stay suspended until the first tap / key; until then sounds are
// silently dropped (the cutscene keeps playing either way).
import { AUDIO } from './config.js'

const A = { ctx: null, master: null, sfx: null, verb: null, amb: null, loops: null, noise: {}, indoor: 0 }
const unlockHooks = []
let muted = false
try {
  muted = localStorage.getItem(AUDIO.storageKey) === 'muted'
} catch {
  // storage blocked
}

export const audioRunning = () => A.ctx?.state === 'running'
export function onAudioUnlocked(fn) {
  if (audioRunning()) fn()
  else unlockHooks.push(fn)
}
export const isMuted = () => muted
export function setMuted(on) {
  muted = !!on
  try {
    localStorage.setItem(AUDIO.storageKey, muted ? 'muted' : 'on')
  } catch {
    // session only
  }
  applyGain()
}
// Bloxity's master_volume setting (0..1) and ad breaks (silent while an ad plays).
let volumeK = 1
let adMuted = false
const gainNow = () => (muted || adMuted ? 0 : AUDIO.volume * volumeK)
function applyGain() {
  if (A.master) A.master.gain.setTargetAtTime(gainNow(), A.ctx.currentTime, 0.05)
}
export function setVolume(k) {
  volumeK = Math.max(0, Math.min(1, Number(k) || 0))
  applyGain()
}
export function setAdMute(on) {
  adMuted = !!on
  applyGain()
}

function makeNoise(ctx, seconds, kind) {
  const len = Math.floor(ctx.sampleRate * seconds)
  const buf = ctx.createBuffer(1, len, ctx.sampleRate)
  const d = buf.getChannelData(0)
  let b0 = 0, b1 = 0, b2 = 0, last = 0
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1
    if (kind === 'white') d[i] = w * 0.6
    else if (kind === 'brown') {
      last = (last + 0.02 * w) / 1.02
      d[i] = last * 3.2
    } else {
      b0 = 0.99765 * b0 + w * 0.099046
      b1 = 0.963 * b1 + w * 0.2965164
      b2 = 0.57 * b2 + w * 1.0526913
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.16
    }
  }
  return buf
}

// A hall-ish impulse response: early reflections + a darkening tail.
function makeImpulse(ctx, seconds = 1.8) {
  const len = Math.floor(ctx.sampleRate * seconds)
  const buf = ctx.createBuffer(2, len, ctx.sampleRate)
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c)
    let lp = 0
    for (let i = 0; i < len; i++) {
      const t = i / len
      const w = Math.random() * 2 - 1
      lp += (w - lp) * (0.9 - t * 0.75) // darker as it decays
      d[i] = lp * Math.pow(1 - t, 2.6) * 0.6
    }
    for (const at of [0.011, 0.023, 0.037, 0.052]) d[Math.floor(at * ctx.sampleRate) + c * 7] += 0.5 - at * 4
  }
  return buf
}

export function initAudio() {
  if (A.ctx) return
  const Ctx = window.AudioContext || window.webkitAudioContext
  if (!Ctx) return
  const ctx = (A.ctx = new Ctx({ latencyHint: 'interactive' }))
  A.master = ctx.createGain()
  A.master.gain.value = gainNow()
  const comp = ctx.createDynamicsCompressor()
  comp.threshold.value = -14
  comp.ratio.value = 4
  comp.attack.value = 0.004
  comp.release.value = 0.2
  A.master.connect(comp).connect(ctx.destination)
  A.sfx = ctx.createGain()
  A.sfx.connect(A.master)
  const conv = ctx.createConvolver()
  conv.buffer = makeImpulse(ctx)
  A.verb = ctx.createGain()
  A.verb.gain.value = 0.18
  A.verb.connect(conv).connect(A.master)
  A.sfx.connect(A.verb)
  A.amb = ctx.createGain()
  A.amb.connect(A.master)
  A.loops = ctx.createGain()
  A.loops.connect(A.master)
  A.noise = { white: makeNoise(ctx, 2, 'white'), pink: makeNoise(ctx, 4, 'pink'), brown: makeNoise(ctx, 4, 'brown') }

  const unlock = () => {
    if (ctx.state !== 'running') ctx.resume().catch(() => {})
  }
  ctx.addEventListener('statechange', () => {
    if (ctx.state === 'running') while (unlockHooks.length) unlockHooks.shift()()
  })
  for (const ev of ['pointerdown', 'keydown', 'touchend']) window.addEventListener(ev, unlock, { capture: true })
  unlock()
}

// --- Building blocks -----------------------------------------------------------------
const now = () => A.ctx.currentTime
const live = () => A.ctx && A.ctx.state === 'running'

function out(vol = 1, pan = 0, dest = A.sfx) {
  const g = A.ctx.createGain()
  g.gain.value = vol
  if (pan && A.ctx.createStereoPanner) {
    const p = A.ctx.createStereoPanner()
    p.pan.value = Math.max(-1, Math.min(1, pan))
    g.connect(p).connect(dest)
  } else g.connect(dest)
  return g
}

function noise(kind, dest, t, dur, { type = 'bandpass', f = 1000, f2 = null, q = 1, a = 0.005, peak = 1, loop = false } = {}) {
  const src = A.ctx.createBufferSource()
  src.buffer = A.noise[kind]
  src.loop = loop
  const filt = A.ctx.createBiquadFilter()
  filt.type = type
  filt.frequency.setValueAtTime(f, t)
  if (f2) filt.frequency.exponentialRampToValueAtTime(f2, t + dur)
  filt.Q.value = q
  const g = A.ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(peak, t + a)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  src.connect(filt).connect(g).connect(dest)
  src.start(t, Math.random() * 1.5)
  src.stop(t + dur + 0.05)
}

function tone(dest, t, dur, { type = 'sine', f = 440, f2 = null, a = 0.005, peak = 0.5, curve = 'exp', vib = 0, vibRate = 6 } = {}) {
  const o = A.ctx.createOscillator()
  o.type = type
  o.frequency.setValueAtTime(f, t)
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur)
  if (vib) {
    const l = A.ctx.createOscillator()
    const lg = A.ctx.createGain()
    l.frequency.value = vibRate
    lg.gain.value = vib
    l.connect(lg).connect(o.frequency)
    l.start(t)
    l.stop(t + dur + 0.05)
  }
  const g = A.ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(peak, t + a)
  if (curve === 'exp') g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  else {
    g.gain.setValueAtTime(peak, t + dur * 0.7)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  }
  o.connect(g).connect(dest)
  o.start(t)
  o.stop(t + dur + 0.05)
}

// A soft bell: fundamental + inharmonic partials.
function bell(dest, t, f, dur = 1.6, peak = 0.25) {
  tone(dest, t, dur, { f, peak, a: 0.004 })
  tone(dest, t, dur * 0.6, { f: f * 2.01, peak: peak * 0.35, a: 0.003 })
  tone(dest, t, dur * 0.35, { f: f * 3.03, peak: peak * 0.15, a: 0.002 })
}

// --- One-shots --------------------------------------------------------------------------
const SFX = {
  step(o) {
    const t = now()
    const d = out(o.vol ?? 0.35, o.pan)
    noise('white', d, t, 0.05, { f: 1500 + Math.random() * 900, q: 0.8, peak: 0.6 })
    tone(d, t, 0.06, { f: 110, f2: 60, peak: 0.35 })
  },
  land(o) {
    const t = now()
    const d = out(o.vol ?? 0.5, o.pan)
    noise('pink', d, t, 0.16, { type: 'lowpass', f: 900, peak: 0.8 })
    tone(d, t, 0.14, { f: 120, f2: 50, peak: 0.6 })
  },
  doorOpen(o) {
    const t = now()
    const d = out(o.vol ?? 0.6, o.pan)
    noise('white', d, t, 0.03, { type: 'highpass', f: 3000, peak: 0.7 })
    noise('white', d, t + 0.05, 0.04, { type: 'highpass', f: 2200, peak: 0.6 })
    tone(d, t + 0.08, 0.35, { type: 'sawtooth', f: 190, f2: 270, peak: 0.04, vib: 8, vibRate: 23 })
    noise('pink', d, t + 0.1, 0.3, { f: 600, q: 0.7, peak: 0.25 })
  },
  doorSlam(o) {
    const t = now()
    const d = out(o.vol ?? 0.9, o.pan)
    tone(d, t, 0.42, { f: 85, f2: 38, peak: 0.9, a: 0.002 })
    noise('pink', d, t, 0.2, { type: 'lowpass', f: 1400, f2: 300, peak: 0.9, a: 0.001 })
    noise('white', d, t + 0.01, 0.05, { type: 'highpass', f: 2500, peak: 0.4 })
    noise('white', d, t + 0.09, 0.08, { f: 3200, q: 4, peak: 0.12 }) // window rattle
  },
  brake(o) {
    const t = now()
    const d = out(o.vol ?? 0.5, o.pan)
    tone(d, t, 0.9, { f: 2650, f2: 2350, peak: 0.07, a: 0.05, curve: 'hold', vib: 40, vibRate: 17 })
    noise('pink', d, t, 1.0, { type: 'lowpass', f: 900, f2: 200, peak: 0.35, a: 0.05 })
  },
  hop(o) {
    const t = now()
    noise('pink', out(o.vol ?? 0.3, o.pan), t, 0.18, { f: 700, f2: 1800, q: 1, peak: 0.6 })
  },
  sting() {
    // "You're late!": dun-dun-DUN on a brassy saw stack, plus a cymbal swell.
    const t = now()
    const d = out(0.5)
    const notes = [[0, 392, 0.16], [0.2, 370, 0.16], [0.42, 261.6, 0.9]]
    for (const [at, f, len] of notes) {
      for (const det of [0.995, 1, 1.006]) {
        const o = A.ctx.createOscillator()
        o.type = 'sawtooth'
        o.frequency.value = f * det
        const lp = A.ctx.createBiquadFilter()
        lp.type = 'lowpass'
        lp.frequency.setValueAtTime(600, t + at)
        lp.frequency.exponentialRampToValueAtTime(2600, t + at + 0.05)
        lp.frequency.exponentialRampToValueAtTime(700, t + at + len)
        const g = A.ctx.createGain()
        g.gain.setValueAtTime(0.0001, t + at)
        g.gain.exponentialRampToValueAtTime(0.12, t + at + 0.03)
        g.gain.exponentialRampToValueAtTime(0.0001, t + at + len)
        o.connect(lp).connect(g).connect(d)
        o.start(t + at)
        o.stop(t + at + len + 0.05)
      }
      tone(d, t + at, len, { f: f / 2, peak: 0.25 })
    }
    noise('white', d, t + 0.42, 1.2, { type: 'highpass', f: 5000, peak: 0.12, a: 0.01 })
  },
  tick(o) {
    const t = now()
    const d = out(o.vol ?? 0.3, o.pan)
    noise('white', d, t, 0.025, { f: 4200, q: 6, peak: 0.8, a: 0.001 })
    tone(d, t, 0.03, { f: 2200, peak: 0.15, a: 0.001 })
  },
  whoosh(o) {
    const t = now()
    const dur = o.dur ?? 0.6
    noise('pink', out(o.vol ?? 0.4, o.pan), t, dur, { f: 300, f2: 2400, q: 0.9, a: dur * 0.6, peak: 0.7 })
  },
  slide(o) {
    const t = now()
    const d = out(o.vol ?? 0.35, o.pan)
    noise('pink', d, t, 0.8, { type: 'lowpass', f: 400, f2: 1500, a: 0.2, peak: 0.5 })
    tone(d, t, 0.8, { type: 'triangle', f: 92, peak: 0.06, a: 0.1, curve: 'hold' })
  },
  chime() {
    const t = now()
    const d = out(0.45)
    ;[523.3, 659.3, 784, 1046.5].forEach((f, i) => bell(d, t + i * 0.09, f, 1.4, 0.2))
    noise('white', d, t + 0.3, 0.6, { type: 'highpass', f: 7000, peak: 0.08, a: 0.01 })
  },
  pa() {
    const t = now()
    const d = out(0.35)
    bell(d, t, 659.3, 2.2, 0.3)
    bell(d, t + 0.55, 523.3, 2.6, 0.3)
  },
  coin(o) {
    const t = now()
    const d = out(o.vol ?? 0.3, o.pan)
    tone(d, t, 0.08, { type: 'square', f: 988, peak: 0.12, curve: 'hold' })
    tone(d, t + 0.08, 0.3, { type: 'square', f: 1319, peak: 0.12 })
  },
  click() {
    const t = now()
    const d = out(0.3)
    tone(d, t, 0.06, { type: 'triangle', f: 900, f2: 600, peak: 0.4, a: 0.001 })
  },
  pop() {
    const t = now()
    const d = out(0.35)
    tone(d, t, 0.12, { f: 300, f2: 900, peak: 0.5, a: 0.002 })
    noise('white', d, t, 0.05, { f: 2000, peak: 0.3 })
  },
  error() {
    const t = now()
    const d = out(0.25)
    tone(d, t, 0.12, { type: 'square', f: 180, peak: 0.25, curve: 'hold' })
    tone(d, t + 0.14, 0.18, { type: 'square', f: 140, peak: 0.25, curve: 'hold' })
  },
  fanfare() {
    const t = now()
    const d = out(0.4)
    ;[[0, 523.3], [0.12, 659.3], [0.24, 784], [0.36, 1046.5], [0.36, 784]].forEach(([at, f]) => {
      tone(d, t + at, 0.5, { type: 'square', f, peak: 0.07, curve: 'hold' })
      tone(d, t + at, 0.5, { type: 'triangle', f: f / 2, peak: 0.12 })
    })
    noise('white', d, t + 0.36, 0.8, { type: 'highpass', f: 6000, peak: 0.1 })
  },
  beep(o) {
    const t = now()
    tone(out(o.vol ?? 0.2, o.pan), t, 0.09, { type: 'square', f: o.f ?? 1760, peak: 0.12, curve: 'hold' })
  },
  belt(o) {
    const t = now()
    const d = out(o.vol ?? 0.25, o.pan)
    tone(d, t, 2.2, { type: 'sawtooth', f: 55, peak: 0.05, a: 0.2, curve: 'hold' })
    noise('pink', d, t, 2.2, { f: 400, q: 2, a: 0.2, peak: 0.3 })
  },
  thud(o) {
    const t = now()
    const d = out(o.vol ?? 0.5, o.pan)
    tone(d, t, 0.18, { f: 140 + Math.random() * 60, f2: 60, peak: 0.7 })
    noise('pink', d, t, 0.1, { type: 'lowpass', f: 1600, peak: 0.6 })
  },
  flap(o) {
    const t = now()
    const d = out(o.vol ?? 0.35, o.pan)
    for (let i = 0; i < 7; i++) noise('pink', d, t + i * 0.065, 0.05, { f: 900 + Math.random() * 400, q: 0.7, peak: 0.7 - i * 0.07 })
  },
  coo(o) {
    const t = now()
    tone(out(o.vol ?? 0.12, o.pan), t, 0.35, { f: 420, f2: 330, peak: 0.3, a: 0.04, vib: 25, vibRate: 30 })
  },
  bonk(o) {
    const t = now()
    const d = out(o.vol ?? 0.35, o.pan)
    tone(d, t, 0.25, { f: 700, f2: 180, peak: 0.45, a: 0.002 })
    noise('white', d, t, 0.04, { f: 2500, peak: 0.4 })
  },
  scream(o) {
    const t = now()
    const d = out(o.vol ?? 0.2, o.pan)
    const f = 500 + Math.random() * 400
    tone(d, t, 0.5, { type: 'sawtooth', f, f2: f * 1.6, peak: 0.06, vib: 30, vibRate: 11 })
    tone(d, t, 0.5, { type: 'sine', f: f * 2, f2: f * 3, peak: 0.08 })
  },
  paper(o) {
    const t = now()
    noise('white', out(o.vol ?? 0.15, o.pan), t, 0.5, { f: 2500, f2: 5000, q: 1.5, a: 0.2, peak: 0.5 })
  },
  horn(o) {
    const t = now()
    const d = out(o.vol ?? 0.2, o.pan)
    tone(d, t, 0.35, { type: 'square', f: 392, peak: 0.08, curve: 'hold' })
    tone(d, t, 0.35, { type: 'square', f: 494, peak: 0.08, curve: 'hold' })
  },
  trunk(o) {
    const t = now()
    const d = out(o.vol ?? 0.6, o.pan)
    tone(d, t, 0.25, { f: 110, f2: 55, peak: 0.6 })
    noise('pink', d, t, 0.12, { type: 'lowpass', f: 1000, peak: 0.6 })
  },
  emoji() {
    const t = now()
    const d = out(0.3)
    tone(d, t, 0.15, { f: 600, f2: 1200, peak: 0.4 })
    tone(d, t + 0.1, 0.2, { f: 1200, f2: 1600, peak: 0.3 })
  },
  // Agent voice: a soft vowel-ish blip per syllable.
  talk(o) {
    const t = now()
    const d = out(o.vol ?? 0.07)
    tone(d, t, 0.06, { type: 'triangle', f: o.f ?? 600, f2: (o.f ?? 600) * 0.9, peak: 0.5, a: 0.004 })
  },
  select() {
    const t = now()
    const d = out(0.35)
    tone(d, t, 0.08, { type: 'triangle', f: 660, peak: 0.4, a: 0.002 })
    tone(d, t + 0.07, 0.16, { type: 'triangle', f: 990, peak: 0.35, a: 0.002 })
    noise('white', d, t, 0.05, { f: 4000, q: 2, peak: 0.15 })
  },
  hmm() {
    const t = now()
    const d = out(0.25)
    tone(d, t, 0.22, { type: 'triangle', f: 330, f2: 300, peak: 0.35 })
    tone(d, t + 0.22, 0.3, { type: 'triangle', f: 247, f2: 230, peak: 0.35 })
  },
  stamp() {
    const t = now()
    const d = out(0.7)
    tone(d, t, 0.2, { f: 160, f2: 50, peak: 0.9, a: 0.001 })
    noise('pink', d, t, 0.12, { type: 'lowpass', f: 2200, peak: 0.8, a: 0.001 })
    noise('white', d, t + 0.02, 0.2, { f: 3000, q: 0.8, peak: 0.15 })
  },
  found() {
    const t = now()
    const d = out(0.4)
    ;[[0, 784], [0.09, 988], [0.18, 1175]].forEach(([at, f]) => tone(d, t + at, 0.22, { type: 'square', f, peak: 0.08 }))
    noise('white', d, t, 0.25, { type: 'highpass', f: 6000, peak: 0.1 })
  },
  // Walk-through metal detector alarm: a harsh two-tone pulse.
  alarm(o) {
    const t = now()
    const d = out(o.vol ?? 0.3, o.pan)
    for (let i = 0; i < 4; i++) tone(d, t + i * 0.16, 0.12, { type: 'square', f: i % 2 ? 880 : 1100, peak: 0.12, curve: 'hold' })
  },
  clearBeep(o) {
    const t = now()
    const d = out(o.vol ?? 0.25, o.pan)
    tone(d, t, 0.12, { type: 'sine', f: 1320, peak: 0.3 })
    tone(d, t + 0.12, 0.2, { type: 'sine', f: 1760, peak: 0.3 })
  },
  pat(o) {
    const t = now()
    const d = out(o.vol ?? 0.2, o.pan)
    noise('pink', d, t, 0.09, { f: 900 + Math.random() * 600, q: 0.8, peak: 0.6 })
  },
  // Cabin PA / seatbelt sign: the classic soft high-low two-tone.
  bingBong(o) {
    const t = now()
    const d = out(o.vol ?? 0.4)
    bell(d, t, 1318.5, 1.6, 0.22)
    bell(d, t + 0.42, 1046.5, 2.0, 0.22)
  },
  // Boarding pass scanner: a bright double beep + a little click.
  scanOk(o) {
    const t = now()
    const d = out(o.vol ?? 0.3, o.pan)
    noise('white', d, t, 0.02, { f: 5000, q: 2, peak: 0.4, a: 0.001 })
    tone(d, t + 0.02, 0.09, { type: 'sine', f: 1975, peak: 0.35, curve: 'hold' })
    tone(d, t + 0.14, 0.14, { type: 'sine', f: 2637, peak: 0.35, curve: 'hold' })
  },
  // Dropping into a padded seat: a soft cushioned thump with a little creak.
  sit(o) {
    const t = now()
    const d = out(o.vol ?? 0.35, o.pan)
    noise('pink', d, t, 0.22, { type: 'lowpass', f: 600, f2: 200, peak: 0.8, a: 0.01 })
    tone(d, t, 0.18, { f: 95, f2: 60, peak: 0.45 })
    tone(d, t + 0.08, 0.12, { type: 'triangle', f: 310, f2: 260, peak: 0.04, vib: 14, vibRate: 30 })
  },
  // Jet bridge / gate door: a pneumatic hiss + roll.
  pneumatic(o) {
    const t = now()
    const d = out(o.vol ?? 0.35, o.pan)
    noise('white', d, t, 0.5, { type: 'highpass', f: 3500, f2: 1800, peak: 0.25, a: 0.02 })
    noise('pink', d, t + 0.1, 0.9, { type: 'lowpass', f: 300, f2: 900, peak: 0.4, a: 0.2 })
  },
  // Landing gear thunk / chocks.
  gear(o) {
    const t = now()
    const d = out(o.vol ?? 0.6, o.pan)
    tone(d, t, 0.35, { f: 70, f2: 38, peak: 0.9, a: 0.003 })
    noise('pink', d, t, 0.25, { type: 'lowpass', f: 900, f2: 200, peak: 0.7, a: 0.002 })
    noise('white', d, t + 0.05, 0.12, { f: 2400, q: 3, peak: 0.12 })
  },
  // Take-off roll: a long swelling roar with runway joints thumping under the wheels.
  rumble(o) {
    const t = now()
    const dur = o.dur ?? 7
    const d = out(o.vol ?? 0.5)
    noise('brown', d, t, dur, { type: 'lowpass', f: 140, f2: 900, peak: 1, a: dur * 0.55 })
    noise('pink', d, t + 0.3, dur, { f: 400, f2: 1600, q: 0.8, peak: 0.35, a: dur * 0.6 })
    tone(d, t, dur, { type: 'sawtooth', f: 48, f2: 110, peak: 0.05, a: dur * 0.5, curve: 'hold' })
    for (let i = 0; i < 9; i++) noise('pink', d, t + 0.5 + i * (0.7 - i * 0.05), 0.06, { type: 'lowpass', f: 300, peak: 0.6 })
  },
  // Touchdown: two tyre chirps and a thump.
  touchdown(o) {
    const t = now()
    const d = out(o.vol ?? 0.5)
    for (const at of [0, 0.14]) {
      noise('white', d, t + at, 0.18, { f: 2400, f2: 1400, q: 3, peak: 0.35, a: 0.005 })
      tone(d, t + at, 0.3, { f: 80, f2: 40, peak: 0.7, a: 0.003 })
    }
    noise('brown', d, t + 0.2, 2.2, { type: 'lowpass', f: 500, f2: 120, peak: 0.6, a: 0.05 })
  },
  // A city car horn (two detuned squares).
  carHorn(o) {
    const t = now()
    const d = out(o.vol ?? 0.12, o.pan)
    const f = o.f ?? 415
    const len = o.dur ?? 0.3
    tone(d, t, len, { type: 'square', f, peak: 0.08, curve: 'hold' })
    tone(d, t, len, { type: 'square', f: f * 1.26, peak: 0.07, curve: 'hold' })
  },
  // The bartender pours you one: glugs + clinks.
  pour(o) {
    const t = now()
    const d = out(o.vol ?? 0.3, o.pan)
    for (let i = 0; i < 6; i++) tone(d, t + i * 0.09, 0.08, { f: 300 + i * 70, f2: 500 + i * 70, peak: 0.25, a: 0.01 })
    bell(d, t + 0.62, 2637, 0.6, 0.08)
    bell(d, t + 0.7, 3136, 0.5, 0.06)
  },
  // Passengers cheering on landing.
  cheer(o) {
    const t = now()
    const d = out(o.vol ?? 0.35)
    noise('pink', d, t, 2.6, { f: 1300, q: 0.6, peak: 0.6, a: 0.3 })
    noise('pink', d, t + 0.1, 2.4, { f: 2600, q: 1.2, peak: 0.25, a: 0.25 })
    for (let i = 0; i < 10; i++) {
      const f = 500 + Math.random() * 600
      tone(d, t + Math.random() * 1.6, 0.25, { type: 'triangle', f, f2: f * 1.3, peak: 0.05, a: 0.02 })
    }
    for (let i = 0; i < 14; i++) noise('white', d, t + 0.3 + Math.random() * 2, 0.03, { f: 2000, q: 1, peak: 0.3, a: 0.001 }) // claps
  },
  scanHum(o) {
    const t = now()
    const d = out(o.vol ?? 0.15, o.pan)
    tone(d, t, 1.2, { type: 'sawtooth', f: 60, peak: 0.05, a: 0.15, curve: 'hold' })
    noise('pink', d, t, 1.2, { f: 250, q: 3, a: 0.2, peak: 0.25 })
  },
}

export function sfx(name, opts = {}) {
  if (!live() || muted) return
  try {
    SFX[name]?.(opts)
  } catch {
    // never let audio break the game
  }
}

// --- Loops ----------------------------------------------------------------------------
// Car engine: detuned saw + square through a lowpass that opens with revs, lumpy idle.
export function engineLoop() {
  if (!A.ctx) return { set() {}, stop() {} }
  const ctx = A.ctx
  const g = ctx.createGain()
  g.gain.value = 0
  const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 400
  const o1 = ctx.createOscillator()
  const o2 = ctx.createOscillator()
  o1.type = 'sawtooth'
  o2.type = 'square'
  const og = ctx.createGain()
  og.gain.value = 0.2
  const lfo = ctx.createOscillator()
  const lfoG = ctx.createGain()
  lfo.frequency.value = 11
  lfoG.gain.value = 0.08
  lfo.connect(lfoG).connect(og.gain)
  o1.connect(og)
  o2.connect(og)
  og.connect(lp)
  const nz = ctx.createBufferSource()
  nz.buffer = A.noise.brown
  nz.loop = true
  const ng = ctx.createGain()
  ng.gain.value = 0.25
  nz.connect(ng).connect(lp)
  lp.connect(g)
  if (pan) g.connect(pan).connect(A.loops)
  else g.connect(A.loops)
  o1.start()
  o2.start()
  lfo.start()
  nz.start()
  return {
    set(rev, vol, p = 0) {
      if (!Number.isFinite(rev) || !Number.isFinite(vol)) return
      if (!Number.isFinite(p)) p = 0
      const t = ctx.currentTime
      const f = 34 + rev * 70
      o1.frequency.setTargetAtTime(f, t, 0.08)
      o2.frequency.setTargetAtTime(f * 0.5, t, 0.08)
      lfo.frequency.setTargetAtTime(9 + rev * 20, t, 0.1)
      lp.frequency.setTargetAtTime(260 + rev * 1300, t, 0.08)
      g.gain.setTargetAtTime(vol, t, 0.08)
      if (pan) pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, p)), t, 0.08)
    },
    stop() {
      g.gain.setTargetAtTime(0, ctx.currentTime, 0.2)
      setTimeout(() => [o1, o2, lfo, nz].forEach((n) => n.stop()), 1200)
    },
  }
}

// Suitcase wheels on tiles: band-limited rumble with a clack per tile joint.
export function rollLoop() {
  if (!A.ctx) return { set() {} }
  const ctx = A.ctx
  const nz = ctx.createBufferSource()
  nz.buffer = A.noise.pink
  nz.loop = true
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 380
  bp.Q.value = 1.2
  const g = ctx.createGain()
  g.gain.value = 0
  nz.connect(bp).connect(g).connect(A.loops)
  nz.start()
  let dist = 0
  return {
    set(speed, dt, vol = 1) {
      if (!Number.isFinite(speed)) return
      const t = ctx.currentTime
      g.gain.setTargetAtTime(Math.min(1, speed / 6) * 0.35 * vol, t, 0.06)
      bp.frequency.setTargetAtTime(260 + speed * 40, t, 0.1)
      dist += speed * dt
      if (dist > 1.5) {
        dist = 0
        if (speed > 1) sfx('tick', { vol: 0.12 * vol })
      }
    },
  }
}

// Jet roar for the planes overhead: brown noise, lowpass opens as it nears.
export function jetLoop() {
  if (!A.ctx) return { set() {} }
  const ctx = A.ctx
  const nz = ctx.createBufferSource()
  nz.buffer = A.noise.brown
  nz.loop = true
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 300
  const g = ctx.createGain()
  g.gain.value = 0
  const whine = ctx.createOscillator()
  whine.frequency.value = 2400
  const wg = ctx.createGain()
  wg.gain.value = 0
  whine.connect(wg).connect(g)
  nz.connect(lp).connect(g).connect(A.loops)
  nz.start()
  whine.start()
  return {
    set(vol, bright) {
      if (!Number.isFinite(vol) || !Number.isFinite(bright)) return
      const t = ctx.currentTime
      g.gain.setTargetAtTime(vol, t, 0.3)
      lp.frequency.setTargetAtTime(200 + bright * 1400, t, 0.3)
      wg.gain.setTargetAtTime(bright * 0.004, t, 0.3)
    },
  }
}

// Turbofan: a low roar + a whistling whine that both follow `rpm`; the gate's jet taxiing in, the
// engines spooling up for take-off, and the steady cabin drone in flight (lowpassed through the hull).
export function turbineLoop() {
  if (!A.ctx) return { set() {}, stop() {} }
  const ctx = A.ctx
  const nz = ctx.createBufferSource()
  nz.buffer = A.noise.brown
  nz.loop = true
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 300
  const hiss = ctx.createBufferSource()
  hiss.buffer = A.noise.pink
  hiss.loop = true
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.Q.value = 1.4
  bp.frequency.value = 1200
  const hg = ctx.createGain()
  hg.gain.value = 0.25
  const whine = ctx.createOscillator()
  whine.type = 'sine'
  whine.frequency.value = 900
  const whine2 = ctx.createOscillator()
  whine2.type = 'sine'
  whine2.frequency.value = 1810
  const wg = ctx.createGain()
  wg.gain.value = 0
  const g = ctx.createGain()
  g.gain.value = 0
  nz.connect(lp).connect(g)
  hiss.connect(bp).connect(hg).connect(g)
  whine.connect(wg)
  whine2.connect(wg)
  wg.connect(g)
  g.connect(A.loops)
  nz.start()
  hiss.start(0, Math.random() * 2)
  whine.start()
  whine2.start()
  return {
    // vol 0..1, rpm 0..1, muffle 0..1 (inside the cabin)
    set(vol, rpm, muffle = 0) {
      if (!Number.isFinite(vol) || !Number.isFinite(rpm)) return
      const t = ctx.currentTime
      g.gain.setTargetAtTime(vol, t, 0.25)
      lp.frequency.setTargetAtTime((160 + rpm * 900) * (1 - muffle * 0.55), t, 0.3)
      bp.frequency.setTargetAtTime(700 + rpm * 1600, t, 0.3)
      hg.gain.setTargetAtTime((0.12 + rpm * 0.3) * (1 - muffle * 0.8), t, 0.3)
      whine.frequency.setTargetAtTime(500 + rpm * 2600, t, 0.4)
      whine2.frequency.setTargetAtTime(1000 + rpm * 5100, t, 0.4)
      wg.gain.setTargetAtTime((0.004 + rpm * 0.014) * (1 - muffle * 0.85), t, 0.3)
    },
    stop() {
      g.gain.setTargetAtTime(0, ctx.currentTime, 0.4)
      setTimeout(() => [nz, hiss, whine, whine2].forEach((n) => n.stop()), 2500)
    },
  }
}

// --- Ambience ---------------------------------------------------------------------------
// Outdoor: traffic rumble + breeze + birds. Indoor: crowd murmur + PA chimes.
// setIndoor(0..1) crossfades and opens the reverb.
let amb = null
export function startAmbience() {
  if (!A.ctx || amb) return
  const ctx = A.ctx
  const bed = (kind, type, f, q, vol) => {
    const s = ctx.createBufferSource()
    s.buffer = A.noise[kind]
    s.loop = true
    const fl = ctx.createBiquadFilter()
    fl.type = type
    fl.frequency.value = f
    fl.Q.value = q
    const g = ctx.createGain()
    g.gain.value = vol
    s.connect(fl).connect(g)
    s.start(0, Math.random() * 3)
    return g
  }
  const outdoor = ctx.createGain()
  const indoor = ctx.createGain()
  outdoor.connect(A.amb)
  indoor.connect(A.amb)
  bed('brown', 'lowpass', 380, 0.5, 0.5).connect(outdoor)
  const wind = bed('pink', 'bandpass', 700, 0.4, 0.05)
  wind.connect(outdoor)
  // Crowd murmur: three formant-ish bands that swell independently.
  const murmurs = [[320, 0.09], [700, 0.07], [1400, 0.035]].map(([f, v]) => {
    const g = bed('pink', 'bandpass', f, 1.6, v)
    g.connect(indoor)
    return { g, v }
  })
  amb = { outdoor, indoor, wind, murmurs, birdIn: 1.5, paIn: 18 }
  setIndoor(0)
}

export function setIndoor(k) {
  A.indoor = k
  if (!amb) return
  const t = A.ctx.currentTime
  amb.outdoor.gain.setTargetAtTime((1 - k) * 0.9 + 0.05, t, 0.4)
  amb.indoor.gain.setTargetAtTime(k * 0.9 + 0.08, t, 0.4)
  A.verb.gain.setTargetAtTime(0.12 + k * 0.3, t, 0.4)
}

// Call every frame: schedules birds, PA chimes and murmur swells.
export function updateAmbience(dt) {
  if (!amb || !live()) return
  const t = A.ctx.currentTime
  amb.birdIn -= dt
  if (amb.birdIn <= 0) {
    amb.birdIn = 1.5 + Math.random() * 4
    if (A.indoor < 0.5) {
      const d = out(0.07 * (1 - A.indoor), Math.random() * 1.6 - 0.8)
      const base = 2600 + Math.random() * 1800
      const n = 2 + Math.floor(Math.random() * 4)
      for (let i = 0; i < n; i++) tone(d, t + i * 0.11, 0.08, { f: base, f2: base * (1.15 + Math.random() * 0.4), peak: 0.5, a: 0.01 })
    }
  }
  amb.paIn -= dt
  if (amb.paIn <= 0) {
    amb.paIn = 35 + Math.random() * 30
    if (A.indoor > 0.5) sfx('pa')
  }
  if (Math.random() < dt * 0.8) {
    for (const m of amb.murmurs) m.g.gain.setTargetAtTime(m.v * (0.6 + Math.random() * 0.8), t, 0.6)
    amb.wind.gain.setTargetAtTime(0.03 + Math.random() * 0.06, t, 1.2)
  }
}

// Extra one-shots registered by other modules (trolls.js, tools.js) with the same synth helpers:
// build({ now, out, tone, noise }, opts). Played through sfx(name) like the built-in ones.
export function registerSfx(name, build) {
  SFX[name] = (o) => build({ now, out, tone, noise }, o)
}
