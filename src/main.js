import { ACESFilmicToneMapping, Clock, Group, PCFSoftShadowMap, PerspectiveCamera, Quaternion, Scene, SRGBColorSpace, Vector2, Vector3, WebGLRenderer } from 'three'
import { AIRPORT, CAMERA, CUTSCENE, graphicsPreset, QUEUE, RENDER, SECURITY, SPAWN, SPAWN_FACING, SUITCASES } from './config.js'
import * as bloxity from './bloxity.js'
import { install as installInput, onKey } from './input.js'
import { installTouch } from './touch.js'
import { createPlayerBody, interpolate as interpolatePlayer, player, resetPlayer, respawn } from './player.js'
import { setCameraSensitivity, syncYawToPlayer, update as updateCamera } from './camera.js'
import { onModeChanged, toggleMode } from './modes.js'
import { bodyCount, initPhysics, stepPhysics } from './physics.js'
import { createLighting } from './lighting.js'
import { createSky } from './world.js'
import { createPostFx } from './postfx.js'
import { setNeonBloom } from './propkit.js'
import { buildDefaultCharacter, loadBaseCharacter } from './avatar/character.js'
import { applyProportions, attachEquippedAccessories } from './avatar/loader.js'
import { disposeAnimator, makeAnimator } from './avatar/animator.js'
import { initAudio, onAudioUnlocked, setIndoor, sfx, startAmbience, updateAmbience } from './audio.js'
import { createFx } from './fx.js'
import { buildExterior } from './airport/exterior.js'
import { buildInterior } from './airport/interior.js'
import { createCrowd } from './crowd.js'
import { createQueue } from './queue.js'
import { createSecurity } from './security.js'
import { buildSecurityHall } from './airport/securityHall.js'
import { createSuitcase, makeBackpack, makeHat, wearHat, wearOnBack } from './suitcase.js'
import { createHud } from './hud/hud.js'
import { createPowers } from './powers.js'
import { createCutscene } from './cutscene.js'
import { store } from './store.js'
import { createTrolls } from './trolls.js'
import { createTools } from './tools.js'
import { initNet, net, onTrolled } from './net.js'

// Boot order: Bloxity SDK -> renderer -> Rapier (async wasm) -> airport (curb,
// terminal, hall), crowd + queue, player body, HUD -> avatar (async) -> the
// opening taxi cutscene -> gameplay at the entrance doors.
let lighting = null
let renderer = null
let postfx = null
let fx = null

function applySetting(key, value) {
  if (key === 'camera_sensitivity') setCameraSensitivity(value)
  else if (key === 'fullscreen') bloxity.requestFullscreen(value)
  else if (key === 'graphics_quality' && renderer) {
    const next = graphicsPreset(value)
    renderer.shadowMap.enabled = next.shadows
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, next.dpr))
    lighting?.setShadows(next)
    postfx?.configure(next)
    setNeonBloom(next.bloom)
    fx?.setDensity(next.particles)
    postfx?.setSize(window.innerWidth, window.innerHeight)
  }
}
bloxity.onSetting(applySetting)
bloxity.init()

// --- Renderer ---------------------------------------------------------------
const preset = graphicsPreset(bloxity.settings.graphics_quality)
renderer = new WebGLRenderer({ antialias: preset.antialias, powerPreference: 'high-performance' })
renderer.outputColorSpace = SRGBColorSpace
renderer.toneMapping = ACESFilmicToneMapping
renderer.toneMappingExposure = RENDER.exposure
renderer.shadowMap.enabled = preset.shadows
renderer.shadowMap.type = PCFSoftShadowMap
renderer.setPixelRatio(Math.min(window.devicePixelRatio, preset.dpr))
document.body.appendChild(renderer.domElement)
installInput(() => bloxity.showMenu(), renderer.domElement)

const scene = new Scene()
const camera = new PerspectiveCamera(CAMERA.fov, 1, CAMERA.near, CAMERA.far)
let viewH = 800
const chaseCam = new PerspectiveCamera(CAMERA.fov, 1, CAMERA.near, CAMERA.far) // gameplay camera target during the hand-off blend
postfx = createPostFx(renderer, scene, camera)
postfx.configure(preset)

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight)
  postfx.setSize(window.innerWidth, window.innerHeight)
  for (const c of [camera, chaseCam]) {
    c.aspect = window.innerWidth / window.innerHeight
    c.updateProjectionMatrix()
  }
  viewH = renderer.getDrawingBufferSize(new Vector2()).y || window.innerHeight
}
window.addEventListener('resize', resize)
resize()

