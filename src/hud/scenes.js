// Little painted postcards for the "Where to?" picker: sky, clouds, a road
// running into the distance with cars, trees, and the city's landmark. Drawn
// once per city on a canvas, cached as a data URL.
const cache = {}
const W = 240
const H = 180

function sky(ctx, top = '#2f8cff', bottom = '#bfe6ff') {
  const g = ctx.createLinearGradient(0, 0, 0, H * 0.7)
  g.addColorStop(0, top)
  g.addColorStop(1, bottom)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = '#ffffff'
  for (const [x, y, s] of [[40, 30, 1], [180, 22, 1.3], [120, 46, 0.8]]) {
    ctx.beginPath()
    ctx.arc(x, y, 12 * s, 0, 7)
    ctx.arc(x + 14 * s, y - 6 * s, 14 * s, 0, 7)
    ctx.arc(x + 30 * s, y, 11 * s, 0, 7)
    ctx.fill()
  }
}
function ground(ctx, color = '#7fcf5a') {
  ctx.fillStyle = color
  ctx.fillRect(0, H * 0.66, W, H)
}
function road(ctx) {
  ctx.fillStyle = '#5b5f68'
  ctx.beginPath()
  ctx.moveTo(W * 0.46, H * 0.66)
  ctx.lineTo(W * 0.54, H * 0.66)
  ctx.lineTo(W * 0.92, H)
  ctx.lineTo(W * 0.08, H)
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  for (let i = 0; i < 5; i++) {
    const t = i / 5
    const y = H * 0.68 + t * t * H * 0.34
    ctx.fillRect(W / 2 - 1 - t * 2, y, 2 + t * 4, 4 + t * 8)
  }
  ctx.fillStyle = '#c9ccd2'
  ctx.beginPath()
  ctx.moveTo(W * 0.44, H * 0.66)
  ctx.lineTo(W * 0.46, H * 0.66)
  ctx.lineTo(W * 0.08, H)
  ctx.lineTo(0, H)
  ctx.lineTo(0, H * 0.96)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(W * 0.54, H * 0.66)
  ctx.lineTo(W * 0.56, H * 0.66)
  ctx.lineTo(W, H * 0.96)
  ctx.lineTo(W, H)
  ctx.lineTo(W * 0.92, H)
  ctx.fill()
}
function car(ctx, x, y, s, color) {
  ctx.fillStyle = color
  ctx.fillRect(x - 12 * s, y - 8 * s, 24 * s, 9 * s)
  ctx.fillRect(x - 8 * s, y - 14 * s, 16 * s, 7 * s)
  ctx.fillStyle = '#1b2233'
  ctx.fillRect(x - 6 * s, y - 13 * s, 12 * s, 5 * s)
  ctx.fillRect(x - 11 * s, y, 5 * s, 3 * s)
  ctx.fillRect(x + 6 * s, y, 5 * s, 3 * s)
}
function tree(ctx, x, y, s, leaf = '#3f9a3c') {
  ctx.fillStyle = '#6b4a2f'
  ctx.fillRect(x - 2 * s, y - 14 * s, 4 * s, 14 * s)
  ctx.fillStyle = leaf
  ctx.beginPath()
  ctx.arc(x, y - 20 * s, 10 * s, 0, 7)
  ctx.arc(x - 7 * s, y - 15 * s, 7 * s, 0, 7)
  ctx.arc(x + 7 * s, y - 15 * s, 7 * s, 0, 7)
  ctx.fill()
}
function buildings(ctx, colors, base = H * 0.66) {
  let x = 0
  let i = 0
  while (x < W) {
    const w = 22 + ((i * 37) % 18)
    const h = 30 + ((i * 53) % 40)
    ctx.fillStyle = colors[i % colors.length]
    ctx.fillRect(x, base - h, w, h)
    ctx.fillStyle = 'rgba(255,255,255,0.35)'
    for (let wy = base - h + 5; wy < base - 6; wy += 8) for (let wx = x + 4; wx < x + w - 4; wx += 6) ctx.fillRect(wx, wy, 3, 4)
    x += w + 2
    i++
  }
}
function lattice(ctx, cx, baseY, height, width, color) {
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(cx - width / 2, baseY)
  ctx.quadraticCurveTo(cx - width * 0.12, baseY - height * 0.5, cx - 2, baseY - height)
  ctx.lineTo(cx + 2, baseY - height)
  ctx.quadraticCurveTo(cx + width * 0.12, baseY - height * 0.5, cx + width / 2, baseY)
  ctx.lineTo(cx + width * 0.3, baseY)
  ctx.quadraticCurveTo(cx, baseY - height * 0.22, cx - width * 0.3, baseY)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'
  for (let k = 1; k < 8; k++) {
    const y = baseY - (height * k) / 8
    const half = (width / 2) * Math.pow(1 - k / 8, 1.6)
    ctx.beginPath()
    ctx.moveTo(cx - half, y)
    ctx.lineTo(cx + half, y)
    ctx.stroke()
  }
}

