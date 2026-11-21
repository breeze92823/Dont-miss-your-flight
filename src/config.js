// Every tunable constant lives here; the rest of src/ holds no theme values.

// --- Identity -------------------------------------------------------------
export const GAME_SLUG = 'dont-miss-your-flight' // slug registered on bloxity.io
export const GAME_TITLE = "Don't Miss Your Flight"

// Forces the Bloxity SDK and avatar CDN to be treated as unavailable (see .env.example).
export const DEV_MODE = import.meta.env.VITE_DEV_MODE === 'true'

// --- World (metres: +X east, +Z south, +Y up) -------------------------------
export const GROUND_Y = 0
// The ground (world.js): one convex slab of land in a sea. The shoreline sweeps from
// the front edge (-Z) back toward +Z on both wings.
export const BEACH = {
  front: -46, // z of the shoreline at the front edge
  back: 90, // z of the back edge
  halfWidth: 75, // x extent of the wings
  wingZ: 24, // z of the shoreline at the far left/right ends
  gateEdge: 21.5, // half-width of the straight shoreline at the front edge
  depth: 4, // slab thickness above the sea floor
  tile: 18, // m per sand texture tile
  fenceHeight: 3, // invisible wall around the sand so nobody walks into the sea
}
export const WATER = { level: -0.6, size: 1400, color: '#12a9e6', shallow: '#7ff0ff' }
// Gameplay starts on the terminal sidewalk, facing the entrance doors (-Z).
export const SPAWN = { x: 0.6, y: 0.2, z: -6.2 }
export const SPAWN_FACING = Math.PI // yaw the character faces on spawn (PI = toward -Z)

// --- Airport layout (airport/*.js). Road runs along X; the terminal is to the north (-Z). ---
export const AIRPORT = {
  walkY: 0.2, // sidewalk / median / hall floor height (roads are at 0)
  facadeZ: -12, // terminal front wall
  curbZ: 0, // sidewalk edge
  roadA: [0, 12], // drop-off road (3 lanes, centres 2 / 6 / 10)
  median: [12, 16],
  roadB: [16, 26], // through road
  farWalk: [26, 29],
  garage: { z0: 40, z1: 64, x: 70, height: 17 },
  halfLength: 96, // x extent of sidewalk + canopy
  canopyY: 12.6,
  doorHalf: 2.4, // half width of the entrance opening
  doorHeight: 4.4,
  hall: { x0: -30, x1: 30, z0: -12, z1: -46, height: 13 },
  taxiStop: { x: 5.2, z: 2 }, // where the cutscene taxi stops (car centre)
}

// --- Check-in queue (queue.js) ---------------------------------------------------
export const QUEUE = {
  // Path the line follows, front last: outside the doors -> serpentine lanes -> head of the line.
  path: [[0.6, -8], [0.6, -14.5], [12, -18], [12, -21], [-8.5, -21], [-8.5, -23.5], [8.5, -23.5], [8.5, -26], [-8.5, -26], [-8.5, -28.5], [12, -28.5], [12, -31.6]],
  spacing: 1.35, // m between people in line
  joinZone: { x0: 9.6, x1: 14.6, z0: -20.4, z1: -16.6 }, // walk in here to join
  counters: [-17.5, -10.5, -3.5, 3.5, 10.5, 17.5], // x of each check-in desk
  deskZ: -39.2, // desk centre z
  startInLine: 24, // NPCs already queueing when the game starts
  maxInLine: 30,
  arriveEvery: [2.2, 3.6], // s between new passengers joining the back
  serveTime: [5.5, 8.5], // s an NPC spends at a desk
  lineSpeed: 2.4, // m/s people shuffle forward
  block: { radius: 0.38, height: 1.7 }, // solid capsule around every NPC in a line, so the player can't cut through it
  // A real passenger in a line who stopped moving with free room ahead of them (`room` m past the spot
  // they could step up to) for `after` s is stalled: this client drops them from its copy of the line
  // (they stop counting and stop being solid) until they move `moved` m. Away passengers (tab hidden,
  // game stopped, dropped connection: the server's `away` flag) are dropped at once. The line's guard
  // walks over so everyone sees security keep the line clear.
  stall: { after: 6, moved: 0.3, room: 1.2 },
  autoSpeed: 5.5, // m/s the player is walked to their spot
  // Online the server keeps every line's order (join tickets, backend lines.ts) and calls passengers
  // to the desks / lanes / scanner: the first `callDepth` in a line may be called at once (one per free
  // spot), asked at most every `callEvery` s. (Away / idle real passengers are passed over.)
  callDepth: 3,
  callEvery: 0.4,
  leaveHold: 1.0, // s of pushing the stick to step out of a line (short nudges keep your place)
  securityDoor: { x: 29.2, z: -33 },
  reward: 30, // coins for checking in
}

// --- Economy: coins only (never premium currency) ------------------------------
export const START_COINS = 0
export const PRICES = {
  skipLine: 1200,
  boardPlane: 3000, // fast-track: skip the line and the desk
  beSecurity: 250,
  bePilot: 500,
  luggageRain: 60,
  killAll: 90,
  paperPlanes: 40,
  scareAll: 50,
  announce: 30,
  emoji: 0,
  skipQuestions: 600,
  pickSeat: 40,
  skipSearch: 800,
  skipTime: 1500, // skip the wait for your plane, or the rest of the flight
  loungePass: 350,
}
export const SUITCASES = [
  { id: 'purple', name: 'Lavender', color: '#a98ae6', price: 0 },
  { id: 'red', name: 'Cherry', color: '#e8434f', price: 80 },
  { id: 'sky', name: 'Sky', color: '#5cc4ff', price: 80 },
  { id: 'mint', name: 'Mint', color: '#5fe0a8', price: 100 },
  { id: 'black', name: 'Midnight', color: '#2b2f3a', price: 120 },
  { id: 'gold', name: 'Gold', color: '#ffc531', price: 400 },
]
export const DAILY_REWARDS = [50, 75, 100, 150, 200, 250, 400]
export const DESTINATIONS = [
  { city: 'london', name: 'London', country: 'UK', code: 'LHR', flight: 'SH 128', gate: 12, time: '10:05', color: '#d6232e' },
  { city: 'tokyo', name: 'Tokyo', country: 'Japan', code: 'HND', flight: 'SH 402', gate: 7, time: '10:20', color: '#e03a5a' },
  { city: 'dubai', name: 'Dubai', country: 'UAE', code: 'DXB', flight: 'SH 77', gate: 15, time: '10:35', color: '#d99a2b' },
  { city: 'new york', name: 'New York', country: 'USA', code: 'JFK', flight: 'SH 311', gate: 3, time: '10:50', color: '#2e8b4e' },
  { city: 'paris', name: 'Paris', country: 'France', code: 'CDG', flight: 'SH 219', gate: 9, time: '11:05', color: '#2a5fd6' },
  { city: 'sydney', name: 'Sydney', country: 'Australia', code: 'SYD', flight: 'SH 6', gate: 21, time: '11:20', color: '#14a3b8' },
  { city: 'cairo', name: 'Cairo', country: 'Egypt', code: 'CAI', flight: 'SH 140', gate: 4, time: '11:40', color: '#b8892a' },
  { city: 'rome', name: 'Rome', country: 'Italy', code: 'FCO', flight: 'SH 55', gate: 18, time: '12:10', color: '#c8542c' },
  { city: 'rio', name: 'Rio', country: 'Brazil', code: 'GIG', flight: 'SH 360', gate: 2, time: '12:25', color: '#1fae5a' },
  { city: 'amsterdam', name: 'Amsterdam', country: 'Netherlands', code: 'AMS', flight: 'SH 92', gate: 5, time: '12:40', color: '#ff7a1a' },
  { city: 'bangkok', name: 'Bangkok', country: 'Thailand', code: 'BKK', flight: 'SH 488', gate: 6, time: '12:55', color: '#e0457b' },
  { city: 'reykjavik', name: 'Reykjavik', country: 'Iceland', code: 'KEF', flight: 'SH 24', gate: 8, time: '13:10', color: '#3a8fd6' },
  { city: 'san francisco', name: 'San Francisco', country: 'USA', code: 'SFO', flight: 'SH 501', gate: 10, time: '13:25', color: '#c8402a' },
  { city: 'marrakech', name: 'Marrakech', country: 'Morocco', code: 'RAK', flight: 'SH 163', gate: 11, time: '13:40', color: '#c0602a' },
  { city: 'seoul', name: 'Seoul', country: 'South Korea', code: 'ICN', flight: 'SH 279', gate: 13, time: '13:55', color: '#3657c9' },
  { city: 'mexico city', name: 'Mexico City', country: 'Mexico', code: 'MEX', flight: 'SH 344', gate: 14, time: '14:10', color: '#2a9a6a' },
  { city: 'cape town', name: 'Cape Town', country: 'South Africa', code: 'CPT', flight: 'SH 417', gate: 16, time: '14:25', color: '#6a8a3a' },
  { city: 'istanbul', name: 'Istanbul', country: 'Turkey', code: 'IST', flight: 'SH 233', gate: 17, time: '14:40', color: '#c22a3a' },
  { city: 'athens', name: 'Athens', country: 'Greece', code: 'ATH', flight: 'SH 186', gate: 19, time: '14:55', color: '#2a6ad6' },
  { city: 'singapore', name: 'Singapore', country: 'Singapore', code: 'SIN', flight: 'SH 58', gate: 20, time: '15:10', color: '#d63a4a' },
  { city: 'agra', name: 'Agra', country: 'India', code: 'AGR', flight: 'SH 615', gate: 22, time: '15:25', color: '#8a5ad6' },
]
// The postcards the desk agent offers ("Where to?"), in order, as DESTINATIONS indices: every city.
// Each one can be visited and counts toward the Destinations window / Places Visited board.
export const FEATURED_DESTINATIONS = [4, 0, 3, 1, 6, 7, 5, 2, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]
export const HOME_AIRPORT = { code: 'SKY', name: 'Skyport' }

