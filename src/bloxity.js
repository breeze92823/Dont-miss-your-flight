// The Bloxity (Legion) SDK facade. Every SDK call goes through here. Nothing
// here may throw when the SDK is missing: a blocked sdk.bloxity.io leaves the
// game fully playable on the default avatar and keyboard controls.
// Docs: https://docs.bloxity.io/#html5
import { GAME_SLUG, GAME_TITLE, SETTINGS, DEV_MODE, LEADERBOARDS, coerceSetting } from './config.js'

export function sdk() {
  if (DEV_MODE) return null
  return (typeof window !== 'undefined' && window.Legion && window.Legion.SDK) || null
}

// --- State --------------------------------------------------------------
export const settings = {}
for (const key of Object.keys(SETTINGS)) settings[key] = coerceSetting(key, SETTINGS[key].def)

// `user` is only written from onUserChanged (re-reading getUser()). `ready`
// flips once auth has settled so the signed-in avatar load isn't pre-empted.
export const authState = { ready: false, user: null, guest: null }

let latestEquipped = null
let latestProportions = null
const avatarListeners = new Set()
const proportionListeners = new Set()
const authListeners = new Set()
const settingListeners = new Set()
const respawnListeners = new Set()
const unsubscribers = []

function emit(listeners, ...args) {
  for (const fn of listeners) {
    try {
      fn(...args)
    } catch (err) {
      console.warn('[bloxity] listener threw', err)
    }
  }
}

// Fires on any customizer change (may fire twice: optimistic, then confirmed;
// keep handlers idempotent). Each returns an unsubscribe.
export function onAvatarChanged(fn) {
  avatarListeners.add(fn)
  return () => avatarListeners.delete(fn)
}
export function onProportionsChanged(fn) {
  proportionListeners.add(fn)
  return () => proportionListeners.delete(fn)
}
export function subscribeAuth(fn) {
  authListeners.add(fn)
  fn(authState)
  return () => authListeners.delete(fn)
}
// fn(key, value) on every change of a SETTINGS key (already coerced).
export function onSetting(fn) {
  settingListeners.add(fn)
  return () => settingListeners.delete(fn)
}
// The portal's own pause-menu "Respawn" button.
export function onRespawnRequest(fn) {
  respawnListeners.add(fn)
  return () => respawnListeners.delete(fn)
}

// --- Auth ---------------------------------------------------------------
// The SDK fires onUserChanged immediately with a null user, then again once the
// portal handshake answers; a null user only settles auth after a grace period.
const GUEST_SETTLE_MS = 2500
let settleTimer = null

function settleAuth() {
  settleTimer = null
  if (authState.ready) return
  authState.ready = true
  emit(authListeners, authState)
}

function onUser() {
  const SDK = sdk()
  const user = SDK ? SDK.auth.getUser() : null
  latestEquipped = null // a different account's equip event must not linger
  latestProportions = null

  if (user || authState.ready) {
    if (settleTimer) clearTimeout(settleTimer)
    settleTimer = null
    authState.ready = true
  } else if (!settleTimer) {
    settleTimer = setTimeout(settleAuth, GUEST_SETTLE_MS)
  }
  authState.user = user
  try {
    authState.guest = user || typeof SDK.auth.getGuest !== 'function' ? null : SDK.auth.getGuest()
  } catch {
    authState.guest = null
  }
  emit(authListeners, authState)
}

// Name for the HUD badge.
export function displayName() {
  const u = authState.user
  if (u) return u.displayName || u.username || u.name || 'Player'
  const g = authState.guest
  if (g) return g.displayName || g.username || g.name || 'Guest'
  return sdk() ? 'Guest' : 'Offline'
}