const PAINT = {
  paris(ctx) {
    sky(ctx)
    ground(ctx)
    lattice(ctx, W / 2, H * 0.66, H * 0.6, 64, '#8a5a3a')
    road(ctx)
    tree(ctx, 30, H * 0.8, 1.2)
    tree(ctx, 210, H * 0.8, 1.2)
    car(ctx, 80, H * 0.9, 1, '#2a62d8')
    car(ctx, 170, H * 0.86, 0.8, '#f2f4f7')
  },
  london(ctx) {
    sky(ctx)
    ground(ctx)
    buildings(ctx, ['#b9a07a', '#a88d66'])
    ctx.fillStyle = '#c9a66b'
    ctx.fillRect(W / 2 - 12, H * 0.12, 24, H * 0.54)
    ctx.fillStyle = '#8a6a3a'
    ctx.beginPath()
    ctx.moveTo(W / 2 - 12, H * 0.12)
    ctx.lineTo(W / 2, H * 0.02)
    ctx.lineTo(W / 2 + 12, H * 0.12)
    ctx.fill()
    ctx.fillStyle = '#f7f1dc'
    ctx.beginPath()
    ctx.arc(W / 2, H * 0.22, 8, 0, 7)
    ctx.fill()
    ctx.strokeStyle = '#1b2233'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(W / 2, H * 0.22)
    ctx.lineTo(W / 2, H * 0.18)
    ctx.moveTo(W / 2, H * 0.22)
    ctx.lineTo(W / 2 + 4, H * 0.22)
    ctx.stroke()
    road(ctx)
    ctx.fillStyle = '#d6232e'
    ctx.fillRect(28, H * 0.74, 34, 22)
    ctx.fillStyle = '#1b2233'
    ctx.fillRect(31, H * 0.76, 28, 6)
    tree(ctx, 210, H * 0.82, 1.1)
    car(ctx, 160, H * 0.9, 1, '#1d1f24')
  },
  'new york'(ctx) {
    sky(ctx)
    ground(ctx, '#9aa0a8')
    buildings(ctx, ['#a0573c', '#8a4a33', '#b7b9c0'])
    ctx.fillStyle = '#cfd3da'
    ctx.fillRect(W / 2 - 10, H * 0.14, 20, H * 0.52)
    ctx.fillRect(W / 2 - 16, H * 0.3, 32, H * 0.36)
    ctx.fillRect(W / 2 - 2, H * 0.03, 4, H * 0.12)
    road(ctx)
    ctx.fillStyle = '#ffd23d'
    ctx.fillRect(W / 2 - 1, H * 0.7, 2, H * 0.3)
    car(ctx, 70, H * 0.9, 1.1, '#f6b800')
    car(ctx, 175, H * 0.88, 1, '#f6b800')
    car(ctx, 128, H * 0.76, 0.6, '#f6b800')
  },
  tokyo(ctx) {
    sky(ctx)
    ground(ctx)
    buildings(ctx, ['#7d8fb3', '#9aa7c4', '#5e6f96'])
    lattice(ctx, W / 2, H * 0.66, H * 0.56, 46, '#e8432f')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(W / 2 - 8, H * 0.32, 16, 5)
    ctx.fillRect(W / 2 - 12, H * 0.5, 24, 5)
    road(ctx)
    for (const x of [26, 214]) tree(ctx, x, H * 0.84, 1.3, '#ff9fc4')
    car(ctx, 90, H * 0.9, 1, '#f2f4f7')
    car(ctx, 160, H * 0.86, 0.9, '#3fae6b')
  },
  cairo(ctx) {
    sky(ctx, '#3b9cff', '#ffe7b0')
    ground(ctx, '#e8c27a')
    ctx.fillStyle = '#d9a95a'
    for (const [x, s] of [[70, 1], [150, 1.4], [205, 0.8]]) {
      ctx.beginPath()
      ctx.moveTo(x - 40 * s, H * 0.66)
      ctx.lineTo(x, H * 0.66 - 50 * s)
      ctx.lineTo(x + 40 * s, H * 0.66)
      ctx.fill()
      ctx.fillStyle = '#c4904a'
      ctx.beginPath()
      ctx.moveTo(x, H * 0.66 - 50 * s)
      ctx.lineTo(x + 40 * s, H * 0.66)
      ctx.lineTo(x + 10 * s, H * 0.66)
      ctx.fill()
      ctx.fillStyle = '#d9a95a'
    }
    road(ctx)
    tree(ctx, 24, H * 0.84, 1.2, '#4c9a3a')
    car(ctx, 160, H * 0.9, 1, '#f2f4f7')
  },
  dubai(ctx) {
    sky(ctx, '#3b9cff', '#fff0cf')
    ground(ctx, '#e6cf9a')
    buildings(ctx, ['#9fb6cf', '#c7d4e2'])
    ctx.fillStyle = '#d7e3f0'
    ctx.beginPath()
    ctx.moveTo(W / 2 - 14, H * 0.66)
    ctx.lineTo(W / 2 - 2, H * 0.02)
    ctx.lineTo(W / 2 + 2, H * 0.02)
    ctx.lineTo(W / 2 + 14, H * 0.66)
    ctx.fill()
    road(ctx)
    car(ctx, 80, H * 0.9, 1, '#1d1f24')
  },
  sydney(ctx) {
    sky(ctx)
    ctx.fillStyle = '#2b8fd6'
    ctx.fillRect(0, H * 0.6, W, H)
    ctx.fillStyle = '#f4f4f0'
    for (const [x, s] of [[90, 1], [125, 1.3], [160, 1]]) {
      ctx.beginPath()
      ctx.moveTo(x - 20 * s, H * 0.62)
      ctx.quadraticCurveTo(x - 4 * s, H * 0.62 - 50 * s, x + 18 * s, H * 0.62 - 44 * s)
      ctx.lineTo(x + 4 * s, H * 0.62)
      ctx.fill()
    }
    ctx.fillStyle = '#c9b38f'
    ctx.fillRect(50, H * 0.62, 140, 8)
    ctx.fillStyle = '#ffffff'
    for (let i = 0; i < 6; i++) ctx.fillRect(10 + i * 40, H * 0.85 + (i % 2) * 8, 18, 2)
  },
  rome(ctx) {
    sky(ctx)
    ground(ctx)
    ctx.fillStyle = '#c99b6a'
    ctx.fillRect(40, H * 0.3, 160, H * 0.36)
    ctx.fillStyle = '#8a5f3a'
    for (let r = 0; r < 3; r++) for (let i = 0; i < 9; i++) {
      ctx.beginPath()
      ctx.ellipse(52 + i * 17, H * 0.38 + r * 20, 5, 7, 0, 0, 7)
      ctx.fill()
    }
    road(ctx)
    car(ctx, 70, H * 0.9, 1, '#d8333b')
    tree(ctx, 214, H * 0.84, 1.2)
  },
}

export function postcard(city) {
  if (cache[city]) return cache[city]
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d')
  ;(PAINT[city] ?? PAINT.paris)(ctx)
  cache[city] = c.toDataURL('image/png')
  return cache[city]
}