// --- Check-in desk conversation (checkin.js) ------------------------------------------
export const CHECKIN = {
  questions: 15, // asked per check-in (drawn from QUESTIONS)
  typeSpeed: 40, // characters per second of the agent's typewriter
  hold: 0.9, // s a reply stays before the next line
  skipQuestions: PRICES.skipQuestions, // coins
  pickSeat: 40, // coins
  upgrades: [
    { id: 'first', name: 'First Class', price: 290, style: 'purple' },
    { id: 'business', name: 'Business', price: 190, style: 'blue' },
    { id: 'premium', name: 'Premium Economy', price: 90, style: 'teal' },
  ],
}
// Each question: [id, text, answers]; each answer: [text, agent reply, mood (happy | sus | wow), tag?].
// Tags are remembered and can turn up later at the security search (SECURITY.items).
export const QUESTIONS = [
  ['danger', 'Are you carrying anything dangerous?', [['No', "Great, that's the right answer.", 'happy'], ['Just my dance moves', 'Hmm. Flagging that.', 'sus'], ['Define "dangerous"', "...I'm writing that down.", 'sus', 'spoon']]],
  ['packed', 'Did you pack your bag yourself?', [['Yes', 'Perfect. Very responsible!', 'happy'], ['My grandma did', 'Tell her she did a great job.', 'happy', 'cookies'], ['The bag packed itself', '...Sure it did.', 'sus']]],
  ['seat', 'Window or aisle?', [['Window', 'Clouds for days!', 'happy'], ['Aisle', 'Easy snack runs. Smart.', 'happy'], ['On the wing', 'Absolutely not.', 'sus']]],
  ['meal', 'Chicken or pasta?', [['Chicken', 'Chicken it is!', 'happy', 'chicken'], ['Pasta', 'Pasta la vista!', 'happy'], ['Both, please', 'Ambitious. I respect it.', 'wow', 'chicken']]],
  ['still', 'Can you sit still for two hours?', [['Easy!', 'Love the confidence.', 'happy'], ['Probably not', 'Honest. I like that.', 'happy'], ["I've never sat still in my life", 'Good luck, row 13.', 'sus']]],
  ['pockets', "What's in your pockets?", [['Nothing', 'Clean pockets, clean conscience.', 'happy'], ['Snacks', 'Share with your neighbour!', 'happy', 'snacks'], ['Smaller pockets', 'Pockets inside pockets...?', 'sus', 'pockets']]],
  ['before', 'Have you flown with us before?', [['Yes!', 'Welcome back, frequent flyer!', 'happy'], ['First time!', 'Exciting! Window seats are the best.', 'happy'], ['I usually take a cannon', 'Please... do not.', 'sus']]],
  ['pet', 'Are you travelling with a pet?', [['No', 'Noted!', 'happy'], ['A goldfish', 'Tiny seatbelt coming right up.', 'wow', 'goldfish'], ['My little brother', '...no. He needs his own ticket.', 'sus']]],
  ['turb', 'How do you feel about turbulence?', [['Love it!', 'A real thrill seeker!', 'wow'], ['A bit scared', "Don't worry, it's just bumpy air.", 'happy'], ['I AM turbulence', 'Hmm. Flagging that.', 'sus']]],
  ['liquids', 'Any liquids over 100 ml?', [['Nope', 'Perfect!', 'happy'], ['Just a smoothie', 'Drink it before security!', 'sus', 'smoothie'], ['A whole ocean', '...how did that even fit?', 'sus', 'smoothie']]],
  ['clouds', "What's the capital of the clouds?", [['Fluffington', 'Wow. A real cloud expert!', 'wow'], ['Rainville', 'Close! Very damp, though.', 'happy'], ["Clouds don't have capitals", 'Correct. Sadly.', 'happy']]],
  ['snore', 'Do you snore?', [['Never', 'Your neighbours thank you.', 'happy'], ['Like a jet engine', "I'll seat you near the engines.", 'sus', 'engine'], ['Only on Tuesdays', "Good thing it's not Tuesday.", 'wow']]],
  ['plane', 'What will you do on the plane?', [['Sleep', 'Sweet dreams up there.', 'happy'], ['Watch movies', 'Popcorn not included!', 'happy'], ['Make toast', 'There are no toasters on planes.', 'sus', 'toaster']]],
  ['suitcase', 'Is this your suitcase?', [['Yes', 'Lovely colour!', 'happy'], ['It follows me everywhere', 'Loyal luggage. Rare.', 'wow'], ['Never seen it before', '...Flagging that.', 'sus', 'duck']]],
  ['excited', 'Are you excited for your trip?', [['SO excited!', 'Me too, and I am not even going!', 'happy'], ['A little nervous', 'You will do great.', 'happy'], ["I'm here for the snacks", 'A person of culture.', 'wow', 'snacks']]],
  ['socks', 'How many socks did you pack?', [['Seven pairs', 'Very organised!', 'happy'], ['One lucky sock', 'Just the one?', 'wow', 'socks'], ['Socks are optional', 'Hmm. Flagging that.', 'sus']]],
  ['hear', 'Can you hear me okay?', [['Loud and clear', 'Great!', 'happy'], ['What?', 'CAN YOU HEAR ME OKAY?', 'wow'], ['Only with my left ear', "I'll speak left-ish.", 'happy']]],
  ['pilot', 'Have you ever met a pilot?', [['Yes!', 'They are pretty cool.', 'happy'], ['I AM a pilot', 'Then why are you in this line?', 'sus'], ['Is that a kind of bird?', '...sort of, yes.', 'wow', 'duck']]],
  ['passport', 'Do you have your passport?', [['Right here!', 'Perfect, thank you!', 'happy'], ['Somewhere...', 'Check the other pocket.', 'sus', 'pockets'], ['My dog ate it', 'The dog is not flying either.', 'sus']]],
  ['fav', 'Favourite thing about airports?', [['The planes', 'Same!', 'happy'], ['The moving walkways', 'Free speed boost!', 'wow'], ['This exact line', 'Aww, you are sweet.', 'happy']]],
]

// --- Security checkpoint (security.js) ------------------------------------------------------
export const SECURITY = {
  hall: { x0: 30, x1: 92, z0: -12, z1: -46 },
  door: { x: 30, z: -33 }, // doorway from the check-in hall
  // Queue path, front last: in through the doorway, serpentine lanes, head of the line.
  path: [[27.5, -33], [32.5, -33], [36, -31.4], [36, -28.5], [55, -28.5], [55, -26], [36, -26], [36, -23.5], [55, -23.5], [55, -21], [36, -21], [36, -18.5], [57.6, -18.5]],
  lanes: { W: 36, E: 55, z: [-28.5, -26, -23.5, -21, -18.5] },
  joinZone: { x0: 31.5, x1: 37.5, z0: -34.5, z1: -30.2 },
  checkpoints: [
    { z: -17, open: false },
    { z: -24.5, open: true },
    { z: -32, open: true },
    { z: -39.5, open: false },
  ],
  trayX: 63, // where you put your things in a tray
  detectorX: 67.5, // walk-through metal detector
  laneEndX: 70.5, // lanes open into the search zone here
  trayEndX: 73.8, // trays stop at the end of the exit rollers
  corridorX: 75.0, // walkway between the exit rollers and the search mats
  // Body search area: mats (each with an officer and a table for your bag) in rows split by railings.
  mats: [[77.5, -18.5], [84.5, -18.5], [77.5, -26.5], [84.5, -26.5], [77.5, -34.5], [84.5, -34.5]],
  exitZ: -41.5, // walkway along the back of the search area to the gates
  gates: { x: 91.4, z: -28 }, // doors to the gates (next area)
  startInLine: 16,
  maxInLine: 24,
  arriveEvery: [3, 5],
  checkTime: [5, 8], // s an NPC spends being searched
  searchTime: 45, // s the player's search takes
  skipSearch: PRICES.skipSearch, // coins
  reward: 40, // coins for clearing security
  // Items the officer can "find". `tag` items appear when your check-in answers mention them.
  items: [
    { id: 'duck', tag: 'duck', icon: '🦆', name: "The stranger's duck", line: "It's staring at me. Why is it staring at me?" },
    { id: 'chicken', tag: 'chicken', icon: '🐔', name: 'A live chicken', line: 'You said CHICKEN for your meal. This is NOT what we meant.' },
    { id: 'spoon', tag: 'spoon', icon: '🥄', name: 'A spoon', line: 'THIS is your dangerous item? A SPOON?' },
    { id: 'toaster', tag: 'toaster', icon: '🍞', name: 'A toaster', line: "You can't make toast on a plane." },
    { id: 'smoothie', tag: 'smoothie', icon: '🥤', name: 'A huge smoothie', line: 'Liquids over 100 ml? Not today.' },
    { id: 'goldfish', tag: 'goldfish', icon: '🐠', name: 'A goldfish in a bag', line: 'He has his own passport. Somehow.' },
    { id: 'pockets', tag: 'pockets', icon: '👖', name: 'More pockets', line: 'It really is pockets all the way down.' },
    { id: 'engine', tag: 'engine', icon: '⚙️', name: 'A tiny jet engine', line: 'For the snoring? ...Fair.' },
    { id: 'cookies', tag: 'cookies', icon: '🍪', name: "Grandma's cookies", line: 'Confiscated. (I am eating one.)' },
    { id: 'snacks', tag: 'snacks', icon: '🍫', name: 'Forty snacks', line: 'That is not a snack. That is a supermarket.' },
    { id: 'socks', tag: 'socks', icon: '🧦', name: 'One lucky sock', line: 'Warm. Why is it warm?' },
    { id: 'cone', icon: '🚧', name: 'A traffic cone', line: 'Where did you even get this?' },
    { id: 'cactus', icon: '🌵', name: 'A very small cactus', line: 'Ouch. OUCH.' },
    { id: 'bowling', icon: '🎳', name: 'A bowling pin', line: 'Wrong game, friend.' },
    { id: 'banana', icon: '🍌', name: 'A banana', line: 'Looked like something else on the X-ray.' },
    { id: 'trumpet', icon: '🎺', name: 'A trumpet', line: "Please don't play it. Please." },
    { id: 'snowglobe', icon: '⛄', name: 'A snow globe', line: 'Over 100 ml. Sorry, little snowman.' },
    { id: 'bagsnacks', icon: '🍿', name: 'A bag of snacks', line: "That's not a carry-on, that's a snack attack." },
  ],
  officerLines: ['Step onto the mat. Arms out!', 'Arms out, please. Random check!', 'Beep beep. You know what that means.', 'Random checks happen to everyone.', 'Hold still...', 'Okay... one more. *pop*', 'Almost done...'],
  officerFinds: ['Ow! OW! Who packs a cactus?!', "He's dressed better than me.", 'Okay, one more. *pop*', 'No liquids over 100 ml, right?', 'Is this... glitter?', 'Okay... you\'re free to go.', 'All clear! Have a nice flight!'],
  passengerLines: ['who else is waiting', 'im so bored', 'i have nothing in my pockets i swear', 'do i have to take my shoes off?', 'they took my shampoo', 'is the beep about my belt?', 'my gate is closing!!', 'it tickles lol'],
}

