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

function poly(ctx, pts, color) {
  ctx.fillStyle = color
  ctx.beginPath()
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
  ctx.closePath()
  ctx.fill()
}
// a mountain from the horizon, optionally snow-capped
function peak(ctx, x, w, h, color, snow = 0) {
  const b = H * 0.66
  poly(ctx, [[x - w / 2, b], [x, b - h], [x + w / 2, b]], color)
  if (snow) poly(ctx, [[x - (w / 2) * snow, b - h * (1 - snow)], [x, b - h], [x + (w / 2) * snow, b - h * (1 - snow)], [x + (w / 6) * snow, b - h * (1 - snow * 1.3)], [x - (w / 8) * snow, b - h * (1 - snow * 0.8)]], '#f4f7fb')
}
function palm(ctx, x, y, s) {
  ctx.strokeStyle = '#7a5a3a'
  ctx.lineWidth = 3 * s
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.quadraticCurveTo(x + 4 * s, y - 16 * s, x + 2 * s, y - 30 * s)
  ctx.stroke()
  ctx.strokeStyle = '#3a8a3a'
  ctx.lineWidth = 3.4 * s
  for (const a of [-2.7, -2.1, -1.4, -0.7, -0.2]) {
    ctx.beginPath()
    ctx.moveTo(x + 2 * s, y - 30 * s)
    ctx.quadraticCurveTo(x + 2 * s + Math.cos(a) * 10 * s, y - 34 * s + Math.sin(a) * 6 * s, x + 2 * s + Math.cos(a) * 16 * s, y - 26 * s + Math.sin(a) * 3 * s)
    ctx.stroke()
  }
}
// a dome (half ellipse) sitting on y
function dome(ctx, cx, y, r, h, color) {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.ellipse(cx, y, r, h, 0, Math.PI, 0)
  ctx.fill()
}
function onion(ctx, cx, y, r, h, color) {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(cx - r * 0.8, y)
  ctx.bezierCurveTo(cx - r * 1.3, y - h * 0.5, cx - r * 0.3, y - h * 0.7, cx, y - h)
  ctx.bezierCurveTo(cx + r * 0.3, y - h * 0.7, cx + r * 1.3, y - h * 0.5, cx + r * 0.8, y)
  ctx.closePath()
  ctx.fill()
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
  rio(ctx) {
    sky(ctx, '#2f9cff', '#d4f0ff')
    ctx.fillStyle = '#2b8fd6'
    ctx.fillRect(0, H * 0.6, W, H)
    poly(ctx, [[20, H * 0.66], [90, H * 0.2], [150, H * 0.66]], '#3f8a3a')
    ctx.fillStyle = '#f2efe6'
    ctx.fillRect(88, H * 0.06, 4, 18)
    ctx.fillRect(80, H * 0.06 + 4, 20, 3)
    ctx.beginPath()
    ctx.arc(90, H * 0.06 - 2, 2.4, 0, 7)
    ctx.fill()
    ctx.fillStyle = '#5a7a4a'
    ctx.beginPath()
    ctx.ellipse(196, H * 0.66, 22, 52, 0, Math.PI, 0)
    ctx.fill()
    ctx.fillStyle = '#f2e2b0'
    ctx.fillRect(0, H * 0.74, W, H)
    ctx.strokeStyle = '#23252b'
    ctx.lineWidth = 3
    ctx.beginPath()
    for (let x = 0; x <= W; x += 4) ctx.lineTo(x, H * 0.86 + Math.sin(x / 12) * 4)
    ctx.stroke()
    palm(ctx, 22, H * 0.96, 1.1)
    palm(ctx, 214, H * 0.98, 1.2)
  },
  amsterdam(ctx) {
    sky(ctx)
    ground(ctx, '#7fcf5a')
    // canal houses with gables
    const cols = ['#6a3a2a', '#3a2e2a', '#8a4a32', '#2e3a3a', '#7a5a3a']
    for (let i = 0; i < 9; i++) {
      const x = i * 27
      const h = 42 + ((i * 17) % 18)
      poly(ctx, [[x, H * 0.66], [x, H * 0.66 - h], [x + 12, H * 0.66 - h - 12], [x + 25, H * 0.66 - h], [x + 25, H * 0.66]], cols[i % cols.length])
      ctx.fillStyle = '#f4f1ea'
      for (let y = H * 0.66 - h + 6; y < H * 0.66 - 8; y += 11) for (const wx of [x + 5, x + 15]) ctx.fillRect(wx, y, 5, 7)
    }
    ctx.fillStyle = '#3a7ab8'
    ctx.fillRect(0, H * 0.66, W, H * 0.12)
    // windmill
    ctx.fillStyle = '#3a4a3a'
    poly(ctx, [[176, H * 0.66], [184, H * 0.3], [196, H * 0.3], [204, H * 0.66]], '#3a4a3a')
    ctx.strokeStyle = '#f4ead4'
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(166, H * 0.12)
    ctx.lineTo(214, H * 0.44)
    ctx.moveTo(214, H * 0.12)
    ctx.lineTo(166, H * 0.44)
    ctx.stroke()
    ctx.fillStyle = '#5a7a3a'
    ctx.fillRect(0, H * 0.78, W, H)
    for (const [x, c] of [[50, '#ff4a6a'], [70, '#ffd23b'], [90, '#ff8a2a'], [130, '#ff4a6a'], [150, '#d6a0ff'], [170, '#ffd23b']]) {
      ctx.fillStyle = c
      for (let k = 0; k < 4; k++) ctx.fillRect(x + (k % 2) * 8, H * 0.8 + k * 8, 6, 6)
    }
  },
  bangkok(ctx) {
    sky(ctx, '#3b9cff', '#ffe6c8')
    ground(ctx, '#8ac868')
    for (const [x, s] of [[120, 1], [70, 0.55], [170, 0.55]]) {
      for (let k = 0; k < 6; k++) {
        const w = (40 - k * 6) * s
        const y = H * 0.66 - k * 13 * s
        poly(ctx, [[x - w / 2, y], [x - w / 2 + 3 * s, y - 13 * s], [x + w / 2 - 3 * s, y - 13 * s], [x + w / 2, y]], k % 2 ? '#ece5d4' : '#d8cdb4')
      }
      poly(ctx, [[x - 4 * s, H * 0.66 - 78 * s], [x, H * 0.66 - 104 * s], [x + 4 * s, H * 0.66 - 78 * s]], '#e8b83a')
    }
    road(ctx)
    palm(ctx, 20, H * 0.95, 1)
    car(ctx, 80, H * 0.9, 1, '#ff5fa2')
    car(ctx, 168, H * 0.86, 0.85, '#ff5fa2')
  },
  reykjavik(ctx) {
    sky(ctx, '#5aa0e0', '#e6f2ff')
    peak(ctx, 40, 140, 70, '#5a6470', 0.45)
    peak(ctx, 200, 160, 80, '#606a76', 0.45)
    ctx.fillStyle = '#f2f5f9'
    ctx.fillRect(0, H * 0.66, W, H)
    ctx.fillStyle = '#c9ccd0'
    ctx.fillRect(112, H * 0.08, 16, H * 0.58)
    for (let i = 1; i <= 5; i++) {
      const h = H * 0.58 - i * 14
      ctx.fillRect(112 - i * 8, H * 0.66 - h, 8, h)
      ctx.fillRect(128 + (i - 1) * 8, H * 0.66 - h, 8, h)
    }
    poly(ctx, [[110, H * 0.08], [120, H * 0.0], [130, H * 0.08]], '#c9ccd0')
    for (const [x, c] of [[8, '#d6232e'], [34, '#f2c230'], [186, '#2a8ad6'], [212, '#3aaa6a']]) {
      ctx.fillStyle = c
      ctx.fillRect(x, H * 0.68, 22, 22)
      poly(ctx, [[x - 2, H * 0.68], [x + 11, H * 0.6], [x + 24, H * 0.68]], '#f4f7fb')
    }
    road(ctx)
    car(ctx, 90, H * 0.9, 1, '#f2f2f2')
  },
  'san francisco'(ctx) {
    sky(ctx, '#4aa4ec', '#eaf4ff')
    ctx.fillStyle = '#2f7fc4'
    ctx.fillRect(0, H * 0.56, W, H)
    poly(ctx, [[150, H * 0.56], [210, H * 0.36], [W, H * 0.4], [W, H * 0.56]], '#9a8a5a')
    const RED = '#c8402a'
    ctx.fillStyle = RED
    for (const x of [60, 170]) {
      ctx.fillRect(x - 5, H * 0.1, 4, H * 0.46)
      ctx.fillRect(x + 1, H * 0.1, 4, H * 0.46)
      for (const y of [0.14, 0.26, 0.38]) ctx.fillRect(x - 6, H * y, 12, 3)
    }
    ctx.fillRect(0, H * 0.46, W, 5)
    ctx.strokeStyle = RED
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(0, H * 0.3)
    ctx.quadraticCurveTo(30, H * 0.36, 60, H * 0.1)
    ctx.quadraticCurveTo(115, H * 0.62, 170, H * 0.1)
    ctx.quadraticCurveTo(205, H * 0.36, W, H * 0.3)
    ctx.stroke()
    // a steep street with a cable car
    poly(ctx, [[0, H], [0, H * 0.78], [W, H * 0.66], [W, H]], '#c9c2b4')
    ctx.fillStyle = '#c8402a'
    ctx.fillRect(110, H * 0.66, 40, 18)
    ctx.fillStyle = '#f4e2a8'
    ctx.fillRect(112, H * 0.66 + 3, 36, 6)
    ctx.fillStyle = '#1b2233'
    ctx.fillRect(108, H * 0.66 - 3, 44, 4)
  },
  marrakech(ctx) {
    sky(ctx, '#3b9cff', '#ffe7c4')
    peak(ctx, 50, 160, 60, '#a07656', 0.35)
    peak(ctx, 190, 180, 70, '#9a7050', 0.35)
    ground(ctx, '#d89a70')
    ctx.fillStyle = '#c98a5a'
    ctx.fillRect(108, H * 0.14, 24, H * 0.52)
    ctx.fillRect(113, H * 0.06, 14, H * 0.1)
    ctx.fillStyle = '#2a8a6a'
    ctx.fillRect(106, H * 0.14, 28, 4)
    dome(ctx, 120, H * 0.06, 7, 6, '#2a8a6a')
    ctx.fillStyle = '#e0b040'
    for (const [y, r] of [[H * 0.0 + 6, 2.4], [H * 0.0 + 1, 1.8]]) {
      ctx.beginPath()
      ctx.arc(120, y, r, 0, 7)
      ctx.fill()
    }
    ctx.fillStyle = '#2e2018'
    ctx.fillRect(116, H * 0.3, 8, 14)
    road(ctx)
    palm(ctx, 30, H * 0.95, 1.1)
    palm(ctx, 206, H * 0.96, 1.1)
    car(ctx, 150, H * 0.88, 0.9, '#e8d8a8')
  },
  seoul(ctx) {
    sky(ctx, '#5aa8f0', '#ffe8f0')
    ctx.fillStyle = '#4a7a3a'
    ctx.beginPath()
    ctx.ellipse(120, H * 0.66, 90, 40, 0, Math.PI, 0)
    ctx.fill()
    ctx.fillStyle = '#f2f2f2'
    ctx.fillRect(117, H * 0.18, 6, H * 0.28)
    ctx.beginPath()
    ctx.ellipse(120, H * 0.2, 11, 5, 0, 0, 7)
    ctx.fill()
    ctx.fillStyle = '#d6232e'
    ctx.fillRect(118.5, H * 0.04, 3, H * 0.12)
    buildings(ctx, ['#a8b0bc', '#c4cad2'], H * 0.74)
    road(ctx)
    for (const x of [24, 216]) tree(ctx, x, H * 0.86, 1.3, '#f2a6c4')
    car(ctx, 90, H * 0.9, 1, '#f28a2a')
  },
  'mexico city'(ctx) {
    sky(ctx, '#3b9cff', '#d8f0ff')
    peak(ctx, 50, 150, 64, '#6a6a70', 0.3)
    peak(ctx, 200, 150, 54, '#706e74', 0.3)
    ground(ctx, '#8ac868')
    ctx.fillStyle = '#e2dccd'
    ctx.fillRect(116, H * 0.2, 8, H * 0.42)
    ctx.fillRect(108, H * 0.58, 24, H * 0.08)
    ctx.fillStyle = '#e0b040'
    ctx.fillRect(117, H * 0.12, 6, 12)
    poly(ctx, [[117, H * 0.14], [106, H * 0.08], [114, H * 0.18]], '#e0b040')
    poly(ctx, [[123, H * 0.14], [134, H * 0.08], [126, H * 0.18]], '#e0b040')
    road(ctx)
    for (const x of [28, 212]) tree(ctx, x, H * 0.86, 1.3, '#9a7ad6')
    car(ctx, 80, H * 0.9, 1, '#f06a9a')
  },
  'cape town'(ctx) {
    sky(ctx, '#3b9cff', '#e0f4ff')
    poly(ctx, [[0, H * 0.66], [30, H * 0.3], [60, H * 0.22], [190, H * 0.22], [215, H * 0.36], [W, H * 0.66]], '#857e6c')
    ctx.fillStyle = '#ffffff'
    for (let x = 64; x < 190; x += 18) {
      ctx.beginPath()
      ctx.arc(x, H * 0.22, 9, Math.PI, 0)
      ctx.fill()
    }
    poly(ctx, [[0, H * 0.66], [20, H * 0.48], [W - 20, H * 0.5], [W, H * 0.66]], '#5a7a3a')
    const cols = ['#4ab0e8', '#f2d03a', '#f28ab0', '#7ac45a', '#f48a3a', '#b48ae8']
    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = cols[i % cols.length]
      ctx.fillRect(i * 24, H * 0.66, 22, 22)
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(i * 24 + 8, H * 0.66 + 8, 6, 9)
    }
    road(ctx)
    car(ctx, 160, H * 0.9, 1, '#f2f2f2')
  },
  istanbul(ctx) {
    sky(ctx, '#3b9cff', '#ffe8d8')
    ctx.fillStyle = '#2b7fc4'
    ctx.fillRect(0, H * 0.6, W, H)
    const ST = '#ddd6c6'
    ctx.fillStyle = ST
    ctx.fillRect(70, H * 0.42, 100, H * 0.2)
    dome(ctx, 120, H * 0.42, 34, 26, '#8a96a4')
    dome(ctx, 86, H * 0.44, 14, 10, '#8a96a4')
    dome(ctx, 154, H * 0.44, 14, 10, '#8a96a4')
    for (const x of [56, 74, 166, 184]) {
      ctx.fillStyle = ST
      ctx.fillRect(x - 2, H * 0.14, 4, H * 0.48)
      poly(ctx, [[x - 3, H * 0.14], [x, H * 0.04], [x + 3, H * 0.14]], '#8a96a4')
      ctx.fillRect(x - 3.5, H * 0.3, 7, 2)
    }
    ctx.fillStyle = '#d8c8a8'
    ctx.fillRect(0, H * 0.74, W, H)
    car(ctx, 70, H * 0.92, 1, '#ffcc12')
    tree(ctx, 210, H * 0.9, 1.2)
  },
  athens(ctx) {
    sky(ctx, '#2f8cff', '#e0f2ff')
    poly(ctx, [[10, H * 0.66], [40, H * 0.42], [200, H * 0.4], [230, H * 0.66]], '#a8987a')
    const MAR = '#efe8d8'
    ctx.fillStyle = MAR
    ctx.fillRect(60, H * 0.38, 120, 4)
    for (let i = 0; i < 9; i++) ctx.fillRect(64 + i * 14, H * 0.2, 6, H * 0.18)
    ctx.fillRect(58, H * 0.17, 124, 6)
    poly(ctx, [[58, H * 0.17], [120, H * 0.06], [182, H * 0.17]], MAR)
    ground(ctx, '#e8e2d2')
    for (let i = 0; i < 9; i++) {
      ctx.fillStyle = '#f6f4ee'
      ctx.fillRect(i * 27, H * 0.7, 24, 20)
      ctx.fillStyle = '#2a6ad6'
      ctx.fillRect(i * 27 + 4, H * 0.72, 5, 8)
      ctx.fillRect(i * 27 + 14, H * 0.72, 5, 8)
    }
    road(ctx)
    car(ctx, 160, H * 0.9, 1, '#ffcc12')
  },
  singapore(ctx) {
    sky(ctx, '#ff9a6a', '#ffe0b0')
    ctx.fillStyle = '#2b6fb4'
    ctx.fillRect(0, H * 0.6, W, H)
    ctx.fillStyle = '#e6eef6'
    for (const x of [80, 108, 136]) ctx.fillRect(x, H * 0.22, 16, H * 0.38)
    ctx.fillStyle = '#eef2f6'
    ctx.beginPath()
    ctx.moveTo(70, H * 0.2)
    ctx.lineTo(176, H * 0.2)
    ctx.quadraticCurveTo(170, H * 0.24, 160, H * 0.24)
    ctx.lineTo(70, H * 0.24)
    ctx.fill()
    ctx.strokeStyle = '#eef2f6'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(205, H * 0.36, 26, 0, 7)
    ctx.stroke()
    for (let k = 0; k < 8; k++) {
      ctx.beginPath()
      ctx.moveTo(205, H * 0.36)
      ctx.lineTo(205 + Math.cos(k * 0.785) * 26, H * 0.36 + Math.sin(k * 0.785) * 26)
      ctx.stroke()
    }
    for (const [x, h] of [[24, 40], [44, 52], [62, 36]]) {
      poly(ctx, [[x - 2, H * 0.6], [x - 9, H * 0.6 - h], [x + 9, H * 0.6 - h], [x + 2, H * 0.6]], '#8a3a9a')
      ctx.fillStyle = '#ff6ad8'
      ctx.fillRect(x - 10, H * 0.6 - h - 2, 20, 3)
    }
    ctx.fillStyle = '#d6d0c8'
    ctx.fillRect(0, H * 0.78, W, H)
    palm(ctx, 120, H * 0.98, 1)
  },
  agra(ctx) {
    sky(ctx, '#4aa4ec', '#ffeedd')
    ground(ctx, '#7fcf5a')
    const MAR = '#f6f2ea'
    ctx.fillStyle = MAR
    ctx.fillRect(70, H * 0.58, 100, H * 0.08)
    ctx.fillRect(90, H * 0.34, 60, H * 0.24)
    onion(ctx, 120, H * 0.34, 18, 42, MAR)
    for (const x of [96, 144]) onion(ctx, x, H * 0.34, 6, 14, MAR)
    for (const x of [74, 166]) {
      ctx.fillStyle = MAR
      ctx.fillRect(x - 2.5, H * 0.24, 5, H * 0.34)
      onion(ctx, x, H * 0.24, 4, 9, MAR)
    }
    ctx.fillStyle = '#b8b0a4'
    ctx.beginPath()
    ctx.moveTo(112, H * 0.58)
    ctx.lineTo(112, H * 0.44)
    ctx.quadraticCurveTo(120, H * 0.36, 128, H * 0.44)
    ctx.lineTo(128, H * 0.58)
    ctx.fill()
    ctx.fillStyle = '#e0b040'
    ctx.fillRect(119, H * 0.06, 2, 10)
    ctx.fillStyle = '#5ab0e8'
    poly(ctx, [[112, H * 0.68], [128, H * 0.68], [160, H], [80, H]], '#5ab0e8')
    for (const x of [60, 84, 156, 180]) poly(ctx, [[x - 5, H * 0.92], [x, H * 0.66], [x + 5, H * 0.92]], '#2f4f2a')
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
