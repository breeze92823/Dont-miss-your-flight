// In-flight food models (inflight.js orders them, the crew brings them, you eat them bite by bite).
// makeTray(cls) is the tray on your tray table (a fold-out table leaf on a pedestal in the bigger seats);
// makeDish(id) builds one dish from FLIGHT.menu (local origin: the dish's centre on the tray, +Y up,
// the diner sits at +Z). Each dish returns:
//   g        the Group to place on the tray
//   pieces   the parts you eat, in order (each bite flies one to your mouth); drinks have none
//   liquid   a drink's liquid (scale.y = how full it is, origin at the bottom of the glass)
//   drink    true: you lift the whole glass to sip
//   steam    local point steam puffs rise from (hot dishes), or null
//   fizz     local point bubbles rise from (fizzy drinks), or null
// Everything is a few rounded primitives in vertex colours (one shared material) plus one glass material.
import { BoxGeometry, BufferAttribute, Color, ConeGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, SphereGeometry, TorusGeometry, Vector3 } from 'three'
import { lathe, rbox } from '../detail.js'

const _c = new Color()
function tint(g, hex) {
  if (g.attributes.color) g = g.clone()
  _c.set(hex)
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
let mats = null
function M() {
  return (mats ??= {
    paint: new MeshStandardMaterial({ vertexColors: true, roughness: 0.5 }),
    shiny: new MeshStandardMaterial({ vertexColors: true, roughness: 0.18, metalness: 0.1 }),
    glass: new MeshStandardMaterial({ color: '#e8f4ff', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.38, depthWrite: false }),
    metal: new MeshStandardMaterial({ color: '#d9dee6', roughness: 0.22, metalness: 0.9 }),
  })
}
// put(parent, geo, hex, x, y, z, rx, ry, rz, mat) -> mesh
function put(parent, geo, hex, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, mat = 'paint') {
  const m = new Mesh(hex ? tint(geo, hex) : geo, hex ? M()[mat] : M()[mat])
  m.position.set(x, y, z)
  m.rotation.set(rx, ry, rz)
  m.castShadow = false
  parent.add(m)
  return m
}
const grp = (parent, x = 0, y = 0, z = 0) => {
  const g = new Group()
  g.position.set(x, y, z)
  parent.add(g)
  return g
}
const ball = (r, sx = 1, sy = 1, sz = 1, seg = 10) => new SphereGeometry(r, seg, Math.max(6, seg - 3)).scale(sx, sy, sz)
const cyl = (r0, r1, h, seg = 14) => new CylinderGeometry(r0, r1, h, seg)
const plate = (g, r, hex = '#ffffff', rim = '#e9edf3') => {
  put(g, lathe([[0, 0], [r * 0.7, 0], [r * 0.75, 0.008], [r, 0.02], [r * 0.98, 0.024], [r * 0.72, 0.012], [0, 0.012]], 22), hex, 0, 0, 0, 0, 0, 0, 'shiny')
  put(g, new TorusGeometry(r * 0.99, 0.003, 4, 26).rotateX(Math.PI / 2), rim, 0, 0.022, 0)
  return 0.014
}
const bowl = (g, r, h, hex = '#ffffff') => {
  put(g, lathe([[0, 0], [r * 0.55, 0], [r * 0.6, 0.006], [r * 0.95, h * 0.7], [r, h], [r * 0.93, h], [r * 0.55, 0.014], [0, 0.014]], 20), hex, 0, 0, 0, 0, 0, 0, 'shiny')
}
// A drinking glass: lathe profile of the outer wall ([r, y] bottom -> top), liquid inside up to `fill`.
function glassWith(g, prof, liquidHex, fill = 0.8, inset = 0.004) {
  put(g, lathe(prof, 18), null, 0, 0, 0, 0, 0, 0, 'glass')
  const y0 = prof[1][1] + 0.004
  const top = prof[prof.length - 1][1]
  const h = (top - y0) * fill
  // the liquid follows the inside of the wall (radius at each height, a little inset)
  const rAt = (y) => {
    for (let i = 1; i < prof.length; i++) {
      const [ra, ya] = prof[i - 1]
      const [rb, yb] = prof[i]
      if (y >= ya && y <= yb) return ra + ((rb - ra) * (y - ya)) / Math.max(1e-4, yb - ya)
    }
    return prof[prof.length - 1][0]
  }
  const pts = [[0, 0]]
  for (let i = 0; i <= 6; i++) {
    const y = (h * i) / 6
    pts.push([Math.max(0.002, rAt(y0 + y) - inset), y])
  }
  pts.push([0, h])
  const liquid = put(g, lathe(pts, 16), liquidHex)
  liquid.position.y = y0
  return liquid
}
const straw = (g, hex, x, y, z, tilt = 0.25, len = 0.2) => put(g, cyl(0.004, 0.004, len, 6), hex, x, y + len / 2, z, tilt, 0, tilt * 0.6)

// --- The tray -------------------------------------------------------------------------------------------
// cls 0..3. table > 0: a fold-out table leaf on a pedestal that tall under the tray.
export function makeTray(cls, table = 0) {
  const g = new Group()
  const fancy = cls <= 1
  if (table > 0) {
    put(g, rbox(0.62, 0.03, 0.46, 0.012, 1), fancy ? '#7a4a2a' : '#5a6170', 0, -0.016, 0)
    put(g, cyl(0.025, 0.04, table - 0.03, 8), '#8d949f', 0, -0.03 - (table - 0.03) / 2, 0.12)
  }
  put(g, rbox(0.5, 0.022, 0.36, 0.01, 1), fancy ? '#f4f0e6' : '#d9d2c3', 0, 0.011, 0)
  if (fancy) put(g, new BoxGeometry(0.48, 0.003, 0.34), '#fbfaf6', 0, 0.023, 0) // linen
  // cutlery on a napkin at the front edge
  put(g, new BoxGeometry(0.042, 0.004, 0.15), fancy ? '#e8d9b8' : '#ffffff', 0.226, 0.025, -0.05)
  put(g, new BoxGeometry(0.007, 0.004, 0.14), null, 0.218, 0.029, -0.05, 0, 0, 0, 'metal')
  put(g, new BoxGeometry(0.007, 0.004, 0.14), null, 0.234, 0.029, -0.05, 0, 0, 0, 'metal')
  g.userData.top = 0.024
  return g
}
// Where dishes go on the tray (x, z), first come first served; drinks prefer the back right.
export const TRAY_SLOTS = [
  { x: -0.12, z: 0.01 },
  { x: 0.1, z: -0.08 },
  { x: 0.18, z: 0.09 },
]

// --- Dishes --------------------------------------------------------------------------------------------
const BUILD = {
  chicken(g, d) {
    const y = plate(g, 0.1)
    const rice = grp(g, 0.035, y, 0.02)
    put(rice, ball(0.04, 1.1, 0.55, 1), '#f7f3e8', 0, 0.012, 0)
    for (let i = 0; i < 9; i++) put(rice, ball(0.007, 1, 1, 1, 6), '#fffdf6', Math.cos(i) * 0.03, 0.024, Math.sin(i * 1.3) * 0.03)
    const peas = grp(g, 0.03, y, -0.04)
    for (let i = 0; i < 8; i++) put(peas, ball(0.009, 1, 1, 1, 6), '#5cb84a', (i % 4) * 0.016 - 0.024, 0.008, Math.floor(i / 4) * 0.016)
    const legs = []
    for (const [x, z, r] of [[-0.045, -0.01, 0.4], [-0.03, 0.04, -0.5]]) {
      const leg = grp(g, x, y, z)
      leg.rotation.y = r
      put(leg, ball(0.03, 1.5, 0.85, 1.05), '#b0652a', 0, 0.025, 0)
      put(leg, ball(0.024, 1.4, 0.6, 0.9), '#d08a44', -0.004, 0.038, 0)
      put(leg, cyl(0.007, 0.009, 0.05, 6).rotateZ(Math.PI / 2), '#f2e6cf', 0.055, 0.022, 0)
      put(leg, ball(0.011, 1, 1, 1, 6), '#f2e6cf', 0.08, 0.022, 0)
      legs.push(leg)
    }
    d.pieces = [legs[0], peas, legs[1], rice]
    d.steam = new Vector3(0, 0.06, 0)
  },
  pasta(g, d) {
    bowl(g, 0.09, 0.045)
    put(g, cyl(0.075, 0.075, 0.008, 18), '#d2412a', 0, 0.036, 0)
    const pieces = []
    for (let i = 0; i < 10; i++) {
      const a = i * 2.39
      const r = 0.015 + (i % 4) * 0.014
      const p = put(g, cyl(0.007, 0.007, 0.03, 8), '#f1c75a', Math.cos(a) * r, 0.046 + (i % 3) * 0.006, Math.sin(a) * r, Math.PI / 2, a, 0.3)
      pieces.push(p)
    }
    const basil = put(g, ball(0.014, 1.4, 0.3, 1), '#3f9a3a', 0.01, 0.066, -0.01)
    const cheese = grp(g)
    for (let i = 0; i < 6; i++) put(cheese, new BoxGeometry(0.006, 0.003, 0.006), '#fff6d6', Math.cos(i * 2) * 0.03, 0.07, Math.sin(i * 2) * 0.03)
    d.pieces = [basil, cheese, ...pieces]
    d.steam = new Vector3(0, 0.08, 0)
  },
  sandwich(g, d) {
    plate(g, 0.095, '#ffffff')
    const half = (x, z, ry) => {
      const s = grp(g, x, 0.016, z)
      s.rotation.y = ry
      const tri = (hex, y, h) => put(s, cyl(0.065, 0.065, h, 3), hex, 0, y, 0, 0, Math.PI / 6, 0)
      tri('#e8c07a', 0.008, 0.014)
      tri('#7ac943', 0.019, 0.006)
      tri('#e04a3a', 0.025, 0.006)
      tri('#f5e6b0', 0.031, 0.006)
      tri('#e8c07a', 0.042, 0.014)
      put(s, cyl(0.002, 0.002, 0.07, 4), '#d9a35a', 0, 0.06, 0)
      put(s, ball(0.008, 1, 1, 1, 6), '#e8434f', 0, 0.095, 0)
      return s
    }
    const a = half(-0.035, 0.012, 0.3)
    const b = half(0.04, -0.012, 2.4)
    const crisps = grp(g, 0.01, 0.016, 0.06)
    for (let i = 0; i < 4; i++) put(crisps, ball(0.012, 1.2, 0.25, 1), '#f2c94c', i * 0.012 - 0.02, 0.004 + (i % 2) * 0.004, 0, 0.2 * i, 0, 0.3)
    const pickle = put(g, ball(0.012, 2, 0.8, 0.9), '#6aa83a', -0.06, 0.026, -0.05)
    d.pieces = [a, pickle, b, crisps]
  },
  noodles(g, d) {
    put(g, lathe([[0, 0], [0.045, 0], [0.058, 0.11], [0.054, 0.11], [0.04, 0.006], [0, 0.006]], 18), '#ffffff')
    put(g, cyl(0.0585, 0.051, 0.04, 18), '#e8434f', 0, 0.07, 0)
    put(g, cyl(0.06, 0.06, 0.006, 18), '#f6f6f6', 0, 0.112, 0)
    put(g, cyl(0.052, 0.052, 0.004, 18), '#d9a24a', 0, 0.1, 0) // broth
    const pieces = []
    for (let i = 0; i < 4; i++) pieces.push(put(g, new TorusGeometry(0.018 + i * 0.007, 0.004, 5, 18).rotateX(Math.PI / 2), '#f3d27a', 0, 0.104 + (3 - i) * 0.003, 0))
    const egg = put(g, cyl(0.016, 0.016, 0.006, 12), '#ffffff', 0.024, 0.11, 0.01, 0.2, 0, 0)
    put(egg, cyl(0.008, 0.008, 0.002, 10), '#ffb21a', 0, 0.004, 0)
    const onion = grp(g)
    for (let i = 0; i < 6; i++) put(onion, cyl(0.004, 0.004, 0.003, 6), '#58b84a', -0.02 + (i % 3) * 0.01, 0.112, -0.015 + Math.floor(i / 3) * 0.012)
    d.pieces = [egg, onion, ...pieces.reverse()]
    d.steam = new Vector3(0, 0.13, 0)
  },
  chips(g, d) {
    put(g, rbox(0.1, 0.11, 0.035, 0.012, 1), '#f2c42a', 0, 0.055, -0.02, -0.25, 0, 0)
    put(g, new BoxGeometry(0.06, 0.03, 0.002), '#d2412a', 0, 0.06, -0.0, -0.25, 0, 0)
    put(g, ball(0.012, 1, 1, 0.2), '#ffffff', 0, 0.075, 0.0, -0.25, 0, 0)
    const pieces = []
    for (let i = 0; i < 6; i++) {
      const a = i * 1.7
      pieces.push(put(g, ball(0.018, 1.25, 0.18, 1), i % 2 ? '#f2c94c' : '#e8b33a', -0.03 + (i % 3) * 0.03, 0.008 + Math.floor(i / 3) * 0.008, 0.04 + Math.sin(a) * 0.012, 0.3 * Math.sin(a), a, 0.25))
    }
    d.pieces = pieces
  },
  // A striped popcorn bucket heaped with fluffy kernels (each bite = a handful off the top).
  popcorn(g, d) {
    put(g, cyl(0.048, 0.034, 0.1, 16), '#ffffff', 0, 0.05, 0)
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2
      put(g, new BoxGeometry(0.016, 0.1, 0.002), '#e0283a', Math.cos(a) * 0.0415, 0.05, Math.sin(a) * 0.0415, -Math.sin(a) * 0.14, -a + Math.PI / 2, 0)
    }
    put(g, cyl(0.05, 0.05, 0.008, 16), '#ffffff', 0, 0.1, 0)
    const pieces = []
    for (let k = 0; k < 5; k++) {
      const h = grp(g, 0, 0.1 + (4 - k) * 0.008, 0)
      for (let i = 0; i < 7; i++) {
        const a = i * 2.4 + k
        const r = 0.012 + (i % 3) * 0.012
        put(h, ball(0.011, 1.1, 0.9, 1, 7), i % 3 ? '#fff6d8' : '#ffe08a', Math.cos(a) * r, 0.006 + (i % 2) * 0.006, Math.sin(a) * r)
      }
      pieces.push(h)
    }
    d.pieces = pieces
  },
  cookie(g, d) {
    put(g, cyl(0.06, 0.06, 0.004, 16), '#ffffff', 0, 0.002, 0) // napkin
    const pieces = []
    for (let k = 0; k < 3; k++) {
      const w = new Mesh(tint(new CylinderGeometry(0.048, 0.05, 0.016, 10, 1, false, (k * 2 * Math.PI) / 3, (2 * Math.PI) / 3), '#c98a4a'), M().paint)
      w.position.y = 0.012
      g.add(w)
      for (let i = 0; i < 3; i++) {
        const a = ((k + 0.2 + i * 0.3) * 2 * Math.PI) / 3
        put(w, ball(0.006, 1, 0.7, 1, 6), '#4a2a14', Math.sin(a) * 0.028, 0.009, Math.cos(a) * 0.028)
      }
      pieces.push(w)
    }
    d.pieces = pieces
  },
  cola(g, d) {
    d.liquid = glassWith(g, [[0, 0], [0.03, 0], [0.034, 0.12], [0.036, 0.13]], '#4a1f0e', 0.85)
    for (let i = 0; i < 3; i++) put(g, new BoxGeometry(0.018, 0.018, 0.018), '#e8f6ff', -0.008 + i * 0.01, 0.09 + i * 0.008, (i % 2) * 0.01, i, i * 0.7, 0, 'glass')
    straw(g, '#e8434f', 0.01, 0.04, 0, 0.18, 0.13)
    put(g, cyl(0.02, 0.02, 0.07, 12), '#d81f2a', 0.06, 0.035, 0.02) // the can beside it
    put(g, cyl(0.02, 0.02, 0.005, 12), null, 0.06, 0.072, 0.02, 0, 0, 0, 'metal')
    d.fizz = new Vector3(0, 0.12, 0)
  },
  juice(g, d) {
    d.liquid = glassWith(g, [[0, 0], [0.028, 0], [0.032, 0.11], [0.034, 0.115]], '#ff9d2e', 0.85)
    const sl = put(g, cyl(0.018, 0.018, 0.005, 14), '#ffb84a', 0.03, 0.11, 0, 0, 0, Math.PI / 2.2)
    put(sl, cyl(0.014, 0.014, 0.006, 14), '#ffd27a', 0, 0, 0)
  },
  tea(g, d) {
    put(g, cyl(0.05, 0.045, 0.008, 18), '#ffffff', 0, 0.004, 0, 0, 0, 0, 'shiny')
    put(g, lathe([[0, 0.008], [0.028, 0.008], [0.036, 0.055], [0.034, 0.055], [0.024, 0.014], [0, 0.014]], 16), '#ffffff', 0, 0, 0, 0, 0, 0, 'shiny')
    put(g, new TorusGeometry(0.014, 0.004, 5, 12), '#ffffff', 0.04, 0.035, 0, 0, Math.PI / 2, 0, 'shiny')
    const liquid = put(g, cyl(0.032, 0.03, 0.03, 14).translate(0, 0.015, 0), '#9a5a2a')
    liquid.position.y = 0.018
    d.liquid = liquid
    put(g, cyl(0.001, 0.001, 0.05, 4), '#f4f0e0', -0.03, 0.06, 0, 0, 0, 0.6)
    put(g, new BoxGeometry(0.012, 0.016, 0.002), '#2fa04a', -0.048, 0.04, 0)
    put(g, new BoxGeometry(0.006, 0.002, 0.04), null, 0.0, 0.01, 0.042, 0, 0.3, 0, 'metal') // spoon
    d.steam = new Vector3(0, 0.07, 0)
  },
  burger(g, d) {
    put(g, rbox(0.2, 0.012, 0.15, 0.006, 1), '#e9e2d0', 0, 0.006, 0) // wax paper
    const half = (s) => {
      const h = grp(g, -0.035 + s * 0.004, 0.012, 0)
      const disc = (r, ht, hex, y) => put(h, new CylinderGeometry(r, r, ht, 14, 1, false, s > 0 ? 0 : Math.PI, Math.PI), hex, 0, y, 0)
      disc(0.045, 0.016, '#d9963a', 0.008)
      disc(0.047, 0.014, '#5a2e1a', 0.023)
      disc(0.05, 0.003, '#ffcc33', 0.032)
      disc(0.05, 0.004, '#6cc04a', 0.036)
      disc(0.044, 0.005, '#e04a3a', 0.041)
      const top = new Mesh(tint(new SphereGeometry(0.046, 14, 8, s > 0 ? 0 : Math.PI, Math.PI, 0, Math.PI / 2).scale(1, 0.62, 1), '#e0993f'), M().paint)
      top.position.y = 0.044
      h.add(top)
      for (let i = 0; i < 4; i++) put(h, ball(0.003, 1.6, 0.6, 1, 5), '#fff3d6', s * (0.008 + (i % 2) * 0.016), 0.068 - (i % 2) * 0.004, -0.015 + i * 0.01)
      return h
    }
    const left = half(-1)
    const right = half(1)
    const fries = []
    put(g, rbox(0.06, 0.06, 0.04, 0.006, 1), '#d81f2a', 0.06, 0.04, -0.02)
    for (let k = 0; k < 3; k++) {
      const f = grp(g, 0.06, 0.07, -0.02)
      for (let i = 0; i < 4; i++) put(f, new BoxGeometry(0.008, 0.06, 0.008), '#f6c84a', -0.02 + i * 0.013 + k * 0.004, 0.008 * k, -0.008 + (k - 1) * 0.008, (i - 1.5) * 0.08, 0, (k - 1) * 0.15)
      fries.push(f)
    }
    d.pieces = [fries[0], right, fries[1], left, fries[2]]
  },
  curry(g, d) {
    bowl(g, 0.1, 0.04, '#f4f1ea')
    put(g, cyl(0.085, 0.085, 0.008, 18), '#e0812a', -0.0, 0.032, 0)
    const rice = [grp(g, 0.025, 0.03, 0.015), grp(g, 0.04, 0.03, -0.02)]
    for (const r of rice) put(r, ball(0.028, 1.1, 0.6, 1), '#fbf8ee', 0, 0.012, 0)
    const chunks = [put(g, ball(0.014, 1.2, 0.8, 1, 8), '#c9682a', -0.04, 0.042, 0.02), put(g, ball(0.013, 1, 0.8, 1.2, 8), '#a8522a', -0.03, 0.042, -0.03)]
    put(g, ball(0.006, 1, 1, 1, 6), '#e83a2a', -0.05, 0.046, -0.01) // chilli
    const naan = put(g, cyl(0.05, 0.05, 0.008, 3).scale(1.2, 1, 0.8), '#e8b866', 0.02, 0.06, 0.07, 0.5, 0.4, 0)
    d.pieces = [naan, chunks[0], rice[0], chunks[1], rice[1]]
    d.steam = new Vector3(-0.02, 0.07, 0)
  },
  cheesecake(g, d) {
    plate(g, 0.08)
    const pieces = []
    for (let k = 0; k < 3; k++) {
      const w = grp(g, 0, 0.014, 0)
      const a0 = -0.45 + k * 0.3
      put(w, new CylinderGeometry(0.075, 0.075, 0.012, 6, 1, false, a0, 0.3), '#c48a4a', 0, 0.006, 0)
      put(w, new CylinderGeometry(0.075, 0.075, 0.042, 6, 1, false, a0, 0.3), '#fff3d6', 0, 0.033, 0)
      put(w, new CylinderGeometry(0.075, 0.075, 0.008, 6, 1, false, a0, 0.3), '#e8434f', 0, 0.058, 0)
      pieces.push(w)
    }
    const berry = put(g, new ConeGeometry(0.014, 0.024, 8).rotateX(Math.PI), '#e8434f', Math.sin(0) * 0.05, 0.085, Math.cos(0) * 0.05)
    put(berry, cyl(0.008, 0.002, 0.006, 6), '#4c9a3a', 0, 0.013, 0)
    d.pieces = [berry, pieces[2], pieces[1], pieces[0]]
  },
  smoothie(g, d) {
    d.liquid = glassWith(g, [[0, 0], [0.026, 0], [0.03, 0.02], [0.036, 0.15], [0.038, 0.155]], '#c03a8a', 0.88)
    put(g, ball(0.03, 1, 0.4, 1), '#f6d6ee', 0, 0.137, 0)
    for (let i = 0; i < 3; i++) put(g, ball(0.008, 1, 1, 1, 6), i % 2 ? '#3a2a8a' : '#d81f4a', -0.012 + i * 0.012, 0.15, 0.006 * i)
    straw(g, '#2fc4b2', 0.012, 0.05, 0, 0.2, 0.15)
  },
  coffee(g, d) {
    put(g, cyl(0.04, 0.036, 0.006, 16), '#ffffff', 0, 0.003, 0, 0, 0, 0, 'shiny')
    put(g, lathe([[0, 0.006], [0.018, 0.006], [0.024, 0.04], [0.022, 0.04], [0.016, 0.01], [0, 0.01]], 14), '#ffffff', 0, 0, 0, 0, 0, 0, 'shiny')
    put(g, new TorusGeometry(0.009, 0.003, 4, 10), '#ffffff', 0.027, 0.026, 0, 0, Math.PI / 2, 0, 'shiny')
    const liquid = put(g, cyl(0.021, 0.018, 0.024, 12).translate(0, 0.012, 0), '#4a2a14')
    liquid.position.y = 0.012
    put(g, cyl(0.02, 0.02, 0.002, 12), '#c98a4a', 0, 0.036, 0) // crema
    put(g, rbox(0.02, 0.006, 0.014, 0.002, 1), '#5a3418', 0.03, 0.009, 0.02) // a chocolate
    d.liquid = liquid
    d.steam = new Vector3(0, 0.05, 0)
  },
  steak(g, d) {
    plate(g, 0.105, '#ffffff', '#c9a14a')
    put(g, cyl(0.05, 0.05, 0.003, 16).scale(1.3, 1, 0.8), '#5a1a14', -0.02, 0.016, 0) // jus
    const slices = []
    for (let i = 0; i < 3; i++) {
      const s = grp(g, -0.05 + i * 0.026, 0.016, -0.005)
      s.rotation.y = 0.15
      put(s, rbox(0.024, 0.028, 0.07, 0.008, 1), '#6b2a1a', 0, 0.014, 0)
      put(s, new BoxGeometry(0.014, 0.022, 0.066), '#c0503a', 0.006, 0.014, 0) // pink inside
      for (let k = 0; k < 2; k++) put(s, new BoxGeometry(0.026, 0.002, 0.004), '#2a0e08', 0, 0.029, -0.015 + k * 0.03, 0, 0.5, 0)
      slices.push(s)
    }
    const mash = [grp(g, 0.05, 0.016, 0.02), grp(g, 0.055, 0.016, -0.03)]
    for (const m of mash) {
      put(m, ball(0.026, 1.1, 0.7, 1), '#f6edd0', 0, 0.012, 0)
      put(m, ball(0.006, 1, 1, 1, 6), '#f2d24a', 0.004, 0.03, 0)
    }
    const beans = grp(g, -0.01, 0.016, 0.06)
    for (let i = 0; i < 5; i++) put(beans, cyl(0.004, 0.004, 0.05, 5).rotateZ(Math.PI / 2), '#4c9a3a', 0, 0.004 + (i % 2) * 0.004, i * 0.007 - 0.014, 0, (i - 2) * 0.15, 0)
    d.pieces = [slices[0], mash[0], slices[1], beans, slices[2], mash[1]]
    d.steam = new Vector3(-0.02, 0.06, 0)
  },
  sushi(g, d) {
    put(g, rbox(0.22, 0.018, 0.12, 0.006, 1), '#b07a44', 0, 0.009, 0) // board
    for (const x of [-0.08, 0.08]) put(g, new BoxGeometry(0.012, 0.012, 0.11), '#8a5a2e', x, -0.004, 0)
    const pieces = []
    for (let i = 0; i < 3; i++) {
      const n = grp(g, -0.07 + i * 0.045, 0.018, -0.025)
      put(n, rbox(0.035, 0.018, 0.02, 0.008, 1), '#fbf8ee', 0, 0.009, 0)
      put(n, rbox(0.04, 0.008, 0.024, 0.004, 1), i === 1 ? '#e8434f' : '#ff8a5a', 0, 0.021, 0)
      if (i !== 1) for (let k = 0; k < 3; k++) put(n, new BoxGeometry(0.002, 0.0015, 0.024), '#ffd2b8', -0.012 + k * 0.012, 0.0255, 0, 0, 0, 0.3)
      pieces.push(n)
    }
    for (let i = 0; i < 3; i++) {
      const m = grp(g, -0.05 + i * 0.035, 0.018, 0.03)
      put(m, cyl(0.016, 0.016, 0.022, 12), '#1a2a1a', 0, 0.011, 0)
      put(m, cyl(0.013, 0.013, 0.023, 12), '#fbf8ee', 0, 0.011, 0)
      put(m, cyl(0.006, 0.006, 0.024, 8), i === 1 ? '#6cc04a' : '#ff8a5a', 0, 0.011, 0)
      pieces.push(m)
    }
    put(g, ball(0.01, 1.4, 0.6, 1, 6), '#7ac943', 0.085, 0.024, 0.03) // wasabi
    put(g, ball(0.012, 1.3, 0.3, 1.1, 6), '#ffb6a8', 0.085, 0.022, -0.02) // ginger
    d.pieces = [pieces[0], pieces[3], pieces[1], pieces[4], pieces[2], pieces[5]]
  },
  lavacake(g, d) {
    plate(g, 0.085, '#ffffff', '#c9a14a')
    put(g, cyl(0.06, 0.06, 0.003, 16), '#3a1408', 0.01, 0.015, 0.01) // molten pool
    const pieces = []
    for (let k = 0; k < 3; k++) {
      const a0 = (k * 2 * Math.PI) / 3
      const w = put(g, new CylinderGeometry(0.034, 0.04, 0.05, 12, 1, false, a0, (2 * Math.PI) / 3), '#4a2414', -0.01, 0.04, 0)
      put(w, new CylinderGeometry(0.03, 0.03, 0.004, 12, 1, false, a0, (2 * Math.PI) / 3), '#f6f2ea', 0, 0.027, 0) // icing sugar
      pieces.push(w)
    }
    const scoop = put(g, ball(0.022, 1, 0.85, 1), '#fff6e0', 0.05, 0.03, 0.03)
    const mint = put(g, ball(0.008, 1.6, 0.3, 1, 6), '#3f9a3a', -0.01, 0.07, 0)
    d.pieces = [mint, pieces[0], scoop, pieces[1], pieces[2]].slice(0, 5)
  },
  mocktail(g, d) {
    put(g, lathe([[0.03, 0], [0.032, 0.004], [0.004, 0.01], [0.004, 0.07], [0.05, 0.11], [0.052, 0.112]], 18), null, 0, 0, 0, 0, 0, 0, 'glass')
    const pts = [[0, 0]]
    for (let i = 0; i <= 5; i++) pts.push([0.004 + i * 0.0086, i * 0.007])
    pts.push([0, 0.035])
    const liquid = put(g, lathe(pts, 16), '#ff7a3a')
    liquid.position.y = 0.072
    put(g, cyl(0.046, 0.046, 0.002, 16), '#ffd25a', 0, 0.106, 0)
    const sl = put(g, cyl(0.018, 0.018, 0.005, 14), '#ff9d2e', 0.045, 0.11, 0, 0, 0, Math.PI / 2.2)
    put(sl, cyl(0.014, 0.014, 0.006, 14), '#ffd27a', 0, 0, 0)
    put(g, ball(0.007, 1, 1, 1, 6), '#d81f4a', -0.02, 0.112, 0.01)
    d.liquid = liquid
    d.fizz = new Vector3(0, 0.1, 0)
  },
  lobster(g, d) {
    plate(g, 0.115, '#ffffff', '#c9a14a')
    const body = grp(g, -0.01, 0.016, 0)
    put(body, ball(0.03, 1, 0.75, 1.5), '#e8402a', 0, 0.02, -0.025)
    put(body, ball(0.008, 1, 1, 1, 6), '#1a1a1a', -0.012, 0.04, -0.06)
    put(body, ball(0.008, 1, 1, 1, 6), '#1a1a1a', 0.012, 0.04, -0.06)
    for (const s of [-1, 1]) put(body, cyl(0.002, 0.001, 0.09, 4), '#c83a22', s * 0.012, 0.04, -0.1, -1.2, 0, s * 0.3)
    const tail = []
    for (let i = 0; i < 3; i++) {
      const t = grp(g, -0.01, 0.016, 0.02 + i * 0.022)
      put(t, ball(0.024 - i * 0.003, 1.1, 0.6, 0.6), '#ff5a3a', 0, 0.016, 0)
      put(t, ball(0.018 - i * 0.003, 1, 0.5, 0.5), '#fff3e6', 0, 0.022, 0)
      tail.push(t)
    }
    const claws = []
    for (const s of [-1, 1]) {
      const c = grp(g, -0.01 + s * 0.05, 0.016, -0.04)
      put(c, ball(0.018, 1, 0.7, 1.5), '#e8402a', 0, 0.014, 0, 0, s * 0.5, 0)
      put(c, new ConeGeometry(0.008, 0.03, 6).rotateX(-Math.PI / 2), '#e8402a', s * 0.01, 0.014, -0.035)
      claws.push(c)
    }
    put(g, cyl(0.018, 0.016, 0.02, 12), '#ffffff', 0.07, 0.026, 0.04, 0, 0, 0, 'shiny')
    put(g, cyl(0.016, 0.016, 0.004, 12), '#ffd84a', 0.07, 0.036, 0.04) // garlic butter
    put(g, ball(0.014, 1.3, 1, 1, 8), '#ffe14a', 0.075, 0.03, -0.04) // lemon
    d.pieces = [claws[0], tail[2], claws[1], tail[1], tail[0], body]
  },
  wagyu(g, d) {
    put(g, rbox(0.22, 0.012, 0.13, 0.004, 1), '#1e1f24', 0, 0.006, 0) // slate
    const slices = []
    for (let i = 0; i < 4; i++) {
      const s = grp(g, -0.06 + i * 0.03, 0.012, 0)
      s.rotation.z = -0.25
      put(s, rbox(0.024, 0.026, 0.07, 0.006, 1), '#7a3426', 0, 0.014, 0)
      put(s, new BoxGeometry(0.018, 0.02, 0.066), '#d06a5a', 0.004, 0.014, 0)
      for (let k = 0; k < 3; k++) put(s, new BoxGeometry(0.02, 0.003, 0.004), '#f4d6c8', 0.005, 0.014 + (k - 1) * 0.006, -0.02 + k * 0.02)
      slices.push(s)
    }
    for (let i = 0; i < 3; i++) put(g, new BoxGeometry(0.008, 0.002, 0.008), '#ffd24a', -0.04 + i * 0.035, 0.044, 0.0, 0, i, 0, 'shiny') // gold leaf
    const salt = put(g, ball(0.012, 1.2, 0.6, 1, 8), '#f4f4f4', 0.08, 0.018, 0.04)
    const sauce = grp(g)
    for (let i = 0; i < 5; i++) put(sauce, cyl(0.006 - i * 0.0008, 0.006 - i * 0.0008, 0.002, 10), '#3a120a', 0.06 - i * 0.014, 0.013, -0.045)
    d.pieces = [slices[0], slices[1], sauce, slices[2], salt, slices[3]]
  },
  caviar(g, d) {
    plate(g, 0.085, '#ffffff', '#c9a14a')
    const pieces = []
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4
      const b = grp(g, Math.cos(a) * 0.04, 0.016, Math.sin(a) * 0.04)
      put(b, cyl(0.02, 0.02, 0.01, 12), '#e8c07a', 0, 0.005, 0)
      put(b, ball(0.012, 1, 0.55, 1, 8), '#fbf7ee', 0, 0.012, 0)
      for (let k = 0; k < 5; k++) put(b, ball(0.0035, 1, 1, 1, 5), '#121212', Math.cos(k * 1.3) * 0.006, 0.019, Math.sin(k * 1.3) * 0.006, 0, 0, 0, 'shiny')
      put(b, cyl(0.001, 0.001, 0.012, 3), '#4c9a3a', 0.006, 0.022, 0, 0.6, 0, 0)
      pieces.push(b)
    }
    d.pieces = pieces
  },
  sundae(g, d) {
    put(g, lathe([[0.03, 0], [0.032, 0.004], [0.006, 0.012], [0.006, 0.04], [0.02, 0.05], [0.05, 0.1], [0.052, 0.104]], 18), null, 0, 0, 0, 0, 0, 0, 'glass')
    put(g, lathe([[0, 0.05], [0.018, 0.052], [0.044, 0.094], [0, 0.094]], 14), '#ff6a8a') // sauce in the glass
    const scoops = []
    for (const [x, y, z, hex] of [[-0.02, 0.105, 0.012, '#ffd6e8'], [0.022, 0.105, 0.008, '#fff6e0'], [0, 0.11, -0.02, '#7a4a2a']]) {
      const s = put(g, ball(0.024, 1, 0.9, 1), hex, x, y, z)
      put(s, ball(0.018, 1.2, 0.3, 1.2, 8), '#c0204a', 0, 0.018, 0) // sauce drip
      scoops.push(s)
    }
    const cream = put(g, new ConeGeometry(0.022, 0.04, 10), '#ffffff', 0, 0.142, 0)
    const cherry = put(g, ball(0.01, 1, 1, 1, 8), '#d81f2a', 0, 0.168, 0, 0, 0, 0, 'shiny')
    put(cherry, cyl(0.001, 0.001, 0.02, 3), '#4c9a3a', 0.003, 0.016, 0, 0, 0, -0.3)
    const sprinkles = grp(g)
    const cols = ['#ff4a6a', '#4ad2ff', '#ffd84a', '#7ac943']
    for (let i = 0; i < 10; i++) put(sprinkles, new BoxGeometry(0.008, 0.002, 0.002), cols[i % 4], Math.cos(i * 2.1) * 0.022, 0.13 - (i % 3) * 0.008, Math.sin(i * 2.1) * 0.022, 0, i, 0.3)
    const wafer = put(g, rbox(0.012, 0.06, 0.03, 0.003, 1), '#e8c07a', 0.03, 0.14, -0.01, 0, 0.4, -0.3)
    d.pieces = [cherry, wafer, cream, scoops[0], scoops[1], scoops[2]].concat([sprinkles]).slice(0, 6)
  },
  champagne(g, d) {
    put(g, lathe([[0.026, 0], [0.028, 0.004], [0.004, 0.012], [0.004, 0.09], [0.018, 0.1], [0.024, 0.17], [0.025, 0.175]], 16), null, 0, 0, 0, 0, 0, 0, 'glass')
    // the stem is solid: the liquid fills the bowl only
    const pts = [[0, 0]]
    for (let i = 0; i <= 5; i++) pts.push([0.003 + (i / 5) * 0.019, i * 0.012])
    pts.push([0, 0.06])
    d.liquid = put(g, lathe(pts, 14), '#f6d77a')
    d.liquid.position.y = 0.094
    const st = put(g, cyl(0.022, 0.024, 0.012, 14), '#d9d2c3', 0.06, 0.006, 0.02) // a little dish of strawberries
    for (let i = 0; i < 3; i++) put(st, new ConeGeometry(0.009, 0.016, 8).rotateX(Math.PI), '#e8434f', -0.01 + i * 0.01, 0.014, (i % 2) * 0.006)
    d.fizz = new Vector3(0, 0.15, 0)
  },
}
// Build one dish. Unknown ids fall back to the chicken.
export function makeDish(id) {
  const g = new Group()
  const d = { g, pieces: [], liquid: null, drink: false, steam: null, fizz: null }
  ;(BUILD[id] ?? BUILD.chicken)(g, d)
  d.drink = !!d.liquid
  return d
}
// The empty plate after the last bite gets a sparkle; the crew (or landing) clears it away.
export const isDrinkId = (id) => ['cola', 'juice', 'tea', 'smoothie', 'coffee', 'mocktail', 'champagne'].includes(id)
