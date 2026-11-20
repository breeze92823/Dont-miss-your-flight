// Shared geometry helpers for detailed props. Everything here returns plain BufferGeometry so it can be
// placed with propkit `put` / vehicles `add` and then merged with `bake()` (one mesh per material).
// Budget: props seen up close may use rounded edges and extra parts; anything repeated dozens of times
// (stanchion posts, seats, bollards, NPC parts) should stay a few hundred triangles and be baked or
// instanced.
import { CylinderGeometry, LatheGeometry, Shape, ExtrudeGeometry, TorusGeometry, Vector2 } from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

// Box with rounded edges. r is the edge radius (clamped to half the smallest side); seg = curve steps.
export function rbox(w, h, d, r = 0.04, seg = 2) {
  const rr = Math.max(0.001, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4))
  return new RoundedBoxGeometry(w, h, d, seg, rr)
}

// Flat slab whose outline has rounded corners (a table top, a sign panel, a seat cushion seen from above),
// lying in XZ, thickness along Y, centred on the origin. bevel softens the top / bottom edges.
export function roundSlab(w, d, h, r = 0.1, bevel = 0.015, curve = 4) {
  const s = roundRectShape(w, d, Math.min(r, w / 2, d / 2))
  const b = Math.min(bevel, h / 3)
  const g = new ExtrudeGeometry(s, { depth: Math.max(0.001, h - b * 2), bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelSegments: 1, curveSegments: curve })
  g.rotateX(-Math.PI / 2)
  g.translate(0, -h / 2 + b, 0)
  return g
}

export function roundRectShape(w, h, r) {
  const s = new Shape()
  const x = -w / 2
  const y = -h / 2
  s.moveTo(x + r, y)
  s.lineTo(x + w - r, y)
  s.quadraticCurveTo(x + w, y, x + w, y + r)
  s.lineTo(x + w, y + h - r)
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  s.lineTo(x + r, y + h)
  s.quadraticCurveTo(x, y + h, x, y + h - r)
  s.lineTo(x, y + r)
  s.quadraticCurveTo(x, y, x + r, y)
  return s
}

// Turned profile around Y: pts = [[radius, y], ...] bottom to top.
export function lathe(pts, seg = 16) {
  return new LatheGeometry(pts.map(([r, y]) => new Vector2(Math.max(0, r), y)), seg)
}

// A post / pipe from y0 to y1.
export function pole(r, y0, y1, seg = 10, r1 = r) {
  return new CylinderGeometry(r1, r, y1 - y0, seg).translate(0, (y0 + y1) / 2, 0)
}

// A ring in the XY plane (a rim, a porthole bezel, a handle loop).
export function ring(r, tube, seg = 24, tubeSeg = 6, arc = Math.PI * 2) {
  return new TorusGeometry(r, tube, tubeSeg, seg, arc)
}

export const nonIndexed = (g) => (g.index ? g.toNonIndexed() : g)