for (const key of Object.keys(bloxity.settings)) applySetting(key, bloxity.settings[key])

// --- Audio (starts on the first tap / key if the browser blocks autoplay) ------
initAudio()
startAmbience()
onAudioUnlocked(() => startAmbience())

// --- Physics + world ----------------------------------------------------------
bloxity.loadingStep('Starting physics')
await initPhysics()

lighting = createLighting(scene, renderer, preset)
fx = createFx(scene)
fx.setDensity(preset.particles)
resize()
createSky(scene)
bloxity.loadingStep('Building the airport')
const exterior = buildExterior(scene, { lighting, fx })
const interior = buildInterior(scene)
const secHall = buildSecurityHall(scene, { makeArrow: interior.makeArrow, pillSign: interior.pillSign })
const crowd = createCrowd(scene, 100)
createPlayerBody()
syncYawToPlayer()

const suitcase = createSuitcase(scene, fx)
const suitcaseColor = () => (SUITCASES.find((s) => s.id === store.data.suitcase) ?? SUITCASES[0]).color
suitcase.setColor(suitcaseColor())

// --- HUD + game systems --------------------------------------------------------
let queue = null
let powers = null
const hud = createHud({ onAction })
hud.setCamera(camera)
let security = null
const playerName = () => {
  const u = bloxity.authState.user
  return (u && (u.username || u.displayName || u.name)) || 'Passenger'
}
queue = createQueue({ scene, crowd, interior, fx, suitcase, hud, store, dialog: hud.dialog, getPlayerName: playerName, toSecurity: (npc) => security.adopt(npc) })
queue.newFlight(store.data.dest)
security = createSecurity({ scene, crowd, hall: secHall, interior, fx, hud, store, queue })
powers = createPowers({ scene, crowd, fx, hud, camera, getPlayer: () => player.renderPosition })
// Shop trolls, tools (passes / timed rewards), job panels, VIP; the server link (saves, Daily
// Reward, trolls from the other players in the room).
const trolls = createTrolls({ scene, crowd, fx, hud, store, getPlayer: () => player.renderPosition })
const isPlaying = () => blend >= 0 && !document.body.classList.contains('cutscene')
const tools = createTools({ scene, camera, canvas: renderer.domElement, crowd, fx, hud, powers, trolls, queue, security, player, getName: playerName, onHat: () => applyHat(), isPlaying })
onTrolled(tools.receive)
initNet()

function onAction(name, arg) {
  switch (name) {
    case 'skipLine':
      if (security.mode === 'line') security.skipLine()
      else if (!queue.skipLine()) hud.toast('Join the line first!')
      return
    case 'canBoard':
      if (security.mode === 'cleared') {
        hud.toast('Boarding opens in the next update!')
        return false
      }
      if (queue.mode === 'turn' || queue.mode === 'desk' || ['turn', 'tray', 'detector'].includes(security.mode)) {
        hud.toast("It's already your turn!")
        return false
      }
      return true
    case 'boardPlane':
      // Fast track: past the check-in desk, or (once checked in) past security.
      if (queue.mode === 'checked') security.fastTrack()
      else queue.fastTrack()
      return
    // Trolls (power buttons + Shop): run here and relayed to everyone in the server.
    case 'luggageRain':
    case 'killAll':
    case 'paperPlanes':
    case 'scareAll':
    case 'lostFound':
    case 'jetFlyover':
    case 'coinShower':
    case 'party':
    case 'snow':
    case 'announce':
      tools.useTroll(name, arg)
      return
    case 'canTroll':
      if (!isPlaying()) hud.toast('Wait for the game to start!')
      return isPlaying()
    case 'openAnnounce':
      hud.openAnnounce()
      return
    case 'pilotAnnounce':
      tools.pilotAnnounce(arg)
      return
    case 'pass':
    case 'tools':
      tools.refresh()
      return
    case 'emoji':
      powers.emoji(arg)
      return
    case 'hat':
      applyHat()
      tools?.refresh()
      return
    case 'suitcase':
      suitcase.setColor(suitcaseColor())
      return
    case 'newFlight':
      queue.newFlight(arg)
      return
  }
}