// --- Checkpoint guards + barriers (guards.js): nobody skips a step ------------------------------------
// Each checkpoint closes the area behind it (`zone`) until you've done its step (`need`): `checked` =
// checked in at a desk, `screening` = called from the security line (or past it), `cleared` = through
// security. A laser gate / fence blocks the way (solid to you only while you're not allowed; passengers
// who are allowed walk straight through). The guard first instructs you (walk into `warn`), gives a last
// warning when you push the barrier again, then shoves you back. Anyone who still ends up inside a zone
// is caught (inside `chase`) or radioed in, and escorted out to `safe`. Zones / boxes: x0 < x1, z0 < z1.
export const GUARDS = {
  scale: 1.12, // guards are a bit bigger than passengers
  walkSpeed: 2.2,
  runSpeed: 6.8, // m/s when rushing the player
  contact: 1.1, // m from the barrier plane that counts as pushing it (player radius is 0.75)
  calmAfter: 14, // s away from a checkpoint before its guard forgets your strikes
  instructEvery: 9, // s between repeated instructions while you hang around
  shove: { speed: 10.5, up: 5, stun: 0.85 }, // knock-back given to the player
  checkpoints: [
    {
      id: 'entry',
      need: 'checked',
      guard: { x: 28.15, z: -37.0, face: -Math.PI / 2, skin: '#c58a5c', tag: 'officer reyes' },
      lectern: { x: 27.55, z: -38.3, face: -Math.PI / 2 },
      gate: { x: 29.35, z0: -35.5, z1: -30.5, decal: 'stop · check-in first' },
      warn: { x0: 23.5, x1: 30.2, z0: -39.5, z1: -26.5 },
      zone: { x0: 30.1, x1: 92.3, z0: -46.5, z1: -12 },
      chase: { x0: 20, x1: 29.2, z0: -42, z1: -24 },
      safe: { x: 24.8, z: -33 },
      goTo: { x: 12, z: -18.5 }, // where they point you: the back of the check-in queue
      instruct: ['Hold it! Check in at the desks first.', 'Boarding pass first! The check-in queue is that way.', 'No pass, no entry. Check in first, friend!'],
      toast: 'Security is closed to you: join the check-in queue first!',
    },
    {
      id: 'lanes',
      need: 'screening',
      guard: { x: 59.2, z: -28.25, face: -Math.PI / 2, skin: '#f3c99c', tag: 'officer park' },
      fence: { x: 60.3, z0: -45.75, z1: -12.65, posts: [-12.9, -15.5, -18.1, -20.7, -23.2, -25.8, -28.3, -30.8, -33.2, -35.8, -38.4, -41.0, -44.2, -45.6], decal: 'screening · wait to be called' },
      warn: { x0: 58.3, x1: 60.3, z0: -46, z1: -12.4 },
      zone: { x0: 60.3, x1: 92.3, z0: -46.5, z1: -12 },
      chase: { x0: 57.9, x1: 63.0, z0: -45.6, z1: -12.8 }, // reaches just past the fence
      safe: { x: 33.4, z: -36.6 },
      goTo: { x: 34.5, z: -32.4 }, // the back of the security line
      instruct: ['Whoa! Join the security line first.', 'No cutting! The line starts by the doorway.', 'Wait to be called, please. Back of the line!'],
      toast: 'No skipping: join the security line by the doorway and wait to be called.',
    },
    {
      id: 'gates',
      need: 'cleared',
      guard: { x: 90.35, z: -32.75, face: -Math.PI / 2, skin: '#8d5a3b', tag: 'officer ade' },
      lectern: { x: 91.0, z: -34.2, face: -Math.PI / 2 },
      gate: { x: 91.25, z0: -30.5, z1: -25.5, decal: 'stop · clear security first' },
      warn: { x0: 86.6, x1: 91.4, z0: -36.5, z1: -20 },
      zone: { x0: 92.3, x1: 210, z0: -100, z1: -15 },
      chase: { x0: 86.4, x1: 91.15, z0: -44.5, z1: -14 },
      safe: { x: 87.9, z: -28 },
      goTo: { x: 57.6, z: -18.5 },
      instruct: ['Not so fast! Clear security first.', 'Screening first, then the gates.', 'Nobody reaches the gates without a security check!'],
      toast: 'Clear the security check before heading to the gates.',
    },
  ],
  lastWarning: ['LAST WARNING! Step away from the barrier!', 'I said STOP. Last warning!', 'Do not test me. Back off!'],
  force: ["That's it! Back you go!", 'Rules are rules!', 'Not on my watch!'],
  breach: ['STOP RIGHT THERE!', "Hey! You can't be back here!", 'Freeze! Out you go!'],
  radio: ['Control, we have a line skipper!', 'Code yellow! Runner past the checkpoint!', 'Backup! Passenger in a closed area!'],
  pass: ['Go right ahead!', 'All good, carry on.', 'Have a great flight!', 'Thank you, move along.'],
  // In a line's lanes without queueing in it: standing within `laneHalf` of its path, `pastJoin` m past
  // its join point, while not in that line (jumped the stanchion fence, or stepped out of the line
  // and stayed in the lanes; walking in through the entrance joins you). After `grace` s (`hopGrace`
  // s when you landed there from a jump, remembered `hopMemory` s) the line's own guard walks over and
  // gives WARNING 1/2, `warnGap` s later the LAST WARNING 2/2, and `removeGap` s after that grabs you
  // and sends you back to the START of the line (its entrance / join zone: you queue again from the
  // back and walk the whole path). Jumping or walking out of the lanes in time ends it ("Thank you").
  // The boarding lanes are only guarded once boarding has opened.
  // Pushing `pushAhead` m further up the line skips the rest of a wait (but never sooner than `minGap`).
  // Strikes are remembered for `memory` s, so stepping out and straight back in picks up where it left
  // off. Other clients see their copy of the guard walk to a real player who blocks and give the same
  // warnings (that player's own client does the removing). The boarding line's guard is a marshal
  // posted at the VIP priority lane, which is VIP-only (`priority` box).
  cutting: {
    laneHalf: 1.05,
    pastJoin: 1.0,
    grace: 2.5,
    hopGrace: 0.3,
    hopMemory: 3,
    hopAhead: 3, // m further up the line: a jump into a later lane is a fence jump
    warnGap: 5,
    removeGap: 4,
    minGap: 1.5,
    pushAhead: 1.2,
    memory: 20,
    standOff: 1.35, // m the guard stands from the blocker while warning
    cooldown: 3, // s after a removal before the line is watched again
    lineGuards: {
      checkin: { x: 15.2, z: -24.6, face: -Math.PI / 2, skin: '#a8714a', tag: 'officer diaz' },
      security: { x: 33.4, z: -24.2, face: Math.PI / 2, skin: '#f1c7a0', tag: 'officer kim' },
    },
    out: {
      checkin: { x: 16.6, z: -16.6 },
      security: { x: 33.2, z: -38.4 },
      boarding: { x: 135.4, z: -35.0 },
    },
    priorityLoiter: 1.2,
    priority: { x0: 154.1, x1: 157.1, z0: -59.8, z1: -37.6 },
    marshal: { x: 153.1, z: -36.3, face: -Math.PI / 2, skin: '#e0a979', tag: 'officer lund' },
    complain: ['Hey! No cutting!', 'Back of the line!', "Excuse me, we've been waiting!", 'Rude!', 'The line starts back there!', 'Wow. Really?'],
    warn1: ["You're not in this line! Out of the lanes, please.", 'No wandering the lanes. The line starts at the entrance!', 'Step out, please. Join at the back!'],
    warn2: ['LAST WARNING! Out of the lanes, now!', 'I will not ask again. MOVE!', 'Final warning! Step out or back to the start!'],
    hopWarn1: ['No jumping the fence! Back out, please.', 'Hey! Use the entrance like everyone else!', 'Over the barrier? Nope. Step out!'],
    hopWarn2: ['LAST WARNING! Off the lanes or back to the start!', 'Jump that fence again and you start over!', 'Final warning! Out of the lanes, now!'],
    removed: ["That's it. Back to the start!", 'From the top, please!', 'Rules are rules. Start again!'],
    thanks: ['Thank you.', 'Much better.', 'Appreciated. Join at the back!'],
    clearLine: ['This one is away. Line, keep moving!', 'Go around, folks. Keep it moving!', 'Line stays clear. Move up, please!'],
    toast1: "Security: you're in the lanes without queueing! Step out, the line starts at the entrance. (Warning 1 of 2)",
    hopToast1: 'Security: no jumping the fence! Step out of the lanes and join at the entrance. (Warning 1 of 2)',
    toast2: 'LAST WARNING! Leave the lanes now or security sends you back to the start. (Warning 2 of 2)',
    removedToast: 'Security sent you back to the start of the line. Walk the line like everyone else!',
    sent: ['The line starts HERE. Wait your turn!', 'Nice try. From the start!', 'Line starts here, friend.'],
    priorityShout: ['VIP priority lane only!', 'Priority boarding is for VIPs!', 'No VIP tag, no priority lane!'],
    priorityToast: 'The priority lane is for VIPs. Join the boarding line!',
  },
}

