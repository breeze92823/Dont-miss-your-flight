---
canDie: true
hasScore: true
rewards: true
clientDir: .
buildCommand: npm run build
distDir: dist
roomSize: 40
---

# Don't Miss Your Flight — Bloxity integration notes

- **canDie**: yes. The "Kill All" troll knocks every player out; the knockout shows Boxity's death
  screen and the player gets up when its countdown allows (`bloxity.deathScreen()`, `trolls.js`).
- **hasScore**: yes. Leaderboards `flights` (Flights Taken), `destinations` (Places Visited) and
  `coins` (Richest Travellers) are declared by the client (`LEADERBOARDS` in `src/config.js`) and
  submitted by the game server for verified accounts (`../Dont-miss-your-flight-backend/src/bloxity.ts`).
- **rewards**: yes. The Shop offers a rewarded ad for coins (`ADS.reward`); the game server verifies
  the reward token with Bloxity before the coins are granted.
- **roomSize**: 40 players per room (`ROOM_MAX_CLIENTS` in the backend), hosted on Bloxity Legion
  through the matchmaker (`Legion.SDK.net.resolveEndpoint`), so party play and Play with friends work.
- Every player in a room is drawn as a fellow passenger; only staff are bots.
- No Gems: nothing in the game is bought with premium currency. Everything costs in-game coins.
