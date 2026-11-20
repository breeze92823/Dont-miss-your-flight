// Conversation + checkpoint UI: the agent panel (avatar, role pill, progress
// dots, typewriter line with a mood face, numbered answer buttons, kg tag,
// "Question N of 15" + Skip button), the destination postcards ("Where to?"),
// the seat map, the full boarding pass with its CHECKED IN stamp, and the
// security search panel ("FOUND ON YOU!" cards, search progress, Skip Search).
import './dialog.css'
import { ICON } from './icons.js'
import { postcard } from './scenes.js'

const FACE = {
  happy: `<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="14" fill="#ffcc33" stroke="#c98a00" stroke-width="2"/><path d="M9 14q2.5-3 5 0M18 14q2.5-3 5 0" fill="none" stroke="#5a3b00" stroke-width="2.2" stroke-linecap="round"/><path d="M10 19q6 6 12 0" fill="#c0392b" stroke="#5a3b00" stroke-width="2" stroke-linecap="round"/><ellipse cx="8" cy="19" rx="2.2" ry="1.4" fill="#ff8a80" opacity=".7"/><ellipse cx="24" cy="19" rx="2.2" ry="1.4" fill="#ff8a80" opacity=".7"/></svg>`,
  sus: `<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="14" fill="#ffcc33" stroke="#c98a00" stroke-width="2"/><path d="M8 10l6 2M18 12l6-3" stroke="#5a3b00" stroke-width="2.2" stroke-linecap="round"/><circle cx="11.5" cy="15" r="1.8" fill="#5a3b00"/><circle cx="21" cy="15" r="1.8" fill="#5a3b00"/><path d="M11 22h10" stroke="#5a3b00" stroke-width="2.2" stroke-linecap="round"/></svg>`,
  wow: `<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="14" fill="#ffcc33" stroke="#c98a00" stroke-width="2"/><circle cx="11" cy="13" r="2.2" fill="#5a3b00"/><circle cx="21" cy="13" r="2.2" fill="#5a3b00"/><ellipse cx="16" cy="21.5" rx="3.2" ry="4" fill="#7a2a1a" stroke="#5a3b00" stroke-width="1.5"/></svg>`,
}
const SHIELD = `<svg viewBox="0 0 32 32"><path d="M16 3l11 4v8c0 7-5 12-11 14C10 27 5 22 5 15V7z" fill="#3a6fd8" stroke="#14213d" stroke-width="2.2" stroke-linejoin="round"/><path d="M16 6l8 3v6c0 5-3.5 9-8 11z" fill="#e8434f"/><path d="M16 6v20c-4.5-2-8-6-8-11V9z" fill="#f4f6fa"/></svg>`
export const SEAT_ICON = {
  first: `<svg viewBox="0 0 64 64"><rect x="14" y="10" width="34" height="34" rx="8" fill="#b06a3b" stroke="#14213d" stroke-width="3"/><rect x="10" y="34" width="44" height="14" rx="6" fill="#d98a4b" stroke="#14213d" stroke-width="3"/><rect x="6" y="28" width="10" height="22" rx="4" fill="#8a4f2a" stroke="#14213d" stroke-width="3"/><rect x="48" y="28" width="10" height="22" rx="4" fill="#8a4f2a" stroke="#14213d" stroke-width="3"/><path d="M20 50v8M44 50v8" stroke="#14213d" stroke-width="4"/><circle cx="31" cy="6" r="4" fill="#ffd23d" stroke="#14213d" stroke-width="2"/></svg>`,
  business: `<svg viewBox="0 0 64 64"><path d="M10 12l14-4 8 26-14 6z" fill="#7a8aa6" stroke="#14213d" stroke-width="3" stroke-linejoin="round"/><path d="M18 40l26-6 10 10-28 8z" fill="#9aa9c3" stroke="#14213d" stroke-width="3" stroke-linejoin="round"/><path d="M44 34l14 4v6l-4 2" fill="#5d6b85" stroke="#14213d" stroke-width="3" stroke-linejoin="round"/><path d="M26 52v6M48 46v8" stroke="#14213d" stroke-width="4"/></svg>`,
  premium: `<svg viewBox="0 0 64 64"><rect x="16" y="8" width="20" height="34" rx="6" fill="#3fd6c0" stroke="#14213d" stroke-width="3" transform="rotate(-8 26 25)"/><rect x="14" y="36" width="32" height="12" rx="5" fill="#5fe8d3" stroke="#14213d" stroke-width="3"/><path d="M46 40h10l2 6H46" fill="#2fb7a3" stroke="#14213d" stroke-width="3" stroke-linejoin="round"/><path d="M20 48v10M40 48v10" stroke="#14213d" stroke-width="4"/></svg>`,
}

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
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const coin = (n) => `<span class="dprice">${ICON.coin}${n}</span>`

