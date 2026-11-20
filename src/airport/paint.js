// Canvas painters for the airport (no image files). Each returns a canvas; wrap
// with toTexture() from textures.js. Sizes are kept small for mobile GPUs.
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three'
import { fbm, mulberry32, paintPavement } from '../textures.js'

const FONT = 'Fredoka, "Arial Rounded MT Bold", Arial, sans-serif'

function cv(w, h = w) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

export function tex(c, { repeatX = 1, repeatY = 1, srgb = true, aniso = 8 } = {}) {
  const t = new CanvasTexture(c)
  t.wrapS = t.wrapT = RepeatWrapping
  t.repeat.set(repeatX, repeatY)
  t.anisotropy = aniso
  if (srgb) t.colorSpace = SRGBColorSpace
  return t
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

// Curtain-wall glass: one tile = 3 x 2 panes, navy frames, bright blue glass with
// cyan reflection streaks and a soft diagonal glare (the reference's look).
export function paintGlass(seed = 11, { frame = '#0d1c3f', top = '#4aa3ff', bottom = '#1559d6' } = {}) {
  const rand = mulberry32(seed)
  const W = 384
  const H = 256
  const c = cv(W, H)
  const ctx = c.getContext('2d')
  const cols = 3
  const rows = 2
  const pw = W / cols
  const ph = H / rows
  ctx.fillStyle = frame
  ctx.fillRect(0, 0, W, H)
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols; k++) {
      const x = k * pw + 5
      const y = r * ph + 5
      const w = pw - 10
      const h = ph - 10
      const g = ctx.createLinearGradient(0, y, 0, y + h)
      g.addColorStop(0, top)
      g.addColorStop(1, bottom)
      ctx.fillStyle = g
      ctx.fillRect(x, y, w, h)
      // faint interior: a darker band low down (people / furniture behind the glass)
      ctx.fillStyle = 'rgba(10, 30, 80, 0.22)'
      ctx.fillRect(x, y + h * 0.62, w, h * 0.38)
      // reflection streaks
      ctx.strokeStyle = 'rgba(170, 240, 255, 0.85)'
      ctx.lineWidth = 3
      for (let i = 0; i < 2; i++) {
        if (rand() < 0.35) continue
        const sx = x + rand() * w * 0.5
        const sy = y + 8 + rand() * h * 0.5
        ctx.beginPath()
        ctx.moveTo(sx, sy)
        ctx.lineTo(sx + 20 + rand() * w * 0.4, sy - 4)
        ctx.stroke()
      }
      const glare = ctx.createLinearGradient(x, y, x + w, y + h)
      glare.addColorStop(0, 'rgba(255,255,255,0)')
      glare.addColorStop(0.45, 'rgba(255,255,255,0.10)')
      glare.addColorStop(0.55, 'rgba(255,255,255,0)')
      ctx.fillStyle = glare
      ctx.fillRect(x, y, w, h)
    }
  }
  return c
}

