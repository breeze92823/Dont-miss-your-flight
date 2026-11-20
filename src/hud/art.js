// Card artwork for the Daily Rewards / Shop / Destinations windows and the tool hotbar: glossy
// inline SVG with thick dark outlines (no image files). Gradient ids are shared between copies on
// purpose (identical definitions), prefixed `a-` so they never clash with icons.js.
import { ICON } from './icons.js'

const O = 'stroke="#14213d" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"'
const coinDef = '<radialGradient id="a-coin" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff2a6"/><stop offset=".55" stop-color="#ffc21a"/><stop offset="1" stop-color="#e08a00"/></radialGradient>'
const coin = (x, y, r) => `<circle cx="${x}" cy="${y}" r="${r}" fill="url(#a-coin)" stroke="#8a4b00" stroke-width="${r * 0.14}"/><ellipse cx="${x}" cy="${y}" rx="${r * 0.42}" ry="${r * 0.66}" fill="none" stroke="#c67600" stroke-width="${r * 0.14}"/><path d="M${x - r * 0.45} ${y - r * 0.5}q${r * 0.25} -${r * 0.25} ${r * 0.55} -${r * 0.18}" stroke="#fff" stroke-width="${r * 0.1}" stroke-linecap="round" fill="none" opacity=".8"/>`
const svg = (body, vb = '0 0 100 100') => `<svg viewBox="${vb}" xmlns="http://www.w3.org/2000/svg"><defs>${coinDef}</defs>${body}</svg>`