export function createDialog(root, { sfx, typeSpeed = 40, hold = 0.9 }) {
  const layer = el('div', 'dlg', '', root)

  // --- Agent panel -------------------------------------------------------------------------
  const wrap = el('div', 'ap-wrap', '', layer)
  const panel = el('div', 'ap', '', wrap)
  const avatar = el('div', 'ap-avatar', 'SH', panel)
  const main = el('div', 'ap-main', '', panel)
  const topRow = el('div', 'ap-top', '', main)
  const role = el('span', 'ap-role', 'check-in agent', topRow)
  const dotsEl = el('div', 'ap-dots', '', topRow)
  const textRow = el('div', 'ap-text', '', main)
  const mood = el('span', 'ap-mood', '', textRow)
  const line = el('span', 'ap-line', '', textRow)
  const kgEl = el('div', 'ap-kg', '', panel)
  const opts = el('div', 'ap-opts', '', wrap)
  const foot = el('div', 'ap-foot', '', layer)
  const footCount = el('div', 'ap-count', '', foot)
  const footBtn = el('button', 'ap-skip', '', foot)
  let footFn = null
  tap(footBtn, () => footFn?.())

  let typing = null
  let skipTyping = false
  function type(text) {
    clearInterval(typing)
    line.textContent = ''
    skipTyping = false
    return new Promise((resolve) => {
      let i = 0
      const step = Math.max(12, 1000 / typeSpeed)
      typing = setInterval(() => {
        if (skipTyping) i = text.length
        else i++
        line.textContent = text.slice(0, i)
        if (i % 3 === 1 && i < text.length) sfx('talk', { f: 520 + Math.random() * 260 })
        if (i >= text.length) {
          clearInterval(typing)
          resolve()
        }
      }, step)
    })
  }
  // Tapping the panel finishes the current line at once.
  tap(panel, () => (skipTyping = true))

  let keyHandler = null
  let cancelAsk = null
  window.addEventListener('keydown', (e) => {
    if (keyHandler && /^Digit[1-9]$/.test(e.code)) keyHandler(Number(e.code.slice(5)) - 1)
  })

  const api = {
    open(roleText = 'check-in agent', initials = 'SH', color = '#2f7fe0') {
      role.textContent = roleText
      avatar.textContent = initials
      avatar.style.setProperty('--c', color)
      layer.classList.add('show')
      document.body.classList.add('dialog-open')
      opts.innerHTML = ''
      line.textContent = ''
      mood.innerHTML = ''
    },
    close() {
      layer.classList.remove('show')
      document.body.classList.remove('dialog-open')
      clearInterval(typing)
      keyHandler = null
      api.foot(null)
      api.kg(null)
    },
    dots(n, total) {
      if (total == null) {
        dotsEl.innerHTML = ''
        return
      }
      if (dotsEl.children.length !== total) dotsEl.innerHTML = '<i></i>'.repeat(total)
      ;[...dotsEl.children].forEach((d, i) => {
        d.className = i < n ? 'on' : i === n ? 'cur' : ''
      })
    },
    kg(v) {
      kgEl.textContent = v == null ? '' : `${v.toFixed(1)} kg`
      kgEl.classList.toggle('show', v != null)
    },
    foot(o) {
      foot.classList.toggle('show', !!o)
      if (!o) return
      footCount.textContent = o.count ?? ''
      footBtn.className = `ap-skip ${o.style ?? 'teal'}`
      footBtn.innerHTML = `<span>${o.label}</span>${o.price ? coin(o.price) : ''}`
      footFn = o.onClick
    },
    // The agent says a line (mood face + typewriter), then holds it.
    async say(text, m = 'happy', holdFor = hold) {
      opts.innerHTML = ''
      wrap.classList.remove('asking')
      mood.innerHTML = FACE[m] ?? ''
      mood.classList.remove('pop')
      void mood.offsetWidth
      mood.classList.add('pop')
      await type(text)
      if (m === 'sus') sfx('hmm')
      await wait(holdFor * 1000)
    },
    // Question + answer buttons. answers: [{ label, style, price, icon }]. Resolves to the index.
    async ask(text, answers, { numbered = true } = {}) {
      mood.innerHTML = ''
      opts.innerHTML = ''
      wrap.classList.add('asking')
      await type(text)
      return new Promise((resolve) => {
        const styles = ['blue', 'purple', 'orange']
        const buttons = answers.map((a, i) => {
          const b = el('button', `ap-opt ${a.style ?? styles[i % 3]}`, `${numbered ? `<span class="num">${i + 1}</span>` : ''}${a.icon ? `<span class="oi">${a.icon}</span>` : ''}<span class="ol">${a.label}</span>${a.price ? coin(a.price) : ''}`, opts)
          b.style.animationDelay = `${i * 60}ms`
          return b
        })
        const pick = (i) => {
          if (i < 0 || i >= buttons.length) return
          keyHandler = null
          sfx('select')
          buttons.forEach((b, k) => b.classList.add(k === i ? 'picked' : 'gone'))
          burst(buttons[i])
          setTimeout(() => resolve(i), 260)
        }
        buttons.forEach((b, i) => tap(b, () => pick(i)))
        keyHandler = pick
        cancelAsk = () => {
          keyHandler = null
          opts.innerHTML = ''
          resolve(-1)
        }
      })
    },
    // Ends a pending ask() with -1 (e.g. Skip Questions was bought mid-question).
    cancel() {
      skipTyping = true
      cancelAsk?.()
      cancelAsk = null
    },
    // "Where to?" postcards. list: [{ index, name, country, code, color, city }].
    pickDestination(list, current) {
      return new Promise((resolve) => {
        const back = el('div', 'dest-back', '', layer)
        const card = el('div', 'dest', '<h2>WHERE TO?</h2><p>Pick your destination</p>', back)
        const row = el('div', 'dest-row', '', card)
        list.forEach((d, i) => {
          const c = el('button', `pc ${d.index === current ? 'cur' : ''}`, `<div class="img"><img alt="" src="${postcard(d.city)}"></div><b>${d.name}</b><small>${d.country} · ${d.code}</small><span class="bar" style="--c:${d.color}"></span>`, row)
          c.style.animationDelay = `${i * 70}ms`
          tap(c, () => {
            sfx('chime')
            back.classList.add('out')
            setTimeout(() => back.remove(), 250)
            resolve(d.index)
          })
        })
        sfx('pop')
      })
    },
    // Seat map of your class's section (checkin.js classSection: rows + seat blocks split by the two
    // aisles); `taken` is a Set of seat ids. Resolves to the chosen seat.
    pickSeat(taken, sec) {
      return new Promise((resolve) => {
        const back = el('div', 'dest-back', '', layer)
        const card = el('div', `seats c-${sec.id}`, `<h2>PICK YOUR SEAT</h2><p><b class="seat-cls">${sec.name}</b> · window seats glow. Tap a free seat.</p>`, back)
        const grid = el('div', 'seat-grid', '', card)
        const pattern = sec.blocks.join(' ')
        const n = pattern.replace(/ /g, '').length
        const cols = `1.6em ${[...pattern].map((c) => (c === ' ' ? '1em' : 'var(--sw)')).join(' ')}`
        grid.style.setProperty('--sw', n > 6 ? '1.75em' : n > 4 ? '2.1em' : '2.8em')
        const head = el('div', 'seat-row head', '', grid)
        head.style.gridTemplateColumns = cols
        for (const c of ` ${pattern}`) el('span', '', c === ' ' ? '' : c, head)
        const last = pattern[pattern.length - 1]
        for (const r of sec.rows) {
          const row = el('div', 'seat-row', '', grid)
          row.style.gridTemplateColumns = cols
          el('span', 'rn', String(r), row)
          for (const c of pattern) {
            if (c === ' ') {
              el('span', 'aisle', '', row)
              continue
            }
            const id = `${r}${c}`
            const free = !taken.has(id)
            const s = el('button', `seat ${free ? '' : 'taken'} ${c === pattern[0] || c === last ? 'window' : ''}`, '', row)
            if (free)
              tap(s, () => {
                sfx('select')
                s.classList.add('picked')
                setTimeout(() => {
                  back.classList.add('out')
                  setTimeout(() => back.remove(), 250)
                  resolve(id)
                }, 350)
              })
          }
        }
        sfx('pop')
      })
    },
    // Full boarding pass with the CHECKED IN stamp. Resolves when dismissed (tap or ~5 s).
    pass(d) {
      return new Promise((resolve) => {
        const back = el('div', 'bp-back', '', layer)
        const bp = el(
          'div',
          'bp',
          `<div class="bp-head"><span>${d.airline}</span><span>BOARDING PASS</span></div>
          <div class="bp-body"><div class="bp-main">
            <small>PASSENGER</small><b class="name">${d.passenger}</b>
            <div class="route"><div><b>${d.from}</b><small>${d.fromName}</small></div><span class="arrow">✈</span><div><b>${d.to}</b><small>${d.toName}</small></div></div>
            <div class="row"><div><small>FLIGHT</small><b>${d.flight}</b></div><div><small>GATE</small><b>${d.gate}</b></div><div><small>BOARDING</small><b>NOW</b></div><div><small>CLASS</small><b>${d.cls}</b></div></div>
          </div><div class="bp-stub"><small>SEAT</small><b class="bseat">${d.seat}</b><div class="barcode"></div></div></div>
          <div class="stamp">CHECKED IN</div>`,
          back,
        )
        sfx('pop')
        setTimeout(() => {
          bp.classList.add('stamped')
          sfx('stamp')
        }, 650)
        let done = false
        const close = () => {
          if (done) return
          done = true
          back.classList.add('out')
          setTimeout(() => back.remove(), 300)
          resolve()
        }
        tap(back, close)
        setTimeout(close, 5200)
      })
    },
  }

  // Little confetti burst out of a picked button (DOM, a dozen dots).
  function burst(b) {
    const r = b.getBoundingClientRect()
    const cols = ['#ffd84a', '#4fd6ff', '#7cff6b', '#ff5c8a', '#ffffff']
    for (let i = 0; i < 14; i++) {
      const d = el('i', 'spark', '', root)
      const a = Math.random() * Math.PI * 2
      const v = 60 + Math.random() * 90
      d.style.left = `${r.left + r.width * (0.3 + Math.random() * 0.4)}px`
      d.style.top = `${r.top + r.height / 2}px`
      d.style.background = cols[i % cols.length]
      d.animate([{ transform: 'translate(-50%,-50%) scale(1)', opacity: 1 }, { transform: `translate(calc(-50% + ${Math.cos(a) * v}px), calc(-50% + ${Math.sin(a) * v - 30}px)) scale(0.3)`, opacity: 0 }], { duration: 600 + Math.random() * 300, easing: 'cubic-bezier(.2,.8,.4,1)' }).onfinish = () => d.remove()
    }
  }

  // --- Security search panel -----------------------------------------------------------------
  const search = el('div', 'srch', '', layer)
  const found = el('div', 'found', `<div class="tab">FOUND ON YOU!</div><div class="no"></div><div class="icon"><span></span></div><div class="fb"><b class="title"></b><div class="quote">${SHIELD}<span></span></div></div>`, search)
  const progWrap = el('div', 'prog', '<div class="track"><div class="fill"></div></div>', search)
  const sfoot = el('div', 'ap-foot show', '<div class="ap-count"></div>', search)
  const sbtn = el('button', 'ap-skip gold', '', sfoot)
  let sFn = null
  tap(sbtn, () => sFn?.())
  api.search = {
    // bar: show the search progress bar (off while you're still walking to the mat).
    show(price, onSkip, { bar = true } = {}) {
      search.classList.add('show')
      search.classList.toggle('nobar', !bar)
      found.classList.remove('show')
      document.body.classList.add('dialog-open')
      sbtn.innerHTML = `<span>Skip Search</span>${coin(price)}`
      sFn = onSkip
    },
    label(text) {
      sfoot.querySelector('.ap-count').textContent = text
    },
    update(remaining, frac) {
      const m = Math.floor(remaining / 60)
      const s = Math.floor(remaining % 60)
      sfoot.querySelector('.ap-count').textContent = `Searching... ${m}:${String(s).padStart(2, '0')}`
      progWrap.querySelector('.fill').style.width = `${Math.max(4, frac * 100)}%`
    },
    found(item, n) {
      found.querySelector('.no').textContent = `#${n}`
      found.querySelector('.icon span').textContent = item.icon
      found.querySelector('.title').textContent = item.name
      const q = found.querySelector('.quote span')
      q.textContent = ''
      found.classList.remove('show')
      void found.offsetWidth
      found.classList.add('show')
      sfx('found')
      let i = 0
      const t = setInterval(() => {
        i++
        q.textContent = item.line.slice(0, i)
        if (i >= item.line.length) clearInterval(t)
      }, 22)
    },
    hideFound() {
      found.classList.remove('show')
    },
    hide() {
      search.classList.remove('show')
      document.body.classList.remove('dialog-open')
    },
  }
  // Red alarm flash over the whole screen (the detector went off).
  const flashEl = el('div', 'alarm-flash', '', root)
  api.flash = () => {
    flashEl.classList.remove('on')
    void flashEl.offsetWidth
    flashEl.classList.add('on')
  }
  return api
}
