// The conversation at the check-in desk, once it's your turn:
//   where to? (postcards) -> bag on the scale (live kg) -> 15 quick questions
//   (funny answers; some are remembered and turn up at the security search)
//   -> upgrade offer -> pick a seat (seat map) -> boarding pass + CHECKED IN stamp.
// Everything priced is paid in coins. Resolves to { tags, cls, seat, dest }.
import { AIRLINE, CHECKIN, DESTINATIONS, FEATURED_DESTINATIONS, HOME_AIRPORT, QUESTIONS } from './config.js'
import { SEAT_ICON } from './hud/dialog.js'
import { sfx } from './audio.js'

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const shuffle = (a) => {
  const b = a.slice()
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[b[i], b[j]] = [b[j], b[i]]
  }
  return b
}

export async function runCheckin(c) {
  const { dialog: D, crowd, agent, desk, suitcase, store, fx, player } = c
  const tags = new Set()

  async function say(text, mood = 'happy', hold) {
    crowd.say(agent, text, 3.4)
    agent.mode = 'wave'
    setTimeout(() => (agent.mode = 'type'), 900)
    await D.say(text, mood, hold)
  }

  D.open('check-in agent', 'SH', '#2f7fe0')

  // --- Where to? ---------------------------------------------------------------------------
  await say('Where are we flying today?', 'happy', 0.35)
  const featured = FEATURED_DESTINATIONS.map((i) => ({ index: i, ...DESTINATIONS[i] }))
  const dest = await D.pickDestination(featured, c.destIndex)
  c.setDest(dest)
  await say(`${DESTINATIONS[dest].name} it is! Great pick.`, 'happy')

  // --- The bag -------------------------------------------------------------------------------
  await say('Hi! Bag on the scale, please.', 'happy', 0.2)
  const kg = 6 + Math.round(Math.random() * 180) / 10
  await new Promise((resolve) => suitcase.toScale({ x: desk.scale.x, y: desk.scale.y + 0.14, z: desk.scale.z + 0.35 }, resolve))
  await new Promise((resolve) => {
    // Count up with little beeps, wobble, settle.
    const t0 = performance.now()
    let lastBeep = 0
    const tick = setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / 1100)
      const shown = Math.max(0, kg * (1 - Math.pow(1 - k, 3)) + Math.sin(k * 20) * (1 - k) * 0.6)
      desk.setKg(shown)
      D.kg(shown)
      if (k - lastBeep > 0.14 && k < 1) {
        lastBeep = k
        sfx('beep', { vol: 0.08, f: 1500 + k * 600 })
      }
      if (k >= 1) {
        clearInterval(tick)
        sfx('beep', { vol: 0.18, f: 2200 })
        fx.sparkle(desk.scale.x, desk.scale.y + 0.6, desk.scale.z, { count: 10, color: '#3dff7a', speed: 2, up: 2, size: 0.25 })
        resolve()
      }
    }, 30)
  })
  await say(`${Math.round(kg)} kg. ${kg < 12 ? 'Nice and light!' : 'Perfect!'}`, 'happy')
  suitcase.toBelt(desk.beltEnd, () => {})
  setTimeout(() => desk.setKg(0), 900)
  D.kg(null)

  // --- Questions --------------------------------------------------------------------------------
  const n = CHECKIN.questions
  const asked = shuffle(QUESTIONS).slice(0, n)
  let skipped = false
  const foot = (i) =>
    D.foot({
      count: `Question ${Math.min(i + 1, n)} of ${n}`,
      label: 'Skip Questions',
      price: CHECKIN.skipQuestions,
      style: 'teal',
      onClick() {
        if (skipped) return
        if (store.spend(CHECKIN.skipQuestions)) {
          skipped = true
          sfx('coin')
          D.cancel()
        }
      },
    })
  for (let i = 0; i < n && !skipped; i++) {
    D.dots(i, n)
    foot(i)
    const [, text, answers] = asked[i]
    const pick = await D.ask(text, answers.map(([label]) => ({ label })))
    if (pick < 0) break
    const [, reply, mood, tag] = answers[pick]
    if (tag) tags.add(tag)
    D.dots(i + 1, n)
    if (mood === 'happy') fx.sparkle(player.x, player.y + 2.2, player.z, { count: 8, color: '#ffd84a', speed: 1.5, up: 2, size: 0.25 })
    await say(reply, mood, 0.7)
  }
  D.foot(null)
  if (skipped) {
    // Fill the dots up quickly for the feel of it.
    for (let i = 0; i <= n; i++) {
      D.dots(i, n)
      await wait(25)
    }
    await say('Skipping ahead! You seem trustworthy.', 'wow', 0.6)
  }
  D.dots(null)

  // --- Upgrade offer --------------------------------------------------------------------------------
  let cls = 'ECONOMY'
  const ups = CHECKIN.upgrades
  const up = await D.ask(
    'Psst... want an upgrade? Premium legroom, a Business recliner, or First Class!',
    [...ups.map((u) => ({ label: u.name, style: u.style, price: u.price, icon: SEAT_ICON[u.id] })), { label: 'No thanks', style: 'white' }],
    { numbered: false },
  )
  if (up >= 0 && up < ups.length && store.spend(ups[up].price)) {
    cls = ups[up].name.toUpperCase()
    sfx('fanfare')
    fx.confetti(player.x, player.y + 2, player.z, 30)
    await say(`${ups[up].name}! Very fancy. Enjoy the legroom.`, 'wow')
  } else await say('No problem! Economy is... also a seat.', 'happy')

  // --- Seat ----------------------------------------------------------------------------------------
  const taken = new Set()
  for (let i = 0; i < 46; i++) taken.add(`${1 + Math.floor(Math.random() * 14)}${'ABCDEF'[Math.floor(Math.random() * 6)]}`)
  let seat = null
  const s = await D.ask('Would you like to pick your own seat? Window, aisle, right up front...', [{ label: 'Pick my seat', style: 'blue', price: CHECKIN.pickSeat }, { label: 'Random is fine', style: 'white' }], { numbered: false })
  if (s === 0 && store.spend(CHECKIN.pickSeat)) {
    seat = await D.pickSeat(taken)
    await say(`Seat ${seat}. Excellent choice!`, 'wow')
  } else {
    do seat = `${4 + Math.floor(Math.random() * 10)}${'ABCDEF'[Math.floor(Math.random() * 6)]}`
    while (taken.has(seat))
    await say('No problem, I picked a nice one for you.', 'happy')
  }

  await say("Don't miss your flight!", 'happy', 0.5)
  const d = DESTINATIONS[dest]
  await D.pass({ airline: AIRLINE, passenger: c.playerName, from: HOME_AIRPORT.code, fromName: HOME_AIRPORT.name, to: d.code, toName: d.name, flight: d.flight, gate: d.gate, cls, seat })
  D.close()
  return { tags, cls, seat, dest }
}
