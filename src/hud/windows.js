// The Daily Rewards, Shop (Passes / Trolls / Jobs) and Destinations windows. They open in the HUD's
// window frame (hud.js openWin) restyled as the big blue / green cards with the icon sticking out of
// the header and the round red close button on the corner. Every price is in coins.
//
// Daily Rewards: a 7-day calendar (config DAILY), one day unlocking per day on the server's clock
// for signed-in players (net.js; guests use the store's local calendar). Tap an unlocked day to
// claim it; the reward is granted only once the claim is accepted.
import './windows.css'
import { DAILY, DESTINATIONS, DEST_SOON, FEATURED_DESTINATIONS, SHOP, SUITCASES } from '../config.js'
import { store } from '../store.js'
import { claimDaily, dailyNow, dailyView, onNetChange, refreshDaily } from '../net.js'
import { ICON, suitcaseIcon } from './icons.js'
import { ART, CITY_ART } from './art.js'

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
const price = (n) => `<span class="cprice">${ICON.coin}<b>${n}</b></span>`
export const clock = (s) => {
  s = Math.max(0, Math.ceil(s))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h) return `${h}h ${m}m`
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

export function createWindows({ openWin, closeWin, onAction, toast, big, sfx }) {
  // The open window's frame: icon in the header + corner close button. Returns the body.
  function frame(title, cls, color, icon) {
    const body = openWin(title, `xw ${cls}`, color)
    const w = body.parentElement
    const head = w.querySelector('.win-head')
    el('span', 'xw-icon', icon, head)
    head.querySelector('span').className = 'xw-title'
    return body
  }
  let timer = 0
  const live = (body, fn) => {
    clearInterval(timer)
    timer = setInterval(() => (body.isConnected ? fn() : clearInterval(timer)), 1000)
  }

  // --- Daily Rewards ----------------------------------------------------------------------------
  const claimable = () => {
    const v = dailyView()
    return Math.max(0, v.unlocked - v.claimed.length)
  }
  let claiming = false
  async function claim(i, rerender) {
    if (claiming) return
    claiming = true
    const r = await claimDaily(i)
    claiming = false
    if (!r.ok) {
      sfx('error')
      toast(r.reason === 'offline' || r.reason === 'timeout' ? 'Could not reach the server. Try again!' : 'That reward is not ready yet.')
      return rerender()
    }
    grant(DAILY.days[i])
    rerender()
  }
  function grant(d) {
    sfx('fanfare')
    if (d.kind === 'coins') {
      store.addCoins(d.amount, null, true)
      big(`+${d.amount} COINS!`, 'gold', 1.4)
      return
    }
    store.grantTimed(d.id, d.minutes)
    if (d.kind === 'job') {
      store.set('hat', d.id)
      onAction('hat')
      big('SECURITY SHIFT!', 'gold', 1.6)
      toast(`You're on duty for ${d.minutes} minutes! Use the job panel.`)
    } else {
      onAction('tools')
      big(`${d.label.toUpperCase()}!`, 'gold', 1.6)
      toast(`${d.label} is yours for ${d.minutes} minutes! Find it in your hotbar.`)
    }
  }

  function rewards() {
    const body = frame('Daily Rewards', 'xw-daily', 'xblue', ART.gift)
    const render = () => {
      body.innerHTML = ''
      const v = dailyView()
      const grid = el('div', 'dr-grid', '', body)
      DAILY.days.forEach((d, i) => {
        const done = v.claimed.includes(i)
        const ready = !done && i < v.unlocked
        const card = el('button', `dr-card ${i === 6 ? 'dr-big' : ''} ${done ? 'done' : ''} ${ready ? 'ready' : ''}`, '', grid)
        card.type = 'button'
        el('span', 'dr-label', d.label, card)
        el('span', 'dr-art', done ? ART.check : ART[d.art], card)
        if (d.badge && !done) el('span', 'dr-badge', `${d.minutes} min`, card)
        el('span', `dr-day ${done ? 'claimed' : ''}`, done ? 'Claimed' : `Day ${i + 1}`, card)
        if (ready) el('span', 'dr-claim', 'Claim!', card)
        tap(card, () => {
          if (ready) return claim(i, render)
          sfx('click')
          if (!done) toast(`Come back tomorrow to unlock Day ${i + 1}!`)
        })
      })
      const foot = el('div', 'dr-foot', '', body)
      const tick = () => {
        const left = (dailyView().nextAt - dailyNow()) / 1000
        if (left <= 0) {
          refreshDaily()
          return render()
        }
        foot.innerHTML = `Next Reward In <b>${clock(left)}</b>`
      }
      tick()
      live(body, tick)
    }
    render()
    const off = onNetChange((what) => {
      if (!body.isConnected) return off()
      if (what === 'daily') render()
    })
  }

  // --- Shop ---------------------------------------------------------------------------------------
  const TABS = [
    ['passes', 'Passes', 'orange'],
    ['trolls', 'Trolls', 'red'],
    ['jobs', 'Jobs', 'blue'],
    ['bags', 'Bags', 'green'],
  ]
  let lastTab = 'passes'
  function shop(tab = lastTab) {
    lastTab = tab
    const body = frame('Shop', 'xw-shop', 'xgreen', ICON.shop)
    const tabs = el('div', 'sh-tabs', '', body)
    for (const [id, label, color] of TABS) {
      const b = el('button', `sh-tab ${id === tab ? `on ${color}` : ''}`, label, tabs)
      tap(b, () => {
        sfx('click')
        shop(id)
      })
    }
    const grid = el('div', 'sh-grid', '', body)
    const render = () => {
      grid.innerHTML = ''
      if (tab === 'bags') for (const s of SUITCASES) bagCard(s, grid, render)
      else for (const item of SHOP[tab]) card(item, tab, grid, render)
    }
    render()
    live(body, () => grid.querySelectorAll('[data-timed]').forEach((t) => (t.textContent = `⏱ ${clock(store.timeLeft(t.dataset.timed))}`)))
  }

  function card(item, tab, grid, render) {
    const c = el('div', 'sh-card', '', grid)
    const art = el('div', `sh-art bg-${item.bg}`, `<span class="rays"></span>${ART[item.art] ?? ''}`, c)
    if (tab === 'passes') el('span', 'sh-pass', 'PASS', art)
    if ((tab === 'passes' || tab === 'jobs') && !store.ownsForGood(item.id) && store.timeLeft(item.id) > 0) {
      const t = el('span', 'sh-timer', '', art)
      t.dataset.timed = item.id
      t.textContent = `⏱ ${clock(store.timeLeft(item.id))}`
    }
    el('b', 'sh-name', item.name, c)
    el('p', 'sh-desc', item.desc, c)
    let btn
    if (tab === 'passes') {
      const owned = store.ownsForGood(item.id)
      btn = el('button', `sh-buy ${owned ? 'owned' : ''}`, owned ? 'Owned' : price(item.price), c)
      tap(btn, () => {
        if (owned) return sfx('click')
        if (!store.spend(item.price)) return
        store.own('passes', item.id)
        sfx('fanfare')
        big(`${item.name.toUpperCase()} UNLOCKED!`, 'gold', 1.6)
        onAction('pass', item.id)
        render()
      })
    } else if (tab === 'trolls') {
      btn = el('button', 'sh-buy', price(item.price), c)
      tap(btn, () => {
        if (item.id === 'announce') {
          closeWin()
          return onAction('openAnnounce')
        }
        if (!onAction('canTroll')) return
        if (!store.spend(item.price)) return
        sfx('coin')
        closeWin()
        onAction(item.id)
      })
    } else {
      const owned = store.has(item.id)
      const on = store.data.hat === item.id
      btn = el('button', `sh-buy ${owned ? (on ? 'owned' : 'blue') : ''}`, owned ? (on ? 'On Duty' : 'Clock In') : price(item.price), c)
      tap(btn, () => {
        if (owned) {
          sfx('click')
          store.set('hat', on ? null : item.id)
          onAction('hat')
          toast(on ? 'Clocked out.' : `You're on duty: ${item.name.replace(/^Be (The )?/, '')}!`)
          return render()
        }
        if (!store.spend(item.price)) return
        store.own('hats', item.id)
        store.set('hat', item.id)
        sfx('fanfare')
        onAction('hat')
        big(item.id === 'pilot' ? 'CAPTAIN ON BOARD!' : 'SECURITY ON DUTY!', 'gold', 1.6)
        render()
      })
    }
  }

  // Suitcase colours (the bag you check in), kept from the first shop.
  function bagCard(s, grid, render) {
    const c = el('div', 'sh-card', '', grid)
    el('div', 'sh-art bg-sky', `<span class="rays"></span>${suitcaseIcon(s.color)}`, c)
    el('b', 'sh-name', `${s.name} Suitcase`, c)
    el('p', 'sh-desc', 'The bag you pull around and check in.', c)
    const owned = store.data.suitcases.includes(s.id)
    const eq = store.data.suitcase === s.id
    const b = el('button', `sh-buy ${eq ? 'owned' : owned ? 'blue' : ''}`, eq ? 'Equipped' : owned ? 'Equip' : s.price ? price(s.price) : 'Free', c)
    tap(b, () => {
      if (eq) return sfx('click')
      if (!owned) {
        if (!store.spend(s.price)) return
        store.own('suitcases', s.id)
        sfx('fanfare')
      } else sfx('click')
      store.set('suitcase', s.id)
      onAction('suitcase')
      render()
    })
  }

  // --- Destinations ---------------------------------------------------------------------------------
  function destinations() {
    const body = frame('Destinations', 'xw-dest', 'xblue', ICON.globe)
    const open = FEATURED_DESTINATIONS.map((i) => DESTINATIONS[i])
    const seen = open.filter((d) => store.data.visited.includes(d.code)).length
    const top = el('div', 'ds-top', `<b>${seen} / ${open.length} visited</b>`, body)
    el('div', 'ds-bar', `<i style="width:${(seen / open.length) * 100}%"></i>`, top)
    const row1 = el('div', 'ds-row', '', body)
    for (const d of open) {
      const v = store.data.visited.includes(d.code)
      const c = el('button', `ds-card ${v ? 'visited' : ''}`, '', row1)
      c.type = 'button'
      const pic = el('div', 'ds-pic', CITY_ART[d.code] ?? '', c)
      if (v) {
        el('span', 'ds-stamp', `${d.code}<small>VISITED</small>`, pic)
        el('span', 'ds-tick', ART.check, c)
      }
      el('b', 'ds-name', d.name, c)
      el('span', 'ds-sub', `${d.country} · ${d.code}`, c)
      el('span', `ds-pill ${v ? 'green' : 'grey'}`, v ? 'visited' : 'not visited yet', c)
      tap(c, () => {
        sfx('click')
        toast(v ? `You've been to ${d.name}! ✈` : `Pick ${d.name} at the check-in desk and clear security to visit it!`)
      })
    }
    const row2 = el('div', 'ds-row soon', '', body)
    for (const d of DEST_SOON) {
      const c = el('div', 'ds-card soon', '', row2)
      el('div', 'ds-pic q', ART.question, c)
      el('b', 'ds-name', d.name, c)
      el('span', 'ds-sub', `${d.country} · ${d.code}`, c)
      el('span', 'ds-pill orange', 'coming soon', c)
    }
  }

  return { rewards, shop, destinations, claimable }
}