// The player's Bloxity profile picture (user, else the guest's derived one) as an absolute
// http(s) URL, '' when there is none. Relative paths resolve against the CDN (staticUrl).
export function getPfp() {
  const raw = authState.user?.pfp || authState.guest?.pfp
  if (typeof raw !== 'string' || !raw) return ''
  try {
    let base = 'https://static.bloxity.io'
    try {
      base = sdk()?.environment?.()?.staticUrl || base
    } catch {
      // Older SDK builds have no environment().
    }
    const url = new URL(raw, base)
    return /^https?:$/.test(url.protocol) ? url.href : ''
  } catch {
    return ''
  }
}

// --- Init ---------------------------------------------------------------
let initialised = false

export function init() {
  if (initialised) return
  initialised = true

  const SDK = sdk()
  if (!SDK) {
    if (DEV_MODE) console.info('[bloxity] VITE_DEV_MODE=true: skipping SDK/CDN, running on the default avatar')
    else console.info('[bloxity] SDK not loaded: running offline on the default avatar')
    authState.ready = true
    emit(authListeners, authState)
    return
  }

  try {
    const onLocalhost = /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)
    SDK.init(onLocalhost ? { gameSlug: GAME_SLUG, portalUrl: 'https://bloxity.io' } : { gameSlug: GAME_SLUG })
    SDK.game.loadingStep(`Loading ${GAME_TITLE}`)

    for (const key of Object.keys(SETTINGS)) {
      const off = SDK.settings.listen(key, (raw) => {
        const next = coerceSetting(key, raw)
        if (settings[key] === next) return
        settings[key] = next
        emit(settingListeners, key, next)
      })
      if (typeof off === 'function') unsubscribers.push(off)
    }
    SDK.settings.triggerAll?.()

    unsubscribers.push(SDK.auth.onUserChanged(onUser))

    if (typeof SDK.avatar?.onAvatarChanged === 'function') {
      unsubscribers.push(
        SDK.avatar.onAvatarChanged((equipped) => {
          // The event payload wins over getEquipped(), which can lag the event.
          if (equipped && typeof equipped === 'object') latestEquipped = equipped
          emit(avatarListeners)
        }),
      )
    }
    if (typeof SDK.avatar?.onProportionsChanged === 'function') {
      unsubscribers.push(
        SDK.avatar.onProportionsChanged((proportions) => {
          if (proportions && typeof proportions === 'object') latestProportions = proportions
          emit(proportionListeners)
        }),
      )
    }

    unsubscribers.push(
      SDK.player.onEvent((event, data) => {
        if (event === 'respawn_request') emit(respawnListeners)
        else if (event === 'play_emote' && typeof data === 'string') emit(emoteListeners, data)
        else if (event === 'stop_emote') emit(emoteListeners, '')
      }),
    )
    initPlatformFeatures(SDK)

    SDK.game.loadingStep('Building the airport')
  } catch (err) {
    console.warn('[bloxity] init failed; running without the SDK', err)
    authState.ready = true
    emit(authListeners, authState)
  }
}

export function loadingStep(text) {
  try {
    sdk()?.game.loadingStep(text)
  } catch {
    // Non-fatal.
  }
}

let announcedFirstFrame = false

// Call once the scene has rendered: tells the portal loading is done.
export function notifyFirstFrame() {
  if (announcedFirstFrame) return
  announcedFirstFrame = true
  const SDK = sdk()
  if (!SDK) return
  try {
    SDK.game.loadingEnd()
    SDK.game.gameplayStart()
  } catch {
    // Non-fatal.
  }
}

export function teardown() {
  for (const off of unsubscribers.splice(0)) {
    try {
      off()
    } catch {
      // Tearing down anyway.
    }
  }
  try {
    sdk()?.game.gameplayEnd()
  } catch {
    // Non-fatal.
  }
}

// --- Avatar accessors (null when the SDK is unavailable or the call throws) ---
export function getEquippedAvatar() {
  if (latestEquipped) return latestEquipped
  try {
    return sdk()?.avatar.getEquipped() ?? null
  } catch {
    return null
  }
}

