// All on-screen UI: the cutscene letterbox (bars, subtitle, title, Skip), the
// gameplay HUD (coins, Rewards / Shop / Destinations, Be Security / Be Pilot,
// the six power buttons, Board The Plane, queue position + Skip Line, prompts,
// big pop text, toasts, announcements, boarding pass) and the modal windows.
// Everything is bought with coins (see PRICES); nothing uses premium currency.
import './hud.css'
import { AIRLINE, CHECKIN, PRICES } from '../config.js'
import { store } from '../store.js'
import { isMuted, setMuted, sfx } from '../audio.js'
import { ICON } from './icons.js'
import { createDialog } from './dialog.js'
import { createWindows } from './windows.js'
import { onNetChange } from '../net.js'
import { Vector3 } from 'three'

function el(tag, cls, html = '', parent = null) {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (html) e.innerHTML = html
  parent?.appendChild(e)
  return e
}
function tap(e, fn) {
  e.addEventListener('pointerdown', (ev) => ev.stopPropagation())
  e.addEventListener('click', (ev) => {
    ev.stopPropagation()
    fn(ev)
  })
}
const coinTag = (n) => (n > 0 ? `<span class="price">${ICON.coin}${n}</span>` : '<span class="price free">FREE</span>')

export function createHud({ onAction }) {
  const root = el('div', 'hud mode-cutscene', '', document.body)
  let camera = null
  const v = new Vector3()

  // --- Cinematic layer --------------------------------------------------------------------
  const cine = el('div', 'cine', '', root)
  el('div', 'cine-bar top', '', cine)
  const bottomBar = el('div', 'cine-bar bottom', '', cine)
  const sub = el('div', 'cine-sub', '', bottomBar)
  const title = el('div', 'cine-title', `<div class="logo"><span class="l1">Don't Miss</span><span class="l2">Your Flight!</span><span class="plane">✈</span></div><div class="tag">Terminal 1 · Departures</div>`, cine)
  const skip = el('button', 'cine-skip', `${ICON.skip}<span>Skip</span>`, cine)
  const fade = el('div', 'cine-fade', '', root)
  let onSkip = null
  tap(skip, () => {
    sfx('click')
    onSkip?.()
  })

  // --- Gameplay HUD ---------------------------------------------------------------------------
  const play = el('div', 'play', '', root)
  const left = el('div', 'hud-left', '', play)
  const tile = (cls, icon, label, fn) => {
    const b = el('button', `tile ${cls}`, `<span class="ico">${icon}</span><span class="lbl">${label}</span>`, left)
    tap(b, () => {
      sfx('pop')
      fn()
    })
    return b
  }
  const rewardsBtn = tile('t-rewards', ICON.rewards, 'Rewards', () => openRewards())
  tile('t-shop', ICON.shop, 'Shop', () => openShop())
  tile('t-dest', ICON.globe, 'Destinations', () => openDestinations())
  const dot = el('span', 'notif', '!', rewardsBtn)

  const role = (cls, icon, label, key, price) => {
    const b = el('button', `role ${cls}`, `<span class="burst"></span><span class="ico">${icon}</span><span class="lbl">${label}</span><span class="sub"></span>`, play)
    tap(b, () => {
      sfx('pop')
      onAction('job', key) // jobs.js: pay + enter the mode (or leave it)
    })
    return b
  }
  const roleSec = role('r-sec', ICON.police, 'Be Security', 'security', PRICES.beSecurity)
  const rolePil = role('r-pil', ICON.pilot, 'Be Pilot', 'pilot', PRICES.bePilot)

  const right = el('div', 'hud-right', '', play)
  const power = (cls, icon, label, key, price, custom) => {
    const b = el('button', `power ${cls}`, `<span class="ico">${icon}</span><span class="lbl">${label}</span>${coinTag(price)}`, right)
    tap(b, () => (custom ? custom() : confirmBuy(label, price, () => onAction(key))))
  }
  power('p-rain', ICON.luggage, 'Luggage Rain', 'luggageRain', PRICES.luggageRain)
  power('p-kill', ICON.devil, 'Kill All', 'killAll', PRICES.killAll)
  power('p-plane', ICON.plane, 'Paper Planes', 'paperPlanes', PRICES.paperPlanes)
  power('p-scare', ICON.skull, 'Scare All', 'scareAll', PRICES.scareAll)
  power('p-ann', ICON.megaphone, 'Announce', 'announce', PRICES.announce, () => openAnnounce())
  power('p-emoji', ICON.emoji, 'Emoji', 'emoji', PRICES.emoji, () => openEmoji())

  const top = el('div', 'hud-top', '', play)
  const board = el('button', 'board', `<span class="ico">${ICON.rocket}</span><span class="lbl">Board The Plane</span>${coinTag(PRICES.boardPlane)}`, top)
  tap(board, () => confirmBuy('Board The Plane', PRICES.boardPlane, () => onAction('boardPlane'), 'Skip the line and check in right now.', () => onAction('canBoard')))
  const planeTimer = el('div', 'plane-timer', '<span class="pt-l"></span><span class="pt-t"></span>', top)
  const inLine = el('div', 'inline-pill', "You're in line!", top)
  const hintEl = el('div', 'hint-pill', '', top)
  const dialog = createDialog(root, { sfx, typeSpeed: CHECKIN.typeSpeed, hold: CHECKIN.hold })

  const coins = el('div', 'hud-coins', `<span class="ico">${ICON.coin}</span><span class="n">0</span>`, play)
  const coinN = coins.querySelector('.n')

  const bottom = el('div', 'hud-bottom', '', play)
  const pos = el('div', 'pos', '', bottom)
  const skipLine = el('button', 'skipline', `<span>Skip Line</span>${coinTag(PRICES.skipLine)}`, bottom)
  tap(skipLine, () => confirmBuy('Skip Line', PRICES.skipLine, () => onAction('skipLine'), 'Jump straight to the front of the line.'))
  // Bottom action: "Plane arriving in 2:21" + Skip Time, "Seat 24E | Cruising..." + Skip Time, Fly Again.
  const act = el('div', 'hud-act', '<div class="act-l"></div><button class="act-b"><span class="act-t"></span><span class="act-p"></span></button>', play)
  const actL = act.querySelector('.act-l')
  const actB = act.querySelector('.act-b')
  let actTap = null
  tap(actB, () => actTap?.())
  // "now boarding": a dark card with a hanging sign while the game moves you onto the plane.
  const nb = el('div', 'nowboarding', '<div class="nb-wire l"></div><div class="nb-wire r"></div><div class="nb-sign"><span class="nb-t">now boarding</span><span class="nb-bar"><i></i></span></div>', root)
  const promptEl = el('div', 'prompt', '', root)
  const statusEl = el('div', 'status', '', root)
  const bigEl = el('div', 'big', '', root)
  const toasts = el('div', 'toasts', '', root)
  const announceEl = el('div', 'announce', '', root)
  const pass = el('div', 'pass', '', root)
  let passTimer = 0
  tap(pass, () => pass.classList.toggle('tucked'))

  const mute = el('button', 'mute', isMuted() ? ICON.mute : ICON.sound, root)
  tap(mute, () => {
    setMuted(!isMuted())
    mute.innerHTML = isMuted() ? ICON.mute : ICON.sound
    sfx('click')
  })

  // --- Coins ------------------------------------------------------------------------------
  let shown = store.coins
  let counting = null
  coinN.textContent = shown
  function countTo(n) {
    cancelAnimationFrame(counting)
    const from = shown
    const t0 = performance.now()
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / 600)
      shown = Math.round(from + (n - from) * (1 - (1 - k) ** 3))
      coinN.textContent = shown
      if (k < 1) counting = requestAnimationFrame(step)
    }
    step()
    coins.classList.remove('bump')
    void coins.offsetWidth
    coins.classList.add('bump')
  }
  function flyCoins(from, n) {
    const rect = coins.querySelector('.ico').getBoundingClientRect()
    let sx = innerWidth / 2
    let sy = innerHeight / 2
    if (from && camera) {
      v.set(from.x, from.y, from.z).project(camera)
      sx = (v.x * 0.5 + 0.5) * innerWidth
      sy = (-v.y * 0.5 + 0.5) * innerHeight
    }
    const count = Math.min(12, Math.max(4, Math.round(n / 5)))
    for (let i = 0; i < count; i++) {
      const c = el('div', 'flycoin', ICON.coin, root)
      const jx = (Math.random() - 0.5) * 120
      const jy = (Math.random() - 0.5) * 80
      c.style.left = `${sx}px`
      c.style.top = `${sy}px`
      c.animate(
        [
          { transform: 'translate(-50%,-50%) scale(0.4)', opacity: 0 },
          { transform: `translate(calc(-50% + ${jx}px), calc(-50% + ${jy}px)) scale(1.1)`, opacity: 1, offset: 0.3 },
          { transform: `translate(calc(-50% + ${rect.left + rect.width / 2 - sx}px), calc(-50% + ${rect.top + rect.height / 2 - sy}px)) scale(0.7)`, opacity: 1 },
        ],
        { duration: 750 + i * 60, easing: 'cubic-bezier(.5,0,.6,1)' },
      ).onfinish = () => {
        c.remove()
        sfx('coin', { vol: 0.18 })
      }
    }
  }
  store.on((e) => {
    if (e.type === 'coins') {
      if (e.delta > 0) {
        flyCoins(e.from, e.delta)
        setTimeout(() => countTo(store.coins), 700)
      } else countTo(store.coins)
    }
    if (e.type === 'broke') {
      sfx('error')
      toast(`Not enough coins! You need ${e.need}. Check in to earn more.`)
      coins.classList.remove('shake')
      void coins.offsetWidth
      coins.classList.add('shake')
    }
    refreshRoles()
    refreshDaily()
  })

  // --- Small helpers ---------------------------------------------------------------------------
  function toast(text) {
    const t = el('div', 'toast', text, toasts)
    setTimeout(() => t.classList.add('out'), 2600)
    setTimeout(() => t.remove(), 3100)
  }
  let bigTimer = 0
  function big(text, color = 'gold', dur = 1.4) {
    bigEl.textContent = text
    bigEl.className = `big show ${color}`
    clearTimeout(bigTimer)
    bigTimer = setTimeout(() => (bigEl.className = `big ${color}`), dur * 1000)
  }

  // --- Windows ------------------------------------------------------------------------------
  let win = null
  function openWin(titleText, cls, color) {
    closeWin()
    const back = el('div', 'win-back', '', root)
    const w = el('div', `win ${cls}`, '', back)
    const head = el('div', `win-head ${color}`, `<span>${titleText}</span>`, w)
    const x = el('button', 'win-x', ICON.close, head)
    tap(x, () => {
      sfx('click')
      closeWin()
    })
    tap(back, (e) => {
      if (e.target === back) closeWin()
    })
    const body = el('div', 'win-body', '', w)
    win = back
    root.classList.add('win-open')
    return body
  }
  function closeWin() {
    win?.remove()
    win = null
    root.classList.remove('win-open')
  }

  function confirmBuy(label, price, go, desc = '', check = null) {
    sfx('pop')
    if (check && check() === false) return
    if (price <= 0) return go()
    const body = openWin(label, 'w-confirm', 'blue')
    el('p', 'desc', desc || `Use it for ${price} coins?`, body)
    const row = el('div', 'row', '', body)
    const yes = el('button', 'btn green', `Buy ${coinTag(price)}`, row)
    const no = el('button', 'btn grey', 'Cancel', row)
    tap(yes, () => {
      closeWin()
      if (store.spend(price)) {
        sfx('coin')
        go()
      }
    })
    tap(no, () => closeWin())
  }

  // Be Security / Be Pilot are modes (jobs.js): every entry costs the price (free while a Daily
  // Reward shift runs) and the hat is on only while the mode runs.
  function refreshRoles() {
    for (const [b, key, price] of [[roleSec, 'security', PRICES.beSecurity], [rolePil, 'pilot', PRICES.bePilot]]) {
      const on = store.data.hat === key
      b.querySelector('.sub').innerHTML = on ? 'ON DUTY' : store.timeLeft(key) > 0 ? 'FREE SHIFT' : `${ICON.coin}${price}`
      b.classList.toggle('on', on)
    }
  }

  // Daily Rewards / Shop / Destinations (windows.js).
  const windows = createWindows({ openWin, closeWin, onAction, toast, big, sfx })
  const openRewards = () => windows.rewards()
  const openShop = (tab) => windows.shop(tab)
  const openDestinations = () => windows.destinations()
  function refreshDaily() {
    const n = windows.claimable()
    dot.style.display = n ? 'flex' : 'none'
    dot.textContent = n > 1 ? n : '!'
  }
  onNetChange(refreshDaily)
  setInterval(refreshDaily, 30_000)

  // Announce (paid power) or, for the pilot job, a free captain's announcement.
  function openAnnounce({ pilot = false } = {}) {
    const body = openWin(pilot ? "Captain's Announcement" : 'Announce', 'w-ann', pilot ? 'yellow' : 'blue')
    el('p', 'desc', pilot ? 'Speak to the whole airport (everyone in the server hears it). Free for the pilot!' : 'Say something over the airport speakers. Everyone in the server hears it!', body)
    const input = el('input', 'ann-input', '', body)
    input.maxLength = 60
    input.placeholder = pilot ? 'This is your captain speaking...' : 'Attention passengers...'
    const b = el('button', 'btn green', pilot ? 'Announce' : `Announce ${coinTag(PRICES.announce)}`, body)
    const send = () => {
      const text = input.value.trim()
      if (!text) return input.focus()
      closeWin()
      if (pilot) onAction('pilotAnnounce', text)
      else if (store.spend(PRICES.announce)) onAction('announce', text)
    }
    tap(b, send)
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') send()
      e.stopPropagation()
    })
    setTimeout(() => input.focus(), 50)
  }

  // The first six are free; the Emoji Pack pass unlocks the rest.
  const EMOJIS = ['😀', '😂', '😎', '😱', '👋', '❤️', '😭', '🥳', '😡', '✈️', '🧳', '🔥', '🤡', '💀', '🤑', '😴', '🤯', '👑']
  function openEmoji() {
    const body = openWin('Emoji', 'w-emoji', 'yellow')
    const pack = store.has('emojiPack')
    const grid = el('div', 'emojis', '', body)
    EMOJIS.forEach((e, i) => {
      const locked = i >= 6 && !pack
      const b = el('button', `emo ${locked ? 'locked' : ''}`, locked ? `${e}<i>🔒</i>` : e, grid)
      tap(b, () => {
        if (locked) {
          sfx('error')
          toast('Unlock every emoji with the Emoji Pack pass!')
          return openShop('passes')
        }
        closeWin()
        onAction('emoji', e)
      })
    })
    if (!pack) {
      const more = el('button', 'btn small blue', 'Get the Emoji Pack', body)
      more.style.marginTop = '0.8em'
      tap(more, () => openShop('passes'))
    }
  }

  function boardingPass(d, r = null) {
    if (!d) {
      pass.className = 'pass'
      return
    }
    pass.innerHTML = `<div class="ph"><span>${AIRLINE}</span><span>BOARDING PASS</span></div>
      <div class="pb"><div><small>flight</small><b>${d.flight}</b></div><div><small>to</small><b>${d.city}</b></div><div><small>gate</small><b>${d.gate}</b></div><div><small>seat</small><b>${r?.seat ?? '13A'}</b></div></div>
      <div class="pf"><span>${d.time}</span><span>${(r?.cls ?? 'ECONOMY').toLowerCase()}</span><span class="bar"></span></div>`
    pass.className = 'pass show'
    sfx('pop')
    clearTimeout(passTimer)
    passTimer = setTimeout(() => pass.classList.add('tucked'), 7000)
  }

  function announce(text) {
    announceEl.innerHTML = `<span class="ico">${ICON.megaphone}</span><span>${text.replace(/</g, '&lt;')}</span>`
    announceEl.classList.remove('show')
    void announceEl.offsetWidth
    announceEl.classList.add('show')
  }

  refreshRoles()
  refreshDaily()

  return {
    root,
    setCamera(c) {
      camera = c
    },
    setMode(m) {
      root.classList.toggle('mode-cutscene', m === 'cutscene')
      root.classList.toggle('mode-play', m === 'play')
      document.body.classList.toggle('cutscene', m === 'cutscene')
    },
    cine: {
      bars(on) {
        cine.classList.toggle('bars', on)
      },
      subtitle(text) {
        if (!text) {
          sub.classList.remove('show')
          return
        }
        sub.textContent = text
        sub.classList.remove('show')
        void sub.offsetWidth
        sub.classList.add('show')
      },
      title(on) {
        title.classList.toggle('show', on)
      },
      skip(on) {
        skip.classList.toggle('show', on)
      },
      onSkip(fn) {
        onSkip = fn
      },
      fade(a, ms = 400) {
        fade.style.transition = `opacity ${ms}ms ease`
        fade.style.opacity = a
      },
    },
    setLine(n) {
      root.classList.toggle('in-line', n != null)
      if (n != null) pos.textContent = `Position In Line: #${n}`
    },
    big,
    toast,
    status(text) {
      statusEl.textContent = text ?? ''
      statusEl.classList.toggle('show', !!text)
    },
    prompt(text) {
      if (text) promptEl.textContent = text
      promptEl.classList.toggle('show', !!text)
    },
    boardingPass,
    announce,
    closeWin,
    openShop,
    openRewards,
    openDestinations,
    openAnnounce,
    refreshDaily,
    dialog,
    confirm: confirmBuy,
    // "PLANE ARRIVING IN" + a big countdown under Board The Plane (null hides it).
    planeTimer(time, label = 'PLANE ARRIVING IN') {
      planeTimer.classList.toggle('show', time != null)
      if (time == null) return
      planeTimer.firstChild.textContent = label
      planeTimer.lastChild.textContent = time
    },
    // The bottom action button: { label, text, color: 'blue' | 'green', price, onTap } or null.
    action(cfg) {
      root.classList.toggle('has-act', !!cfg)
      if (!cfg) return
      actL.textContent = cfg.label ?? ''
      actB.className = `act-b ${cfg.color ?? 'blue'}`
      actB.querySelector('.act-t').textContent = cfg.text
      actB.querySelector('.act-p').innerHTML = cfg.price ? coinTag(cfg.price) : ''
      actTap = cfg.onTap
    },
    actionLabel(text) {
      actL.textContent = text
    },
    showBoard(on) {
      board.style.display = on ? '' : 'none'
    },
    nowBoarding(on, text = 'now boarding') {
      nb.querySelector('.nb-t').textContent = text
      nb.classList.toggle('show', on)
    },
    // Dark pill under Board The Plane, e.g. "Walk to the line to join it!".
    hint(text) {
      if (text) hintEl.textContent = text
      hintEl.classList.toggle('show', !!text)
    },
  }
}