export function paintAsphalt(seed = 21) {
  const size = 256
  const n = fbm(size, 16, 4, seed)
  const big = fbm(size, 3, 2, seed + 1)
  const c = cv(size)
  const ctx = c.getContext('2d')
  const img = ctx.createImageData(size, size)
  const rand = mulberry32(seed)
  for (let i = 0; i < size * size; i++) {
    const v = 58 + n[i] * 22 + big[i] * 14 + (rand() < 0.04 ? 25 : 0)
    img.data[i * 4] = v
    img.data[i * 4 + 1] = v + 2
    img.data[i * 4 + 2] = v + 8
    img.data[i * 4 + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  return c
}

export const paintSidewalk = () => paintPavement({ base: '#d3d6dc', alt: '#c2c6ce', joint: '#8f949d' }, 256, 4, 707)
export const paintHallFloor = () => paintPavement({ base: '#fbfcfe', alt: '#eef1f6', joint: '#c4cad4' }, 256, 4, 808)

export function paintCarpet() {
  const size = 128
  const n = fbm(size, 32, 2, 33)
  const c = cv(size)
  const ctx = c.getContext('2d')
  const img = ctx.createImageData(size, size)
  for (let i = 0; i < size * size; i++) {
    const v = n[i] * 14
    img.data[i * 4] = 44 + v
    img.data[i * 4 + 1] = 50 + v
    img.data[i * 4 + 2] = 66 + v
    img.data[i * 4 + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  return c
}

// Dark navy wall panels with lighter seams (inside the hall).
export function paintPanels() {
  const size = 256
  const c = cv(size)
  const ctx = c.getContext('2d')
  const rand = mulberry32(44)
  const n = 4
  const s = size / n
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const l = 30 + rand() * 6
      const g = ctx.createLinearGradient(0, y * s, 0, y * s + s)
      g.addColorStop(0, `hsl(222, 28%, ${l + 4}%)`)
      g.addColorStop(1, `hsl(222, 30%, ${l - 2}%)`)
      ctx.fillStyle = g
      ctx.fillRect(x * s, y * s, s, s)
    }
  }
  ctx.strokeStyle = '#141b2c'
  ctx.lineWidth = 4
  for (let i = 0; i <= n; i++) {
    ctx.beginPath()
    ctx.moveTo(i * s, 0)
    ctx.lineTo(i * s, size)
    ctx.moveTo(0, i * s)
    ctx.lineTo(size, i * s)
    ctx.stroke()
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.06)'
  ctx.lineWidth = 2
  for (let i = 0; i <= n; i++) {
    ctx.beginPath()
    ctx.moveTo(i * s + 3, 0)
    ctx.lineTo(i * s + 3, size)
    ctx.stroke()
  }
  return c
}

// Multi-storey car park face: concrete bands, dark openings, slim posts.
export function paintGarage() {
  const W = 512
  const H = 256
  const c = cv(W, H)
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#9aa3b4'
  ctx.fillRect(0, 0, W, H)
  const levels = 4
  const lh = H / levels
  for (let l = 0; l < levels; l++) {
    const y = l * lh
    ctx.fillStyle = '#b4bccb'
    ctx.fillRect(0, y, W, lh * 0.3)
    ctx.fillStyle = '#8890a3'
    ctx.fillRect(0, y + lh * 0.28, W, 3)
    const g = ctx.createLinearGradient(0, y + lh * 0.3, 0, y + lh)
    g.addColorStop(0, '#1b2440')
    g.addColorStop(1, '#2d3a63')
    ctx.fillStyle = g
    ctx.fillRect(0, y + lh * 0.32, W, lh * 0.62)
    for (let x = 0; x < W; x += 32) {
      ctx.fillStyle = '#7d869a'
      ctx.fillRect(x, y + lh * 0.32, 6, lh * 0.62)
    }
  }
  return c
}

// The departure board. `rows`: [time, city, flight, gate, status]; `blink` dims one row's status.
export function drawBoard(c, rows, { title = 'departures', highlight = -1, blinkOn = true } = {}) {
  const ctx = c.getContext('2d')
  const W = c.width
  const H = c.height
  ctx.fillStyle = '#0a0d14'
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = '#151b28'
  ctx.fillRect(0, 0, W, H * 0.16)
  ctx.fillStyle = '#ffffff'
  ctx.font = `600 ${H * 0.09}px ${FONT}`
  ctx.textBaseline = 'middle'
  ctx.fillText(title, W * 0.04, H * 0.085)
  const statusColor = { boarding: '#3dff7a', 'gate closing': '#ff4256', delayed: '#ffd23d', 'on time': '#ffffff', 'checked in': '#4fd6ff' }
  const rh = (H * 0.8) / rows.length
  ctx.font = `500 ${rh * 0.5}px ${FONT}`
  rows.forEach((r, i) => {
    const y = H * 0.18 + rh * (i + 0.5)
    if (i === highlight) {
      ctx.fillStyle = 'rgba(79, 214, 255, 0.16)'
      ctx.fillRect(0, y - rh / 2, W, rh)
    }
    ctx.fillStyle = '#ffffff'
    ctx.fillText(r[0], W * 0.04, y)
    ctx.fillText(r[1], W * 0.2, y)
    ctx.fillText(r[2], W * 0.52, y)
    ctx.fillText(String(r[3]), W * 0.68, y)
    if (r[4] !== 'gate closing' || blinkOn) {
      ctx.fillStyle = statusColor[r[4]] ?? '#ffffff'
      ctx.fillText(r[4], W * 0.76, y)
    }
  })
  return c
}
export const boardCanvas = () => cv(512, 256)

// Small screen above each desk: airline, desk number, "open".
export function paintDeskScreen(n, airline) {
  const c = cv(256, 96)
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#0b0f18'
  ctx.fillRect(0, 0, 256, 96)
  ctx.font = `italic 600 30px ${FONT}`
  ctx.fillStyle = '#4fb8ff'
  ctx.textBaseline = 'middle'
  ctx.fillText(airline, 14, 30)
  ctx.font = `500 22px ${FONT}`
  ctx.fillStyle = '#ffffff'
  ctx.fillText(`check-in ${n}`, 14, 68)
  ctx.fillStyle = '#3dff7a'
  ctx.font = `600 24px ${FONT}`
  ctx.fillText('open', 186, 30)
  return c
}

// Front panel of a check-in desk: dark slate with the airline name.
export function paintDeskFront(airline) {
  const c = cv(256, 64)
  const ctx = c.getContext('2d')
  const g = ctx.createLinearGradient(0, 0, 0, 64)
  g.addColorStop(0, '#3a4357')
  g.addColorStop(1, '#2a3142')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 256, 64)
  ctx.fillStyle = '#cfd8ea'
  ctx.font = `italic 600 28px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(airline, 128, 34)
  return c
}

// Big hanging sign: black rounded slab, white italic word.
export function paintSlabSign(text, { w = 512, h = 128, color = '#ffffff', bg = '#11141c' } = {}) {
  const c = cv(w, h)
  const ctx = c.getContext('2d')
  ctx.fillStyle = bg
  roundRect(ctx, 0, 0, w, h, h * 0.18)
  ctx.fill()
  ctx.fillStyle = color
  ctx.font = `italic 600 ${h * 0.5}px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, w / 2, h * 0.53)
  return c
}