// { height, shoulderWidth, armLength, legOffsetX, torsoScaleX, neckHeight,
// headScale }, normalised around 1.0; loader.js applyProportions() consumes it.
export function getProportions() {
  try {
    const current = sdk()?.avatar.getProportions()
    return latestProportions ? { ...current, ...latestProportions } : current ?? null
  } catch {
    return latestProportions
  }
}

// Skin texture URL with the worn face, shirt and pants already drawn on.
export function getSkinTextureUrl() {
  try {
    const url = sdk()?.avatar?.getSkinTextureUrl?.()
    return typeof url === 'string' && url ? url : null
  } catch {
    return null
  }
}

export const canCustomize = () => typeof sdk()?.avatar?.toggleCustomizer === 'function'

// Opens / closes the portal's avatar editor; edits come back through onAvatarChanged.
export function toggleCustomizer() {
  try {
    sdk()?.avatar.toggleCustomizer()
  } catch {
    // Ignore.
  }
}

// --- Game server ------------------------------------------------------
// Bloxity hosting has no fixed socket URL: the matchmaker picks a pod with room (or wakes one) and
// the SDK returns its endpoint (the dev channel reaches the dev backend, prod the prod one). Each
// endpoint is pinned to one pod, so net.js builds a new Client per resolve.
export function canResolveServer() {
  try {
    return typeof sdk()?.net?.resolveEndpoint === 'function'
  } catch {
    return false
  }
}
// { endpoint, relayRoomId }: relayRoomId is the matchmaker relay pinning the pod (the endpoint is
// {playUrl}/v1/ws/<relayRoomId>). Rejects (net.js retries with backoff) when the matchmaker can't answer.
export async function resolveServerEndpoint(userId) {
  const { endpoint, roomId, cold } = await sdk().net.resolveEndpoint(GAME_SLUG, userId ? { userId } : undefined)
  if (cold) console.info('[net] waking up a server...')
  return { endpoint, relayRoomId: roomId }
}

// The ?roomId= the page was opened with: the game page's Open Rooms Join button (a bare Colyseus
// room id) or a friend invite (what updateRoom() reported: "<relayRoomId>~<colyseusRoomId>").
export function launchRoomId() {
  try {
    return new URLSearchParams(location.search).get('roomId') || ''
  } catch {
    return ''
  }
}

// Where a launch room lives: { endpoint, roomId, relayRoomId }, or null when it is gone, full or
// can't be found. A bare id needs the matchmaker's cross-pod directory (a plain joinById through
// any relay would usually land on another pod); a relay~room id is joined through its relay.
export async function locateRoom(id) {
  const playUrl = (() => {
    try {
      return sdk()?.environment?.()?.playUrl
    } catch {
      return '' // Older SDK builds have no environment().
    }
  })()
  if (!playUrl || !id) return null
  const base = playUrl.replace(/\/$/, '')
  const [relay, roomId] = id.includes('~') ? id.split('~', 2) : ['', id]
  if (relay) return { endpoint: `${base.replace(/^http/i, 'ws')}/v1/ws/${encodeURIComponent(relay)}`, roomId, relayRoomId: relay }
  const res = await fetch(`${base}/v1/dir/${encodeURIComponent(GAME_SLUG)}/list`)
  const rooms = res.ok ? (await res.json())?.rooms ?? [] : []
  const r = rooms.find((r) => r.colyseusRoomId === roomId && !r.locked && r.players < r.maxPlayers)
  return r ? { endpoint: r.joinUrl, roomId: r.colyseusRoomId, relayRoomId: r.relayRoomId } : null
}

// Reports the room this player is in ('' = not in a joinable room), so the portal's friend invites
// land in it.
export function updateRoom(roomId) {
  try {
    sdk()?.game?.updateRoom?.(roomId)
  } catch {
    // Ignore.
  }
}

// --- Portal -----------------------------------------------------------
export function showMenu() {
  try {
    sdk()?.portal.showMenu(true)
  } catch {
    // Ignore.
  }
}