export const AIRLINE = 'skyhop air'

// --- Gates (airport/gates.js + boarding.js): past security -> concourse -> your gate ----------------
// The concourse runs east from the security hall's "gates" doorway. Shops line its south side, gate
// doors its north side; the player's gate opens into a big gate hall (seats, boarding line, gate desk,
// jet bridge) with the Sky Lounge next to it and the apron + parked planes behind the glass.
export const GATES = {
  corridor: { x0: 92, x1: 178, zS: -23, zN: -33, height: 6 },
  shops: [
    { x0: 95, x1: 107, name: 'duty free', kind: 'duty' },
    { x0: 109, x1: 121, name: 'cloud café', kind: 'cafe' },
    { x0: 123, x1: 135, name: 'news · books', kind: 'books' },
    { x0: 137, x1: 149, name: 'travel shop', kind: 'travel' },
    { x0: 151, x1: 163, name: 'sweets', kind: 'sweets' },
  ],
  fakeGates: [{ x: 102, d: -1 }, { x: 168, d: 1 }], // closed gate doors: your gate number + d
  hall: { x0: 112, x1: 158, zS: -33, zN: -64, height: 11 },
  hallDoor: { x: 125.5, w: 7 }, // opening from the corridor into your gate hall
  lounge: { x0: 92.5, x1: 112, zS: -36, zN: -60, height: 5.4, doorZ: -45, doorW: 3.2 },
  // Gate seating: back-to-back double rows (z of the backs) in two blocks, plus one row facing the windows.
  seatRows: [-40.5, -45.5, -50.5, -55.5],
  windowRowZ: -60.2,
  seatBlocks: [116.4, 127.6], // x of the first seat in each block
  seatsPerBlock: 10,
  seatPitch: 0.68,
  // Boarding line (front last) on the dark carpet, then the gate desk + scanners + the jet bridge door.
  linePath: [[138.6, -37.6], [140, -40], [152.4, -40], [152.4, -43], [140, -43], [140, -46], [152.4, -46], [152.4, -49], [140, -49], [140, -52], [152.4, -52], [152.4, -55], [148, -55], [148, -57.4]],
  joinZone: { x0: 136.5, x1: 141.5, z0: -40.5, z1: -35.5 },
  boardX: 148, // the boarding door / scan point x
  scanZ: -60.6,
  doorZ: -64,
  rotunda: { x: 148, z: -67.4, r: 2.6 },
  plane: { x: 160.6, z: -84, y: 3.4 }, // parked airliner centre (nose west, front door at x = boardX)
  waitTime: 210, // s from clearing security until your plane arrives
  boardingCall: 12, // s the line stays open for NPCs before you can still walk on alone
  startSeated: 26, // NPCs waiting in the gate hall
  sameFlight: 12, // of them, how many are on your flight (they line up when boarding opens)
  loungeCoins: 5, // coins every loungeEvery s inside the Sky Lounge
  loungeEvery: 30,
  agentLines: ['Next!', 'Boarding pass, please!', 'Enjoy your flight!', 'Have a nice flight!', 'Welcome aboard!'],
  passengerLines: ['ok whos flying with me', 'please not the middle seat', 'is the plane here yet', 'im so bored', 'window seat or riot', 'this chair is comfy ngl', 'my legs are asleep', 'boarding when??', 'i can see the plane!!', 'who else is waiting'],
  bouncerLines: ['Sorry, pass holders only!', 'Got a Sky Lounge Pass?', 'Members only, friend.', 'Nice try!'],
}