// --- Player avatar ----------------------------------------------------------
const playerGroup = new Group()
playerGroup.rotation.order = 'YXZ'
scene.add(playerGroup)
let avatar = null
let animator = null
let generation = 0
let avatarReady = false
let hat = null

function applyHat() {
  if (hat) {
    hat.parent?.remove(hat)
    hat = null
  }
  const kind = store.data.hat
  if (!kind || !avatar) return
  animator?.rig.resetToBindPose()
  avatar.rotation.set(0, 0, 0)
  avatar.position.y = 0
  hat = makeHat(kind)
  wearHat(avatar, hat, playerGroup)
}

// The carry-on backpack: one worn on the avatar's back, and a loose copy that rides the
// security tray, sits on the search table and flies back (security.js drives it).
const backpack = { worn: makeBackpack(), loose: makeBackpack(), on: true }
backpack.loose.visible = false
scene.add(backpack.loose)
security.setPack({
  mesh: backpack.loose,
  worn: () => backpack.on,
  setWorn(on) {
    backpack.on = on
    backpack.worn.visible = on
    if (!on) backpack.loose.visible = true
  },
})

function setAvatar(next) {
  if (avatar) playerGroup.remove(avatar)
  disposeAnimator(animator)
  avatar = next
  playerGroup.add(avatar)
  hat = null
  applyHat()
  backpack.worn.parent?.remove(backpack.worn)
  avatar.rotation.set(0, 0, 0)
  avatar.position.y = 0
  wearOnBack(avatar, backpack.worn, playerGroup)
  backpack.worn.visible = backpack.on
  animator = makeAnimator(avatar)
}

setAvatar(buildDefaultCharacter())

async function loadAvatar() {
  const mine = ++generation
  try {
    const group = await loadBaseCharacter()
    if (mine !== generation) return
    const equipped = bloxity.authState.user ? bloxity.getEquippedAvatar() : null
    await attachEquippedAccessories(group, equipped, { skinTextureUrl: bloxity.getSkinTextureUrl() })
    if (mine !== generation) return
    applyProportions(group, bloxity.authState.user ? bloxity.getProportions() : null)
    setAvatar(group)
  } finally {
    if (mine === generation) avatarReady = true
  }
}

let signedIn = null
bloxity.subscribeAuth((s) => {
  const now = !!s.user
  if (now !== signedIn) {
    signedIn = now
    loadAvatar()
  }
})
bloxity.onAvatarChanged(loadAvatar)
bloxity.onProportionsChanged(() => applyProportions(avatar, bloxity.getProportions()))
bloxity.onRespawnRequest(respawn)

// --- Modes + keys --------------------------------------------------------------
let firstPerson = false
onModeChanged((mode) => {
  firstPerson = mode === 'player'
})
onKey('KeyV', toggleMode)
onKey('KeyN', () => lighting.toggleDayNight())
onKey('KeyR', respawn)
installTouch({ mode: toggleMode, day: () => lighting.toggleDayNight(), respawn })

// --- Cutscene ---------------------------------------------------------------------
let cutscene = CUTSCENE.enabled ? createCutscene({ camera, exterior, hud, fx, suitcase }) : null
hud.setMode(cutscene ? 'cutscene' : 'play')
player.frozen = !!cutscene
let blend = cutscene ? -1 : 1 // -1 = cutscene running, 0..1 = blending into the chase cam
const blendFrom = { pos: new Vector3(), quat: new Quaternion(), fov: CAMERA.fov }

function startGameplay() {
  resetPlayer(SPAWN, SPAWN_FACING)
  syncYawToPlayer()
  player.frozen = false
  hud.setMode('play')
  blend = 0
  blendFrom.pos.copy(camera.position)
  blendFrom.quat.copy(camera.quaternion)
  blendFrom.fov = camera.fov
  sfx('chime')
  fx.sparkle(0, AIRPORT.walkY + 3, AIRPORT.facadeZ + 1, { count: 30, color: '#7cf0ff', speed: 5, up: 3 })
}
if (!cutscene) startGameplay()