// Where Boxity draws its own controls over the game: the toolbar in the top-left corner and
// the chat feed under it, as [{ id, left, top, width, height }] in CSS px. fn runs now and on
// every change (resize, toolbar change). Without the SDK (dev mode, blocked CDN) it gets the
// default footprint the SDK itself assumes until the portal reports, so the HUD is laid out
// the same everywhere. Returns an unsubscribe.
export function onReservedAreas(fn) {
  try {
    const off = sdk()?.ui?.onReservedAreasChange?.((areas) => fn(Array.isArray(areas) ? areas : []))
    if (typeof off === 'function') return off
  } catch {
    // Fall back to the estimate below.
  }
  const update = () => fn(estimatedReservedAreas(window.innerWidth, window.innerHeight))
  window.addEventListener('resize', update)
  update()
  return () => window.removeEventListener('resize', update)
}

// The SDK's estimate (legion-sdk ui.estimatedAreas): an 8 px margin round one row of buttons,
// the whole width on narrow phones, and the chat feed under it.
function estimatedReservedAreas(w, h) {
  const compact = w < 640 || h <= 500
  const toolbarHeight = 16 + (w < 640 ? 32 : w < 768 ? 40 : 44)
  const chatWidth = compact ? Math.min(w * 0.7, 260) : Math.min(w * 0.8, 360)
  return [
    { id: 'toolbar', left: 0, top: 0, width: Math.min(w, w < 480 ? w : 330), height: toolbarHeight },
    { id: 'chat', left: 0, top: toolbarHeight, width: Math.round(chatWidth + 8), height: compact ? 140 : 180 },
  ]
}

export function requestFullscreen(on) {
  try {
    const SDK = sdk()
    if (!SDK) return
    if (on) SDK.portal.requestFullscreen()
    else SDK.portal.exitFullscreen()
  } catch {
    // Ignore.
  }
}

// --- Platform features (docs.bloxity.io HTML5: Ads, Screen ads, Death screen, Leaderboards, Emotes,
// Overhead chat bubbles, Player events). Everything below is a no-op without the SDK. -----------------
const emoteListeners = new Set()
const chatListeners = new Set()
const breakListeners = new Set()

function initPlatformFeatures(SDK) {
  try {
    // Ad breaks (required): pause + mute while Boxity plays an ad.
    if (SDK.ads?.onBreakStart) {
      unsubscribers.push(SDK.ads.onBreakStart((e) => emit(breakListeners, true, e?.kind)))
      unsubscribers.push(SDK.ads.onBreakEnd((e) => emit(breakListeners, false, e?.kind)))
    }
    // Screen ads (required): declare every screen this game shows. Gameplay banners stay off.
    SDK.ads?.declareScreens?.({
      gameplay: {},
      results: { slots: [{ position: 'bottom-center', sizes: ['728x90', '320x100', '320x50'] }] },
    })
    // Leaderboards: the backend submits the scores; define() shows the boards in the portal.
    SDK.leaderboard?.define?.(LEADERBOARDS)
    // Emotes: the portal's emote wheel sends play_emote / stop_emote (handled in init's onEvent).
    SDK.game?.registerFeature?.('emotes')
    // Overhead chat bubbles: every chat message, ours included.
    if (SDK.chat?.onMessage) {
      unsubscribers.push(
        SDK.chat.onMessage((m) => {
          if (!m || m.isGif) return
          let text = m.text
          try {
            text = SDK.chat.bubbleText?.(m) ?? m.text
          } catch {
            // Raw text then.
          }
          if (typeof text === 'string' && text) emit(chatListeners, { userId: String(m.userId ?? ''), username: String(m.username ?? ''), text, mine: !!m.isLocalPlayer })
        }),
      )
    }
  } catch (err) {
    console.warn('[bloxity] platform features failed to start', err)
  }
}

// fn(emoteId) on the portal's emote wheel; '' = stop.
export function onEmote(fn) {
  emoteListeners.add(fn)
  return () => emoteListeners.delete(fn)
}
// fn({ userId, username, text, mine }) for every chat message (GIFs skipped).
export function onChat(fn) {
  chatListeners.add(fn)
  return () => chatListeners.delete(fn)
}
// fn(active, kind) when an ad break starts (true) / ends (false).
export function onAdBreak(fn) {
  breakListeners.add(fn)
  return () => breakListeners.delete(fn)
}

