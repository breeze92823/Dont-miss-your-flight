// A queue path: a polyline measured by distance `s` from its start (the back of
// the line) to its end (the head of the line).
export function makePath(points) {
  const P = points.map(([x, z]) => ({ x, z }))
  const cum = [0]
  for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i].x - P[i - 1].x, P[i].z - P[i - 1].z))
  const total = cum[cum.length - 1]
  function at(s, out = {}) {
    s = Math.max(0, Math.min(total, s))
    let i = 1
    while (i < cum.length - 1 && cum[i] < s) i++
    const a = P[i - 1]
    const b = P[i]
    const t = (s - cum[i - 1]) / (cum[i] - cum[i - 1] || 1)
    out.x = a.x + (b.x - a.x) * t
    out.z = a.z + (b.z - a.z) * t
    out.yaw = Math.atan2(b.x - a.x, b.z - a.z)
    return out
  }
  function project(x, z) {
    let best = 0
    let bd = Infinity
    for (let i = 1; i < P.length; i++) {
      const a = P[i - 1]
      const b = P[i]
      const dx = b.x - a.x
      const dz = b.z - a.z
      const l2 = dx * dx + dz * dz
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / l2))
      const d = (a.x + dx * t - x) ** 2 + (a.z + dz * t - z) ** 2
      if (d < bd) {
        bd = d
        best = cum[i - 1] + Math.sqrt(l2) * t
      }
    }
    return best
  }
  return { P, cum, total, at, project }
}

export const angTo = (from, to, max) => {
  const d = Math.atan2(Math.sin(to - from), Math.cos(to - from))
  return Math.abs(d) <= max ? to : from + Math.sign(d) * max
}