// Road paint (white letters on transparent), slightly worn.
export function paintRoadText(lines) {
  const c = cv(256, 256)
  const ctx = c.getContext('2d')
  ctx.fillStyle = 'rgba(240,240,240,0.9)'
  ctx.font = `700 64px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  lines.forEach((l, i) => ctx.fillText(l, 128, 128 + (i - (lines.length - 1) / 2) * 72))
  const rand = mulberry32(5)
  ctx.globalCompositeOperation = 'destination-out'
  for (let i = 0; i < 500; i++) {
    ctx.fillStyle = `rgba(0,0,0,${rand() * 0.6})`
    ctx.fillRect(rand() * 256, rand() * 256, 2 + rand() * 4, 2 + rand() * 4)
  }
  return c
}

// Head texture for the crowd: white skin (tinted per instance), face centred at u = 0.5.
export function paintFace() {
  const c = cv(256, 128)
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, 256, 128)
  ctx.fillStyle = '#1b1b1b'
  ctx.beginPath()
  ctx.ellipse(116, 56, 5, 9, 0, 0, Math.PI * 2)
  ctx.ellipse(140, 56, 5, 9, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#1b1b1b'
  ctx.lineWidth = 4
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.arc(128, 70, 13, 0.2 * Math.PI, 0.8 * Math.PI)
  ctx.stroke()
  return c
}

export function paintTaxiSign() {
  const c = cv(256, 96)
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#f3e3b4'
  ctx.fillRect(0, 0, 256, 96)
  ctx.fillStyle = '#1a1a1a'
  ctx.font = `700 72px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('TAXI', 128, 52)
  return c
}

export function paintCheckers() {
  const c = cv(128, 16)
  const ctx = c.getContext('2d')
  for (let x = 0; x < 16; x++) for (let y = 0; y < 2; y++) {
    ctx.fillStyle = (x + y) % 2 ? '#111111' : '#f4f4f4'
    ctx.fillRect(x * 8, y * 8, 8, 8)
  }
  return c
}

export function paintLed(text, color = '#ffb020') {
  const c = cv(256, 48)
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#080808'
  ctx.fillRect(0, 0, 256, 48)
  ctx.fillStyle = color
  ctx.font = `700 30px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 128, 26)
  return c
}

// Airliner fuselage strip: white with a window row and a blue cheat line.
export function paintFuselage() {
  const c = cv(512, 128)
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#f7f9fc'
  ctx.fillRect(0, 0, 512, 128)
  ctx.fillStyle = '#1d5fd6'
  ctx.fillRect(0, 76, 512, 10)
  ctx.fillStyle = '#26324a'
  for (let x = 10; x < 500; x += 14) ctx.fillRect(x, 52, 7, 10)
  return c
}

// Speech bubble: white rounded rect + tail, dark text. Repaints in place.
export function drawBubble(c, text) {
  const ctx = c.getContext('2d')
  ctx.font = `500 30px ${FONT}`
  const w = Math.min(c.width - 8, ctx.measureText(text).width + 44)
  ctx.clearRect(0, 0, c.width, c.height)
  const x = (c.width - w) / 2
  ctx.fillStyle = 'rgba(245, 246, 250, 0.96)'
  roundRect(ctx, x, 4, w, 56, 18)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(c.width / 2 - 10, 58)
  ctx.lineTo(c.width / 2, 74)
  ctx.lineTo(c.width / 2 + 10, 58)
  ctx.fill()
  ctx.fillStyle = '#2a2f3a'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, c.width / 2, 33)
  return c
}
export const bubbleCanvas = () => cv(640, 80)

// Name tag: light grey text with a dark soft outline.
export function drawName(c, text) {
  const ctx = c.getContext('2d')
  ctx.clearRect(0, 0, c.width, c.height)
  ctx.font = `500 34px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineWidth = 6
  ctx.strokeStyle = 'rgba(30, 34, 48, 0.55)'
  ctx.strokeText(text, c.width / 2, c.height / 2)
  ctx.fillStyle = '#f2f4f8'
  ctx.fillText(text, c.width / 2, c.height / 2)
  return c
}
export const nameCanvas = () => cv(320, 48)

// Digital scale read-out.
export function drawScale(c, kg) {
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#071108'
  ctx.fillRect(0, 0, c.width, c.height)
  ctx.fillStyle = '#3dff7a'
  ctx.font = `600 ${c.height * 0.62}px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(`${kg.toFixed(1)} kg`, c.width / 2, c.height / 2 + 2)
  return c
}
export const scaleCanvas = () => cv(128, 48)

// Emoji sprite (rendered by the OS emoji font).
export function paintEmoji(e) {
  const c = cv(128)
  const ctx = c.getContext('2d')
  ctx.font = '96px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(e, 64, 70)
  return c
}