export const ART = {
  gift: svg(`<defs><linearGradient id="a-gb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a77bff"/><stop offset="1" stop-color="#5b2fd0"/></linearGradient></defs>
    <path d="M50 30c-6-16-26-20-26-8 0 8 14 9 26 8zM50 30c6-16 26-20 26-8 0 8-14 9-26 8z" fill="#ffc531" ${O}/>
    <rect x="16" y="44" width="68" height="46" rx="6" fill="url(#a-gb)" ${O}/><rect x="10" y="30" width="80" height="18" rx="5" fill="#8a5cff" ${O}/>
    <rect x="43" y="30" width="14" height="60" fill="#ffc531" ${O}/><path d="M22 52h56" stroke="rgba(255,255,255,.35)" stroke-width="4"/>`),
  check: svg(`${coin(50, 52, 40)}<path d="M28 52l15 15 30-34" fill="none" stroke="#14213d" stroke-width="15" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M28 52l15 15 30-34" fill="none" stroke="#3ee05a" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>`),
  coin1: svg(coin(50, 52, 36)),
  coin2: svg(`${coin(38, 40, 28)}${coin(60, 62, 30)}`),
  coin3: svg(`${coin(34, 64, 26)}${coin(66, 64, 26)}${coin(50, 36, 27)}`),
  police: ICON.police,
  pilot: ICON.pilot,
  devil: ICON.devil,
  skull: ICON.skull,
  luggage: ICON.luggage,
  plane: ICON.plane,
  megaphone: ICON.megaphone,
  emojiPack: ICON.emoji,
  grapple: svg(`<path d="M52 92V40" stroke="#14213d" stroke-width="9" stroke-linecap="round"/><path d="M52 92V40" stroke="#4a4f5c" stroke-width="4" stroke-linecap="round"/>
    <path d="M52 40c-14-2-20-12-16-24M52 40c14-2 20-12 16-24M52 40V12" fill="none" stroke="#14213d" stroke-width="8" stroke-linecap="round"/>
    <path d="M52 40c-14-2-20-12-16-24M52 40c14-2 20-12 16-24M52 40V12" fill="none" stroke="#c9d1de" stroke-width="3.5" stroke-linecap="round"/>
    <path d="M36 16l-6 4M68 16l6 4M52 12l0-6" stroke="#14213d" stroke-width="5" stroke-linecap="round"/>`),
  gravityGun: svg(`<defs><linearGradient id="a-gg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e3e8f0"/><stop offset="1" stop-color="#7d8799"/></linearGradient></defs>
    <path d="M14 58l14-18h40l10 10-8 20H40l-6 18H20l4-18z" fill="url(#a-gg)" ${O}/><path d="M66 40l18-10M70 50l20 0M66 60l18 10" stroke="#14213d" stroke-width="6" stroke-linecap="round"/>
    <path d="M66 40l18-10M70 50l20 0M66 60l18 10" stroke="#ffb020" stroke-width="2.5" stroke-linecap="round"/><circle cx="48" cy="50" r="8" fill="#ffd23d" ${O}/><circle cx="48" cy="50" r="3" fill="#fff"/>`),
  vip: svg(`<defs><linearGradient id="a-vp" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe066"/><stop offset="1" stop-color="#ff9d00"/></linearGradient></defs>
    <g transform="rotate(-18 50 50)"><path d="M10 34h80v10a7 7 0 0 0 0 14v10H10V58a7 7 0 0 0 0-14z" fill="url(#a-vp)" ${O}/>
    <path d="M26 38v26" stroke="#c45a00" stroke-width="3" stroke-dasharray="4 4"/><path d="M58 37l4 9 10 1-8 7 3 10-9-5-9 5 3-10-8-7 10-1z" fill="#ff6b3d" ${O}/></g>`),
  airHorn: svg(`<defs><linearGradient id="a-ah" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#c9d1de"/><stop offset=".5" stop-color="#fff"/><stop offset="1" stop-color="#aab4c4"/></linearGradient></defs>
    <rect x="36" y="44" width="28" height="48" rx="6" fill="url(#a-ah)" ${O}/><rect x="40" y="34" width="20" height="12" rx="3" fill="#e3263c" ${O}/>
    <path d="M44 34l-6-22h30l-10 22z" fill="#ff4b55" ${O}/><path d="M24 14l-8-6M22 26h-10M78 14l8-6M80 26h10" stroke="#ffd23d" stroke-width="5" stroke-linecap="round"/>`),
  handcuffs: svg(`<circle cx="32" cy="62" r="18" fill="none" stroke="#14213d" stroke-width="12"/><circle cx="32" cy="62" r="18" fill="none" stroke="#d6dde8" stroke-width="6"/>
    <circle cx="68" cy="40" r="18" fill="none" stroke="#14213d" stroke-width="12"/><circle cx="68" cy="40" r="18" fill="none" stroke="#d6dde8" stroke-width="6"/>
    <path d="M44 52l12-6" stroke="#14213d" stroke-width="9" stroke-linecap="round"/><path d="M44 52l12-6" stroke="#9aa5b8" stroke-width="4" stroke-linecap="round"/>`),
  banHammer: svg(`<path d="M50 44v50" stroke="#14213d" stroke-width="11" stroke-linecap="round"/><path d="M50 44v50" stroke="#5b3a22" stroke-width="5" stroke-linecap="round"/>
    <rect x="18" y="14" width="64" height="34" rx="6" fill="#2b2f3a" ${O}/><rect x="14" y="18" width="10" height="26" rx="3" fill="#4a4f5c" ${O}/><rect x="76" y="18" width="10" height="26" rx="3" fill="#4a4f5c" ${O}/>
    <text x="50" y="38" text-anchor="middle" font-family="Fredoka,Arial" font-weight="700" font-size="16" fill="#ff4b55">BAN</text>`),
  lostFound: svg(`<path d="M18 50h64l-6 40H24z" fill="#d99a4e" ${O}/><path d="M18 50l-8-14h36l4 14M82 50l8-14H54l-4 14" fill="#f0b569" ${O}/>
    <path d="M30 50c-4-14 2-30 10-34 6 4 4 16-2 20" fill="#ff7aa8" ${O}/><circle cx="40" cy="16" r="5" fill="#ff7aa8" ${O}/>
    <path d="M58 50V30h18" fill="none" stroke="#14213d" stroke-width="7" stroke-linecap="round"/><path d="M58 50V30h18" fill="none" stroke="#c9d1de" stroke-width="3" stroke-linecap="round"/>
    <path d="M72 30v8" stroke="#14213d" stroke-width="5" stroke-linecap="round"/><path d="M60 22l12-8 4 6" fill="#4fd36a" ${O}/>`),
  jet: svg(`<defs><linearGradient id="a-jt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#bcd6f0"/></linearGradient></defs>
    <path d="M8 54c10-8 60-12 78-8 8 2 8 8 0 10-18 4-68 4-78-2z" fill="url(#a-jt)" ${O}/><path d="M40 50L22 22h12l22 26zM44 56L28 82h12l18-24z" fill="#4c8cf5" ${O}/>
    <path d="M12 52l-4-16h8l8 14z" fill="#4c8cf5" ${O}/><path d="M60 46h4M68 46h4M52 47h4" stroke="#14213d" stroke-width="3" stroke-linecap="round"/>`),
  coinShower: svg(`<path d="M22 40a14 14 0 0 1 8-26 18 18 0 0 1 34-2 14 14 0 0 1 14 28z" fill="#fff" ${O}/>${coin(28, 62, 10)}${coin(52, 78, 11)}${coin(74, 58, 10)}${coin(44, 54, 7)}${coin(66, 84, 7)}`),
  disco: svg(`<defs><radialGradient id="a-ds" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff"/><stop offset=".5" stop-color="#9fd0ff"/><stop offset="1" stop-color="#3d5fd6"/></radialGradient></defs>
    <path d="M50 4v14" stroke="#14213d" stroke-width="4"/><circle cx="50" cy="54" r="34" fill="url(#a-ds)" ${O}/>
    <path d="M18 44h64M16 56h68M20 68h60M50 20v68M34 23c-6 20-6 42 0 62M66 23c6 20 6 42 0 62" stroke="#14213d" stroke-width="2" opacity=".55" fill="none"/>
    <rect x="36" y="38" width="9" height="9" fill="#fff"/><rect x="58" y="60" width="9" height="9" fill="#ffd8f2"/><path d="M84 18l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill="#fff36b"/>`),
  snow: svg(`<path d="M18 46a14 14 0 0 1 8-26 20 20 0 0 1 38-2 15 15 0 0 1 16 28z" fill="#fff" ${O}/>
    ${[[30, 66], [56, 74], [76, 60]].map(([x, y]) => `<g stroke="#14213d" stroke-width="7" stroke-linecap="round"><path d="M${x} ${y - 11}v22M${x - 10} ${y - 6}l20 12M${x - 10} ${y + 6}l20-12"/></g><g stroke="#8fd3ff" stroke-width="3" stroke-linecap="round"><path d="M${x} ${y - 11}v22M${x - 10} ${y - 6}l20 12M${x - 10} ${y + 6}l20-12"/></g>`).join('')}`),
  question: svg(`<text x="50" y="72" text-anchor="middle" font-family="Fredoka,Arial" font-weight="700" font-size="64" fill="#fff" stroke="#0b1226" stroke-width="5" paint-order="stroke">?</text>`),
}