// --- Per-frame helpers ---------------------------------------------------------------
const CARRY = { ArmR1: { x: 0.55, z: -0.1 }, ArmR2: { x: 0.15 } }
const owner = { x: 0, y: 0, z: 0, facing: 0, speed: 0, indoor: false }
const animIn = { grounded: true, speed: 0, verticalVelocity: 0, turn: 0, overlay: null, overlayWeight: 0 }
const focus = new Vector3()
const actors = []
let indoor = 0
let stepDist = 0
let wasGrounded = true
let lastPrompt = null
let securityToast = 0
const lastPos = new Vector3()

function setPrompt(text) {
  if (text === lastPrompt) return
  lastPrompt = text
  hud.prompt(text)
}

// --- Loop -------------------------------------------------------------------
const clock = new Clock()
let shownLoading = true
let readySince = 0

let simTime = 0
renderer.setAnimationLoop(() => tick(Math.min(clock.getDelta(), 0.1)))

function tick(dt, draw = true) {
  simTime += dt
  const t = simTime

  stepPhysics(dt)
  interpolatePlayer()

  const inCutscene = cutscene && !cutscene.done
  if (inCutscene) cutscene.update(dt)
  // Ended, or skipped (Skip finishes it from a timer, between ticks).
  if (cutscene?.done && blend < 0) startGameplay()

  // Who drives the avatar: the cutscene actor or the player body.
  if (cutscene && !cutscene.done) {
    const a = cutscene.actor
    playerGroup.visible = a.visible
    playerGroup.position.set(a.x, a.y, a.z)
    playerGroup.rotation.set(0, a.facing, 0)
    owner.speed = a.speed
    animIn.grounded = a.grounded
    animIn.speed = a.speed
    animIn.verticalVelocity = a.vy
    animIn.overlay = a.overlay
    animIn.overlayWeight = a.overlayWeight
  } else {
    const p = player.renderPosition
    playerGroup.visible = !firstPerson
    playerGroup.position.set(p.x, p.y, p.z)
    playerGroup.rotation.set(0, player.facing, 0)
    owner.speed = Math.hypot(player.velocity.x, player.velocity.z)
    animIn.grounded = player.grounded
    animIn.speed = owner.speed
    animIn.verticalVelocity = player.velocity.y
    animIn.overlay = null
    animIn.overlayWeight = 0
  }
  owner.x = playerGroup.position.x
  owner.y = playerGroup.position.y
  owner.z = playerGroup.position.z
  owner.facing = playerGroup.rotation.y
  owner.indoor = indoor > 0.5
  if (security.pose) {
    animIn.overlay = security.pose
    animIn.overlayWeight = 1
  } else if (!animIn.overlay && suitcase.state === 'follow' && suitcase.root.visible) {
    animIn.overlay = CARRY
    animIn.overlayWeight = Math.min(1, owner.speed / 2.5)
  }
  animator?.update(dt, animIn)
  suitcase.update(dt, owner)

  // Footsteps + landing thump from the avatar's real motion.
  const moved = Math.hypot(owner.x - lastPos.x, owner.z - lastPos.z)
  lastPos.set(owner.x, owner.y, owner.z)
  if (playerGroup.visible && animIn.grounded && moved < 2) {
    stepDist += moved
    const stride = 0.55 + owner.speed * 0.11
    if (stepDist > stride && owner.speed > 0.8) {
      stepDist = 0
      sfx('step', { vol: (indoor > 0.5 ? 0.3 : 0.22) * Math.min(1, owner.speed / 5 + 0.4) })
    }
  }
  if (animIn.grounded && !wasGrounded && blend >= 0) {
    sfx('land', { vol: 0.35 })
    fx.puff(owner.x, owner.y + 0.05, owner.z, { count: 5, size: 0.3, alpha: 0.3, life: 0.6 })
  }
  wasGrounded = animIn.grounded

  // Gameplay systems.
  if (blend >= 0) {
    queue.update(dt, t)
    powers.update(dt, t)
    // Camera: chase cam, blended in from the last cutscene frame.
    updateCamera(blend < 1 ? chaseCam : camera, dt)
    if (blend < 1) {
      blend = Math.min(1, blend + dt / CUTSCENE.blendOut)
      const e = blend * blend * (3 - 2 * blend)
      camera.position.lerpVectors(blendFrom.pos, chaseCam.position, e)
      camera.quaternion.slerpQuaternions(blendFrom.quat, chaseCam.quaternion, e)
      camera.fov = blendFrom.fov + (chaseCam.fov - blendFrom.fov) * e
      camera.updateProjectionMatrix()
    }
    // Prompts + markers follow where you are and what you're doing.
    const inside = player.position.z < AIRPORT.facadeZ - 0.4
    const free = queue.mode === 'free'
    interior.doorMarker.visible = !inside && free
    interior.queueMarker.visible = free
    const sp = queue.mode === 'checked' ? security.prompts() : null
    if (sp) setPrompt(sp.prompt)
    else if (!free) setPrompt(null)
    else setPrompt(inside ? 'Join the queue!' : 'Run inside and check in!')
    hud.hint(sp?.hint ?? null)
    // The doorway to security only lets you through once you're checked in; the gates are next.
    securityToast -= dt
    const sd = QUEUE.securityDoor
    const pp = player.position
    if (securityToast <= 0 && queue.mode !== 'checked' && Math.abs(pp.x - sd.x) < 4.5 && Math.abs(pp.z - sd.z) < 4) {
      securityToast = 5
      hud.toast('Check in first, then head to security.')
    }
    const g = SECURITY.gates
    if (securityToast <= 0 && Math.abs(pp.x - g.x) < 4 && Math.abs(pp.z - g.z) < 4) {
      securityToast = 5
      hud.toast(security.mode === 'cleared' ? 'Boarding opens in the next update!' : 'Clear security first!')
    }
  } else {
    interior.doorMarker.visible = false
    interior.queueMarker.visible = false
  }

  // Indoor / outdoor ambience.
  const inHall = owner.z < AIRPORT.facadeZ - 0.5 && owner.x > AIRPORT.hall.x0 && owner.x < SECURITY.hall.x1 ? 1 : 0
  const nextIndoor = indoor + (inHall - indoor) * Math.min(1, dt * 2)
  if (Math.abs(nextIndoor - indoor) > 0.01 || (inHall && indoor < 0.99) || (!inHall && indoor > 0.01)) setIndoor(nextIndoor)
  indoor = nextIndoor
  updateAmbience(dt)

  // World life.
  actors.length = 0
  actors.push(owner)
  queue.actors(actors)
  security.actors(actors)
  if (blend >= 0) security.update(dt, t, camera)
  if (blend >= 0) tools.update(dt) // pins NPCs, so before crowd.update
  trolls.update(dt, t)
  secHall.update(dt, t)
  crowd.update(dt, camera)
  exterior.update(dt, t, { actors, camera })
  interior.update(dt, t)
  fx.setViewport(viewH, camera)
  fx.update(dt)

  // Shadows follow what the camera is looking at (the player in gameplay).
  if (blend >= 0) focus.copy(playerGroup.position)
  else camera.getWorldDirection(focus).multiplyScalar(14).add(camera.position)
  lighting.update(dt, focus)
  trolls.late(camera, dt) // camera shake
  if (draw) postfx.render()

  if (shownLoading) {
    readySince += dt
    if (avatarReady || readySince > 5) {
      shownLoading = false
      bloxity.notifyFirstFrame()
    }
  }
}

window.addEventListener('beforeunload', bloxity.teardown)

if (import.meta.env.DEV) {
  const teleport = (x, y, z, facing = player.facing) => {
    resetPlayer({ x, y, z }, facing)
    syncYawToPlayer()
  }
  // advance(seconds): steps the game manually (for testing when the tab is not painting).
  const advance = (seconds, step = 1 / 30) => {
    for (let k = 0; k < seconds / step - 1; k++) tick(step, false)
    tick(step, true)
  }
  window.__game = { advance, player, scene, renderer, camera, postfx, bodies: bodyCount, toggleMode, teleport, queue, security, crowd, store, hud, powers, tools, trolls, net, get cutscene() { return cutscene } }
}
