// The arrival street at your destination (built at FLIGHT.city, rebuilt for each trip): a paved plaza in
// front of a small terminal ("departures · fly again"), bollards and a zebra crossing, then a long
// street of 4-7 storey buildings with framed shopfronts, signs, striped awnings, window sills + lintels,
// cornices with corbels, parapets and rooftop clutter (AC units, vents, stair houses), trees, lamps,
// hydrants, bins and traffic. The look comes from CITIES[code]: brick walk-ups with fire escapes and
// water towers in New York, terraces with chimneys + a red phone box and double-decker in London,
// limestone with iron balconies and mansard roofs in Paris, neon signs, lanterns and vending machines in
// Tokyo, sandstone arches, roof terraces and palms in Cairo, each with its landmark on the skyline.
// The other cities mix those flags with hipped tile roofs, front gables, snow, spruces, shutters,
// corrugated cladding, parked bikes and wave-mosaic paving; their landmarks (Colosseum, Opera House,
// tower in the desert, statue on the peak, windmills, temple prangs, basalt-column church, suspension
// bridge, minaret, hill tower, victory column, Table Mountain, domed mosque, Parthenon, sky-park
// towers + big wheel, Taj Mahal) are procedural, set behind the street's end with mountains or hills.
//
// Draw calls: almost every static part shares one vertex-coloured material (plus a metal one) and is
// baked; facades share one material per wall colour (window repeats live in the UVs); every shop sign
// sits in one atlas, every Tokyo neon sign in another. clear() disposes all of it.
import {
  BoxGeometry,
  BufferAttribute,
  CanvasTexture,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  RepeatWrapping,
  Shape,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
} from 'three'
import { CITIES, FLIGHT } from '../config.js'
import { bake } from '../bake.js'
import { neon } from '../propkit.js'
import { RAPIER, addFixed, world } from '../physics.js'
import { mulberry32 } from '../textures.js'
import { lathe, pole, rbox } from '../detail.js'
import { makeCar } from './vehicles.js'

const FONT = 'Fredoka, "Arial Rounded MT Bold", Arial, sans-serif'
const BAY = 3.2 // m per window bay
const FLOOR = 3.3 // m per storey
const ROAD = 7 // half-width of the street
const WALK = 12 // sidewalk outer edge (building line)
const NEON_COLS = ['#ff3b8a', '#3be0ff', '#ffd23b', '#7cff6a', '#ff7a3b']
const SIGN_BGS = ['#11141c', '#1d3557', '#5c1d24', '#1d4a2e', '#3a2a1a', '#2a1d4a', '#0f3b44', '#4a1d3a']

function cv(w, h = w) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}
const texOf = (c, rx = 1, ry = 1) => {
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.wrapS = t.wrapT = RepeatWrapping
  t.repeat.set(rx, ry)
  t.anisotropy = 8
  return t
}
// canvas colour: scale a #hex
const shade = (hex, k) => {
  const n = parseInt(hex.slice(1), 16)
  const f = (v) => Math.max(0, Math.min(255, Math.round(v * k)))
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`
}
// vertex colour: scale any CSS colour, back to #hex
const _c = new Color()
const dk = (col, k) => `#${_c.set(col).multiplyScalar(k).getHexString()}`
function tint(g, col) {
  if (g.attributes.color) g = g.clone()
  _c.set(col)
  const n = g.attributes.position.count
  const a = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    a[i * 3] = _c.r
    a[i * 3 + 1] = _c.g
    a[i * 3 + 2] = _c.b
  }
  g.setAttribute('color', new BufferAttribute(a, 3))
  return g
}
function mesh(parent, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new Mesh(geo, mat)
  m.position.set(x, y, z)
  m.rotation.set(rx, ry, rz)
  parent.add(m)
  return m
}
// UVs from the geometry's own XZ positions (paving) or a box's faces (k = tiles per metre).
function planarUV(g, k) {
  const p = g.attributes.position
  const uv = g.attributes.uv
  for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) * k, p.getZ(i) * k)
  return g
}
function cubeUV(g, k) {
  const p = g.attributes.position
  const n = g.attributes.normal
  const uv = g.attributes.uv
  for (let i = 0; i < uv.count; i++) {
    const ax = Math.abs(n.getX(i))
    const az = Math.abs(n.getZ(i))
    if (ax > 0.5) uv.setXY(i, p.getZ(i) * k, p.getY(i) * k)
    else if (az > 0.5) uv.setXY(i, p.getX(i) * k, p.getY(i) * k)
    else uv.setXY(i, p.getX(i) * k, p.getZ(i) * k)
  }
  return g
}
// A triangular prism (pitched roof): w wide, h high, len long along Z, base on y = 0.
function prism(w, h, len) {
  const s = new Shape()
  s.moveTo(-w / 2, 0)
  s.lineTo(w / 2, 0)
  s.lineTo(0, h)
  s.closePath()
  return new ExtrudeGeometry(s, { depth: len, bevelEnabled: false }).translate(0, 0, -len / 2)
}
function scaleUV(g, su, sv) {
  const uv = g.attributes.uv
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv)
  return g
}
function cropUV(g, u0, v0, u1, v1) {
  const uv = g.attributes.uv
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0))
  return g
}