// --- City postcards (Destinations): a street with the landmark at the end. Drawn in colour; the
// window greys out the ones not visited yet with a CSS filter.
const sky = (a, b) => `<defs><linearGradient id="a-sky-${a.slice(1)}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="160" height="100" fill="url(#a-sky-${a.slice(1)})"/>`
const cloud = (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})"><ellipse cx="0" cy="0" rx="14" ry="7" fill="#fff"/><ellipse cx="10" cy="-4" rx="10" ry="8" fill="#fff"/><ellipse cx="-9" cy="-2" rx="8" ry="6" fill="#fff"/></g>`
const street = (side) => `<path d="M0 100L66 64h28l66 36z" fill="#5d6574"/><path d="M80 66v4M80 76v6M80 88v8" stroke="#fff" stroke-width="2.5"/>
  <path d="M0 100L66 64H0z" fill="${side}"/><path d="M160 100L94 64h66z" fill="${side}"/>`
const car = (x, y, c, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})"><rect x="-8" y="-5" width="16" height="7" rx="2" fill="${c}" stroke="#14213d" stroke-width="1"/><rect x="-5" y="-9" width="10" height="5" rx="1.5" fill="#cfe9ff" stroke="#14213d" stroke-width="1"/><circle cx="-5" cy="2" r="2" fill="#14213d"/><circle cx="5" cy="2" r="2" fill="#14213d"/></g>`
const trees = (xs, y) => xs.map((x) => `<circle cx="${x}" cy="${y}" r="9" fill="#3fae4a" stroke="#1d5e2a" stroke-width="1.2"/><circle cx="${x + 6}" cy="${y - 5}" r="7" fill="#57c75c"/>`).join('')