// The emote catalogue (GET {apiUrl}/v1/avatar/emotes), fetched once: id -> clip.
let emoteCatalogue = null
export function emoteClip(id) {
  emoteCatalogue ||= (async () => {
    const SDK = sdk()
    const api = SDK?.environment?.()?.apiUrl || 'https://api.bloxity.io'
    const res = await fetch(`${api.replace(/\/$/, '')}/v1/avatar/emotes`)
    const { emotes } = res.ok ? await res.json() : { emotes: [] }
    return new Map((emotes ?? []).filter((e) => e?.id && e.clip?.tracks).map((e) => [e.id, e.clip]))
  })().catch((err) => {
    console.warn('[bloxity] emote catalogue failed', err)
    emoteCatalogue = null
    return new Map()
  })
  return emoteCatalogue.then((m) => m.get(id) ?? null)
}

// The Bloxity game token the backend verifies (identity). '' for guests / no SDK.
export function getToken() {
  try {
    return sdk()?.auth?.getToken?.() || ''
  } catch {
    return ''
  }
}

// The signed-in player's look for the other passengers to draw: JSON { equipped, proportions }, ''
// for the default look.
export function lookJson() {
  if (!authState.user) return ''
  const equipped = getEquippedAvatar()
  if (!equipped) return ''
  try {
    return JSON.stringify({ equipped, proportions: getProportions() ?? null }).slice(0, 3000)
  } catch {
    return ''
  }
}
// Skin texture (pants / shirt / face drawn in) for another player's equipped set, or null.
export function skinTextureUrlFor(equipped) {
  try {
    const url = sdk()?.avatar?.getSkinTextureUrlFor?.(equipped)
    return typeof url === 'string' && url ? url : null
  } catch {
    return null
  }
}

// Friend toasts: someone joined the room after us / was already there.
export function playerJoined(username) {
  try {
    if (username) sdk()?.game?.playerJoined?.(username)
  } catch {
    // Ignore.
  }
}
export function playerInRoom(username) {
  try {
    if (username) sdk()?.game?.playerInRoom?.(username)
  } catch {
    // Ignore.
  }
}

// --- Rewarded ads ----------------------------------------------------------------------------------
export function rewardedAvailable() {
  try {
    return !!sdk()?.ads?.isAvailable?.()
  } catch {
    return false
  }
}
// Plays a rewarded ad: { status, rewardToken?, test?, reason? }. Grant only on status 'completed'
// AND a backend-verified token (net.js claimAdReward).
export async function showRewarded(placement) {
  try {
    const r = await sdk()?.ads?.showRewarded?.(placement)
    return r && typeof r === 'object' ? r : { status: 'disabled' }
  } catch {
    return { status: 'error' }
  }
}
// A full screen ad between scenes ('results' on landing). Returns a handle or null.
export function showScreenAd(type) {
  try {
    return sdk()?.ads?.screen?.(type) ?? null
  } catch {
    return null
  }
}
export function hideScreenAd() {
  try {
    sdk()?.ads?.hideScreen?.()
  } catch {
    // Ignore.
  }
}

// --- Death screen ------------------------------------------------------------------------------------
// Shows Boxity's death screen and resolves once the player may get up (countdown 0). Resolves at once
// without the SDK (outside Boxity the countdown is 0 too).
export function deathScreen() {
  let handle = null
  try {
    handle = sdk()?.deathScreen?.show?.()
  } catch {
    handle = null
  }
  if (!handle) return Promise.resolve()
  return Promise.resolve(handle.ready)
    .catch(() => {})
    .then(() => {
      try {
        if (!handle.respawn?.()) sdk()?.deathScreen?.hide?.()
      } catch {
        // Closed anyway.
      }
    })
}