// --- The flight (airport/cabin.js + flight.js) and the arrival city (airport/city.js) -----------------
export const FLIGHT = {
  cabin: { x: 0, y: 300, z: -300 }, // the cabin interior is built up here, out of sight
  aisle: 1.45, // the two aisles run at x = cabin.x -/+ aisle (widebody, twin aisle)
  // Classes, nose to tail. `seats` = the letters per block, blocks split by '|' (A on the left / -X).
  // `x` = each letter's offset from the centre line. Upgrades are bought at check-in (CHECKIN.upgrades,
  // same ids) or from the crew at the curtain (`upgrade`, a little dearer): coins only, never gems.
  classes: [
    { id: 'first', name: 'First Class', short: 'FIRST', rows: 2, pitch: 2.35, seats: 'A|E|K', x: { A: -2.95, E: 0, K: 2.95 }, color: '#e8b54a', upgrade: 360 },
    { id: 'business', name: 'Business', short: 'BUSINESS', rows: 4, pitch: 1.7, seats: 'A|EF|K', x: { A: -2.47, E: -0.47, F: 0.47, K: 2.47 }, color: '#4f8dff', upgrade: 260 },
    { id: 'premium', name: 'Premium Economy', short: 'PREMIUM', rows: 4, pitch: 1.1, seats: 'AC|DF|HK', x: { A: -3.22, C: -2.52, D: -0.37, F: 0.37, H: 2.52, K: 3.22 }, color: '#2fc4b2', upgrade: 130 },
    { id: 'economy', name: 'Economy', short: 'ECONOMY', rows: 16, pitch: 0.9, seats: 'ABC|DEF|GHK', x: { A: -3.48, B: -2.9, C: -2.32, D: -0.58, E: 0, F: 0.58, G: 2.32, H: 2.9, K: 3.48 }, color: '#3a8bff' },
  ],
  // The cabin crew (cabinCrew.js): one attendant guards each class curtain; you may always walk aft, never
  // forward past your own class. Each push past a curtain is a strike (remembered `memory` s): 1 polite,
  // 2 firm, 3 = walked back to your seat (seatbelt on for `belted` s). During the meal service the posts
  // are empty: sneak forward and sit in a free seat for `sneakTime` s unseen for `sneakReward` coins.
  crew: {
    memory: 50,
    belted: 6,
    push: 7.5, // m/s the polite shove back through the curtain
    sneakTime: 12,
    sneakReward: 40,
    spot: 3.2, // m: an attendant this close sees a standing stowaway
    serviceAt: 14, // s into the cruise the meal service starts
    mealCoins: 10,
    lines: {
      polite: ['Excuse me! This cabin is for {cls} passengers.', 'Oh! I\'m sorry, {cls} only beyond this curtain.', 'Pardon me, may I see your boarding pass? Ah. {cls} is this way only for ticket holders.'],
      firm: ['I really must insist. Seat {seat}, please.', 'Last time, love: back to {seat}.', 'Please return to your seat, {seat}. Thank you!'],
      escort: ['Right, let\'s get you back to {seat}.', 'Come along, I\'ll walk you to {seat}.', 'Seatbelt on for you, I\'m afraid!'],
      caught: ['Nice try! Back to {seat}, please.', 'Lovely attempt. {seat} misses you!', 'Hmm, that\'s not your seat, is it?'],
      welcome: ['Welcome to {cls}!', 'Right this way, {cls} awaits!', 'Enjoy the upgrade!'],
      post: ['Enjoy your flight!', 'Let me know if you need anything.', 'The meal service will start soon.', 'Please keep the aisle clear.'],
    },
  },
  cruiseTime: 240, // s in the air
  passengers: 70, // NPCs on board
  reward: 100, // coins for landing
  city: { x: -330, y: 0, z: -330 }, // the arrival street (rebuilt for each destination)
  crewLines: ['Chicken or pasta?', 'Tea, coffee?', 'Anything to drink?', 'Mind your elbows!', 'Coming through!'],
  cabinLines: ['we\'re flying', 'i can see clouds', 'ears popping', 'snacks when', 'my ears hurt lol', 'wheee', 'this is so cool', 'are we there yet'],
}
// Arrival streets: one builder, styled per destination code (palette, roofs, shop names, vehicles).
export const CITIES = {
  JFK: { name: 'New York', walls: ['#a7432f', '#c9774a', '#d6b37a', '#8f3a2c', '#b8603c', '#e0c79a'], trim: '#efe6d6', roof: 'flat', fireEscapes: true, waterTowers: true, shops: ['pizza', 'bagels', 'deli', 'books', 'laundromat', 'hot dogs', 'diner', 'shoes'], awnings: ['#d6232e', '#1d4fbf', '#2a8a4a', '#1b1d22'], taxi: '#ffcc12', bus: null, landmark: 'skyline', sidewalk: '#d9d2c3', tree: '#3f8f3a' },
  LHR: { name: 'London', walls: ['#8a4a35', '#f1ede3', '#9c5a3e', '#e9e3d4', '#7a3d2c', '#f4efe5'], trim: '#ffffff', roof: 'chimneys', fireEscapes: false, railings: true, shops: ['fish & chips', 'tea room', 'books', 'chemist', 'the red lion', 'bakery', 'post office', 'flowers'], awnings: ['#1b3d6b', '#2a5c3a', '#7a1f2a', '#1b1d22'], taxi: '#15171c', bus: '#d6232e', landmark: 'bigben', phoneBox: true, sidewalk: '#c9c6bd', tree: '#3d8a3e' },
  CDG: { name: 'Paris', walls: ['#eadcc0', '#e4d3b1', '#efe4cc', '#ddc9a5', '#e8dbc0'], trim: '#f7f1e3', roof: 'mansard', fireEscapes: false, balconies: true, shops: ['café', 'boulangerie', 'fleurs', 'fromagerie', 'crêpes', 'librairie', 'pâtisserie', 'bistro'], awnings: ['#b3202a', '#1f3f7a', '#2a6a3a', '#7a1f4a'], taxi: '#f5f5f5', bus: null, landmark: 'eiffel', sidewalk: '#d8d0c0', tree: '#4c9640' },
  HND: { name: 'Tokyo', walls: ['#d9dde3', '#b7bec9', '#f0eee8', '#9aa3b0', '#e6e1d6', '#c8ccd2'], trim: '#ffffff', roof: 'signs', fireEscapes: false, neon: true, shops: ['ramen', 'sushi', 'arcade', 'konbini', 'karaoke', 'manga', 'tea', 'bento'], awnings: ['#d6232e', '#1b1d22', '#ff6fa8', '#2a8a4a'], taxi: '#2d7a4a', bus: null, landmark: 'tower', vending: true, sidewalk: '#cfd2d6', tree: '#4f9a4a' },
  CAI: { name: 'Cairo', walls: ['#d9b77f', '#c99b5c', '#e4c995', '#b88a52', '#e8d3a6'], trim: '#f2e3c0', roof: 'terrace', fireEscapes: false, arches: true, shops: ['bazaar', 'spices', 'tea house', 'souvenirs', 'falafel', 'lamps', 'carpets', 'juice'], awnings: ['#2a6a9a', '#b3202a', '#2a7a4a', '#c8782a'], taxi: '#f2f2f2', bus: null, landmark: 'pyramids', palms: true, sidewalk: '#e2cfa8', tree: '#5a9a3a' },
  // Optional street flags (city.js): roof 'tiles' (hipped, `roofCol`) / 'gable' (front gables), `classicLamps`,
  // `lanterns` (+ `lanternCol`), `shutters` (colour), `corrugated` walls, `snow`, `pines`, `bikes`, `waves` paving.
  FCO: { name: 'Rome', walls: ['#d9a066', '#c9824e', '#e3b779', '#b8653a', '#e8c690', '#cf8f5a'], trim: '#f1e4c8', roof: 'tiles', roofCol: '#b5562e', balconies: true, classicLamps: true, shops: ['gelato', 'trattoria', 'espresso', 'pizzeria', 'pasta', 'leather', 'farmacia', 'vino'], awnings: ['#2a5c3a', '#7a1f2a', '#c8782a', '#1b3d6b'], taxi: '#f4f4f0', bus: null, landmark: 'colosseum', sidewalk: '#d6c8ae', tree: '#4a7a34' },
  SYD: { name: 'Sydney', walls: ['#e8d8bc', '#c87a4a', '#f0e6d2', '#a8583a', '#e2cfa8', '#d9e2e8'], trim: '#ffffff', roof: 'tiles', roofCol: '#9a3a2a', balconies: true, shops: ['meat pies', 'surf shop', 'flat white', 'fish & chips', 'milk bar', 'opals', 'bakery', 'books'], awnings: ['#1b6fa8', '#2a8a6a', '#e8a03a', '#c8402a'], taxi: '#f2f2f2', bus: null, landmark: 'opera', sidewalk: '#d4cfc4', tree: '#5a8a4a' },
  DXB: { name: 'Dubai', walls: ['#efe4cc', '#e2d2b0', '#f4ecdc', '#d8c49c', '#ebe0c6'], trim: '#fbf6ea', roof: 'terrace', arches: true, shutters: '#8a5a2a', palms: true, shops: ['gold souk', 'perfume', 'shawarma', 'dates', 'spices', 'karak tea', 'textiles', 'juice'], awnings: ['#c8962a', '#2a6a9a', '#7a1f2a', '#2a7a5a'], taxi: '#f2ead8', bus: null, landmark: 'burj', sidewalk: '#e8dcc0', tree: '#4f8a3a' },
  GIG: { name: 'Rio', walls: ['#f2d24a', '#5fc4b0', '#f28aa0', '#9ad0f0', '#f4a85a', '#b8e07a'], trim: '#ffffff', roof: 'tiles', roofCol: '#c8643a', balconies: true, palms: true, waves: true, shops: ['açaí', 'churrasco', 'samba', 'juice bar', 'havaianas', 'coconuts', 'padaria', 'surf'], awnings: ['#1fae5a', '#ffd23b', '#2a62d8', '#ff6a3a'], taxi: '#ffcc12', bus: null, landmark: 'christ', sidewalk: '#f4f1ea', tree: '#3f8f3a' },
  AMS: { name: 'Amsterdam', walls: ['#5a2e22', '#3a2a24', '#7a3a2a', '#2e3a3a', '#6a4a3a', '#4a2a1e'], trim: '#f4f1ea', roof: 'gable', roofCol: '#6a564e', railings: true, classicLamps: true, bikes: true, shops: ['stroopwafels', 'cheese', 'tulips', 'frites', 'bike rental', 'café', 'pancakes', 'books'], awnings: ['#ff7a1a', '#1b3d6b', '#7a1f2a', '#2a6a3a'], taxi: '#2b2f3a', bus: null, landmark: 'windmill', sidewalk: '#b0806a', tree: '#4a8a3a' },
  BKK: { name: 'Bangkok', walls: ['#e8dcc4', '#c9d6c8', '#e6c9a8', '#b8c4cc', '#f0e0b8', '#d4b8a8'], trim: '#f7f1e3', roof: 'signs', lanterns: true, lanternCol: '#ffb31a', palms: true, shops: ['pad thai', 'mango sticky rice', 'massage', 'noodles', 'tuk-tuk tours', 'silk', 'thai tea', 'street food'], awnings: ['#e0457b', '#2a8a6a', '#ffb31a', '#2a62d8'], taxi: '#ff5fa2', bus: null, landmark: 'prang', sidewalk: '#cfc8bc', tree: '#3f8f3a' },
  KEF: { name: 'Reykjavik', walls: ['#d6232e', '#f2c230', '#2a8ad6', '#f4f4f0', '#3aaa6a', '#2a3a4a'], trim: '#ffffff', roof: 'tiles', roofCol: '#2a3a4a', corrugated: true, snow: true, pines: true, shops: ['hot dogs', 'wool sweaters', 'fish soup', 'bakery', 'puffins', 'skyr', 'records', 'hot springs'], awnings: ['#1b3d6b', '#d6232e', '#2a6a3a', '#1b1d22'], taxi: '#f2f2f2', bus: null, landmark: 'hallgrim', sidewalk: '#e6eaee', tree: '#2f5a3a' },
  SFO: { name: 'San Francisco', walls: ['#f2c6d4', '#a8d4e8', '#f4e2a8', '#c8e0b0', '#e8b89a', '#d4c4e8'], trim: '#ffffff', roof: 'gable', roofCol: '#4a4a5a', shops: ['sourdough', 'clam chowder', 'cable car gifts', 'burritos', 'coffee', 'chocolate', 'vintage', 'books'], awnings: ['#c8402a', '#1b3d6b', '#2a6a3a', '#e8a03a'], taxi: '#f2f2f2', bus: null, landmark: 'goldengate', sidewalk: '#cfcac0', tree: '#4a8a3a' },
  RAK: { name: 'Marrakech', walls: ['#d4785a', '#c96a4a', '#e08a66', '#b85a3e', '#dc9070'], trim: '#f0d8c0', roof: 'terrace', arches: true, shutters: '#2a7a5a', palms: true, lanterns: true, lanternCol: '#ffb84a', shops: ['souk', 'spices', 'lanterns', 'rugs', 'tagine', 'mint tea', 'leather', 'argan oil'], awnings: ['#2a7a5a', '#c8962a', '#2a4a9a', '#b3202a'], taxi: '#e8d8a8', bus: null, landmark: 'koutoubia', sidewalk: '#e0b898', tree: '#5a8a3a' },
  ICN: { name: 'Seoul', walls: ['#dcdfe4', '#c4cad2', '#ece8e0', '#a8b0bc', '#e4ddd2'], trim: '#ffffff', roof: 'flat', neon: true, shops: ['kimchi', 'bibimbap', 'k-pop', 'fried chicken', 'tteokbokki', 'cosmetics', 'bubble tea', 'pc bang'], awnings: ['#3657c9', '#d6232e', '#ff6fa8', '#2a8a4a'], taxi: '#f28a2a', bus: null, landmark: 'namsan', sidewalk: '#d2d4d8', tree: '#f2a6c4' },
  MEX: { name: 'Mexico City', walls: ['#e86a8a', '#f2b43a', '#3ab0c8', '#f4e8d4', '#c8402a', '#7ac46a'], trim: '#f6efe0', roof: 'terrace', balconies: true, shops: ['tacos', 'churros', 'tortas', 'mercado', 'paletas', 'elotes', 'piñatas', 'café'], awnings: ['#2a9a6a', '#e8452c', '#ff6fa8', '#2a62d8'], taxi: '#f06a9a', bus: null, landmark: 'angel', sidewalk: '#d4ccbc', tree: '#9a7ad6' },
  CPT: { name: 'Cape Town', walls: ['#4ab0e8', '#f2d03a', '#f28ab0', '#7ac45a', '#f48a3a', '#b48ae8'], trim: '#ffffff', roof: 'flat', palms: true, shops: ['biltong', 'braai', 'bobotie', 'surf', 'craft market', 'coffee', 'rooibos', 'books'], awnings: ['#2a6a3a', '#1b3d6b', '#c8402a', '#e8a03a'], taxi: '#f2f2f2', bus: null, landmark: 'table', sidewalk: '#cfc8b8', tree: '#4a8a3a' },
  IST: { name: 'Istanbul', walls: ['#e8d8c0', '#c99a7a', '#d4b8a0', '#b8a088', '#e6cfb0', '#a87a5a'], trim: '#f4ece0', roof: 'tiles', roofCol: '#a8502e', classicLamps: true, shops: ['kebab', 'baklava', 'turkish delight', 'çay', 'bazaar', 'simit', 'carpets', 'lamps'], awnings: ['#c22a3a', '#1b3d6b', '#2a6a5a', '#c8962a'], taxi: '#ffcc12', bus: null, landmark: 'mosque', sidewalk: '#cfc6b6', tree: '#4a8a3a' },
  ATH: { name: 'Athens', walls: ['#f4f2ec', '#e8e4da', '#f0ece2', '#dcd6c8'], trim: '#ffffff', roof: 'terrace', shutters: '#2a6ad6', shops: ['gyros', 'souvlaki', 'olive oil', 'bakery', 'sandals', 'honey', 'pottery', 'frappé'], awnings: ['#2a6ad6', '#1b3d6b', '#c8962a', '#2a7a5a'], taxi: '#ffcc12', bus: null, landmark: 'parthenon', sidewalk: '#e2ddd0', tree: '#7a9a5a' },
  SIN: { name: 'Singapore', walls: ['#f4c4b0', '#b8e0d0', '#f4e0a0', '#c8d4f0', '#f0b8c8', '#d4ecc0'], trim: '#ffffff', roof: 'tiles', roofCol: '#b8552e', shutters: '#2a7a6a', lanterns: true, lanternCol: '#ff3a2a', palms: true, shops: ['chicken rice', 'laksa', 'satay', 'kaya toast', 'durian', 'bubble tea', 'hawker centre', 'chili crab'], awnings: ['#d63a4a', '#2a8a6a', '#e8a03a', '#3657c9'], taxi: '#2a62d8', bus: null, landmark: 'marina', sidewalk: '#d6d0c8', tree: '#3a8a3a' },
  AGR: { name: 'Agra', walls: ['#e8b88a', '#d89a6a', '#f0d0a8', '#c88a5a', '#e6c4a0'], trim: '#f6eadc', roof: 'terrace', arches: true, shutters: '#2a6a8a', shops: ['chai', 'samosas', 'marble crafts', 'lassi', 'sweets', 'spices', 'saris', 'petha'], awnings: ['#e8452c', '#2a8a6a', '#e8a03a', '#7a2a8a'], taxi: '#f2c230', bus: null, landmark: 'taj', sidewalk: '#dcc8a8', tree: '#4a8a3a' },
}