export const CITY_ART = {
  CDG: svg(`${sky('#5fb8ff', '#cdeaff')}${cloud(30, 20)}${cloud(130, 14, 0.8)}
    <path d="M80 8l4 14h-8zM76 22h8l6 30H70zM70 52h20l10 14H60z" fill="#7a5a3a" stroke="#3b2a1a" stroke-width="1.5"/><path d="M70 52q10-10 20 0" fill="#cfe9ff" stroke="#3b2a1a" stroke-width="1.5"/>
    <path d="M73 38h14M71 46h18" stroke="#3b2a1a" stroke-width="1.2"/>${trees([18, 36, 128, 146], 62)}${street('#68b84e')}${car(50, 86, '#ff4b55')}${car(112, 80, '#ffc531', 0.8)}`, '0 0 160 100'),
  LHR: svg(`${sky('#79b6e8', '#d9ecfa')}${cloud(120, 18)}${cloud(28, 26, 0.7)}
    <rect x="72" y="18" width="16" height="48" fill="#c9a66b" stroke="#5a4320" stroke-width="1.5"/><path d="M70 18l10-14 10 14z" fill="#3d4f6a" stroke="#1d2838" stroke-width="1.5"/>
    <circle cx="80" cy="28" r="5.5" fill="#fff" stroke="#5a4320" stroke-width="1.5"/><path d="M80 28v-3M80 28h2.5" stroke="#14213d" stroke-width="1"/>
    <rect x="96" y="44" width="40" height="22" fill="#c9a66b" stroke="#5a4320" stroke-width="1.2"/><rect x="24" y="44" width="40" height="22" fill="#c9a66b" stroke="#5a4320" stroke-width="1.2"/>${street('#7d8696')}${car(48, 86, '#d6232e')}${car(116, 82, '#2b2f3a', 0.8)}`, '0 0 160 100'),
  JFK: svg(`${sky('#5aa9f0', '#d2e9ff')}${cloud(24, 16, 0.8)}
    ${[[10, 20, 22], [34, 8, 18], [54, 26, 14], [92, 30, 16], [110, 12, 20], [132, 22, 24]].map(([x, y, w]) => `<rect x="${x}" y="${y}" width="${w}" height="${66 - y}" fill="#8e9bb3" stroke="#3a4560" stroke-width="1.2"/><path d="M${x + 3} ${y + 6}h${w - 6}M${x + 3} ${y + 14}h${w - 6}M${x + 3} ${y + 22}h${w - 6}" stroke="#cfe0ff" stroke-width="2"/>`).join('')}
    <rect x="72" y="14" width="14" height="52" fill="#b9c3d6" stroke="#3a4560" stroke-width="1.5"/><path d="M74 14l5-10 5 10zM79 4v-4" fill="#b9c3d6" stroke="#3a4560" stroke-width="1.5"/>${street('#6f7a8c')}${car(52, 86, '#ffc531')}${car(108, 80, '#ffc531', 0.8)}`, '0 0 160 100'),
  HND: svg(`${sky('#6cb6f2', '#ffe3ec')}${cloud(130, 20, 0.9)}
    <path d="M80 6l-14 60h28z" fill="none" stroke="#e8452c" stroke-width="3.5"/><path d="M71 30h18M68 46h24" stroke="#e8452c" stroke-width="3.5"/><rect x="74" y="24" width="12" height="6" fill="#fff" stroke="#e8452c" stroke-width="1.5"/>
    ${[[14, 34, 22], [38, 44, 20], [104, 40, 20], [128, 30, 24]].map(([x, y, w]) => `<rect x="${x}" y="${y}" width="${w}" height="${66 - y}" fill="#a3aec4" stroke="#3a4560" stroke-width="1.2"/><path d="M${x + 3} ${y + 6}h${w - 6}M${x + 3} ${y + 14}h${w - 6}" stroke="#ffd6e6" stroke-width="2"/>`).join('')}
    ${street('#ffb3cc')}${car(50, 86, '#fff')}${car(114, 80, '#4c6ef5', 0.8)}`, '0 0 160 100'),
  CAI: svg(`${sky('#7cc4f5', '#fff1cc')}${cloud(30, 16, 0.7)}<circle cx="128" cy="18" r="8" fill="#ffe066"/>
    <path d="M52 66l28-46 28 46z" fill="#e8c06a" stroke="#8a6420" stroke-width="1.5"/><path d="M80 20l28 46H88z" fill="#c99a40"/><path d="M60 54h40M66 44h28M72 34h16" stroke="#a87c30" stroke-width="1"/>
    <path d="M14 66V40M14 40c-8 0-10 6-10 6M14 40c8 0 10 6 10 6M14 40c-4-6-10-6-10-6M14 40c4-6 10-6 10-6" fill="none" stroke="#3a7a2a" stroke-width="3" stroke-linecap="round"/>
    <path d="M146 66V44M146 44c-8 0-10 6-10 6M146 44c8 0 10 6 10 6" fill="none" stroke="#3a7a2a" stroke-width="3" stroke-linecap="round"/>${street('#e3c27a')}${car(50, 86, '#fff')}${car(110, 80, '#2a5fd6', 0.8)}`, '0 0 160 100'),
}
