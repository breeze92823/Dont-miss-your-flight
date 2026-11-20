// Inline SVG icons for the HUD: glossy, thick dark outlines, gradients (no image files).
const O = 'stroke="#14213d" stroke-width="3" stroke-linejoin="round"'

export const ICON = {
  rewards: `<svg viewBox="0 0 64 64"><defs><linearGradient id="cr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff6b7a"/><stop offset="1" stop-color="#e3263c"/></linearGradient></defs>
    <rect x="8" y="12" width="48" height="44" rx="9" fill="#fff" ${O}/><path d="M8 21a9 9 0 0 1 9-9h30a9 9 0 0 1 9 9v6H8z" fill="url(#cr)" ${O}/>
    <rect x="18" y="6" width="6" height="12" rx="3" fill="#cfd6e4" ${O}/><rect x="40" y="6" width="6" height="12" rx="3" fill="#cfd6e4" ${O}/>
    <text x="32" y="50" text-anchor="middle" font-family="Fredoka,Arial" font-weight="700" font-size="22" fill="#14213d">31</text></svg>`,
  shop: `<svg viewBox="0 0 64 64"><defs><linearGradient id="sb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff5c8a"/><stop offset="1" stop-color="#c8174a"/></linearGradient></defs>
    <path d="M20 26c0-12 24-12 24 0" fill="none" stroke="#14213d" stroke-width="7" stroke-linecap="round"/><path d="M20 26c0-12 24-12 24 0" fill="none" stroke="#ff9fbd" stroke-width="3" stroke-linecap="round"/>
    <path d="M8 26h48l-6 28H14z" fill="url(#sb)" ${O}/><path d="M18 33l3 15M32 33v15M46 33l-3 15" stroke="#8e0d33" stroke-width="3" stroke-linecap="round"/></svg>`,
  globe: `<svg viewBox="0 0 64 64"><defs><radialGradient id="gb" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#7fd4ff"/><stop offset="1" stop-color="#1a6fd6"/></radialGradient></defs>
    <circle cx="32" cy="33" r="24" fill="url(#gb)" ${O}/><path d="M18 22c6-4 10 2 8 7s-8 3-9 9-6-2-3-8 0-6 4-8zM36 40c4-3 10-1 11 4s-6 8-9 5-6-5-2-9zM38 14c5 0 10 4 9 8s-6 2-8 0-6-8-1-8z" fill="#5fd35a" stroke="#14213d" stroke-width="2"/>
    <path d="M6 44c4-5 12-5 15 0 3-3 9-2 9 3H6z" fill="#fff" ${O}/><path d="M40 20c3-4 10-3 11 1 3-1 7 1 6 5H38c-1-3 0-5 2-6z" fill="#fff" stroke="#14213d" stroke-width="2"/></svg>`,
  luggage: `<svg viewBox="0 0 64 64"><rect x="9" y="22" width="22" height="32" rx="5" fill="#ff4b55" ${O} transform="rotate(-12 20 38)"/><rect x="33" y="18" width="22" height="34" rx="5" fill="#4fe0e8" ${O} transform="rotate(10 44 35)"/>
    <path d="M15 22v-8h10v8" fill="none" stroke="#14213d" stroke-width="3" transform="rotate(-12 20 38)"/><path d="M39 18v-9h10v9" fill="none" stroke="#14213d" stroke-width="3" transform="rotate(10 44 35)"/>
    <path d="M20 26v24M44 22v26" stroke="rgba(0,0,0,.25)" stroke-width="3"/></svg>`,
  devil: `<svg viewBox="0 0 64 64"><defs><linearGradient id="dv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b67bff"/><stop offset="1" stop-color="#6b2fd6"/></linearGradient></defs>
    <path d="M12 10l10 12M52 10L42 22" stroke="#14213d" stroke-width="8" stroke-linecap="round"/><path d="M12 10l10 12M52 10L42 22" stroke="#9b5cff" stroke-width="4" stroke-linecap="round"/>
    <path d="M10 30c0-12 10-16 22-16s22 4 22 16c0 14-8 26-22 26S10 44 10 30z" fill="url(#dv)" ${O}/>
    <ellipse cx="23" cy="33" rx="7" ry="8" fill="#fff" ${O}/><ellipse cx="41" cy="33" rx="7" ry="8" fill="#fff" ${O}/><circle cx="24" cy="34" r="3.5" fill="#14213d"/><circle cx="40" cy="34" r="3.5" fill="#14213d"/>
    <path d="M24 47q8 5 16 0" fill="none" stroke="#14213d" stroke-width="3" stroke-linecap="round"/></svg>`,
  plane: `<svg viewBox="0 0 64 64"><path d="M6 32L58 10 40 54 30 38z" fill="#bfe9ff" ${O}/><path d="M30 38L58 10 22 34z" fill="#7fc9f5" ${O}/><path d="M30 38l-2 12 8-8" fill="#4ea7e0" ${O}/></svg>`,
  skull: `<svg viewBox="0 0 64 64"><path d="M12 30C12 16 21 8 32 8s20 8 20 22c0 7-3 11-7 13v9H19v-9c-4-2-7-6-7-13z" fill="#f4f6fa" ${O}/>
    <ellipse cx="24" cy="31" rx="6" ry="7" fill="#14213d"/><ellipse cx="40" cy="31" rx="6" ry="7" fill="#14213d"/><path d="M32 38l-3 6h6z" fill="#14213d"/>
    <path d="M25 52v-6M32 52v-6M39 52v-6" stroke="#14213d" stroke-width="3"/></svg>`,
  megaphone: `<svg viewBox="0 0 64 64"><defs><linearGradient id="mg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7fb0ff"/><stop offset="1" stop-color="#2a5fd6"/></linearGradient></defs>
    <path d="M8 26h10l22-12v36L18 38H8z" fill="url(#mg)" ${O}/><rect x="12" y="38" width="8" height="14" rx="3" fill="#2a5fd6" ${O}/>
    <path d="M46 22q6 10 0 20M52 16q10 16 0 32" fill="none" stroke="#ffd23d" stroke-width="5" stroke-linecap="round"/></svg>`,
  emoji: `<svg viewBox="0 0 64 64">${[[18, 18], [44, 18], [18, 44], [44, 44]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="13" fill="#ffcc33" ${O}/><circle cx="${x - 4}" cy="${y - 2}" r="3.2" fill="#fff" stroke="#14213d" stroke-width="2"/><circle cx="${x + 4}" cy="${y - 2}" r="3.2" fill="#fff" stroke="#14213d" stroke-width="2"/><path d="M${x - 5} ${y + 5}q5 4 10 0" fill="none" stroke="#14213d" stroke-width="2.5" stroke-linecap="round"/>`).join('')}</svg>`,
  police: `<svg viewBox="0 0 64 64"><defs><linearGradient id="pc" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5a8dff"/><stop offset="1" stop-color="#1f3f9a"/></linearGradient></defs>
    <path d="M6 30c2-12 16-20 30-18s24 8 22 18z" fill="url(#pc)" ${O}/><path d="M8 30h48v8H8z" fill="#14213d"/><path d="M10 38q22 14 44 0" fill="#0b1226" ${O}/>
    <path d="M32 16l6 4v7l-6 4-6-4v-7z" fill="#ffc531" stroke="#8a5a00" stroke-width="2"/><circle cx="32" cy="23" r="2.5" fill="#fff6c8"/></svg>`,
  pilot: `<svg viewBox="0 0 64 64"><path d="M4 28c2-10 16-18 30-17s26 6 26 17z" fill="#f7f9fd" ${O}/><path d="M8 28h48v8H8z" fill="#1b1d24"/><path d="M10 36q22 14 44 0" fill="#0b0d14" ${O}/>
    <path d="M18 20q14-6 28 0-14 4-28 0z" fill="#ffc531" stroke="#8a5a00" stroke-width="1.5"/><circle cx="32" cy="20" r="4" fill="#3fb4ff" stroke="#14213d" stroke-width="2"/></svg>`,
  rocket: `<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="28" fill="#fff0f3" ${O}/><path d="M20 44c-2-10 8-26 26-28-2 18-18 28-28 26z" fill="#ff4b6e" ${O}/><circle cx="36" cy="28" r="5" fill="#bfe9ff" ${O}/>
    <path d="M20 44l-6 6M24 48l-4 6M16 40l-6 4" stroke="#ffb020" stroke-width="4" stroke-linecap="round"/></svg>`,
  coin: `<svg viewBox="0 0 64 64"><defs><radialGradient id="cn" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff2a6"/><stop offset=".55" stop-color="#ffc21a"/><stop offset="1" stop-color="#e08a00"/></radialGradient></defs>
    <circle cx="32" cy="32" r="27" fill="url(#cn)" stroke="#8a4b00" stroke-width="4"/><ellipse cx="32" cy="32" rx="12" ry="18" fill="none" stroke="#c67600" stroke-width="4"/><path d="M22 18q6-6 14-4" stroke="#fff" stroke-width="3" stroke-linecap="round" fill="none" opacity=".8"/></svg>`,
  skip: `<svg viewBox="0 0 64 64"><path d="M8 24h24V12l24 20-24 20V40H8z" fill="#bfe1ff" stroke="#1d3f8a" stroke-width="4" stroke-linejoin="round"/></svg>`,
  sound: `<svg viewBox="0 0 64 64"><path d="M10 24h10l14-12v40L20 40H10z" fill="#fff" ${O}/><path d="M42 22q6 10 0 20M48 16q10 16 0 32" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/></svg>`,
  mute: `<svg viewBox="0 0 64 64"><path d="M10 24h10l14-12v40L20 40H10z" fill="#fff" ${O}/><path d="M42 24l14 16M56 24L42 40" stroke="#ff5a5a" stroke-width="6" stroke-linecap="round"/></svg>`,
  bolt: `<svg viewBox="0 0 64 64"><path d="M36 4L12 36h16l-4 24 28-34H34z" fill="#ffe14d" ${O}/><path d="M33 12L20 31" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".7"/></svg>`,
  close: `<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="#fff" stroke-width="3.5" stroke-linecap="round"/></svg>`,
}

// A suitcase drawn in a colour (shop swatches).
export const suitcaseIcon = (c) => `<svg viewBox="0 0 64 64"><path d="M24 14v-6h16v6" fill="none" stroke="#14213d" stroke-width="4"/><rect x="14" y="14" width="36" height="40" rx="7" fill="${c}" ${O}/>
  <path d="M24 18v32M32 18v32M40 18v32" stroke="rgba(0,0,0,.18)" stroke-width="3"/><rect x="42" y="20" width="6" height="8" rx="1" fill="#ffcf33" stroke="#14213d" stroke-width="1.5"/>
  <circle cx="20" cy="57" r="3" fill="#14213d"/><circle cx="44" cy="57" r="3" fill="#14213d"/></svg>`