// --- Opening cutscene (cutscene.js) ------------------------------------------------
export const CUTSCENE = { enabled: true, blendOut: 1.1 }

// --- Audio (audio.js): everything synthesised, no files ----------------------------
export const AUDIO = { volume: 0.8, storageKey: 'dmyf-audio' }

// --- Player modes (modes.js) -------------------------------------------------
// 'character' = third-person chase cam with the avatar on screen.
// 'player' = first-person, the camera is the player's eyes and the avatar is hidden.
export const MODES = ['character', 'player']
export const START_MODE = 'character'

// --- Physics (physics.js, player.js) ------------------------------------------
export const PHYSICS = {
  gravity: -22, // m/s^2 for dynamic bodies and the player
  fixedStep: 1 / 60, // s per physics tick; rendering interpolates between ticks
  maxSubSteps: 5, // a long frame never runs more ticks than this
  walkSpeed: 8, // m/s
  sprintSpeed: 14, // m/s with Shift held
  accel: 70, // m/s^2 toward the target velocity on the ground
  airAccel: 22, // m/s^2 steering while airborne
  decel: 60, // m/s^2 when no key is held
  turnSpeed: 12, // rad/s the body turns toward its heading
  jumpSpeed: 8.5, // m/s
  coyoteTime: 0.1, // s after leaving a ledge a jump still counts
  jumpBuffer: 0.12, // s a jump pressed before landing is remembered
  stepHeight: 0.45, // m autostep
  maxSlope: 50, // degrees the player can walk up
  snapToGround: 0.4, // m the controller stays glued to downward steps and slopes
  pushMass: 80, // kg the character weighs when shoving crates
  killY: -6, // sank this far: respawn
}
export const PLAYER_DIMS = { radius: 0.75, height: 1.8 } // capsule the character controller moves

// --- Look ------------------------------------------------------------------
export const RENDER = { exposure: 1.0 }
export const FOG = { near: 170, far: 650 }
// The two lighting moods lighting.js blends between (key N toggles).
export const TIME_OF_DAY = {
  transition: 2.5, // s to blend day <-> night
  day: {
    zenith: '#1576f0',
    horizon: '#a9e2ff',
    sunColor: '#fff4de',
    // Sun + hemi + env together keep the pale sand (#eed39c) near its own tan;
    // much more and ACES washes it (and the props) out to grey-white.
    sunIntensity: 2.4,
    sunElevation: 55, // degrees above the horizon
    sunAzimuth: 35, // degrees, 0 = from +Z
    hemiSky: '#e4f2ff',
    hemiGround: '#d8c39a',
    hemiIntensity: 0.8,
    envIntensity: 0.45,
    lampIntensity: 0,
    stars: 0,
    exposure: 0.95,
  },
  night: {
    zenith: '#050b22',
    horizon: '#24345e',
    sunColor: '#9fb4ff', // the moon
    sunIntensity: 0.55,
    sunElevation: 38,
    sunAzimuth: -60,
    hemiSky: '#3a4c80',
    hemiGround: '#1a1a22',
    hemiIntensity: 0.35,
    envIntensity: 0.25,
    lampIntensity: 30,
    stars: 1,
    exposure: 1.15,
  },
}
export const LIGHT = {
  shadowRange: 40, // half-width of the sun's shadow box around the player
  lampColor: '#ffb35c',
  lampDistance: 22,
}

// Default (fallback) character look, used only when player.glb cannot load.
export const CHARACTER_COLORS = { skin: '#f2c79a', suit: '#2f6fd0', hair: '#4a2f1c' }

export const MATERIAL_PBR = {
  PLAYER: { roughness: 0.7, metalness: 0 },
  GROUND: { roughness: 0.95, metalness: 0 },
}

// --- Graphics presets, picked by the Bloxity graphics_quality setting ----------
export const GRAPHICS_PRESETS = {
  Low: { shadows: false, shadowMap: 512, antialias: false, dpr: 1, bloom: false, particles: 0.35 },
  Medium: { shadows: true, shadowMap: 1024, antialias: false, dpr: 1.25, bloom: false, particles: 0.6 },
  High: { shadows: true, shadowMap: 2048, antialias: true, dpr: 2, bloom: true, particles: 1 },
  Ultra: { shadows: true, shadowMap: 4096, antialias: true, dpr: 2, bloom: true, particles: 1 },
}

// Bloom (postfx.js): only HDR-bright pixels (above threshold, linear, before
// tone mapping) glow: neon rails, waterfall, VIP gate, particles. Sunlit sand
// stays under the threshold.
export const BLOOM = { strength: 0.6, radius: 0.35, threshold: 2.0 }
// Neon materials (propkit.js): k = HDR colour multiplier with bloom on; with
// bloom off they are capped at plainMax so they stay coloured, not white.
export const NEON = { k: 3.5, plainMax: 1.2 }

// Phones and tablets default to a lighter preset when the portal sends no value,
// and any preset is capped there (a phone at DPR 3 renders 9x the pixels; bloom
// is a full-screen multi-pass blur, so it stays off on phones).
export const COARSE_POINTER = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
export const DEFAULT_GRAPHICS = COARSE_POINTER ? 'Medium' : 'High'
export const MOBILE_GRAPHICS_CAP = { dpr: 1.5, shadowMap: 1024, particles: 0.6 }