// --- Canvas painters --------------------------------------------------------------------------------
// One window bay x one storey of facade, styled: brick, rusticated stone or tiles, a framed window with
// a deep reveal, glazing bars per city and curtains / blinds / shutters behind the glass.
function paintBay(style, wall, seed) {
  const W = 256
  const H = 264
  const c = cv(W, H)
  const ctx = c.getContext('2d')
  const rand = mulberry32(seed)
  ctx.fillStyle = wall
  ctx.fillRect(0, 0, W, H)
  const n = parseInt(wall.slice(1), 16)
  const lum = (((n >> 16) & 255) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11) / 255
  const brick = style.fireEscapes || (style.railings && lum < 0.6)
  if (brick) {
    ctx.fillStyle = shade(wall, 0.72)
    ctx.fillRect(0, 0, W, H)
    for (let y = 0; y < H; y += 12) {
      const off = (y / 12) % 2 ? 0 : 16
      for (let x = -32; x < W; x += 32) {
        ctx.fillStyle = shade(wall, 0.86 + rand() * 0.24)
        ctx.fillRect(x + off + 1, y + 1, 30, 10)
        ctx.fillStyle = 'rgba(255,255,255,0.07)'
        ctx.fillRect(x + off + 1, y + 1, 30, 2)
      }
    }
  } else if (style.balconies || style.arches || style.railings) {
    for (let y = 0; y < H; y += 44) {
      for (let x = (y / 44) % 2 ? -40 : 0; x < W; x += 80) {
        ctx.fillStyle = shade(wall, 0.95 + rand() * 0.08)
        ctx.fillRect(x + 1, y + 1, 78, 41)
      }
      ctx.fillStyle = shade(wall, 0.84)
      ctx.fillRect(0, y + 42, W, 3)
      ctx.fillStyle = 'rgba(255,255,255,0.18)'
      ctx.fillRect(0, y + 45, W, 1)
    }
  } else if (style.neon) {
    for (let y = 0; y < H; y += 22) for (let x = 0; x < W; x += 32) {
      ctx.fillStyle = shade(wall, 0.94 + rand() * 0.08)
      ctx.fillRect(x + 1, y + 1, 30, 20)
    }
  } else if (style.corrugated) {
    // corrugated iron cladding: vertical ribs
    for (let x = 0; x < W; x += 8) {
      ctx.fillStyle = shade(wall, 0.86)
      ctx.fillRect(x, 0, 3, H)
      ctx.fillStyle = 'rgba(255,255,255,0.14)'
      ctx.fillRect(x + 4, 0, 2, H)
    }
  }
  // grime: darker toward the bottom of each storey
  const gr = ctx.createLinearGradient(0, 0, 0, H)
  gr.addColorStop(0, 'rgba(0,0,0,0)')
  gr.addColorStop(1, 'rgba(0,0,0,0.12)')
  ctx.fillStyle = gr
  ctx.fillRect(0, 0, W, H)

  const wx = 64
  const wy = 52
  const ww = 128
  const wh = 158
  const arch = style.arches
  const archPath = (x0, y0, w, h, grow) => {
    ctx.beginPath()
    ctx.moveTo(x0 - grow, y0 + h + grow)
    ctx.lineTo(x0 - grow, y0 + 54)
    ctx.arc(x0 + w / 2, y0 + 54, w / 2 + grow, Math.PI, 0)
    ctx.lineTo(x0 + w + grow, y0 + h + grow)
    ctx.closePath()
  }
  // surround (shadow, frame, highlight)
  ctx.fillStyle = 'rgba(0,0,0,0.25)'
  if (arch) {
    archPath(wx + 4, wy + 4, ww, wh, 12)
    ctx.fill()
  } else ctx.fillRect(wx - 8, wy - 6, ww + 24, wh + 22)
  ctx.fillStyle = style.trim
  if (arch) {
    archPath(wx, wy, ww, wh, 12)
    ctx.fill()
  } else ctx.fillRect(wx - 12, wy - 12, ww + 24, wh + 24)
  // glass
  const g = ctx.createLinearGradient(wx, wy, wx + ww, wy + wh)
  g.addColorStop(0, '#3a5f98')
  g.addColorStop(0.5, '#1b3564')
  g.addColorStop(1, '#0f1f40')
  ctx.fillStyle = g
  if (arch) {
    archPath(wx, wy, ww, wh, 0)
    ctx.fill()
  } else ctx.fillRect(wx, wy, ww, wh)
  // what's behind the glass
  const r = rand()
  if (r < 0.3) {
    ctx.fillStyle = ['#e9dcc0', '#c84a3a', '#3a6a9a', '#e8c35a'][Math.floor(rand() * 4)]
    ctx.fillRect(wx + 4, wy + (arch ? 30 : 4), 26, wh - (arch ? 34 : 8))
    ctx.fillRect(wx + ww - 30, wy + (arch ? 30 : 4), 26, wh - (arch ? 34 : 8))
  } else if (r < 0.55) {
    ctx.fillStyle = 'rgba(240,232,214,0.92)'
    const bh = wh * (0.2 + rand() * 0.35)
    ctx.fillRect(wx + 2, wy + (arch ? 24 : 2), ww - 4, bh)
    ctx.fillStyle = 'rgba(0,0,0,0.12)'
    for (let y = wy + (arch ? 24 : 2) + 6; y < wy + bh; y += 6) ctx.fillRect(wx + 2, y, ww - 4, 1)
  } else if (r < 0.7) {
    ctx.fillStyle = 'rgba(255,214,140,0.55)' // a lit room
    ctx.fillRect(wx + 6, wy + wh * 0.35, ww - 12, wh * 0.6)
  }
  // reflection
  ctx.fillStyle = 'rgba(170,215,255,0.3)'
  ctx.beginPath()
  ctx.moveTo(wx + 14, wy + wh)
  ctx.lineTo(wx + 54, wy + wh)
  ctx.lineTo(wx + ww - 10, wy + 20)
  ctx.lineTo(wx + ww - 50, wy + 20)
  ctx.closePath()
  ctx.fill()
  // inner reveal shadow
  ctx.fillStyle = 'rgba(0,0,0,0.35)'
  if (!arch) ctx.fillRect(wx, wy, ww, 7)
  ctx.fillRect(wx, wy + (arch ? 54 : 0), 6, wh - (arch ? 54 : 0))
  // glazing bars
  ctx.fillStyle = style.trim
  if (brick) {
    // sash: two over two
    ctx.fillRect(wx + ww / 2 - 3, wy, 6, wh)
    ctx.fillRect(wx, wy + wh * 0.48, ww, 9)
    ctx.fillRect(wx, wy + wh * 0.24, ww, 3)
    ctx.fillRect(wx, wy + wh * 0.74, ww, 3)
  } else if (style.balconies) {
    // French windows: two leaves of small panes
    ctx.fillRect(wx + ww / 2 - 4, wy, 8, wh)
    for (let k = 1; k < 4; k++) ctx.fillRect(wx, wy + (wh * k) / 4 - 2, ww, 4)
  } else if (style.neon) {
    ctx.fillRect(wx + ww / 3 - 2, wy, 4, wh)
    ctx.fillRect(wx + (ww * 2) / 3 - 2, wy, 4, wh)
    ctx.fillRect(wx, wy + wh * 0.7, ww, 5)
  } else if (arch) {
    ctx.fillRect(wx + ww / 2 - 3, wy + 10, 6, wh - 10)
    ctx.fillRect(wx, wy + 54, ww, 5)
    // shutters folded back (turquoise unless the city says otherwise)
    ctx.fillStyle = style.shutters ?? '#2a7a8a'
    ctx.fillRect(wx - 34, wy + 54, 22, wh - 54)
    ctx.fillRect(wx + ww + 12, wy + 54, 22, wh - 54)
    ctx.fillStyle = 'rgba(0,0,0,0.25)'
    for (let y = wy + 60; y < wy + wh; y += 8) {
      ctx.fillRect(wx - 34, y, 22, 2)
      ctx.fillRect(wx + ww + 12, y, 22, 2)
    }
  } else {
    ctx.fillRect(wx + ww / 2 - 4, wy, 8, wh)
    ctx.fillRect(wx, wy + wh * 0.42, ww, 7)
  }
  if (style.shutters && !arch) {
    // louvred shutters folded back beside the window
    ctx.fillStyle = style.shutters
    ctx.fillRect(wx - 46, wy - 4, 32, wh + 8)
    ctx.fillRect(wx + ww + 14, wy - 4, 32, wh + 8)
    ctx.fillStyle = 'rgba(0,0,0,0.22)'
    for (let y = wy + 2; y < wy + wh; y += 8) {
      ctx.fillRect(wx - 44, y, 28, 2)
      ctx.fillRect(wx + ww + 16, y, 28, 2)
    }
  }
  // shadow cast by the sill (the sill itself is geometry)
  ctx.fillStyle = 'rgba(0,0,0,0.22)'
  ctx.fillRect(wx - 16, wy + wh + 22, ww + 32, 10)
  return c
}
function paintPaving(col, waves = false) {
  const c = cv(256)
  const ctx = c.getContext('2d')
  const rand = mulberry32(17)
  if (waves) {
    // black + white mosaic waves (the Copacabana promenade): tiles seamlessly every 256 px
    ctx.fillStyle = '#f4f1ea'
    ctx.fillRect(0, 0, 256, 256)
    ctx.fillStyle = '#23252b'
    for (let y0 = 0; y0 < 256; y0 += 64) {
      ctx.beginPath()
      for (let x = 0; x <= 256; x += 4) ctx.lineTo(x, y0 + 16 + Math.sin((x / 256) * Math.PI * 4) * 14)
      for (let x = 256; x >= 0; x -= 4) ctx.lineTo(x, y0 + 40 + Math.sin((x / 256) * Math.PI * 4) * 14)
      ctx.closePath()
      ctx.fill()
    }
    for (let i = 0; i < 2600; i++) {
      ctx.fillStyle = rand() < 0.5 ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)'
      ctx.fillRect(rand() * 256, rand() * 256, 2, 2)
    }
    return c
  }
  ctx.fillStyle = shade(col, 0.74)
  ctx.fillRect(0, 0, 256, 256)
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    ctx.fillStyle = shade(col, 0.92 + rand() * 0.14)
    ctx.fillRect(x * 64 + 2, y * 64 + 2, 60, 60)
    ctx.fillStyle = 'rgba(255,255,255,0.08)'
    ctx.fillRect(x * 64 + 2, y * 64 + 2, 60, 3)
  }
  for (let i = 0; i < 1200; i++) {
    ctx.fillStyle = rand() < 0.5 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)'
    ctx.fillRect(rand() * 256, rand() * 256, 2, 2)
  }
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = 'rgba(40,40,40,0.18)'
    ctx.beginPath()
    ctx.arc(rand() * 256, rand() * 256, 2 + rand() * 2, 0, 7)
    ctx.fill()
  }
  return c
}
function paintZebra() {
  const c = cv(256, 64)
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#5c6068'
  ctx.fillRect(0, 0, 256, 64)
  const rand = mulberry32(9)
  for (let i = 0; i < 400; i++) {
    ctx.fillStyle = `rgba(0,0,0,${0.05 + rand() * 0.08})`
    ctx.fillRect(rand() * 256, rand() * 64, 2, 2)
  }
  ctx.fillStyle = '#f2f2ee'
  for (let x = 8; x < 256; x += 32) ctx.fillRect(x, 4, 18, 56)
  ctx.fillStyle = 'rgba(90,90,90,0.35)' // worn patches
  for (let i = 0; i < 40; i++) ctx.fillRect(rand() * 256, rand() * 64, 3 + rand() * 4, 2)
  return c
}
function paintRoad() {
  const c = cv(256, 256)
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#5f636b'
  ctx.fillRect(0, 0, 256, 256)
  const rand = mulberry32(5)
  for (let i = 0; i < 2600; i++) {
    const v = rand() < 0.5 ? 255 : 0
    ctx.fillStyle = `rgba(${v},${v},${v},${0.03 + rand() * 0.05})`
    ctx.fillRect(rand() * 256, rand() * 256, 2, 2)
  }
  // tar seams + a patch
  ctx.strokeStyle = 'rgba(30,30,34,0.45)'
  ctx.lineWidth = 1.5
  for (let i = 0; i < 4; i++) {
    ctx.beginPath()
    let x = 20 + rand() * 216
    ctx.moveTo(x, 0)
    for (let y = 0; y <= 256; y += 32) ctx.lineTo((x += (rand() - 0.5) * 10), y)
    ctx.stroke()
  }
  ctx.fillStyle = 'rgba(40,42,48,0.35)'
  ctx.fillRect(160, 150, 26, 40)
  // gutters by the kerbs
  ctx.fillStyle = '#7d8087'
  ctx.fillRect(0, 0, 7, 256)
  ctx.fillRect(249, 0, 7, 256)
  // centre: double yellow; lanes: dashed white
  ctx.fillStyle = '#ffd21f'
  ctx.fillRect(122, 0, 4, 256)
  ctx.fillRect(130, 0, 4, 256)
  ctx.fillStyle = '#f4f4f4'
  for (const x of [62, 192]) ctx.fillRect(x, 0, 3, 120)
  return c
}
function paintAwning(col) {
  const c = cv(64)
  const ctx = c.getContext('2d')
  ctx.fillStyle = col
  ctx.fillRect(0, 0, 64, 32)
  ctx.fillStyle = '#f4f1ea'
  ctx.fillRect(0, 32, 64, 32)
  ctx.fillStyle = 'rgba(0,0,0,0.12)'
  ctx.fillRect(0, 28, 64, 4)
  ctx.fillRect(0, 60, 64, 4)
  return c
}
// What you see through a shop window: lit back wall, shelves of goods, ceiling lights, a counter.
function paintShop() {
  const c = cv(256, 128)
  const ctx = c.getContext('2d')
  const rand = mulberry32(31)
  const g = ctx.createLinearGradient(0, 0, 0, 128)
  g.addColorStop(0, '#5a4a3a')
  g.addColorStop(0.2, '#f1dfbe')
  g.addColorStop(1, '#c8a878')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 256, 128)
  ctx.fillStyle = '#3a2e24'
  ctx.fillRect(0, 0, 256, 14)
  for (let x = 16; x < 256; x += 42) {
    ctx.fillStyle = '#fff6d8'
    ctx.fillRect(x, 10, 18, 4)
  }
  for (const y of [34, 62, 90]) {
    ctx.fillStyle = '#6a4a2e'
    ctx.fillRect(0, y + 16, 256, 4)
    for (let x = 2; x < 254; ) {
      const w = 6 + rand() * 12
      ctx.fillStyle = ['#d6232e', '#1d6fd8', '#f2c230', '#2a9a4a', '#f4f4f4', '#e86a2a', '#8a4ad8'][Math.floor(rand() * 7)]
      ctx.fillRect(x, y + 16 - (8 + rand() * 8), w - 2, 16)
      x += w
    }
  }
  ctx.fillStyle = '#4a3424'
  ctx.fillRect(30, 104, 120, 24)
  ctx.fillStyle = '#6a4a32'
  ctx.fillRect(30, 104, 120, 4)
  ctx.fillStyle = 'rgba(255,255,255,0.18)' // glass sheen
  ctx.beginPath()
  ctx.moveTo(150, 128)
  ctx.lineTo(190, 128)
  ctx.lineTo(250, 0)
  ctx.lineTo(210, 0)
  ctx.closePath()
  ctx.fill()
  return c
}
// Shop sign atlas: one 512 x 64 board per shop name.
function paintSigns(names) {
  const c = cv(512)
  const ctx = c.getContext('2d')
  names.slice(0, 8).forEach((name, i) => {
    const y = i * 64
    ctx.fillStyle = SIGN_BGS[i % SIGN_BGS.length]
    ctx.fillRect(0, y, 512, 64)
    ctx.strokeStyle = '#e9c46a'
    ctx.lineWidth = 3
    ctx.strokeRect(6, y + 6, 500, 52)
    ctx.fillStyle = '#e9c46a'
    for (const x of [22, 490]) {
      ctx.beginPath()
      ctx.arc(x, y + 32, 4, 0, 7)
      ctx.fill()
    }
    ctx.fillStyle = '#fff8e6'
    ctx.font = `italic 600 38px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(name, 256, y + 34, 440)
  })
  return c
}
// Tokyo neon atlas: one 64 x 512 vertical sign per shop name.
function paintNeonSigns(names) {
  const c = cv(512)
  const ctx = c.getContext('2d')
  names.slice(0, 8).forEach((name, i) => {
    const x = i * 64
    const col = NEON_COLS[i % NEON_COLS.length]
    ctx.fillStyle = '#14161c'
    ctx.fillRect(x, 0, 64, 512)
    ctx.strokeStyle = col
    ctx.lineWidth = 4
    ctx.strokeRect(x + 5, 5, 54, 502)
    ctx.fillStyle = col
    ctx.font = `700 44px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const letters = name.toUpperCase().replace(/ /g, '').slice(0, 6).split('')
    const step = 440 / Math.max(1, letters.length)
    letters.forEach((l, k) => ctx.fillText(l, x + 32, 36 + step * (k + 0.5)))
  })
  return c
}
function paintSign(text, w = 512, h = 64) {
  const c = cv(w, h)
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#11141c'
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = '#1b8cff'
  ctx.fillRect(0, h - 5, w, 5)
  ctx.fillStyle = '#ffffff'
  ctx.font = `italic 500 ${h * 0.56}px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, w / 2, h * 0.5, w - 20)
  return c
}
function paintClock() {
  const c = cv(256)
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#2a2a30'
  ctx.fillRect(0, 0, 256, 256)
  ctx.fillStyle = '#c9a54a'
  ctx.fillRect(8, 8, 240, 240)
  ctx.fillStyle = '#3a3220'
  for (const [x, y] of [[20, 20], [236, 20], [20, 236], [236, 236]]) {
    ctx.beginPath()
    ctx.arc(x, y, 12, 0, 7)
    ctx.fill()
  }
  ctx.fillStyle = '#1b1d22'
  ctx.beginPath()
  ctx.arc(128, 128, 118, 0, 7)
  ctx.fill()
  ctx.fillStyle = '#f6f1e2'
  ctx.beginPath()
  ctx.arc(128, 128, 108, 0, 7)
  ctx.fill()
  ctx.strokeStyle = '#1b1d22'
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2
    const big = i % 5 === 0
    ctx.lineWidth = big ? 7 : 2
    ctx.beginPath()
    ctx.moveTo(128 + Math.sin(a) * (big ? 80 : 94), 128 - Math.cos(a) * (big ? 80 : 94))
    ctx.lineTo(128 + Math.sin(a) * 102, 128 - Math.cos(a) * 102)
    ctx.stroke()
  }
  ctx.lineCap = 'round'
  ctx.lineWidth = 8
  ctx.beginPath()
  ctx.moveTo(128, 128)
  ctx.lineTo(128, 48)
  ctx.stroke()
  ctx.lineWidth = 10
  ctx.beginPath()
  ctx.moveTo(128, 128)
  ctx.lineTo(178, 140)
  ctx.stroke()
  ctx.fillStyle = '#c9a54a'
  ctx.beginPath()
  ctx.arc(128, 128, 9, 0, 7)
  ctx.fill()
  return c
}
// Gothic stonework: tall recessed lancet panels between buttresses.
function paintGothic() {
  const c = cv(128, 256)
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#c9ad74'
  ctx.fillRect(0, 0, 128, 256)
  for (let k = 0; k < 3; k++) {
    const x = 8 + k * 40
    ctx.fillStyle = '#a88d58'
    ctx.beginPath()
    ctx.moveTo(x, 240)
    ctx.lineTo(x, 50)
    ctx.quadraticCurveTo(x, 16, x + 14, 10)
    ctx.quadraticCurveTo(x + 28, 16, x + 28, 50)
    ctx.lineTo(x + 28, 240)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#3a3a44'
    ctx.fillRect(x + 8, 60, 12, 70)
    ctx.fillRect(x + 8, 150, 12, 70)
    ctx.fillStyle = '#e0c891'
    ctx.fillRect(x - 3, 0, 3, 256)
  }
  ctx.fillStyle = '#b39760'
  ctx.fillRect(0, 244, 128, 12)
  return c
}
function paintOffice(seed) {
  const c = cv(128)
  const ctx = c.getContext('2d')
  const rand = mulberry32(seed)
  ctx.fillStyle = '#7d8aa0'
  ctx.fillRect(0, 0, 128, 128)
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    const lit = rand() < 0.15
    ctx.fillStyle = lit ? '#e8dcae' : `rgb(${50 + rand() * 30},${70 + rand() * 30},${100 + rand() * 30})`
    ctx.fillRect(x * 32 + 4, y * 32 + 5, 24, 22)
    ctx.fillStyle = 'rgba(255,255,255,0.15)'
    ctx.fillRect(x * 32 + 4, y * 32 + 5, 24, 3)
  }
  return c
}
// Open lattice (alpha-tested): frame + X bracing, thick enough to survive mip-mapping.
function paintLattice() {
  const c = cv(128)
  const ctx = c.getContext('2d')
  ctx.clearRect(0, 0, 128, 128)
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 16
  ctx.strokeRect(0, 0, 128, 128)
  ctx.lineWidth = 11
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(128, 128)
  ctx.moveTo(128, 0)
  ctx.lineTo(0, 128)
  ctx.stroke()
  ctx.lineWidth = 6
  ctx.beginPath()
  ctx.moveTo(0, 64)
  ctx.lineTo(128, 64)
  ctx.stroke()
  return c
}
// Iron railing panel (alpha-tested), 0.5 m per tile: bars, and scrolls for Paris balconies.
function paintRailing(scrolls) {
  const c = cv(128, 64)
  const ctx = c.getContext('2d')
  ctx.clearRect(0, 0, 128, 64)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, 128, 6)
  ctx.fillRect(0, 56, 128, 8)
  for (let x = 0; x < 128; x += 32) ctx.fillRect(x, 0, 6, 64)
  if (scrolls) {
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 4
    for (let x = 16; x < 128; x += 32) {
      ctx.beginPath()
      ctx.arc(x + 3, 22, 9, 0, 7)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(x + 3, 42, 9, 0, 7)
      ctx.stroke()
    }
  } else {
    for (let x = 16; x < 128; x += 32) ctx.fillRect(x, 0, 4, 64)
    ctx.fillRect(0, 28, 128, 4)
  }
  return c
}
function paintSteps() {
  const c = cv(256)
  const ctx = c.getContext('2d')
  const rand = mulberry32(23)
  ctx.fillStyle = '#d4b880'
  ctx.fillRect(0, 0, 256, 256)
  for (let y = 0; y < 256; y += 16) {
    ctx.fillStyle = '#e8d3a0'
    ctx.fillRect(0, y, 256, 4)
    ctx.fillStyle = '#a88c58'
    ctx.fillRect(0, y + 13, 256, 3)
    const off = (y / 16) % 2 ? 0 : 20
    for (let x = off; x < 256; x += 40) {
      ctx.fillStyle = '#b89c68'
      ctx.fillRect(x, y + 4, 2, 9)
    }
  }
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = rand() < 0.5 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.07)'
    ctx.fillRect(rand() * 256, rand() * 256, 3, 3)
  }
  return c
}
function paintVending(col) {
  const c = cv(128)
  const ctx = c.getContext('2d')
  const rand = mulberry32(col.length * 7 + col.charCodeAt(1))
  ctx.fillStyle = '#eef4f8'
  ctx.fillRect(0, 0, 128, 128)
  for (let r = 0; r < 4; r++) {
    ctx.fillStyle = '#c9d2da'
    ctx.fillRect(0, r * 32 + 26, 128, 6)
    for (let k = 0; k < 6; k++) {
      ctx.fillStyle = ['#d6232e', '#1d6fd8', '#f2c230', '#2a9a4a', '#ff7a3b', '#8a4ad8', '#1b1d22'][Math.floor(rand() * 7)]
      ctx.fillRect(6 + k * 20, r * 32 + 6, 12, 20)
      ctx.fillStyle = 'rgba(255,255,255,0.4)'
      ctx.fillRect(8 + k * 20, r * 32 + 8, 3, 14)
      ctx.fillStyle = '#3be0ff'
      ctx.fillRect(9 + k * 20, r * 32 + 28, 6, 3)
    }
  }
  return c
}
// One bay x one tier of a Roman arcade: block courses, pilasters, a dark arch, a cornice on top.
function paintArcade(stone) {
  const c = cv(128)
  const ctx = c.getContext('2d')
  const rand = mulberry32(61)
  ctx.fillStyle = stone
  ctx.fillRect(0, 0, 128, 128)
  for (let y = 0; y < 128; y += 16) {
    ctx.fillStyle = shade(stone, 0.86)
    ctx.fillRect(0, y, 128, 2)
  }
  ctx.fillStyle = shade(stone, 1.08)
  ctx.fillRect(0, 14, 12, 114)
  ctx.fillRect(116, 14, 12, 114)
  ctx.fillStyle = '#3a2e24'
  ctx.beginPath()
  ctx.moveTo(28, 128)
  ctx.lineTo(28, 60)
  ctx.arc(64, 60, 36, Math.PI, 0)
  ctx.lineTo(100, 128)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = 'rgba(0,0,0,0.35)' // depth inside the arch
  ctx.fillRect(28, 60, 10, 68)
  ctx.strokeStyle = shade(stone, 1.12)
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.arc(64, 60, 40, Math.PI, 0)
  ctx.stroke()
  ctx.fillStyle = shade(stone, 0.78)
  ctx.fillRect(0, 0, 128, 10)
  ctx.fillStyle = shade(stone, 1.14)
  ctx.fillRect(0, 10, 128, 3)
  for (let i = 0; i < 500; i++) {
    ctx.fillStyle = rand() < 0.5 ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.07)'
    ctx.fillRect(rand() * 128, rand() * 128, 3, 3)
  }
  return c
}
// Moorish minaret panel: red-ochre stone, a cusped window, a lozenge (sebka) lattice above it.
function paintMinaret() {
  const c = cv(128)
  const ctx = c.getContext('2d')
  const rand = mulberry32(73)
  ctx.fillStyle = '#c98a5a'
  ctx.fillRect(0, 0, 128, 128)
  for (let y = 0; y < 128; y += 10) {
    ctx.fillStyle = 'rgba(80,40,20,0.18)'
    ctx.fillRect(0, y, 128, 1.5)
  }
  ctx.strokeStyle = '#a8683e'
  ctx.lineWidth = 3
  for (let x = 16; x < 128; x += 24) {
    ctx.beginPath()
    ctx.moveTo(x - 12, 40)
    ctx.lineTo(x, 22)
    ctx.lineTo(x + 12, 40)
    ctx.lineTo(x, 58)
    ctx.closePath()
    ctx.stroke()
  }
  ctx.fillStyle = '#e8b890'
  ctx.fillRect(40, 66, 48, 58)
  ctx.fillStyle = '#2e2018'
  ctx.beginPath()
  ctx.moveTo(48, 124)
  ctx.lineTo(48, 86)
  for (let k = 0; k < 3; k++) ctx.arc(56 + k * 8, 86, 4.5, Math.PI, 0)
  ctx.lineTo(80, 124)
  ctx.closePath()
  ctx.fill()
  for (let i = 0; i < 500; i++) {
    ctx.fillStyle = rand() < 0.5 ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.06)'
    ctx.fillRect(rand() * 128, rand() * 128, 3, 3)
  }
  return c
}
// A Mughal iwan: white marble frame, inlaid border, a deep pointed arch with a small one inside.
function paintIwan() {
  const c = cv(128, 192)
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#f3efe7'
  ctx.fillRect(0, 0, 128, 192)
  ctx.strokeStyle = '#3a3a3a'
  ctx.lineWidth = 2
  ctx.strokeRect(8, 8, 112, 184)
  ctx.strokeRect(14, 14, 100, 178)
  const pointed = (x0, x1, yb, ys, yt) => {
    const mx = (x0 + x1) / 2
    ctx.beginPath()
    ctx.moveTo(x0, yb)
    ctx.lineTo(x0, ys)
    ctx.quadraticCurveTo(x0, yt + (ys - yt) * 0.3, mx, yt)
    ctx.quadraticCurveTo(x1, yt + (ys - yt) * 0.3, x1, ys)
    ctx.lineTo(x1, yb)
    ctx.closePath()
  }
  const g = ctx.createLinearGradient(0, 30, 0, 192)
  g.addColorStop(0, '#9a948a')
  g.addColorStop(1, '#d8d2c6')
  ctx.fillStyle = g
  pointed(26, 102, 192, 80, 30)
  ctx.fill()
  ctx.fillStyle = '#2e2a26'
  pointed(48, 80, 192, 132, 108)
  ctx.fill()
  ctx.fillStyle = '#5a5248'
  pointed(50, 78, 100, 78, 56)
  ctx.fill()
  return c
}

// =====================================================================================================
export function createCity(scene) {
  const O = FLIGHT.city
  const Y = O.y + 0.2
  let built = null

  function clear() {
    if (!built) return
    scene.remove(built.root)
    built.root.traverse((o) => {
      if (o.isMesh) o.geometry.dispose()
    })
    for (const d of built.trash) d.dispose() // the materials + textures this build made
    for (const c of built.bodies) world.removeCollider(c, false)
    built = null
  }

  function build(code) {
    clear()
    const style = CITIES[code] ?? CITIES.JFK
    const rand = mulberry32(code.charCodeAt(0) * 131 + code.charCodeAt(1) * 7 + code.charCodeAt(2))
    const deco = mulberry32(code.charCodeAt(0) * 17 + code.charCodeAt(2) * 3 + 99) // decoration only (keeps the layout's sequence)
    const root = new Group()
    root.position.set(O.x, 0, O.z)
    const S = new Group()
    const bodies = []
    const trash = []
    const own = (o) => {
      trash.push(o)
      return o
    }
    const tex = (c, rx, ry) => own(texOf(c, rx, ry))
    const solid = (hx, hy, hz, x, y, z) => {
      bodies.push(addFixed(RAPIER.ColliderDesc.cuboid(hx, hy, hz), { x: O.x + x, y, z: O.z + z }))
    }
    const signTex = tex(paintSigns(style.shops))
    const shopTex = tex(paintShop(), 1, 1)
    const M = {
      paint: own(new MeshStandardMaterial({ vertexColors: true, roughness: 0.75 })),
      metal: own(new MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.55 })),
      leaf: own(new MeshStandardMaterial({ vertexColors: true, roughness: 0.8, flatShading: true })),
      frond: own(new MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: DoubleSide })),
      walk: own(new MeshStandardMaterial({ map: tex(paintPaving(style.sidewalk, style.waves)), roughness: 0.9 })),
      road: own(new MeshStandardMaterial({ map: tex(paintRoad(), 1, 40), roughness: 0.9 })),
      zebra: own(new MeshStandardMaterial({ map: tex(paintZebra()), roughness: 0.8 })),
      glass: own(new MeshStandardMaterial({ color: '#1d3f78', roughness: 0.08, metalness: 0.5 })),
      shopGlass: own(new MeshStandardMaterial({ map: shopTex, emissive: '#ffffff', emissiveMap: shopTex, emissiveIntensity: 0.35, roughness: 0.1, metalness: 0.2 })),
      termGlass: own(new MeshStandardMaterial({ color: '#2a8cff', roughness: 0.05, metalness: 0.3, emissive: '#1a5ac8', emissiveIntensity: 0.35 })),
      signs: own(new MeshStandardMaterial({ map: signTex, emissiveMap: signTex, emissive: '#ffffff', emissiveIntensity: 0.45, roughness: 0.5 })),
      lamp: own(neon('#fff2c8', 1.6)),
    }
    const awnMats = style.awnings.map((col) => own(new MeshStandardMaterial({ map: tex(paintAwning(col), 1, 2), roughness: 0.75 })))
    const neonCache = new Map()
    const neonMat = (col, k = 2.2) => {
      const key = col + k
      if (!neonCache.has(key)) neonCache.set(key, own(neon(col, k)))
      return neonCache.get(key)
    }
    const bayMats = style.walls.map((w, i) => ({ color: w, m: own(new MeshStandardMaterial({ map: tex(paintBay(style, w, 40 + i)), roughness: 0.85 })) }))
    // placement shorthands: vertex-coloured paint / metal
    const P = (parent, geo, col, x, y, z, rx, ry, rz) => mesh(parent, tint(geo, col), M.paint, x, y, z, rx, ry, rz)
    const Pm = (parent, geo, col, x, y, z, rx, ry, rz) => mesh(parent, tint(geo, col), M.metal, x, y, z, rx, ry, rz)
    const B = (parent, w, h, d, col, x, y, z, ry = 0) => P(parent, new BoxGeometry(w, h, d), col, x, y, z, 0, ry)
    const IRON = '#1b1d22'
    const STEEL = '#c8ccd4'
    const SNOW = '#f2f5f9'
    const roofCol = style.snow ? SNOW : style.roofCol ?? '#b5562e'
    // railing panels (fire escapes, balconies): one alpha-tested plane instead of dozens of balusters
    const railMat = style.fireEscapes || style.balconies ? own(new MeshStandardMaterial({ map: tex(paintRailing(style.balconies)), color: '#2a2c31', alphaTest: 0.5, side: DoubleSide, roughness: 0.5, metalness: 0.3 })) : null
    const railPanel = (parent, len, h, x, y, z, ry = 0) => mesh(parent, scaleUV(new PlaneGeometry(len, h), Math.max(1, Math.round(len / 0.5)), 1), railMat, x, y, z, 0, ry, 0)

    // --- Ground: plaza, street, sidewalks, crossing ------------------------------------------------
    const L0 = -46
    const L1 = 168
    const Z0 = -6 // where the street meets the plaza
    const pave = (w, h, d, x, y, z) => mesh(S, planarUV(new BoxGeometry(w, h, d).translate(x, y, z), 0.25), M.walk)
    pave(120, 0.4, Z0 - L0, 0, Y - 0.2, (L0 + Z0) / 2)
    for (const s of [-1, 1]) pave(60 - ROAD, 0.4, L1 - Z0, s * (ROAD + (60 - ROAD) / 2), Y - 0.2, (Z0 + L1) / 2)
    const road = mesh(S, new PlaneGeometry(ROAD * 2, L1 - Z0), M.road, 0, Y - 0.15, (Z0 + L1) / 2, -Math.PI / 2)
    road.material.map.repeat.set(1, (L1 - Z0) / 5)
    for (const s of [-1, 1]) P(S, rbox(0.3, 0.17, L1 - Z0, 0.05, 1), '#e6e6e2', s * ROAD, Y - 0.07, (Z0 + L1) / 2)
    P(S, rbox(ROAD * 2, 0.17, 0.3, 0.05, 1), '#e6e6e2', 0, Y - 0.07, Z0)
    mesh(S, new PlaneGeometry(ROAD * 2, 4), M.zebra, 0, Y - 0.14, Z0 + 2.4, -Math.PI / 2)
    B(S, ROAD, 0.01, 0.35, '#f2f2ee', ROAD / 2, Y - 0.145, Z0 + 5) // stop line (lanes heading for the plaza)
    // manholes + drain grates
    const manhole = tint(new CircleGeometry(0.42, 14).rotateX(-Math.PI / 2), '#3b3e44')
    const manRing = tint(new TorusGeometry(0.42, 0.03, 4, 14).rotateX(Math.PI / 2), '#2a2c31')
    for (const [x, z] of [[-1.8, 22], [3.4, 58], [-3.4, 96], [1.8, 134]]) {
      mesh(S, manhole, M.metal, x, Y - 0.143, z)
      mesh(S, manRing, M.metal, x, Y - 0.145, z)
    }
    for (const s of [-1, 1]) for (let z = 12; z < L1 - 12; z += 30) B(S, 0.36, 0.02, 0.9, '#2a2c31', s * (ROAD - 0.32), Y - 0.142, z)
    // colliders: plaza + sidewalks at kerb height, the street 15 cm lower; walls keep you in the area
    for (const [hx, cx, z0, z1, top] of [[60, 0, L0, Z0, Y], [(60 - ROAD) / 2, -(ROAD + (60 - ROAD) / 2), Z0, L1, Y], [(60 - ROAD) / 2, ROAD + (60 - ROAD) / 2, Z0, L1, Y], [ROAD, 0, Z0, L1, Y - 0.15]]) {
      bodies.push(addFixed(RAPIER.ColliderDesc.cuboid(hx, 0.5, (z1 - z0) / 2), { x: O.x + cx, y: top - 0.5, z: O.z + (z0 + z1) / 2 }))
    }
    solid(60, 10, 0.5, 0, Y + 10, L1 - 4)
    for (const s of [-1, 1]) solid(0.5, 10, (L1 - L0) / 2, s * 44, Y + 10, (L0 + L1) / 2)

    // --- The terminal you arrived at ("departures · fly again") ----------------------------------
    const tz = -32
    const WHITE = '#eef0f4'
    P(S, rbox(34, 10, 10, 0.35, 1), WHITE, 0, Y + 5, tz - 5)
    mesh(S, new BoxGeometry(30, 7.2, 0.3), M.termGlass, 0, Y + 4.1, tz + 0.05)
    for (let x = -15; x <= 15.01; x += 2.5) Pm(S, new BoxGeometry(0.16, 7.4, 0.36), '#dfe3e9', x, Y + 4.1, tz + 0.1)
    for (const y of [0.6, 4.2, 7.6]) Pm(S, new BoxGeometry(30.2, 0.18, 0.36), '#dfe3e9', 0, Y + y, tz + 0.1)
    P(S, rbox(36, 0.7, 12, 0.2, 1), '#f6f7fa', 0, Y + 10.25, tz - 4) // roof
    B(S, 36.05, 0.26, 0.08, '#1b8cff', 0, Y + 10.15, tz + 2.02) // blue fascia stripe
    P(S, rbox(22, 0.3, 4.2, 0.1, 1), '#f6f7fa', 0, Y + 6.2, tz + 2) // canopy
    B(S, 22.04, 0.1, 0.06, '#1b8cff', 0, Y + 6.2, tz + 4.11)
    const downlight = new CircleGeometry(0.15, 10).rotateX(Math.PI / 2)
    for (let x = -9; x <= 9.01; x += 3) mesh(S, downlight, M.lamp, x, Y + 6.04, tz + 2.6)
    for (const s of [-1, 1]) {
      Pm(S, pole(0.14, 0, 6.05, 12), STEEL, s * 10, Y, tz + 3.8)
      Pm(S, lathe([[0.32, 0], [0.32, 0.12], [0.2, 0.22], [0.15, 0.3]], 12), STEEL, s * 10, Y, tz + 3.8)
      Pm(S, lathe([[0.15, 0], [0.26, 0.1], [0.26, 0.16]], 12), STEEL, s * 10, Y + 5.89, tz + 3.8)
    }
    // the sign + entrance portal + mat
    const dsign = tex(paintSign('departures · fly again'))
    const dMat = own(new MeshStandardMaterial({ map: dsign, emissiveMap: dsign, emissive: '#ffffff', emissiveIntensity: 0.5 }))
    P(S, rbox(9.8, 1.3, 0.3, 0.06, 1), '#2a2e36', 0, Y + 7.1, tz + 0.58)
    mesh(S, new PlaneGeometry(9.2, 1.1), dMat, 0, Y + 7.1, tz + 0.735)
    B(S, 6.4, 0.35, 0.5, '#2a2e36', 0, Y + 3.38, tz + 0.3)
    for (const s of [-1, 1]) B(S, 0.25, 3.4, 0.5, '#2a2e36', s * 3.1, Y + 1.7, tz + 0.3)
    B(S, 3.6, 0.01, 2, '#2a2d33', 0, Y + 0.005, tz + 1.4)
    // sliding doors (moved in update), each with a slim frame + pull handle
    const doorPanels = []
    const doorMat = own(new MeshStandardMaterial({ color: '#bfe0ff', transparent: true, opacity: 0.55, roughness: 0.05 }))
    for (const s of [-1, 1]) {
      const p = new Mesh(new BoxGeometry(1.5, 3.2, 0.08), doorMat)
      p.position.set(s * 0.75, Y + 1.6, tz + 0.3)
      p.userData.s = s
      const fr = new Group()
      for (const x of [-0.72, 0.72]) Pm(fr, new BoxGeometry(0.06, 3.2, 0.1), '#dfe3e9', x, 0, 0)
      for (const y of [-1.57, 1.57]) Pm(fr, new BoxGeometry(1.5, 0.06, 0.1), '#dfe3e9', 0, y, 0)
      Pm(fr, new BoxGeometry(0.04, 0.9, 0.05), '#dfe3e9', -s * 0.6, 0, 0.08)
      p.add(bake(fr, false))
      root.add(p)
      doorPanels.push(p)
    }
    solid(17, 5, 5, 0, Y + 5, tz - 5)
    // bollards along the plaza edge
    const bollard = tint(lathe([[0.2, 0], [0.2, 0.05], [0.16, 0.08], [0.15, 0.8], [0.165, 0.82], [0.165, 0.88], [0.12, 0.95], [0.05, 0.99], [0, 1.0]], 12), STEEL)
    const band = tint(new CylinderGeometry(0.158, 0.158, 0.07, 12, 1, true), IRON)
    const bollardAt = (x, z) => {
      mesh(S, bollard, M.metal, x, Y, z)
      mesh(S, band, M.paint, x, Y + 0.68, z)
      solid(0.18, 0.5, 0.18, x, Y + 0.5, z)
    }
    for (const x of [-11, -8.5, -6, 6, 8.5, 11, -2.5, 2.5]) {
      const z = x > -3 && x < 3 ? -8 : -7.2
      if (Math.abs(x) < 3) continue
      bollardAt(x, z)
    }
    for (const x of [-4.5, -1.5, 1.5, 4.5]) bollardAt(x, -9.4)

    // --- Buildings --------------------------------------------------------------------------------
    // Shared bits for the facades.
    const awningGeo = (sw) => {
      const sh = new Shape()
      sh.moveTo(0, 3.02)
      sh.lineTo(1.5, 2.42)
      sh.lineTo(1.5, 2.14)
      sh.lineTo(1.46, 2.14)
      sh.lineTo(1.46, 2.38)
      sh.lineTo(0, 2.96)
      sh.closePath()
      const g = new ExtrudeGeometry(sh, { depth: sw, bevelEnabled: false })
      g.rotateY(-Math.PI / 2) // profile x -> out of the facade (+Z), extrusion -> along it
      g.translate(sw / 2, 0, 0)
      return g
    }
    const acGeo = tint(rbox(1.2, 0.8, 0.9, 0.06, 1), '#c9ccd2')
    const fanGeo = tint(new CircleGeometry(0.3, 12).rotateX(-Math.PI / 2), '#3a3d44')
    const ventGeo = tint(pole(0.12, 0, 0.9, 8), '#9aa1ad')
    const ventCap = tint(new ConeGeometry(0.2, 0.18, 8), '#9aa1ad')
    const potGeo = tint(new CylinderGeometry(0.12, 0.15, 0.55, 8), '#b5562e')
    const shopsLeft = [...style.shops]
    const building = (x0, x1, z0, z1, face, idx) => {
      // face: +1 = the facade looks toward +X (west row), -1 toward -X, 2 = toward +Z (plaza row)
      const w = Math.abs(x1 - x0)
      const d = Math.abs(z1 - z0)
      const floors = 4 + Math.floor(rand() * 4) - (style.roof === 'mansard' ? 1 : 0)
      const H = floors * FLOOR + 4
      const cx = (x0 + x1) / 2
      const cz = (z0 + z1) / 2
      const bm = bayMats[idx % bayMats.length]
      const wall = bm.color
      const frontLen = face === 2 ? w : d
      const off = (face === 2 ? d : w) / 2
      const half = frontLen / 2
      const ry = face === 2 ? 0 : face === 1 ? Math.PI / 2 : -Math.PI / 2
      const upperH = H - 4
      // facade frame: x along the frontage, y up from the pavement, +z out of the facade
      const Fg = new Group()
      Fg.position.set(cx + (face === 2 ? 0 : face * off), Y, cz + (face === 2 ? off : 0))
      Fg.rotation.y = ry
      S.add(Fg)
      // body + ground floor + the tiled facade (window repeats live in the UVs)
      B(S, w, upperH, d, wall, cx, Y + 4 + upperH / 2, cz)
      B(S, w, 4, d, style.trim, cx, Y + 2, cz)
      const nb = Math.max(1, Math.round(frontLen / BAY))
      const bw = frontLen / nb
      mesh(Fg, scaleUV(new PlaneGeometry(frontLen, upperH), nb, floors), bm.m, 0, 4 + upperH / 2, 0.02)
      // window sills + lintels (or keystones over the arches)
      const sill = tint(new BoxGeometry(bw * 0.64, 0.09, 0.2), dk(style.trim, 0.9))
      const lintel = tint(new BoxGeometry(bw * 0.62, 0.16, 0.12), style.trim)
      const key = tint(new BoxGeometry(0.22, 0.3, 0.1), style.trim)
      for (let f = 0; f < floors; f++) for (let i = 0; i < nb; i++) {
        const a = -half + (i + 0.5) * bw
        const yb = 4 + f * FLOOR
        mesh(Fg, sill, M.paint, a, yb + 0.56, 0.1)
        if (style.arches) mesh(Fg, key, M.paint, a, yb + 2.86, 0.07)
        else if (!style.neon) mesh(Fg, lintel, M.paint, a, yb + 2.84, 0.08)
      }
      // ground floor: pilasters, framed shop window, door, fascia + sign board, awning
      const name = shopsLeft.length ? shopsLeft.shift() : style.shops[Math.floor(rand() * style.shops.length)]
      const awnI = Math.floor(rand() * style.awnings.length)
      const awn = style.awnings[awnI]
      const frameCol = dk(awn, 0.7)
      const sw = Math.min(frontLen - 1.2, 10)
      for (const s of [-1, 1]) B(Fg, 0.45, 4, 0.22, dk(style.trim, 0.88), s * (half - 0.225), 2, 0.11)
      mesh(Fg, scaleUV(new PlaneGeometry(sw, 2.5), sw / 3, 1), M.shopGlass, 0, 1.65, 0.03)
      B(Fg, sw + 0.16, 0.42, 0.18, frameCol, 0, 0.21, 0.09) // stall riser
      B(Fg, sw + 0.16, 0.14, 0.16, frameCol, 0, 2.97, 0.08) // transom
      for (const s of [-1, 1]) B(Fg, 0.1, 2.9, 0.16, frameCol, s * (sw / 2 + 0.03), 1.5, 0.08)
      const dx = sw / 2 - 1
      const nm = Math.max(1, Math.round(sw / 2.4))
      for (let k = 1; k < nm; k++) {
        const ax = -sw / 2 + (k * sw) / nm
        if (Math.abs(ax - dx) > 0.8) B(Fg, 0.06, 2.5, 0.1, frameCol, ax, 1.65, 0.06)
      }
      B(Fg, sw, 0.05, 0.08, frameCol, 0, 2.55, 0.05)
      mesh(Fg, new BoxGeometry(1.15, 2.6, 0.05), M.glass, dx, 1.42, 0.12)
      for (const s of [-1, 1]) B(Fg, 0.1, 2.85, 0.18, frameCol, dx + s * 0.62, 1.43, 0.11)
      B(Fg, 1.34, 0.12, 0.18, frameCol, dx, 2.86, 0.11)
      Pm(Fg, new BoxGeometry(1.15, 0.25, 0.03), STEEL, dx, 0.25, 0.16)
      Pm(Fg, new BoxGeometry(0.04, 0.6, 0.04), STEEL, dx - 0.4, 1.3, 0.2)
      B(Fg, sw + 0.3, 0.95, 0.12, dk(awn, 0.45), 0, 3.45, 0.08) // fascia
      const signW = Math.min(sw - 0.6, 5.76)
      const row = Math.max(0, style.shops.indexOf(name))
      const fu = signW / 5.76
      B(Fg, signW + 0.16, 0.86, 0.06, '#d9c27a', 0, 3.45, 0.16)
      mesh(Fg, cropUV(new PlaneGeometry(signW, 0.72), 0.5 - fu / 2, 1 - (row + 1) / 8, 0.5 + fu / 2, 1 - row / 8), M.signs, 0, 3.45, 0.195)
      mesh(Fg, awningGeo(sw), awnMats[awnI])
      for (const s of [-1, 1]) B(Fg, 0.03, 0.03, 1.6, IRON, s * (sw / 2 - 0.1), 2.68, 0.75).rotation.x = 0.37
      if (style.neon || style.lanterns) {
        // paper lanterns under the awning
        const lan = lathe([[0, 0], [0.12, 0.04], [0.17, 0.18], [0.12, 0.34], [0, 0.38]], 8)
        for (const s of [-1, 1]) mesh(Fg, lan, neonMat(style.lanternCol ?? '#ff5a3a', 1.4), s * (sw / 2 - 0.6), 1.7, 1.35)
      }
      // ledge over the shops + cornice (two steps) with corbels on the street side
      B(S, w + 0.3, 0.25, d + 0.3, style.trim, cx, Y + 4.1, cz)
      B(S, w + 0.5, 0.45, d + 0.5, style.trim, cx, Y + H + 0.2, cz)
      B(S, w + 0.25, 0.25, d + 0.25, dk(style.trim, 0.92), cx, Y + H - 0.12, cz)
      if (!style.neon && !style.arches) for (let a = -half + 0.5; a < half - 0.3; a += 1.0) B(Fg, 0.16, 0.3, 0.22, style.trim, a, H - 0.4, 0.13)
      const roofTop = H + 0.425
      const flatRoof = style.roof === 'flat' || style.roof === 'signs' || style.roof === 'terrace'
      if (flatRoof) {
        // parapet + coping + tar roof (or a layer of snow) + clutter
        if (style.snow) B(S, w - 0.2, 0.3, d - 0.2, SNOW, cx, Y + roofTop + 0.15, cz)
        else B(S, w - 0.4, 0.02, d - 0.4, '#4d5058', cx, Y + roofTop + 0.01, cz)
        const ph = style.roof === 'terrace' ? 0.9 : 0.7
        for (const s of [-1, 1]) {
          B(S, w + 0.3, ph, 0.22, wall, cx, Y + roofTop + ph / 2, cz + s * (d / 2 + 0.04))
          B(S, 0.22, ph, d + 0.3, wall, cx + s * (w / 2 + 0.04), Y + roofTop + ph / 2, cz)
          B(S, w + 0.42, 0.08, 0.34, style.trim, cx, Y + roofTop + ph + 0.04, cz + s * (d / 2 + 0.04))
          B(S, 0.34, 0.08, d + 0.42, style.trim, cx + s * (w / 2 + 0.04), Y + roofTop + ph + 0.04, cz)
        }
        const n = 1 + Math.floor(deco() * 3)
        for (let k = 0; k < n; k++) {
          const ax = (deco() - 0.5) * (frontLen - 3)
          const az = -off - 1 - deco() * (off - 2)
          mesh(Fg, acGeo, M.paint, ax, roofTop + 0.4, az)
          mesh(Fg, fanGeo, M.paint, ax, roofTop + 0.81, az)
        }
        for (let k = 0; k < 2; k++) {
          const ax = (deco() - 0.5) * (frontLen - 2)
          const az = -off * (0.3 + deco() * 1.2)
          mesh(Fg, ventGeo, M.paint, ax, roofTop, az)
          mesh(Fg, ventCap, M.paint, ax, roofTop + 0.95, az)
        }
        if (style.roof === 'flat' && deco() < 0.5) {
          B(Fg, 2.2, 2.4, 2, wall, half - 2, roofTop + 1.2, -off * 1.4)
          B(Fg, 2.4, 0.15, 2.2, style.trim, half - 2, roofTop + 2.45, -off * 1.4)
          B(Fg, 0.9, 1.9, 0.06, '#5a4030', half - 2, roofTop + 0.95, -off * 1.4 + 1.01)
        }
        if (style.roof === 'terrace') {
          // water tanks + a satellite dish
          const tank = tint(new CylinderGeometry(0.45, 0.45, 0.9, 10), deco() < 0.5 ? '#f2f2f2' : '#2a2c31')
          for (let k = 0; k < 2; k++) mesh(Fg, tank, M.paint, -half + 1.2 + k * 1.1, roofTop + 0.45, -off * 1.6)
          const dish = tint(lathe([[0, 0], [0.06, 0], [0.32, 0.07], [0.5, 0.2], [0.46, 0.21], [0.28, 0.11], [0, 0.06]], 10), '#e8e8e8')
          mesh(Fg, dish, M.paint, half - 1.4, roofTop + 1.1, -off * 0.7, 0.9, 0, 0)
          B(Fg, 0.06, 1.1, 0.06, '#9aa1ad', half - 1.4, roofTop + 0.55, -off * 0.7 - 0.2)
        }
      }
      if (style.roof === 'mansard') {
        const r = P(S, new CylinderGeometry(0.62, 1, 1, 4, 1), '#5d6470', cx, Y + H + 1.9, cz, 0, Math.PI / 4, 0)
        r.scale.set(w * 0.71, 3, d * 0.71)
        B(S, w * 0.62 + 0.1, 0.08, d * 0.62 + 0.1, '#4a505a', cx, Y + H + 3.42, cz) // zinc ridge
        for (let a = -half + 1.6; a < half - 1; a += BAY) {
          B(Fg, 1.1, 1.3, 0.9, style.trim, a, H + 1.6, -0.9)
          P(Fg, prism(1.3, 0.55, 0.98), '#4a505a', a, H + 2.24, -0.9)
          mesh(Fg, new BoxGeometry(0.7, 0.8, 0.05), M.glass, a, H + 1.55, -0.43)
          B(Fg, 0.06, 0.8, 0.06, style.trim, a, H + 1.55, -0.4)
          B(Fg, 0.9, 0.08, 0.14, style.trim, a, H + 1.1, -0.4)
        }
        for (const k of [-0.32, 0.32]) {
          B(Fg, 0.9, 1.4, 0.6, wall, k * frontLen, H + 3.6, -off)
          B(Fg, 1.0, 0.12, 0.7, style.trim, k * frontLen, H + 4.32, -off)
          for (const p of [-0.22, 0.22]) mesh(Fg, potGeo, M.paint, k * frontLen + p, H + 4.6, -off)
        }
      } else if (style.roof === 'chimneys') {
        for (const k of [-0.3, 0.3]) {
          B(Fg, 1.2, 2.2, 0.9, wall, k * frontLen, H + 1.2, -off * 1.3)
          B(Fg, 1.36, 0.16, 1.06, style.trim, k * frontLen, H + 2.3, -off * 1.3)
          for (const p of [-0.3, 0, 0.3]) mesh(Fg, potGeo, M.paint, k * frontLen + p, H + 2.65, -off * 1.3)
        }
        const r = P(S, new CylinderGeometry(0.01, 1, 1, 4, 1), '#5d6470', cx, Y + H + 1.4, cz, 0, Math.PI / 4, 0)
        r.scale.set(w * 0.71, 2, d * 0.71)
      } else if (style.roof === 'terrace') {
        if (rand() < 0.5) {
          B(S, 2, 2.2, 2, style.trim, cx, Y + H + 1.3, cz) // stair house
          B(S, 2.2, 0.12, 2.2, dk(style.trim, 0.9), cx, Y + H + 2.46, cz)
        }
      } else if (style.roof === 'signs') {
        // rooftop billboard on a steel frame
        if (rand() < 0.6) {
          const col = ['#ff3b8a', '#3be0ff', '#ffd23b', '#7cff6a'][Math.floor(rand() * 4)]
          const bwid = Math.min(frontLen - 2, 7)
          mesh(Fg, new BoxGeometry(bwid, 2.4, 0.2), neonMat(col), 0, H + 2.2, -off)
          B(Fg, bwid + 0.2, 0.12, 0.3, IRON, 0, H + 3.45, -off)
          B(Fg, bwid + 0.2, 0.12, 0.3, IRON, 0, H + 0.95, -off)
          for (const k of [-2, 2]) {
            B(Fg, 0.12, 1.4, 0.12, IRON, k, H + 0.9, -off)
            B(Fg, 0.08, 1.6, 0.08, IRON, k, H + 1.2, -off - 0.7).rotation.x = -0.6
          }
          B(Fg, bwid, 0.05, 0.5, IRON, 0, H + 0.9, -off - 0.4) // catwalk
        }
      } else if (style.roof === 'tiles') {
        // a hipped roof of clay tiles (or snow) with deep eaves
        const rh = 2.2 + rand() * 1.2
        B(S, w + 0.9, 0.18, d + 0.9, dk(roofCol, 0.75), cx, Y + roofTop + 0.09, cz)
        const r = P(S, new CylinderGeometry(0.01, 1, 1, 4, 1), roofCol, cx, Y + roofTop + 0.18 + rh / 2, cz, 0, Math.PI / 4, 0)
        r.scale.set((w + 0.8) * 0.71, rh, (d + 0.8) * 0.71)
        if (rand() < 0.5) {
          B(Fg, 0.9, 1.8, 0.9, wall, frontLen * 0.25, H + 1.6, -off * 1.1)
          B(Fg, 1.06, 0.14, 1.06, style.trim, frontLen * 0.25, H + 2.55, -off * 1.1)
        }
      } else if (style.roof === 'gable') {
        // a row of front gables (canal houses / Victorians): a wall-coloured triangle on the facade,
        // a pitched roof running back from it, a hoist beam or a little round window at the top
        const ng = Math.max(1, Math.round(frontLen / 4.6))
        const gw = frontLen / ng
        const rd = off * 2 - 0.4
        for (let k = 0; k < ng; k++) {
          const a = -half + (k + 0.5) * gw
          const gh = gw * (0.55 + deco() * 0.25)
          P(Fg, prism(gw + 0.3, gh + 0.15, rd), roofCol === SNOW ? SNOW : dk(roofCol, 1), a, roofTop - 0.05, -off - 0.2)
          P(Fg, prism(gw - 0.1, gh - 0.1, 0.4), wall, a, roofTop, 0.0)
          B(Fg, gw * 0.3, 0.12, 0.3, style.trim, a, roofTop + gh * 0.55, 0.22)
          if (deco() < 0.5) B(Fg, 0.14, 0.14, 1.1, IRON, a, roofTop + gh - 0.7, 0.5)
          else mesh(Fg, new CircleGeometry(0.32, 10), M.glass, a, roofTop + gh * 0.4, 0.21)
        }
      }
      if (style.waterTowers && rand() < 0.6) {
        const wx = cx + (rand() - 0.5) * w * 0.4
        const wz = cz + (rand() - 0.5) * d * 0.4
        const y0 = Y + H + 0.2
        for (const [lx, lz] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) P(S, pole(0.08, 0, 2.4, 6), IRON, wx + lx, y0, wz + lz)
        for (const [lx, lz, r2] of [[0, -0.9, 0], [0, 0.9, 0], [-0.9, 0, Math.PI / 2], [0.9, 0, Math.PI / 2]]) {
          const br = P(S, new BoxGeometry(2.4, 0.06, 0.06), IRON, wx + lx, y0 + 1.2, wz + lz, 0, r2, 0)
          br.rotation.set(0, r2, 0.75, 'YXZ')
        }
        B(S, 2.6, 0.12, 2.6, '#4a3a2a', wx, y0 + 2.45, wz)
        P(S, new CylinderGeometry(1.4, 1.46, 2.8, 16), '#8a5a32', wx, y0 + 3.9, wz)
        const hoop = tint(new TorusGeometry(1.45, 0.04, 4, 16).rotateX(Math.PI / 2), IRON)
        for (const y of [2.9, 3.9, 4.9]) mesh(S, hoop, M.paint, wx, y0 + y, wz)
        P(S, new ConeGeometry(1.58, 1.2, 16), '#5d6470', wx, y0 + 5.9, wz)
        P(S, new IcosahedronGeometry(0.12, 0), IRON, wx, y0 + 6.55, wz)
        for (const s of [-1, 1]) B(S, 0.04, 3.4, 0.04, IRON, wx + s * 0.2, y0 + 4.0, wz + 1.5)
        for (let y = 2.6; y < 5.6; y += 0.35) B(S, 0.42, 0.03, 0.03, IRON, wx, y0 + y, wz + 1.5)
      }
      // fire escapes (NY): platforms, railings, zig-zag stairs, a drop ladder at the bottom
      if (style.fireEscapes && frontLen > 7 && rand() < 0.75) {
        const ew = Math.min(6, frontLen - 2)
        const a0 = (rand() - 0.5) * (frontLen - ew - 1)
        const run = ew * 0.5
        const ang = Math.atan2(FLOOR, run)
        const L = Math.hypot(FLOOR, run)
        for (let f = 1; f < floors; f++) {
          const y = 4 + f * FLOOR - 0.2
          B(Fg, ew, 0.06, 1.1, IRON, a0, y, 0.55)
          B(Fg, ew, 0.14, 0.04, IRON, a0, y - 0.04, 1.1)
          B(Fg, ew, 0.05, 0.05, IRON, a0, y + 0.95, 1.08)
          railPanel(Fg, ew, 0.92, a0, y + 0.49, 1.08)
          for (const s of [-1, 1]) {
            B(Fg, 0.05, 0.05, 1.1, IRON, a0 + s * ew / 2, y + 0.95, 0.55)
            railPanel(Fg, 1.08, 0.92, a0 + s * ew / 2, y + 0.49, 0.55, Math.PI / 2)
          }
          // brackets under the platform
          for (const s of [-1, 1]) B(Fg, 0.04, 0.04, 1.2, IRON, a0 + s * (ew / 2 - 0.3), y - 0.35, 0.5).rotation.x = -0.55
          const sg = f % 2 ? 1 : -1
          if (f === 1) {
            // drop ladder hanging from the first platform
            const lx = a0 - sg * ew * 0.3
            for (const s of [-1, 1]) B(Fg, 0.04, 2.4, 0.04, IRON, lx + s * 0.22, y - 1.2, 1.0)
            for (let k = 0.2; k < 2.4; k += 0.3) B(Fg, 0.44, 0.03, 0.03, IRON, lx, y - k, 1.0)
            continue
          }
          const scx = a0 + sg * ew * 0.18
          const scy = y - FLOOR / 2 + 0.05
          for (const sz of [0.32, 0.88]) B(Fg, L, 0.14, 0.03, IRON, scx, scy, sz).rotation.z = sg * ang
          for (let k = 0; k < 8; k++) {
            const t = (k + 0.5) / 8
            B(Fg, 0.24, 0.03, 0.56, IRON, scx + sg * (t - 0.5) * run, scy + (t - 0.5) * FLOOR, 0.6)
          }
        }
      }
      // iron balconies (Paris): a continuous one on the first floor, single ones above
      if (style.balconies) {
        const rail = (cx2, len2, y) => {
          B(Fg, len2, 0.1, 0.62, dk(style.trim, 0.92), cx2, y - 0.03, 0.3)
          B(Fg, len2, 0.05, 0.05, IRON, cx2, y + 0.9, 0.58)
          railPanel(Fg, len2, 0.86, cx2, y + 0.46, 0.58)
          for (const s of [-1, 1]) {
            B(Fg, 0.04, 0.04, 0.58, IRON, cx2 + s * (len2 / 2 - 0.02), y + 0.9, 0.3)
            railPanel(Fg, 0.56, 0.86, cx2 + s * (len2 / 2 - 0.02), y + 0.46, 0.3, Math.PI / 2)
          }
        }
        for (let f = 1; f < floors; f += f === 1 ? 1 : 2) {
          const y = 4 + f * FLOOR - 0.15
          if (f === 1) rail(0, frontLen - 0.6, y)
          else for (let i = 0; i < nb; i++) rail(-half + (i + 0.5) * bw, bw * 0.7, y)
        }
      }
      if (style.neon) {
        // vertical neon sign on brackets (from the shared atlas, one column per shop name)
        void rand() // the sign colour now comes from the atlas column; keep the random sequence
        const col = Math.max(0, style.shops.indexOf(name))
        const u0 = col / 8
        const ns = new Group()
        ns.position.set(half - 1.2, 4 + 3.2, 0.9)
        Fg.add(ns)
        B(ns, 0.14, 5.3, 0.86, IRON, 0, 0, 0)
        for (const s of [-1, 1]) {
          const g = cropUV(new PlaneGeometry(0.8, 5.2), u0, 0, u0 + 1 / 8, 1).rotateY((s * Math.PI) / 2)
          mesh(ns, g, neonAtlas, s * 0.075, 0, 0)
        }
        for (const y of [-2, 2]) B(ns, 0.06, 0.08, 0.6, IRON, 0, y, -0.65)
      }
      // collider
      solid(w / 2, (H + 2) / 2, d / 2, cx, Y + (H + 2) / 2, cz)
    }
    const neonAtlas = style.neon ? own(new MeshBasicMaterial({ map: tex(paintNeonSigns(style.shops)) })) : null
    // west row (facades look +X) and east row (look -X), z from -4 to the end
    let idx = 0
    for (const side of [-1, 1]) {
      let z = -2
      while (z < L1 - 10) {
        const len = 9 + Math.floor(rand() * 3) * 2
        const x0 = side * WALK
        const x1 = side * (WALK + 12 + rand() * 4)
        building(Math.min(x0, x1), Math.max(x0, x1), z, z + len, side < 0 ? 1 : -1, idx++)
        z += len
      }
    }
    // the plaza's side rows (facades look +Z toward the street mouth)
    for (const side of [-1, 1]) {
      building(side * 18, side * 44, -44, -14, side < 0 ? 1 : -1, idx++)
    }
    // the row closing the end of the street
    building(-WALK - 16, WALK + 16, L1 - 10, L1, 2, idx++)

    // --- Street furniture: trees, lamps, bins, hydrants; city specials -------------------------------
    const leafCols = [style.tree, dk(style.tree, 0.8), dk(style.tree, 1.15)]
    const blobs = [[0, 4.1, 0, 1.5], [0.95, 3.6, 0.5, 1.05], [-0.85, 3.7, -0.45, 1.1], [0.2, 4.95, -0.3, 1.0], [-0.5, 4.5, 0.75, 0.95], [0.7, 4.4, -0.8, 0.9]]
    const blobGeos = leafCols.map((c) => tint(new IcosahedronGeometry(1, 1), c))
    const trunkGeo = tint(new CylinderGeometry(0.12, 0.22, 3.2, 8), '#7a5a3c')
    const branchGeo = tint(new CylinderGeometry(0.05, 0.08, 1.3, 6), '#7a5a3c')
    const frondGeo = (() => {
      const g = new PlaneGeometry(0.7, 2.8, 2, 6)
      const p = g.attributes.position
      for (let i = 0; i < p.count; i++) {
        const t = (p.getY(i) + 1.4) / 2.8
        const x = p.getX(i) * (1 - t * 0.75)
        p.setXYZ(i, x, -t * t * 1.3 + Math.abs(x) * 0.3, t * 2.8)
      }
      g.computeVertexNormals()
      return tint(g, style.tree)
    })()
    const pineGeos = [tint(new ConeGeometry(1, 1.6, 8), style.tree), tint(new ConeGeometry(1, 1.6, 8), dk(style.tree, 0.85))]
    const snowCap = tint(new ConeGeometry(1, 1, 8), SNOW)
    const tree = (x, z) => {
      if (style.palms) {
        const lean = (deco() - 0.5) * 0.6
        let px = x
        let py = Y
        for (let k = 0; k < 6; k++) {
          const r0 = 0.27 - k * 0.025
          P(S, new CylinderGeometry(r0 - 0.025, r0, 1.02, 8), '#8a6a4a', px, py + 0.5, z, 0, 0, -lean * 0.12 * k)
          P(S, new CylinderGeometry(r0 + 0.02, r0 + 0.02, 0.1, 8), '#6e5236', px, py + 0.98, z)
          px += lean * 0.12 * k
          py += 1
        }
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2 + deco() * 0.3
          mesh(S, frondGeo, M.frond, px, py + 0.05, z, -0.15 - deco() * 0.2, a, 0).rotation.order = 'YXZ'
        }
        for (let k = 0; k < 3; k++) P(S, new IcosahedronGeometry(0.15, 0), '#5a3d22', px + Math.sin(k * 2.1) * 0.22, py - 0.2, z + Math.cos(k * 2.1) * 0.22)
      } else if (style.pines) {
        // a spruce: short trunk, four stacked cones (snow-dusted tips in a snowy city)
        const s = 0.9 + deco() * 0.3
        P(S, pole(0.18, 0, 1.4, 8, 0.14), '#5a3d28', x, Y, z)
        for (let k = 0; k < 4; k++) {
          const r = (1.7 - k * 0.36) * s
          const y = Y + (1.1 + k * 1.15) * s
          mesh(S, pineGeos[k % 2], M.leaf, x, y + r * 0.7, z, 0, deco() * 3, 0).scale.set(r, r * 1.25, r)
          if (style.snow) mesh(S, snowCap, M.leaf, x, y + r * 1.25, z, 0, deco() * 3, 0).scale.set(r * 0.55, r * 0.5, r * 0.55)
        }
      } else {
        mesh(S, trunkGeo, M.paint, x, Y + 1.6, z)
        for (const [a, tilt] of [[0.6, 0.7], [3.4, 0.6]]) {
          const b = mesh(S, branchGeo, M.paint, x + Math.sin(a) * 0.35, Y + 3.1, z + Math.cos(a) * 0.35)
          b.rotation.set(tilt, a, 0, 'YXZ')
        }
        blobs.forEach(([dx, dy, dz, r], k) => {
          const s = r * (0.92 + deco() * 0.16)
          const b = mesh(S, blobGeos[k % 3], M.leaf, x + dx, Y + dy, z + dz, deco() * 3, deco() * 3, 0)
          b.scale.set(s, s * 0.9, s)
        })
        if (style.snow) mesh(S, snowCap, M.leaf, x, Y + 5.55, z).scale.set(1.1, 0.5, 1.1)
      }
      // tree pit: soil + a grate frame
      B(S, 1.3, 0.04, 1.3, '#4a3a2a', x, Y + 0.02, z)
      for (const s of [-1, 1]) {
        Pm(S, new BoxGeometry(1.4, 0.05, 0.08), '#2a2c31', x, Y + 0.025, z + s * 0.66)
        Pm(S, new BoxGeometry(0.08, 0.05, 1.4), '#2a2c31', x + s * 0.66, Y + 0.025, z)
      }
      solid(0.3, 1.5, 0.3, x, Y + 1.5, z)
    }
    // street lamps: a cobra-head on a curved arm, or (London / Paris) a fluted post with lanterns
    const classic = style.classicLamps ?? (style.roof === 'chimneys' || style.roof === 'mansard')
    const lampBase = tint(lathe([[0.26, 0], [0.26, 0.38], [0.18, 0.48], [0.13, 0.58]], 10), IRON)
    const lampPole = tint(pole(0.13, 0.5, 6.2, 8, 0.09), IRON)
    const lampArc = tint(new TorusGeometry(0.6, 0.05, 5, 8, Math.PI / 2), IRON)
    const lampHead = tint(rbox(0.75, 0.16, 0.36, 0.07, 1), '#2a2d33')
    const classicBase = tint(lathe([[0.32, 0], [0.32, 0.3], [0.22, 0.45], [0.2, 0.9], [0.13, 1.1], [0, 1.1]], 10), IRON)
    const lanternBase = tint(lathe([[0, 0], [0.05, 0], [0.18, 0.12], [0.21, 0.16], [0, 0.16]], 8), IRON)
    const lanternHood = tint(lathe([[0, 0.54], [0.25, 0.54], [0.27, 0.6], [0.07, 0.82], [0, 0.88]], 8), IRON)
    const lanternGlass = new CylinderGeometry(0.17, 0.2, 0.4, 8).translate(0, 0.35, 0)
    const lamp = (x, z, s) => {
      if (classic) {
        mesh(S, classicBase, M.paint, x, Y, z)
        P(S, pole(0.11, 1.1, 4.7, 8, 0.08), IRON, x, Y, z)
        P(S, new TorusGeometry(0.12, 0.04, 4, 10).rotateX(Math.PI / 2), IRON, x, Y + 4.7, z)
        B(S, 1.3, 0.07, 0.07, IRON, x, Y + 4.75, z)
        for (const [lx, ly] of [[0, 4.75], [-0.6, 4.2], [0.6, 4.2]]) {
          mesh(S, lanternBase, M.paint, x + lx, Y + ly, z)
          mesh(S, lanternGlass, M.lamp, x + lx, Y + ly, z)
          mesh(S, lanternHood, M.paint, x + lx, Y + ly, z)
        }
      } else {
        mesh(S, lampBase, M.paint, x, Y, z)
        mesh(S, lampPole, M.paint, x, Y, z)
        mesh(S, lampArc, M.paint, x - s * 0.6, Y + 6.2, z, 0, s > 0 ? 0 : Math.PI, 0)
        B(S, 0.95, 0.08, 0.08, IRON, x - s * 1.08, Y + 6.8, z)
        mesh(S, lampHead, M.paint, x - s * 1.55, Y + 6.74, z)
        mesh(S, new BoxGeometry(0.6, 0.02, 0.26), M.lamp, x - s * 1.55, Y + 6.655, z)
        // a city banner on the post
        B(S, 0.03, 1.2, 0.55, style.awnings[0], x + s * 0.05, Y + 4.4, z + 0.36)
        B(S, 0.03, 0.03, 0.62, IRON, x, Y + 5.02, z + 0.3)
      }
      solid(0.15, 3, 0.15, x, Y + 3, z)
    }
    const hydrant = tint(lathe([[0.2, 0], [0.2, 0.06], [0.15, 0.08], [0.14, 0.5], [0.17, 0.52], [0.17, 0.56], [0.12, 0.6], [0.1, 0.7], [0.04, 0.74], [0, 0.76]], 10), '#d6232e')
    const nozzle = tint(new CylinderGeometry(0.055, 0.055, 0.12, 8), '#d6232e')
    const capGeo = tint(new CylinderGeometry(0.065, 0.065, 0.04, 8), '#c9a54a')
    const binGeo = tint(lathe([[0.2, 0], [0.24, 0.05], [0.26, 0.75], [0.28, 0.78], [0.28, 0.82], [0.24, 0.86], [0.12, 0.92], [0, 0.94]], 10), IRON)
    for (const s of [-1, 1]) {
      for (let z = 6; z < L1 - 14; z += 18) tree(s * 10, z + (s > 0 ? 9 : 0))
      for (let z = 0; z < L1 - 14; z += 24) lamp(s * 7.8, z + 4, s)
      for (let z = 14; z < L1 - 14; z += 36) {
        const x = s * 8.2
        if (s > 0) {
          mesh(S, hydrant, M.paint, x, Y, z)
          for (const k of [-1, 1]) {
            mesh(S, nozzle, M.paint, x, Y + 0.38, z + k * 0.17, Math.PI / 2, 0, 0)
            mesh(S, capGeo, M.metal, x, Y + 0.38, z + k * 0.24, Math.PI / 2, 0, 0)
          }
          // the big pumper nozzle faces the road
          P(S, new CylinderGeometry(0.075, 0.075, 0.12, 8), '#d6232e', x - 0.17, Y + 0.32, z, 0, 0, Math.PI / 2)
          Pm(S, new CylinderGeometry(0.085, 0.085, 0.04, 8), '#c9a54a', x - 0.25, Y + 0.32, z, 0, 0, Math.PI / 2)
          Pm(S, new CylinderGeometry(0.03, 0.03, 0.06, 5), '#c9a54a', x, Y + 0.78, z)
        } else {
          mesh(S, binGeo, M.paint, x, Y, z)
          B(S, 0.1, 0.06, 0.02, '#c9a54a', x, Y + 0.6, z + 0.255)
        }
      }
    }
    tree(-16, -12)
    tree(16, -12)
    if (style.bikes) {
      // rows of parked bikes along both kerbs: two wheels, a frame triangle, saddle + bars
      const wheel = tint(new TorusGeometry(0.33, 0.028, 4, 16).rotateY(Math.PI / 2), IRON)
      const BIKE_COLS = ['#1b1d22', '#2a5c3a', '#7a1f2a', '#1b3d6b', '#c8c2b0', '#e8a03a']
      const bike = (x, z, col) => {
        for (const dz of [-0.52, 0.52]) mesh(S, wheel, M.paint, x, Y + 0.35, z + dz)
        B(S, 0.04, 0.04, 0.72, col, x, Y + 0.62, z + 0.02)
        B(S, 0.04, 0.04, 0.66, col, x, Y + 0.48, z - 0.14).rotation.x = -0.55
        B(S, 0.04, 0.46, 0.04, col, x, Y + 0.6, z - 0.26).rotation.x = 0.2
        B(S, 0.04, 0.5, 0.04, col, x, Y + 0.6, z + 0.42).rotation.x = -0.25
        B(S, 0.1, 0.05, 0.24, IRON, x, Y + 0.86, z - 0.3)
        B(S, 0.5, 0.035, 0.035, IRON, x, Y + 0.88, z + 0.36)
      }
      for (const s of [-1, 1]) for (let z = 24; z < L1 - 20; z += 27) {
        const n = 3 + Math.floor(deco() * 3)
        for (let k = 0; k < n; k++) bike(s * 8.4, z + k * 0.7, BIKE_COLS[Math.floor(deco() * BIKE_COLS.length)])
        solid(0.25, 0.5, n * 0.35 + 0.3, s * 8.4, Y + 0.5, z + (n - 1) * 0.35)
      }
    }
    if (style.snow) {
      // ploughed snowbanks along the kerbs
      const bank = tint(new IcosahedronGeometry(1, 1), SNOW)
      for (const s of [-1, 1]) for (let z = 2; z < L1 - 12; z += 3.2) {
        const b = mesh(S, bank, M.leaf, s * (ROAD + 0.7), Y + 0.05, z + deco(), deco() * 3, deco() * 3, 0)
        b.scale.set(0.55 + deco() * 0.2, 0.35 + deco() * 0.15, 1.4 + deco() * 0.4)
      }
    }
    if (style.phoneBox) {
      // red telephone box: plinth, corner posts, glazed sides with bars, crown + domed roof, lit sign
      const g = new Group()
      g.position.set(-9.6, Y, 3)
      S.add(g)
      const RED = '#d6232e'
      B(g, 1.1, 0.15, 1.1, RED, 0, 0.075, 0)
      for (const [px, pz] of [[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45]]) B(g, 0.14, 2.3, 0.14, RED, px, 1.3, pz)
      B(g, 1.05, 0.32, 1.05, RED, 0, 2.6, 0)
      P(g, rbox(1.0, 0.24, 1.0, 0.11, 1), RED, 0, 2.82, 0)
      P(g, rbox(0.3, 0.12, 0.3, 0.05, 1), RED, 0, 2.97, 0)
      for (let k = 0; k < 4; k++) {
        const a = (k * Math.PI) / 2
        const fx = Math.sin(a)
        const fz = Math.cos(a)
        mesh(g, new PlaneGeometry(0.76, 1.8), M.glass, fx * 0.46, 1.35, fz * 0.46, 0, a, 0)
        mesh(g, new BoxGeometry(0.8, 0.13, 0.02), neonMat('#fff7e0', 1.1), fx * 0.53, 2.58, fz * 0.53, 0, a, 0)
        for (let r = 1; r < 8; r++) B(g, 0.76, 0.03, 0.03, RED, fx * 0.47, 0.45 + (r * 1.8) / 8, fz * 0.47, a)
        for (const sx of [-0.13, 0.13]) {
          const b = B(g, 0.03, 1.8, 0.03, RED, fx * 0.47 + fz * sx, 1.35, fz * 0.47 - fx * sx)
          b.rotation.y = a
        }
      }
      B(g, 0.05, 0.3, 0.04, '#c9a54a', 0.34, 1.3, 0.5)
      solid(0.5, 1.3, 0.5, -9.6, Y + 1.3, 3)
    }
    if (style.vending) {
      for (const [x, col] of [[-11.2, '#d6232e'], [-11.2, '#1d4fbf']]) {
        const z = col === '#d6232e' ? 6 : 7.2
        const vt = tex(paintVending(col))
        const vm = own(new MeshStandardMaterial({ map: vt, emissiveMap: vt, emissive: '#ffffff', emissiveIntensity: 0.6, roughness: 0.2 }))
        const g = new Group()
        g.position.set(x, Y, z)
        g.rotation.y = Math.PI / 2 // front faces the road (+X)
        S.add(g)
        P(g, rbox(1.0, 1.9, 0.8, 0.05, 1), col, 0, 0.95, 0)
        mesh(g, new PlaneGeometry(0.82, 0.92), vm, 0, 1.3, 0.405)
        mesh(g, new BoxGeometry(0.86, 0.14, 0.03), neonMat('#e8f6ff', 1.4), 0, 1.84, 0.4)
        B(g, 0.22, 0.4, 0.04, '#d9dde3', 0.28, 0.62, 0.41)
        B(g, 0.6, 0.18, 0.06, IRON, -0.1, 0.25, 0.41)
        B(g, 1.04, 0.08, 0.84, dk(col, 0.6), 0, 0.04, 0)
        solid(0.5, 1, 0.4, x, Y + 1, z)
      }
    }

    // --- Landmark on the skyline ---------------------------------------------------------------------
    const LM = new Group()
    LM.position.set(0, Y, L1 + 120)
    // moving parts (windmill sails, a big wheel) live outside the bake; same frame as LM
    const dyn = new Group()
    root.add(dyn)
    const spin = []
    // shared landmark helpers
    const jag = (g, amt, seed) => {
      // wobble a shape's outline (same displacement for duplicated seam vertices: no cracks)
      const p = g.attributes.position
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i)
        const y = p.getY(i)
        const z = p.getZ(i)
        const f = 1 + amt * Math.sin(x * 0.07 + z * 0.05 + seed) * Math.cos(z * 0.06 - y * 0.04 + seed * 2)
        p.setXYZ(i, x * f, y, z * f)
      }
      return g
    }
    // a low-poly peak, optionally snow-capped above `cap` (fraction of its height from the top)
    const mountain = (x, z, r, h, col, cap = 0) => {
      const g = jag(new ConeGeometry(r, h, 11, 8), 0.16, x * 0.13 + z * 0.07)
      const p = g.attributes.position
      const a = new Float32Array(p.count * 3)
      const c0 = new Color(col)
      const c1 = new Color(SNOW)
      for (let i = 0; i < p.count; i++) {
        const t = (p.getY(i) + h / 2) / h
        const c = cap && t > 1 - cap ? c1 : c0
        const k = cap && t > 1 - cap ? 1 : 0.88 + t * 0.24
        a.set([c.r * k, c.g * k, c.b * k], i * 3)
      }
      g.setAttribute('color', new BufferAttribute(a, 3))
      mesh(LM, g, M.leaf, x, h / 2 - 1, z)
    }
    const domePts = (r, h, n = 10) => Array.from({ length: n + 1 }, (_, i) => [r * Math.cos((i / n) * Math.PI / 2), h * Math.sin((i / n) * Math.PI / 2)])
    const onionPts = (r, h) => [[r * 0.82, 0], [r * 0.98, h * 0.12], [r * 1.05, h * 0.3], [r * 0.95, h * 0.48], [r * 0.7, h * 0.66], [r * 0.38, h * 0.82], [r * 0.14, h * 0.93], [0, h]]
    const umbrellaPine = (x, z, s) => {
      P(LM, pole(0.5 * s, 0, 13 * s, 6, 0.32 * s), '#6a4a32', x, 0, z)
      mesh(LM, tint(new IcosahedronGeometry(1, 1), '#3f6a2e'), M.leaf, x, 14 * s, z).scale.set(8 * s, 3 * s, 8 * s)
    }
    const cypress = (x, z, s) => mesh(LM, tint(new IcosahedronGeometry(1, 1), '#2f4f2a'), M.leaf, x, 9 * s, z).scale.set(2.2 * s, 10 * s, 2.2 * s)
    const latOf = (col) => own(new MeshStandardMaterial({ map: tex(paintLattice()), color: col, alphaTest: 0.5, side: DoubleSide, roughness: 0.6, metalness: 0.3 }))
    // a straight member from (x0, y0) to (x1, y1) in LM's XY plane at depth z
    const beam = (x0, y0, x1, y1, z, t, col) => {
      const len = Math.hypot(x1 - x0, y1 - y0)
      B(LM, len, t, t, col, (x0 + x1) / 2, (y0 + y1) / 2, z).rotation.z = Math.atan2(y1 - y0, x1 - x0)
    }
    if (style.landmark === 'skyline') {
      const om = own(new MeshStandardMaterial({ map: tex(paintOffice(3)), roughness: 0.4, metalness: 0.2 }))
      for (let i = 0; i < 9; i++) {
        const h = 40 + rand() * 60
        const bw2 = 14 + rand() * 8
        const bz = rand() * 30
        const bx = -80 + i * 20
        mesh(LM, cubeUV(new BoxGeometry(bw2, h, 14), 1 / 6), om, bx, h / 2, bz)
        B(LM, bw2 + 0.6, 1.2, 14.6, '#9aa6b8', bx, h + 0.6, bz)
        if (i % 3 === 0) P(LM, pole(0.3, 0, 10, 6), '#c8ccd4', bx, h + 1.2, bz)
      }
      // a stepped art-deco tower with setback ledges, corner fins, a crown and a spire
      let y = 0
      for (const [w2, h2] of [[30, 70], [22, 40], [14, 30], [8, 18]]) {
        mesh(LM, cubeUV(new BoxGeometry(w2, h2, w2), 1 / 5), om, 0, y + h2 / 2, 10)
        for (const [fx, fz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B(LM, 1.2, h2, 1.2, '#b8c2d2', (fx * w2) / 2, y + h2 / 2, 10 + (fz * w2) / 2)
        y += h2
        B(LM, w2 + 1.2, 1.4, w2 + 1.2, '#c8d0dc', 0, y, 10)
      }
      for (let k = 0; k < 3; k++) P(LM, rbox(7 - k * 2, 3, 7 - k * 2, 0.8, 1), '#d8dee8', 0, y + 1.5 + k * 3, 10)
      P(LM, new CylinderGeometry(0.4, 1.6, 30, 8), '#c8ccd4', 0, y + 9 + 15, 10)
      P(LM, pole(0.15, 0, 12, 5), '#c8ccd4', 0, y + 39, 10)
    } else if (style.landmark === 'bigben') {
      const gt = tex(paintGothic())
      const st = own(new MeshStandardMaterial({ map: gt, roughness: 0.8 }))
      const STONE = '#c9ad74'
      mesh(LM, cubeUV(new BoxGeometry(14, 90, 14), 1 / 7), st, 0, 45, 0)
      for (const [fx, fz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B(LM, 1.8, 92, 1.8, '#d8bf86', fx * 7, 46, fz * 7)
      for (const y of [30, 60, 90]) B(LM, 15, 1, 15, '#b39760', 0, y, 0)
      // clock stage: four faces in gilded frames
      mesh(LM, cubeUV(new BoxGeometry(16, 16, 16), 1 / 8), st, 0, 100, 0)
      const ct = tex(paintClock())
      const clockMat = own(new MeshStandardMaterial({ map: ct, emissiveMap: ct, emissive: '#ffffff', emissiveIntensity: 0.3 }))
      for (let k = 0; k < 4; k++) {
        const a = (k * Math.PI) / 2
        mesh(LM, new PlaneGeometry(13, 13), clockMat, Math.sin(a) * 8.05, 100, Math.cos(a) * 8.05, 0, a, 0)
        P(LM, new ConeGeometry(4, 4, 4), STONE, Math.sin(a) * 7, 109.5, Math.cos(a) * 7, 0, a + Math.PI / 4, 0)
      }
      for (const [fx, fz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        P(LM, new ConeGeometry(0.9, 6, 6), STONE, fx * 7.6, 111, fz * 7.6)
        P(LM, new ConeGeometry(1.2, 10, 6), '#3a4a5a', fx * 6, 123, fz * 6)
      }
      // belfry with dark arches, the spire, a lantern + gilt finial
      B(LM, 15, 10, 15, STONE, 0, 113, 0)
      for (let k = 0; k < 4; k++) {
        const a = (k * Math.PI) / 2
        for (const o of [-3.5, 0, 3.5]) B(LM, 2.4, 6.5, 0.2, '#2a2a30', Math.sin(a) * 7.55 + Math.cos(a) * o, 113, Math.cos(a) * 7.55 - Math.sin(a) * o, a)
      }
      P(LM, new ConeGeometry(11, 30, 4), '#3a4a5a', 0, 133, 0, 0, Math.PI / 4, 0)
      B(LM, 2.2, 3, 2.2, '#c9a54a', 0, 149, 0)
      P(LM, new ConeGeometry(0.9, 6, 6), '#c9a54a', 0, 153.5, 0)
      // the palace, with a pitched roof and a row of pinnacles
      mesh(LM, cubeUV(new BoxGeometry(120, 30, 20), 1 / 7), st, 50, 15, 10)
      P(LM, prism(20, 8, 120).rotateY(Math.PI / 2), '#4a5a6a', 50, 30, 10)
      for (let x = -6; x <= 106; x += 8) P(LM, new ConeGeometry(0.8, 6, 6), STONE, x, 33, 0)
    } else if (style.landmark === 'eiffel') {
      const IRONB = '#6b5440'
      const lat = own(new MeshStandardMaterial({ map: tex(paintLattice()), color: IRONB, alphaTest: 0.5, side: DoubleSide, roughness: 0.6, metalness: 0.3 }))
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const leg = mesh(LM, scaleUV(new CylinderGeometry(2.4, 4, 62, 4, 1, true), 4, 10), lat, sx * 22, 30, sz * 22)
        leg.rotation.set(sz * 0.38, Math.PI / 4, -sx * 0.38, 'XZY')
      }
      // first-floor arches + platform with a railing band
      for (let k = 0; k < 4; k++) {
        const a = (k * Math.PI) / 2
        P(LM, new TorusGeometry(17, 0.9, 4, 18, Math.PI), IRONB, Math.sin(a) * 21, 38, Math.cos(a) * 21, 0, a, 0)
      }
      B(LM, 50, 4, 50, IRONB, 0, 58, 0)
      mesh(LM, scaleUV(new CylinderGeometry(35.5, 35.5, 2.4, 4, 1, true), 16, 1), lat, 0, 61.2, 0, 0, Math.PI / 4, 0)
      mesh(LM, scaleUV(new CylinderGeometry(6, 16, 70, 4, 1, true), 4, 12), lat, 0, 95, 0, 0, Math.PI / 4, 0)
      B(LM, 20, 3, 20, IRONB, 0, 128, 0)
      mesh(LM, scaleUV(new CylinderGeometry(0.6, 6, 80, 4, 1, true), 4, 14), lat, 0, 170, 0, 0, Math.PI / 4, 0)
      B(LM, 3.4, 4, 3.4, IRONB, 0, 196, 0)
      P(LM, pole(0.3, 0, 12, 5), IRONB, 0, 198, 0)
      LM.position.x = 40
    } else if (style.landmark === 'tower') {
      const lt = tex(paintLattice())
      const latR = own(new MeshStandardMaterial({ map: lt, color: '#e84a2a', alphaTest: 0.5, side: DoubleSide, roughness: 0.5 }))
      const latW = own(new MeshStandardMaterial({ map: lt, color: '#f4f4f4', alphaTest: 0.5, side: DoubleSide, roughness: 0.5 }))
      let y = 0
      const segs = 9
      for (let i = 0; i < segs; i++) {
        const r0 = 26 * (1 - i / segs) + 1.5
        const r1 = 26 * (1 - (i + 1) / segs) + 1.5
        const s = mesh(LM, scaleUV(new CylinderGeometry(r1, r0, 18, 4, 1, true), 4 * Math.max(1, Math.round(r0 / 6)), 4), i % 2 ? latW : latR, 0, y + 9, 0)
        s.rotation.y = Math.PI / 4
        y += 18
        if (i === 3 || i === 6) {
          B(LM, r1 * 1.6, 5, r1 * 1.6, '#f4f4f4', 0, y, 0)
          mesh(LM, new BoxGeometry(r1 * 1.62, 2, r1 * 1.62), M.glass, 0, y + 0.4, 0)
          B(LM, r1 * 1.7, 0.4, r1 * 1.7, '#e84a2a', 0, y + 2.6, 0)
        }
      }
      for (let k = 0; k < 4; k++) P(LM, new CylinderGeometry(0.5 - k * 0.1, 1.2 - k * 0.15, 6.5, 6), k % 2 ? '#f4f4f4' : '#e84a2a', 0, y + 3.25 + k * 6.5, 0)
      LM.position.x = -30
    } else if (style.landmark === 'pyramids') {
      const sm = own(new MeshStandardMaterial({ map: tex(paintSteps()), roughness: 0.95 }))
      for (const [x, z, s] of [[-40, 0, 1], [40, 40, 0.8], [110, 80, 0.55]]) {
        mesh(LM, scaleUV(new ConeGeometry(70 * s, 90 * s, 4, 1, true), 24 * s, 6 * s), sm, x, 45 * s, z, 0, Math.PI / 4, 0)
        if (s === 1) P(LM, new ConeGeometry(14, 18, 4), '#ecdcb4', x, 81, z, 0, Math.PI / 4, 0) // casing stones at the tip
      }
      // a blocky sphinx on guard
      const SAND = '#cfae72'
      B(LM, 8, 5, 24, SAND, -95, 2.5, -20)
      B(LM, 7, 7, 7, SAND, -95, 7, -32)
      B(LM, 9, 4, 3, '#2a6a9a', -95, 8.5, -32)
      for (const s of [-1, 1]) B(LM, 2.4, 2, 10, SAND, -95 + s * 3, 1, -36)
      LM.position.z += 60
    } else if (style.landmark === 'colosseum') {
      // three arcaded tiers all round, the attic storey only on the far side (the near one fell)
      const STONE = '#d9bc8c'
      const arc = own(new MeshStandardMaterial({ map: tex(paintArcade(STONE)), roughness: 0.9, side: DoubleSide }))
      const ringWall = (r, h, y0, t0, tl, perRing, tiers) => {
        const g = scaleUV(new CylinderGeometry(r, r, h, 72, 1, true, t0, tl), (perRing * tl) / (Math.PI * 2), tiers)
        mesh(LM, g, arc, 0, y0 + h / 2, 0).scale.z = 0.78
      }
      ringWall(100, 66, 0, 0, Math.PI * 2, 64, 3)
      ringWall(100, 22, 66, -Math.PI * 0.6, Math.PI * 1.2, 64, 1)
      ringWall(80, 56, 0, 0, Math.PI * 2, 52, 3) // the inner ring, seen through the gap
      for (const y of [66, 44, 22]) P(LM, new TorusGeometry(100.7, 0.9, 4, 72).rotateX(Math.PI / 2), dk(STONE, 1.05), 0, y, 0).scale.z = 0.78
      for (const [x, z, s] of [[-130, -40, 1.4], [-150, 20, 1.2], [135, -30, 1.5], [160, 30, 1.2], [-115, 70, 1.1]]) umbrellaPine(x, z, s)
      for (const [x, z] of [[-118, -55], [118, -60], [142, -50]]) cypress(x, z, 1.6)
      LM.position.z += 50
    } else if (style.landmark === 'opera') {
      // tiled shells on a granite podium + the harbour bridge's steel arch off to the left
      const TILE = '#f6f3ea'
      B(LM, 200, 16, 110, '#c49a74', 0, 8, 0)
      B(LM, 90, 3, 20, '#b88f68', 0, 17.5, -44)
      // a sail = a quarter of a sphere (bulging toward -X, its flat back edge vertical), seen side-on;
      // pairs stand back to back, stepping down in size along the podium
      const sail = tint(new SphereGeometry(1, 20, 10, -Math.PI / 2, Math.PI, 0, Math.PI / 2), TILE)
      const shell = (x, z, s, back, lean) => {
        const m = mesh(LM, sail, M.frond, x, 16, z, 0, back ? Math.PI : 0, back ? -lean : lean)
        m.scale.set(s * 0.95, s * 1.45, s * 0.5)
      }
      for (const [z, k0, xs] of [[-12, 1.45, [52, 12, -20, -45]], [26, 1.1, [36, 8, -16, -35]]]) {
        ;[34, 29, 23, 16].forEach((s0, k) => {
          const s = s0 * k0
          shell(xs[k], z, s, false, 0.12)
          shell(xs[k], z, s * 0.62, true, 0.12)
        })
      }
      const STEELB = '#8a929c'
      const bx = -200
      const bz = 40
      P(LM, new TorusGeometry(90, 2.4, 6, 48, Math.PI), STEELB, bx, 0, bz)
      P(LM, new TorusGeometry(81, 1.6, 6, 48, Math.PI), STEELB, bx, 0, bz)
      B(LM, 260, 3, 16, '#5d6470', bx, 34, bz)
      for (let x = -77; x <= 77; x += 11) {
        const top = Math.sqrt(90 * 90 - x * x)
        B(LM, 0.8, top - 35, 0.8, STEELB, bx + x, (top + 35) / 2, bz)
      }
      for (const s of [-1, 1]) {
        B(LM, 13, 54, 18, '#c9b38f', bx + s * 98, 27, bz)
        B(LM, 14, 3, 19, '#b8a07c', bx + s * 98, 54, bz)
      }
    } else if (style.landmark === 'burj') {
      // three wings stepping back around a core in a spiral, then a long spire; towers around it
      const om = own(new MeshStandardMaterial({ map: tex(paintOffice(11)), roughness: 0.25, metalness: 0.45, color: '#dfe8f2' }))
      let y = 0
      const tiers = [[30, 48], [27, 42], [23, 38], [19, 34], [15, 30], [11, 26], [8, 22], [5, 18]]
      tiers.forEach(([len, h], i) => {
        P(LM, new CylinderGeometry(len * 0.3, len * 0.32, h, 6), '#dfe6ee', 0, y + h / 2, 0)
        for (let k = 0; k < 3; k++) {
          const a = (k * Math.PI * 2) / 3
          const l = len * (1 - 0.18 * ((i + k) % 3) / 2)
          const wing = mesh(LM, cubeUV(new BoxGeometry(Math.max(4, 10 - i), h, l), 1 / 6), om, Math.sin(a) * l * 0.5, y + h / 2, Math.cos(a) * l * 0.5)
          wing.rotation.y = a
        }
        y += h
      })
      P(LM, pole(3, 0, 70, 8, 0.4), '#e8eef4', 0, y, 0)
      const om2 = own(new MeshStandardMaterial({ map: tex(paintOffice(5)), roughness: 0.35, metalness: 0.3 }))
      for (const [x, z, w2, h2] of [[-90, 30, 22, 120], [-130, 70, 18, 90], [-60, 90, 16, 150], [80, 40, 20, 110], [125, 10, 24, 80], [100, 95, 18, 140], [160, 70, 16, 100]]) {
        mesh(LM, cubeUV(new BoxGeometry(w2, h2, w2), 1 / 6), om2, x, h2 / 2, z)
        P(LM, new ConeGeometry(w2 * 0.4, 14, 4), '#c8d0dc', x, h2 + 7, z, 0, Math.PI / 4, 0)
      }
      LM.position.z += 60
    } else if (style.landmark === 'christ') {
      // the statue with open arms on a green peak; the rounded sugarloaf rock beyond
      const PEAK = 128
      mountain(-30, 30, 95, PEAK + 2, '#3f7a3a')
      const sx = -30
      const sz = 30
      const STAT = '#ece6d8'
      B(LM, 7, 9, 7, '#d8d0c0', sx, PEAK - 2, sz)
      P(LM, pole(3.2, 0, 24, 10, 1.8), STAT, sx, PEAK + 2.5, sz)
      B(LM, 36, 3.2, 3, STAT, sx, PEAK + 22, sz)
      P(LM, new SphereGeometry(2.3, 12, 8), STAT, sx, PEAK + 28.5, sz)
      const rock = tint(new IcosahedronGeometry(1, 2), '#6a7a5a')
      mesh(LM, rock, M.leaf, 130, 0, 80).scale.set(42, 105, 46)
      mesh(LM, rock, M.leaf, 190, 0, 60).scale.set(36, 48, 36)
      mountain(-170, 120, 90, 80, '#4a8a42')
      LM.position.z += 40
    } else if (style.landmark === 'windmill') {
      // a big smock mill (sails turn), a little one, and a brick church tower with a crown
      const sails = latOf('#efe6d4')
      const mill = (x, z, s, speed) => {
        P(LM, new CylinderGeometry(12 * s, 12 * s, 4 * s, 8), '#7a3a2a', x, 2 * s, z)
        P(LM, new CylinderGeometry(7 * s, 11 * s, 34 * s, 8), '#3a4a3a', x, 4 * s + 17 * s, z)
        P(LM, new CylinderGeometry(13.5 * s, 13.5 * s, 0.8 * s, 8), '#6a4a32', x, 14 * s, z)
        P(LM, lathe([[7.6, 0], [7.6, 2], [5.4, 6], [2, 8.6], [0, 9]].map(([r, h]) => [r * s, h * s]), 8), '#5a3a2a', x, 38 * s, z)
        const hub = new Group()
        hub.position.set(x, 42 * s, z - 12 * s)
        dyn.add(hub)
        P(LM, new CylinderGeometry(0.9 * s, 0.9 * s, 6 * s, 8).rotateX(Math.PI / 2), '#3a2a20', x, 42 * s, z - 9 * s) // axle out of the cap
        for (let k = 0; k < 4; k++) {
          const arm = new Group()
          arm.rotation.z = (k * Math.PI) / 2
          hub.add(arm)
          P(arm, new BoxGeometry(0.8 * s, 34 * s, 0.8 * s), '#5a3a2a', 0, 17 * s, 0)
          mesh(arm, scaleUV(new PlaneGeometry(5 * s, 26 * s), 1, 5), sails, 3 * s, 20 * s, 0)
        }
        P(hub, new CylinderGeometry(1.4 * s, 1.4 * s, 3 * s, 8).rotateX(Math.PI / 2), '#3a2a20', 0, 0, 0)
        spin.push({ o: hub, speed })
      }
      mill(0, 20, 1.55, 0.35)
      mill(110, 70, 0.9, 0.5)
      const BRICK = '#7a3a2a'
      B(LM, 14, 50, 14, BRICK, -95, 25, 40)
      B(LM, 11, 14, 11, '#d8cfc0', -95, 57, 40)
      P(LM, new CylinderGeometry(4.5, 5, 12, 8), '#d8cfc0', -95, 70, 40)
      P(LM, lathe([[5, 0], [5.2, 2], [3, 6], [0.6, 12], [0, 13]], 8), '#2a4a7a', -95, 76, 40)
      Pm(LM, new SphereGeometry(1.1, 8, 6), '#e0b040', -95, 90, 40)
      B(LM, 40, 26, 30, BRICK, -95, 13, 70)
      P(LM, prism(30, 16, 40).rotateY(Math.PI / 2), '#3a2e2a', -95, 26, 70)
      LM.position.z += 20
    } else if (style.landmark === 'prang') {
      // a temple's porcelain-studded central prang with four small ones, and a hall with stacked roofs
      const prang = (x, z, s) => {
        let y = 0
        const tiers = [[16, 8], [13.5, 6], [12, 14], [10, 5], [8.6, 12], [7, 5], [5.6, 9], [4.2, 5], [3, 6], [1.8, 5]]
        tiers.forEach(([r, h], i) => {
          P(LM, new CylinderGeometry(r * 0.86 * s, r * s, h * s, 8), i % 2 ? '#ece5d4' : '#ddd3bb', x, (y + h / 2) * s, z, 0, Math.PI / 8, 0)
          P(LM, new CylinderGeometry(r * 0.9 * s, r * 0.92 * s, 0.9 * s, 8), ['#2a8a9a', '#c84a3a', '#e8b83a'][i % 3], x, (y + h) * s, z, 0, Math.PI / 8, 0)
          y += h
        })
        Pm(LM, new ConeGeometry(1.3 * s, 11 * s, 8), '#e8b83a', x, (y + 5.5) * s, z)
        Pm(LM, pole(0.25 * s, 0, 7 * s, 6), '#e8b83a', x, (y + 11) * s, z)
      }
      prang(0, 30, 1.4)
      for (const [x, z] of [[-62, -6], [62, -6], [-62, 70], [62, 70]]) prang(x, z, 0.62)
      const hx = -125
      B(LM, 44, 6, 74, '#f2ede2', hx, 3, 20)
      B(LM, 34, 14, 62, '#f6f1e6', hx, 13, 20)
      const roofs = [[46, 16, 68, 20, '#c8502a'], [36, 12, 58, 29, '#2a7a4a'], [26, 9, 48, 36, '#c8502a']]
      for (const [w2, h2, l2, y2, col] of roofs) {
        P(LM, prism(w2, h2, l2), col, hx, y2, 20)
        B(LM, 0.8, 0.8, l2, '#e8b83a', hx, y2 + h2, 20)
        for (const s of [-1, 1]) Pm(LM, new ConeGeometry(0.6, 6, 6), '#e8b83a', hx, y2 + h2 + 2, 20 + s * l2 * 0.5)
      }
      LM.position.z += 40
    } else if (style.landmark === 'hallgrim') {
      // a concrete church whose tower steps down like basalt columns; snowy mountains behind
      const CON = '#c9ccd0'
      B(LM, 14, 76, 12, CON, 0, 38, 0)
      for (let i = 1; i <= 7; i++) {
        const h2 = 76 - i * 9.5
        for (const s of [-1, 1]) B(LM, 3.6, h2, 10, dk(CON, 1 - i * 0.025), s * (7 + i * 3.6 - 1.8), h2 / 2, 1)
      }
      P(LM, new ConeGeometry(7.5, 16, 4), CON, 0, 84, 0, 0, Math.PI / 4, 0)
      B(LM, 0.6, 6, 0.6, '#9aa0a8', 0, 94, 0)
      B(LM, 3.4, 0.6, 0.6, '#9aa0a8', 0, 94.5, 0)
      for (const y of [30, 46, 62]) B(LM, 1.4, 9, 0.3, '#3a4048', 0, y, -6.1)
      mesh(LM, new CircleGeometry(2.4, 16), M.glass, 0, 70, -6.15, 0, Math.PI, 0)
      B(LM, 22, 26, 60, CON, 0, 13, 36)
      P(LM, prism(22, 9, 60), '#8a929c', 0, 26, 36)
      mountain(-170, 220, 150, 120, '#5a6470', 0.4)
      mountain(30, 260, 180, 150, '#606a76', 0.45)
      mountain(220, 230, 140, 110, '#56606c', 0.4)
      LM.position.z += 30
    } else if (style.landmark === 'goldengate') {
      // two art-deco towers, the deck, the main cables' curve, hangers, brown hills behind
      const RED = '#c8432c'
      const TX = 90
      const TOP = 158
      const DECK = 48
      for (const tx of [-TX, TX]) {
        for (const s of [-1, 1]) {
          B(LM, 8, TOP, 8, RED, tx, TOP / 2, s * 10)
          B(LM, 5, TOP * 0.6, 5, dk(RED, 0.9), tx, TOP * 0.3, s * 11.2)
        }
        for (const y of [DECK + 22, DECK + 46, DECK + 68, TOP - 6]) B(LM, 5, 7, 24, RED, tx, y, 0)
      }
      B(LM, 560, 4, 22, RED, 0, DECK, 0)
      B(LM, 560, 5, 19, dk(RED, 0.75), 0, DECK - 4.4, 0)
      const cableY = (x) => {
        const ax = Math.abs(x)
        if (ax <= TX) return DECK + 6 + (TOP - DECK - 6) * (x / TX) ** 2
        const t = (ax - TX) / (280 - TX)
        return TOP + (DECK + 2 - TOP) * t - 10 * Math.sin(Math.PI * t)
      }
      for (const s of [-1, 1]) {
        let px = -280
        for (let x = -270; x <= 280; x += 10) {
          beam(px, cableY(px), x, cableY(x), s * 10, 1.4, RED)
          px = x
        }
        for (let x = -270; x <= 270; x += 10) {
          if (Math.abs(Math.abs(x) - TX) < 4) continue
          const top = cableY(x)
          B(LM, 0.35, top - DECK, 0.35, RED, x, (top + DECK) / 2, s * 10)
        }
      }
      for (const tx of [-280, 280]) B(LM, 16, DECK + 4, 30, '#9a9a90', tx, DECK / 2, 0)
      mountain(-260, 220, 150, 80, '#9a8a5a')
      mountain(60, 260, 190, 100, '#8a8a58')
      mountain(300, 200, 140, 70, '#7a8a52')
      LM.rotation.y = 0.42
      LM.position.x = 30
    } else if (style.landmark === 'koutoubia') {
      // a square red-stone minaret with a lantern and three gilt balls; the snowy Atlas behind
      const mt = own(new MeshStandardMaterial({ map: tex(paintMinaret()), roughness: 0.9 }))
      mesh(LM, cubeUV(new BoxGeometry(18, 72, 18), 1 / 9), mt, 0, 36, 0)
      B(LM, 19, 2.6, 19, '#2a8a6a', 0, 72.6, 0)
      for (let k = 0; k < 4; k++) {
        const a = (k * Math.PI) / 2
        for (let o = -7.5; o <= 7.6; o += 3.75) B(LM, 1.6, 2.4, 1.6, '#c98a5a', Math.sin(a) * 8.6 + Math.cos(a) * o, 75, Math.cos(a) * 8.6 - Math.sin(a) * o)
      }
      mesh(LM, cubeUV(new BoxGeometry(9, 12, 9), 1 / 9), mt, 0, 80, 0)
      B(LM, 9.8, 1.4, 9.8, '#2a8a6a', 0, 86.4, 0)
      P(LM, lathe(domePts(4.8, 4.6), 12), '#2a8a6a', 0, 87, 0)
      Pm(LM, pole(0.3, 0, 12, 6), '#d9a83a', 0, 91, 0)
      for (const [y, r] of [[94, 1.5], [97.2, 1.2], [99.8, 0.9]]) Pm(LM, new SphereGeometry(r, 10, 8), '#e0b040', 0, y, 0)
      B(LM, 90, 15, 60, '#d6a06e', 50, 7.5, 34)
      for (let x = 10; x <= 90; x += 10) P(LM, prism(9, 4, 60), '#2a7a5a', x, 15, 34)
      for (const [x, z, s] of [[-50, -10, 1], [-70, 20, 1.2], [110, -10, 1.1]]) {
        P(LM, pole(0.8 * s, 0, 22 * s, 8, 0.6 * s), '#8a6a4a', x, 0, z)
        mesh(LM, tint(new IcosahedronGeometry(1, 1), '#4a7a3a'), M.leaf, x, 23 * s, z).scale.set(7 * s, 3 * s, 7 * s)
      }
      mountain(-190, 300, 190, 140, '#a07656', 0.3)
      mountain(40, 340, 230, 170, '#9a7050', 0.32)
      mountain(270, 300, 170, 120, '#a47a5a', 0.28)
      LM.position.z += 20
    } else if (style.landmark === 'namsan') {
      // the tower on its wooded mountain + a palace gate with a two-tier tiled roof
      mountain(0, 50, 120, 76, '#4a7a3a')
      const ty = 74
      P(LM, pole(3.6, 0, 52, 12, 2.4), '#f2f2f2', 0, ty, 50)
      P(LM, lathe([[2.4, 0], [9, 3], [9.8, 6], [9.4, 10], [7, 13], [2.2, 14]], 16), '#e8e8ea', 0, ty + 50, 50)
      mesh(LM, new CylinderGeometry(9.9, 9.9, 2.6, 16), M.glass, 0, ty + 57.5, 50)
      for (let k = 0; k < 5; k++) P(LM, pole(1.3 - k * 0.18, 0, 5, 8, 1.15 - k * 0.18), k % 2 ? '#f4f4f4' : '#d6232e', 0, ty + 64 + k * 5, 50)
      const gx = -75
      B(LM, 54, 15, 18, '#b8b0a0', gx, 7.5, -20)
      for (const ox of [-14, 0, 14]) B(LM, 7, 10, 0.4, '#2a2a2a', gx + ox, 5, -29.1)
      B(LM, 42, 9, 12, '#a83a2a', gx, 19.5, -20)
      B(LM, 43, 1.4, 12.6, '#2a7a5a', gx, 23.5, -20)
      P(LM, prism(20, 7, 56).rotateY(Math.PI / 2), '#3a3f48', gx, 24.2, -20)
      B(LM, 30, 5, 9, '#a83a2a', gx, 29.5, -20)
      P(LM, prism(15, 6, 40).rotateY(Math.PI / 2), '#3a3f48', gx, 31.8, -20)
      mountain(-220, 240, 150, 120, '#6a7060')
      mountain(200, 270, 170, 130, '#646a5c')
      LM.position.z += 20
    } else if (style.landmark === 'angel') {
      // a tall victory column with a golden winged figure; snow-capped volcanoes far behind
      const ST = '#e2dccd'
      const GOLD = '#e0b040'
      P(LM, rbox(32, 6, 32, 0.4, 1), '#cfc6b4', 0, 3, 0)
      P(LM, rbox(22, 7, 22, 0.4, 1), '#d8d0c0', 0, 9.5, 0)
      for (const [x, z] of [[-13, -13], [13, -13], [-13, 13], [13, 13]]) P(LM, rbox(4, 5, 4, 0.3, 1), '#3a3a3a', x, 8.5, z)
      P(LM, pole(3.4, 13, 76, 16, 2.9), ST, 0, 0, 0)
      for (const y of [28, 44, 60]) Pm(LM, new TorusGeometry(3.35, 0.45, 6, 16).rotateX(Math.PI / 2), GOLD, 0, y, 0)
      P(LM, rbox(8, 3, 8, 0.3, 1), ST, 0, 77.5, 0)
      Pm(LM, pole(1.5, 0, 9, 8, 0.7), GOLD, 0, 79, 0)
      Pm(LM, new SphereGeometry(1, 8, 6), GOLD, 0, 89, 0)
      for (const s of [-1, 1]) Pm(LM, new BoxGeometry(0.5, 10, 4), GOLD, s * 2.6, 86, 1.6, 0.35, 0, s * 0.55)
      Pm(LM, new BoxGeometry(0.4, 6, 0.4), GOLD, 1.2, 91, 0, 0, 0, -0.2)
      Pm(LM, new TorusGeometry(1.3, 0.25, 6, 14), GOLD, 1.8, 94.5, 0)
      mountain(-130, 250, 140, 120, '#6a6a70', 0.28)
      mountain(130, 260, 150, 130, '#706e74', 0.3)
      LM.scale.setScalar(1.3)
      LM.position.z += 20
    } else if (style.landmark === 'table') {
      // the flat-topped mountain with its tablecloth of cloud, and the peaks either side
      const mtn = new Shape()
      mtn.moveTo(-280, 0)
      mtn.lineTo(-220, 60)
      mtn.lineTo(-180, 104)
      mtn.lineTo(-60, 108)
      mtn.lineTo(80, 110)
      mtn.lineTo(180, 106)
      mtn.lineTo(215, 70)
      mtn.lineTo(280, 0)
      mtn.closePath()
      mesh(LM, tint(new ExtrudeGeometry(mtn, { depth: 70, bevelEnabled: false }), '#857e6c'), M.leaf, 0, -1, 60)
      const foot = new Shape()
      foot.moveTo(-320, 0)
      foot.lineTo(-250, 40)
      foot.lineTo(250, 46)
      foot.lineTo(320, 0)
      foot.closePath()
      mesh(LM, tint(new ExtrudeGeometry(foot, { depth: 40, bevelEnabled: false }), '#5a7a3a'), M.leaf, 0, -1, 40)
      const cloudGeo = tint(new IcosahedronGeometry(1, 1), '#ffffff')
      for (let x = -170; x <= 170; x += 26) mesh(LM, cloudGeo, M.leaf, x, 111, 70 + (x % 3) * 4, 0, x, 0).scale.set(22, 6 + Math.abs(Math.sin(x)) * 4, 26)
      mountain(320, 40, 55, 100, '#7a7464')
      mountain(-330, 70, 80, 120, '#7a7464')
      LM.scale.set(1, 1.4, 1)
      LM.position.z += 40
    } else if (style.landmark === 'mosque') {
      // a big lead dome on a drum, half-domes, corner domes and six pencil minarets
      const ST = '#ddd6c6'
      const LEAD = '#8a96a4'
      B(LM, 72, 26, 72, ST, 0, 13, 0)
      B(LM, 74, 2, 74, dk(ST, 0.9), 0, 26.5, 0)
      P(LM, new CylinderGeometry(20, 21, 9, 24), ST, 0, 31, 0)
      P(LM, lathe(domePts(21.5, 17), 24), LEAD, 0, 35.5, 0)
      Pm(LM, pole(0.4, 0, 8, 6), '#d9a83a', 0, 52, 0)
      // each half-dome bulges outward (+X before its turn)
      for (const [x, z, ry] of [[0, -18, Math.PI / 2], [0, 18, -Math.PI / 2], [-18, 0, Math.PI], [18, 0, 0]]) {
        P(LM, new SphereGeometry(14, 16, 8, Math.PI / 2, Math.PI, 0, Math.PI / 2), LEAD, x, 27, z, 0, ry, 0)
      }
      for (const [x, z] of [[-27, -27], [27, -27], [-27, 27], [27, 27]]) {
        P(LM, new CylinderGeometry(7, 7, 4, 12), ST, x, 28, z)
        P(LM, lathe(domePts(7.4, 6), 12), LEAD, x, 30, z)
      }
      B(LM, 72, 12, 70, ST, 0, 6, 74)
      const minaret = (x, z) => {
        P(LM, pole(2.4, 0, 74, 12, 1.8), ST, x, 0, z)
        for (const y of [36, 52, 66]) P(LM, new CylinderGeometry(3.2, 2.4, 1.4, 12), ST, x, y, z)
        P(LM, new ConeGeometry(2, 15, 12), LEAD, x, 81.5, z)
        Pm(LM, pole(0.2, 0, 4, 6), '#d9a83a', x, 89, z)
      }
      for (const [x, z] of [[-42, -42], [42, -42], [-42, 34], [42, 34], [-42, 112], [42, 112]]) minaret(x, z)
      mountain(-200, 160, 110, 40, '#6a8a5a')
      mountain(220, 180, 120, 46, '#6a8a5a')
      LM.scale.setScalar(1.5)
      LM.position.z += 30
    } else if (style.landmark === 'parthenon') {
      // a rocky acropolis with the colonnaded temple on top (a few columns long fallen)
      const MAR = '#e8dfcb'
      const hill = tint(jag(new CylinderGeometry(78, 104, 46, 12, 2), 0.12, 3), '#c4b48e')
      mesh(LM, hill, M.leaf, 0, 22, 20)
      const y0 = 45
      B(LM, 80, 1.6, 40, dk(MAR, 0.9), 0, y0 + 0.8, 20)
      B(LM, 76, 2, 36, MAR, 0, y0 + 2.6, 20)
      const col = tint(pole(1.3, 0, 18, 10, 1.05), MAR)
      const cap = tint(new BoxGeometry(3, 0.9, 3), MAR)
      const putCol = (x, z) => {
        mesh(LM, col, M.paint, x, y0 + 3.6, z)
        mesh(LM, cap, M.paint, x, y0 + 22, z)
      }
      for (let i = 0; i < 17; i++) {
        const x = -34 + i * 4.25
        putCol(x, 4.5)
        if (i !== 5 && i !== 6 && i !== 12) putCol(x, 35.5)
      }
      for (let i = 1; i < 7; i++) for (const x of [-34, 34]) putCol(x, 4.5 + i * 4.43)
      B(LM, 72, 4, 34, MAR, 0, y0 + 24.4, 20)
      B(LM, 73, 0.8, 35, dk(MAR, 0.92), 0, y0 + 26.6, 20)
      P(LM, prism(34, 6.5, 72).rotateY(Math.PI / 2), MAR, 0, y0 + 27, 20)
      for (const [x, z] of [[-60, -10], [65, -5], [-75, 40]]) cypress(x, z, 1.1)
      LM.rotation.y = -0.38
      LM.scale.setScalar(1.25)
      LM.position.z += 30
    } else if (style.landmark === 'marina') {
      // three hotel towers under one long sky-park deck, a big wheel (it turns) and glowing supertrees
      const om = own(new MeshStandardMaterial({ map: tex(paintOffice(17)), roughness: 0.25, metalness: 0.4, color: '#e6eef6' }))
      for (const x of [-42, 0, 42]) {
        mesh(LM, cubeUV(new BoxGeometry(24, 120, 16), 1 / 6), om, x, 60, 0)
        mesh(LM, cubeUV(new BoxGeometry(14, 110, 16), 1 / 6), om, x + 12, 55, 0).rotation.z = -0.06
      }
      P(LM, rbox(156, 5, 24, 2, 1), '#eef2f6', 12, 123, 0)
      B(LM, 156.4, 1.4, 24.4, '#7ab8e0', 12, 125.8, 0)
      for (let x = -55; x <= 70; x += 14) mesh(LM, tint(new IcosahedronGeometry(1, 0), '#3a8a3a'), M.leaf, x, 127.5, (x % 28 ? 5 : -5)).scale.set(3, 2.6, 3)
      const wheel = new Group()
      wheel.position.set(140, 70, 40)
      dyn.add(wheel)
      const WH = '#eef2f6'
      for (const dz of [-2.5, 2.5]) P(wheel, new TorusGeometry(56, 1, 6, 64), WH, 0, 0, dz)
      for (let k = 0; k < 16; k++) P(wheel, new BoxGeometry(0.6, 112, 0.6), '#c8d0dc', 0, 0, 0, 0, 0, (k * Math.PI) / 16)
      for (let k = 0; k < 28; k++) {
        const a = (k / 28) * Math.PI * 2
        P(wheel, rbox(4, 3, 7, 0.8, 1), '#9ad0f0', Math.cos(a) * 57, Math.sin(a) * 57, 0)
      }
      P(wheel, new CylinderGeometry(3, 3, 8, 12).rotateX(Math.PI / 2), '#8a929c', 0, 0, 0)
      spin.push({ o: wheel, speed: 0.04 })
      for (const s of [-1, 1]) beam(140 + s * 34, 0, 140, 70, 40 + s * 4, 2.2, '#c8d0dc')
      const lat = latOf('#8a3a9a')
      for (const [x, z, h] of [[-130, 30, 42], [-108, 62, 56], [-150, 72, 48], [-92, 18, 36], [-170, 30, 38]]) {
        mesh(LM, scaleUV(new CylinderGeometry(10, 2.4, h, 10, 1, true), 6, 4), lat, x, h / 2, z)
        P(LM, pole(2.2, 0, h, 8, 1.6), '#5a2a6a', x, 0, z)
        mesh(LM, new TorusGeometry(10, 0.5, 4, 24).rotateX(Math.PI / 2), neonMat('#ff6ad8', 1.6), x, h, z)
      }
      LM.position.z += 40
    } else if (style.landmark === 'taj') {
      // white marble: a plinth, the chamfered hall with iwans, the onion dome, chattris, minarets
      const MAR = '#f3efe7'
      const iw = own(new MeshStandardMaterial({ map: tex(paintIwan()), roughness: 0.6 }))
      B(LM, 120, 7, 120, '#ece4d6', 0, 3.5, 0)
      P(LM, new CylinderGeometry(36, 36, 38, 8), MAR, 0, 7 + 19, 0, 0, Math.PI / 8, 0)
      B(LM, 74, 1.2, 74, dk(MAR, 0.94), 0, 45.6, 0)
      const ap = 36 * Math.cos(Math.PI / 8) + 0.06
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4
        const big = k % 2 === 0
        mesh(LM, new PlaneGeometry(big ? 22 : 18, big ? 33 : 30), iw, Math.sin(a) * ap, 7 + (big ? 17.5 : 16), Math.cos(a) * ap, 0, a, 0)
      }
      P(LM, new CylinderGeometry(15.5, 15.5, 9, 24), MAR, 0, 50.5, 0)
      P(LM, lathe(onionPts(17.5, 34), 24), MAR, 0, 55, 0)
      Pm(LM, pole(0.5, 0, 10, 6), '#d9a83a', 0, 88, 0)
      for (const [y, r] of [[92, 1.2], [95, 0.9]]) Pm(LM, new SphereGeometry(r, 8, 6), '#d9a83a', 0, y, 0)
      for (const [x, z] of [[-21, -21], [21, -21], [-21, 21], [21, 21]]) {
        P(LM, new CylinderGeometry(5.2, 5.2, 6, 8), MAR, x, 49, z)
        P(LM, lathe(onionPts(5.6, 9), 12), MAR, x, 52, z)
      }
      for (const [x, z] of [[-54, -54], [54, -54], [-54, 54], [54, 54]]) {
        P(LM, pole(2.8, 0, 62, 12, 2.1), MAR, x, 7, z)
        for (const y of [27, 47, 67]) P(LM, new CylinderGeometry(3.8, 3.1, 1.3, 12), MAR, x, y, z)
        P(LM, new CylinderGeometry(2.6, 2.6, 4, 8), MAR, x, 71, z)
        P(LM, lathe(onionPts(3, 5), 10), MAR, x, 73, z)
      }
      for (const x of [-30, -18, 18, 30]) cypress(x, -78, 1)
      LM.scale.setScalar(1.25)
      LM.position.z += 40
    }
    S.add(LM)
    dyn.position.copy(LM.position)
    dyn.rotation.copy(LM.rotation)

    // --- Traffic: cars + taxis looping down the lanes; a few parked -----------------------------------
    const cars = []
    const lanes = [-5.2, -1.8, 1.8, 5.2]
    for (let i = 0; i < 10; i++) {
      const lane = lanes[i % 4]
      const isTaxi = rand() < 0.55
      const col = isTaxi ? style.taxi : ['#f2f2f2', '#15171c', '#2a62d8', '#8a8f9a', '#d8333b'][Math.floor(rand() * 5)]
      const car = makeCar({ color: col, taxi: isTaxi && style.taxi === '#ffcc12' })
      const dir = lane > 0 ? -1 : 1
      car.root.position.set(lane, Y - 0.15, -2 + rand() * (L1 - 20))
      car.root.rotation.y = dir > 0 ? 0 : Math.PI
      root.add(car.root)
      cars.push({ car, dir, speed: 6 + rand() * 6, lane })
    }
    if (style.bus) {
      // a double-decker: rounded decks, window bands with pillars, cream band, skirt, wheels, blind
      const bus = new Group()
      const RED = style.bus
      P(bus, rbox(2.5, 2.0, 10, 0.15, 1), RED, 0, 1.4, 0)
      P(bus, rbox(2.5, 2.1, 9.8, 0.3, 1), RED, 0, 3.45, -0.1)
      for (const [y, h] of [[1.9, 0.9], [3.6, 0.9]]) {
        mesh(bus, new BoxGeometry(2.54, h, 9.0), M.glass, 0, y, -0.2)
        for (let z = -4.2; z <= 4.21; z += 1.2) B(bus, 2.58, h, 0.14, RED, 0, y, z)
      }
      mesh(bus, new BoxGeometry(2.2, 1.3, 0.05), M.glass, 0, 1.9, 5.0)
      mesh(bus, new BoxGeometry(2.2, 0.9, 0.05), M.glass, 0, 3.6, 4.86)
      B(bus, 2.54, 0.12, 9.9, '#efe6d6', 0, 2.45, 0)
      B(bus, 2.56, 0.25, 10.05, IRON, 0, 0.42, 0)
      B(bus, 1.6, 0.32, 0.05, IRON, 0, 4.15, 4.9)
      mesh(bus, new BoxGeometry(1.4, 0.22, 0.02), neonMat('#ffd23b', 1.3), 0, 4.15, 4.93)
      for (const s of [-1, 1]) {
        mesh(bus, new BoxGeometry(0.3, 0.18, 0.04), M.lamp, s * 0.9, 0.8, 5.01)
        for (const z of [-3.4, 3.4]) {
          P(bus, new CylinderGeometry(0.5, 0.5, 0.3, 14), IRON, s * 1.15, 0.5, z, 0, 0, Math.PI / 2)
          Pm(bus, new CylinderGeometry(0.25, 0.25, 0.32, 10), STEEL, s * 1.15, 0.5, z, 0, 0, Math.PI / 2)
        }
      }
      const bb = bake(bus, true)
      bb.position.set(-5.2, Y - 0.15, 40)
      root.add(bb)
      cars.push({ car: { root: bb, wheels: [] }, dir: 1, speed: 5, lane: -5.2 })
    }

    // --- Bake the static parts ---------------------------------------------------------------------------
    const baked = bake(S, false)
    const casters = new Set([M.paint, M.metal, M.leaf, M.frond, railMat, ...bayMats.map((b) => b.m)])
    baked.traverse((o) => {
      if (o.isMesh) {
        o.receiveShadow = true
        o.castShadow = casters.has(o.material)
      }
    })
    root.add(baked)
    scene.add(root)
    built = { root, bodies, trash, cars, doorPanels, door: { x: O.x, z: O.z + tz + 0.3, k: 0 }, style, L1, spin }
    return built
  }

  return {
    get built() {
      return built
    },
    build,
    clear,
    spawn: () => ({ x: O.x + 0, y: O.y + 0.25, z: O.z - 22 }),
    get origin() {
      return O
    },
    update(dt, near) {
      if (!built) return
      for (const c of built.cars) {
        const r = c.car.root
        r.position.z += c.dir * c.speed * dt
        if (r.position.z > built.L1 - 12) r.position.z = -2
        if (r.position.z < -2) r.position.z = built.L1 - 12
        for (const w of c.car.wheels) w.rotation.x += (c.speed * dt) / 0.36
      }
      for (const s of built.spin) s.o.rotation.z += s.speed * dt
      const d = built.door
      d.k += Math.sign((near ? 1 : 0) - d.k) * Math.min(Math.abs((near ? 1 : 0) - d.k), dt * 2)
      const e = d.k * d.k * (3 - 2 * d.k)
      for (const p of built.doorPanels) p.position.x = p.userData.s * (0.75 + e * 1.4)
    },
  }
}