// The preset to render with on this device.
export function graphicsPreset(name) {
  const p = GRAPHICS_PRESETS[name] ?? GRAPHICS_PRESETS[DEFAULT_GRAPHICS]
  if (!COARSE_POINTER) return p
  const cap = MOBILE_GRAPHICS_CAP
  return { ...p, dpr: Math.min(p.dpr, cap.dpr), shadowMap: Math.min(p.shadowMap, cap.shadowMap), bloom: false, particles: Math.min(p.particles, cap.particles) }
}

// --- Touch controls (touch.js) --------------------------------------------------
export const TOUCH = {
  deadZone: 0.12, // fraction of the joystick radius that does nothing
  lookScale: 1.5, // touch drag pixels -> look, relative to a mouse pixel
  pinchPixelsPerNotch: 30, // finger spread change that equals one wheel notch
}

// --- Camera (camera.js) -------------------------------------------------------
export const CAMERA = {
  fov: 70,
  near: 0.1,
  far: 1200,
  startPitch: 0.14, // radians above the horizon (low chase cam)
  minPitch: -0.35,
  maxPitch: 1.25,
  firstPersonPitch: 1.45, // |pitch| limit looking up/down in player mode
  eyeHeight: 0.92, // eye height as a fraction of player height (player mode)
  distance: 9.5, // resting boom length, m
  minDistance: 2.5, // wheel in past this enters player mode
  maxDistance: 26,
  followLerp: 14, // 1/s: the one smoothing stage, on the point the camera follows
  targetHeight: 1.2, // look-at point as a fraction of player height
  lookSensitivity: 0.0026, // rad per pixel of mouse movement
  zoomStep: 0.9, // m per wheel notch
  zoomEase: 12, // 1/s the zoom glides to its target
  speedFov: 6, // degrees the FOV widens at sprint speed
  speedEase: 3, // 1/s the speed framing eases in and out
  clearEase: 6, // 1/s the boom eases back out once a wall stops blocking it
}

// --- Bloxity (bloxity.js, avatar/) -------------------------------------------------
// SDK setting keys this game listens for; registering a listener makes the control
// appear in the portal's settings menu.
export const SETTINGS = {
  graphics_quality: { def: DEFAULT_GRAPHICS, type: 'enum', values: ['Low', 'Medium', 'High', 'Ultra'] },
  camera_sensitivity: { def: '1', type: 'number', min: 0.1, max: 5 },
  show_fps: { def: 'false', type: 'bool' },
  fullscreen: { def: 'false', type: 'bool' },
  master_volume: { def: '80', type: 'number', min: 0, max: 100 },
}

// The base rig, measured from player.glb: origin at the feet, 6.4 units tall at bind pose.
export const RIG_HEIGHT = 6.4
// Bind-pose values of the rig nodes the SDK proportions drive.
export const RIG = { armOffsetX: 2, legOffsetX: 0.6, neckOffsetY: 0.6 }
// getProportions() ranges, straight from the SDK spec; clamped before they reach the scene graph.
export const PROPORTIONS = {
  height: { def: 1, min: 0.5, max: 1.6 },
  shoulderWidth: { def: 1, min: 0.5, max: 1.5 },
  armLength: { def: 1, min: 0.05, max: 3 },
  legOffsetX: { def: 1, min: -0.7, max: 5 },
  torsoScaleX: { def: 1, min: 0.3, max: 2 },
  neckHeight: { def: 1, min: 0.94, max: 1.2 },
  headScale: { def: 1, min: 0.3, max: 2.6 },
}

// Procedural animation (avatar/animator.js), ported from Clean Leaves for Loot.
// Rotations are radians in CHARACTER space: +X swings a limb backward, +Y yaws, +Z rolls.
const deg = (d) => (d * Math.PI) / 180
export const ANIM = {
  airborneDelay: 0.07, // s off the ground before the air pose (ignores a step down a ledge)
  // Walk -> run is one cycle at two depths; phase advances with distance travelled.
  locomotion: {
    minFrequency: 0.7,
    maxFrequency: 3.6,
    strideDistance: 3.8, // m per cycle
    idleSpeed: 0.6,
    walkSpeed: 2.5,
    runSpeed: 8,
    sprintSpeed: 13,
    hipSwing: { walk: deg(22), run: deg(42), sprint: deg(56) },
    kneeBend: { walk: deg(30), run: deg(58), sprint: deg(72) },
    armSwing: { walk: deg(18), run: deg(36), sprint: deg(52) },
    elbowBend: { walk: deg(14), run: deg(44), sprint: deg(70) },
    torsoTwist: { walk: deg(4), run: deg(7), sprint: deg(9) },
    torsoLean: { walk: deg(3), run: deg(10), sprint: deg(18) },
    headCounterTwist: { walk: deg(2), run: deg(4), sprint: deg(5) },
    torsoRoll: { walk: deg(2), run: deg(3), sprint: deg(3) },
    bob: { walk: 0.03, run: 0.07, sprint: 0.09 }, // m, on the avatar root
    bankAngle: deg(9),
    bankRate: 8,
  },
  idle: {
    breathFrequency: 0.35,
    breathAmount: deg(1.8),
    breathBob: 0.007,
    basePose: {
      ArmL1: { x: deg(-4), z: deg(8) },
      ArmL2: { x: deg(12) },
      ArmR1: { x: deg(-4), z: deg(-8) },
      ArmR2: { x: deg(12) },
      LegL1: { x: deg(-4) },
      LegR1: { x: deg(4) },
    },
  },
  airborne: {
    rise: {
      LegL1: { x: deg(-38) }, LegR1: { x: deg(8) }, LegL2: { x: deg(62) }, LegR2: { x: deg(40) },
      ArmL1: { x: deg(-40), z: deg(34) }, ArmR1: { x: deg(-30), z: deg(-34) },
      ArmL2: { x: deg(30) }, ArmR2: { x: deg(30) }, Spine1: { x: deg(6) },
    },
    fall: {
      LegL1: { x: deg(-14) }, LegR1: { x: deg(10) }, LegL2: { x: deg(22) }, LegR2: { x: deg(18) },
      ArmL1: { x: deg(-70), z: deg(40) }, ArmR1: { x: deg(-60), z: deg(-40) },
      ArmL2: { x: deg(20) }, ArmR2: { x: deg(20) }, Spine1: { x: deg(-4) },
    },
    velocityReference: 8, // m/s vertical speed that reads as fully rising / falling
  },
  landing: {
    duration: 0.16,
    pose: {
      LegL1: { x: deg(-34) }, LegR1: { x: deg(-34) }, LegL2: { x: deg(58) }, LegR2: { x: deg(58) },
      ArmL1: { x: deg(-18), z: deg(20) }, ArmR1: { x: deg(-18), z: deg(-20) }, Spine1: { x: deg(14) },
    },
    bobY: -0.2,
  },
  transitions: { toLocomotion: 0.14, toAirborne: 0.12, toLanding: 0.06 }, // s to blend a pose change
}

export const FONT_FAMILY = 'Fredoka'

export function clamp(n, min, max) {
  return n < min ? min : n > max ? max : n
}

// Coerce one raw SDK string against its SETTINGS entry.
export function coerceSetting(key, raw) {
  const spec = SETTINGS[key]
  if (!spec) return raw
  const value = raw === '' || raw == null ? spec.def : raw
  if (spec.type === 'bool') return value === 'true' || value === true
  if (spec.type === 'enum') return spec.values.includes(value) ? value : spec.def
  const n = Number(value)
  return clamp(Number.isFinite(n) ? n : Number(spec.def), spec.min, spec.max)
}

// --- Server link (net.js; ../Dont-miss-your-flight-backend) ----------------------------------
// Dev talks to a local `npm start` backend (VITE_SERVER_URL_DEV overrides); production resolves the
// Bloxity Legion endpoint through the SDK. Without a server the game plays on the browser save.
export const SERVER_URL = import.meta.env.DEV ? import.meta.env.VITE_SERVER_URL_DEV || 'ws://localhost:2567' : ''
export const NET = {
  saveEvery: 4, // s between saves while something changed
  requestTimeout: 6, // s a daily claim waits for the server's answer
  retry: 3, // s before the first reconnect attempt (doubles up to retryMax)
  retryMax: 60,
  rejoin: 2, // s after a dropped room before rejoining
}

// --- Daily Rewards window (hud/windows.js; backend daily.ts, DAILY_DAYS = days.length) -------------
// One day unlocks per calendar day (the server's UTC day when online). kind: coins | job (a free
// shift: the job for `minutes`) | tool (a timed hotbar tool) | pass (a pass for `minutes`).
export const DAILY = {
  days: [
    { kind: 'coins', amount: 50, label: '50 Coins', art: 'coin1' },
    { kind: 'job', id: 'security', minutes: 15, label: 'Free Security Shift', art: 'police' },
    { kind: 'coins', amount: 100, label: '100 Coins', art: 'coin2' },
    { kind: 'coins', amount: 150, label: '150 Coins', art: 'coin2' },
    { kind: 'tool', id: 'grapple', minutes: 15, label: 'Grapple Hook', art: 'grapple', badge: true },
    { kind: 'coins', amount: 300, label: '300 Coins', art: 'coin3' },
    { kind: 'pass', id: 'gravityGun', minutes: 15, label: 'Gravity Gun', art: 'gravityGun', badge: true },
  ],
}

// --- Shop window (hud/windows.js): Passes / Trolls / Jobs, every price in coins -----------------------
// Passes are kept for good; trolls are one-shot (the same prices as the power buttons, and they land
// on everyone in the server through the backend's `troll` relay); jobs are the role hats + their panel.
export const SHOP = {
  passes: [
    { id: 'lounge', name: 'Sky Lounge Pass', desc: 'Get into the Sky Lounge at your gate: comfy chairs, a bar and free coins while you wait.', price: PRICES.loungePass, art: 'lounge', bg: 'orange' },
    { id: 'emojiPack', name: 'Emoji Pack', desc: 'Every emoji, not just the free ones.', price: 120, art: 'emojiPack', bg: 'gold' },
    { id: 'vip', name: 'VIP', desc: 'VIP tag, 2x coins and priority boarding: no boarding line.', price: 1200, art: 'vip', bg: 'gold' },
    { id: 'airHorn', name: 'Air Horn', desc: 'HOOOONK. Everyone nearby jumps.', price: 250, art: 'airHorn', bg: 'orange' },
    { id: 'handcuffs', name: 'Handcuffs', desc: 'Click anyone to detain them for 5 seconds.', price: 400, art: 'handcuffs', bg: 'sky' },
    { id: 'gravityGun', name: 'Gravity Gun', desc: 'Click anyone to pick them up, click again to throw them!', price: 1500, art: 'gravityGun', bg: 'teal' },
    { id: 'banHammer', name: 'Ban Hammer', desc: 'One bonk banishes anyone back to the entrance!', price: 1800, art: 'banHammer', bg: 'red' },
  ],
  trolls: [
    { id: 'killAll', name: 'Kill All', desc: 'Knock out EVERYONE in the server!', price: PRICES.killAll, art: 'devil', bg: 'purple' },
    { id: 'scareAll', name: 'Scare All', desc: "A jumpscare on everyone's screen!", price: PRICES.scareAll, art: 'skull', bg: 'red' },
    { id: 'luggageRain', name: 'Luggage Rain', desc: 'Make it rain suitcases all over the place!', price: PRICES.luggageRain, art: 'luggage', bg: 'red' },
    { id: 'lostFound', name: 'Lost And Found Rain', desc: 'Empty Lost and Found over everyone. Kitchen sink included!', price: 60, art: 'lostFound', bg: 'orange' },
    { id: 'paperPlanes', name: 'Paper Airplane Storm', desc: 'Fill the sky with paper airplanes!', price: PRICES.paperPlanes, art: 'plane', bg: 'sky' },
    { id: 'jetFlyover', name: 'Jet Flyover', desc: 'A jet roars over the terminal and rattles everyone!', price: 70, art: 'jet', bg: 'teal' },
    { id: 'coinShower', name: 'Coin Shower', desc: 'It rains coins: everyone grabs a few!', price: 80, art: 'coinShower', bg: 'gold' },
    { id: 'party', name: 'Airport Party', desc: 'Disco lights and party music for everyone!', price: 100, art: 'disco', bg: 'purple' },
    { id: 'snow', name: 'Let It Snow', desc: 'Make it snow over everyone, indoors too!', price: 60, art: 'snow', bg: 'sky' },
    { id: 'announce', name: 'Airport Announcement', desc: 'Say something ridiculous over the speakers!', price: PRICES.announce, art: 'megaphone', bg: 'lime' },
  ],
  jobs: [
    { id: 'security', name: 'Be Security', desc: 'Run the checkpoint: search the nervous ones, add time, let people go. Paid per shift.', price: PRICES.beSecurity, art: 'police', bg: 'sky' },
    { id: 'pilot', name: 'Be The Pilot', desc: 'Fly your own jet: takeoff, steer, land, turbulence and announcements. Paid per flight.', price: PRICES.bePilot, art: 'pilot', bg: 'gold' },
  ],
}

// --- Destinations window: every desk postcard can be visited; a destination counts as visited once
// you clear security on a flight there. Anything listed here shows as "coming soon" (none right now).
export const DEST_SOON = []

// --- Tools (tools.js): hotbar items, used on whoever is under the crosshair ------------------------
export const TOOLS = {
  order: ['airHorn', 'handcuffs', 'gravityGun', 'banHammer', 'grapple'],
  names: { airHorn: 'Air Horn', handcuffs: 'Handcuffs', gravityGun: 'Gravity Gun', banHammer: 'Ban Hammer', grapple: 'Grapple Hook' },
  range: 26, // m a tool reaches
  pickPx: 90, // screen px around the aim point that still picks someone
  hornRadius: 18, // m: everyone this close jumps
  hornCooldown: 2,
  cuffTime: 5, // s detained
  throwSpeed: 18, // m/s a gravity gun throw
  grappleRange: 45,
  grappleSpeed: 26,
  banTime: 7, // s the banished walk back from the entrance
  entrance: { x: 0, z: -3 }, // where the banished reappear (outside the doors)
}

// --- Jobs (jobs.js): Be Security / Be Pilot are modes. Each entry costs PRICES.beSecurity / bePilot
// (free while a Daily Reward shift for it runs); Exit ends the mode and puts you back where you were.
export const JOBS = {
  searchReward: 5, // (old tools.js job pins)
  searchTime: 4, // s a Security search takes
  holdTime: 10, // s "Add Time" adds to a search / to how long someone waits at your desk
  turbulenceCooldown: 12,
  takeoffCooldown: 15,
  // Security: you stand at a desk on the walkway behind the search mats; passengers come through from
  // the lanes, stop at your desk and wait for your call. Search the nervous ones, wave the rest through.
  security: {
    post: { x: 82.4, z: -39.3, facing: -1.75 }, // where you stand (facing west along the walkway; the desk is front-left so the camera sees it)
    desk: { x: 80.2, z: -41.6 }, // where the passenger stops (beside you, so the camera sees them)
    spacing: 1.6, // m between passengers waiting for your desk
    every: [2.5, 5], // s between new passengers
    max: 5, // passengers on the way to / at your desk
    speed: 2.6,
    patience: 9, // s someone waits at the desk before walking on
    susChance: 0.4, // share of passengers hiding something
    catchReward: 15, // coins: searched someone who was hiding something
    clearReward: 2, // searched someone with nothing on them
    waveReward: 4, // let an innocent passenger go
  },
  // Pilot: your own jet on the runway. Takeoff rolls it down the runway, then you fly it (W/S or the
  // joystick up/down climb and dive, A/D turn); Land glides it back onto the runway.
  pilot: {
    start: { x: -40, z: -190 }, // west end of the runway, nose east
    accel: 9, // m/s² down the runway
    rotateAt: 52, // m/s: lift off
    cruise: 62, // m/s in the air
    turnRate: 0.6, // rad/s at full stick
    minAlt: 25, // m above the runway you can dive to
    maxAlt: 280,
    centre: { x: 200, z: -120 }, // fly further than `radius` from here and the jet turns back (the
    radius: 360, //                 built world ends not far past the runway and the car park)
    landReward: 20, // coins per landing after at least `minFlight` s in the air
    minFlight: 15,
  },
}

// --- Multiplayer: fellow passengers (net.js, remote.js; backend presence.ts) ------------------------
// Everyone else in your server is drawn as a passenger walking the same airport, standing in the same
// lines (they take a place in your check-in / security / boarding line and hold the desk, lane, search
// mat or scanner they use) and flying with you when their flight matches yours. The staff (desk and
// gate agents, security officers, shop clerks, bouncer, bartender, cabin crew) are always bots.
// bots: false = there are NO bot passengers at all (no line, desk, security, gate, lounge or cabin
// passengers): the only passengers are the real players in your server. bots: true brings them back
// as a backfill while the server is quiet (each real passenger in the airport replaces one in
// `fullAt`-th of them; at `fullAt` real passengers no new ones arrive).
export const PASSENGERS = {
  bots: false,
  fullAt: 6, // (bots: true only) real passengers in the airport at which bot passengers stop arriving
}
export const REMOTE = {
  poseEvery: 0.1, // s between pose updates sent
  tripEvery: 0.5, // s between checks for a changed trip (zone / line / hold / look)
  delay: 0.15, // s others are drawn behind real time (smooth interpolation)
  drawDist: 70, // m: passengers further away are hidden
  maxDrawn: 24, // full avatars drawn at once (the nearest)
  tagDist: 26, // m: name tags shown this close
  aliveEvery: 1, // s between `alive` beats from the game loop (no beat for 5 s = away for the others)
  activeEvery: 2, // s between `active` messages while the player gives input (none for 60 s = idle: passed over in lines)
}
// --- Bloxity ads (bloxity.js): rewarded ad for coins (verified by the backend), the results screen
// ad shown on landing. Coins per ad = the backend's AD_REWARD_COINS.
export const ADS = {
  reward: { placement: 'free-coins', coins: 150, cooldown: 60 },
  resultsScreen: true,
}
// --- Bloxity leaderboards: the ids the backend reports to (constants.ts BOARDS). define() makes the
// portal's trophy button show them.
export const LEADERBOARDS = [
  { id: 'flights', label: 'Flights Taken', order: 'desc', mode: 'best', format: 'number', reset: 'none' },
  { id: 'destinations', label: 'Places Visited', order: 'desc', mode: 'best', format: 'number', reset: 'none' },
  { id: 'coins', label: 'Richest Travellers', order: 'desc', mode: 'latest', format: 'compact', reset: 'none' },
]
// --- Bloxity emotes (emotes.js): the portal's emote wheel; an emote stops when you move.
export const EMOTES = {
  blendIn: 0.12, // s
  stopSpeed: 0.6, // m/s of movement that cancels an emote
}
