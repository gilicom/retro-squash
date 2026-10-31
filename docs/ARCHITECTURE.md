# Architecture

Retro Squash is plain ES modules with one runtime dependency (Three.js). The
code is split into a **pure core** that knows nothing about browsers, and a
**thin browser layer** that renders it, listens to input and plays sound. The
split is what makes the project portable: the core runs unchanged in Node for
tests and tuning, and could be dropped into another engine (Unity via a JS
bridge, a native port, a multiplayer server) by re-implementing only the
browser layer.

## Coordinate system

All modules share one metric coordinate system:

| Axis | Meaning | Range |
| --- | --- | --- |
| `x` | across the court, left side wall to right side wall | 0 … 6.40 m |
| `y` | up from the floor | 0 … 5.64 m (nominal ceiling) |
| `z` | depth, front wall to glass back wall (camera side) | 0 … 9.75 m |

Players face the front wall, so "right" is +x and a shot travels toward z = 0.
The 3D renderer uses the same axes directly (Three.js is right-handed with the
camera looking down −z, which matches). 

## Module map

```
                    ┌───────────────────────── browser layer ─────────────────────────┐
 index.html ─► main.js ─► ui/ui.js (DOM, i18n) ◄──┐                                   │
                   │  ├─► pwa/pwa.js (service worker, install, wake lock)             │
                   │  ├─► ranking/ranking.js ─► ranking/providers/* ─► backend (REST) │
                   │  │      (identity, rating, queue)      config/backend.js         │
                   │  │                           │ events / callbacks                │
                   └──► core/game.js ─────────────┴─► input/input.js   audio/sound.js │
                           │        │                                                 │
                           │        └─► render3d/renderer3d.js
                           │             (court3d, body3d, player3d, skinned-player, racket3d, textures)
                           ▼
                    ┌───────────────────────────── pure core ─────────────────────────┐
                    │ core/match.js                                                   │
                    │   ├─ physics/ball.js        integration + collision events      │
                    │   ├─ physics/shots.js       shot catalogue, aimAt, pressure     │
                    │   ├─ rules/referee.js       legality, faults, scoring           │
                    │   ├─ entities/player.js     movement, stamina, reach, swing     │
                    │   ├─ entities/ai.js         prediction, positioning, shot choice│
                    │   └─ config/*               court, physics, difficulty, stamina │
                    └─────────────────────────────────────────────────────────────────┘
```

### Pure core (`src/core/match.js` and below)

`Match` owns the ball, both players, the AI controller and the referee, and
runs the rally state machine:

```
serve ──(serve())──► rally ──(decision)──► point ──(POINT_PAUSE)──► serve
                                                └──► gameover ──(nextGame())──► serve
                                                └──► matchover
```

It exposes `update(dt, real)` and emits events (`serveReady`, `serve`, `hit`,
`wall`, `floor`, `rallyEnd`, `gameOver`, `matchOver`). It never reads the
clock, the DOM or `Math.random` directly: a random source is injected so
matches are reproducible (see `tests/match.test.js`).

After a rally ends the ball keeps being integrated (no referee, no racket
contact) until it dies or the next serve is set up, so a fault is still
visible as the ball rolling out. Within a rally the ball is integrated at a fixed 240 Hz (`PHYSICS.STEP`) with
an accumulator, independent of the frame rate. After every physics step the
match checks whether the player whose turn it is can reach the ball and, if so,
strikes it (`_strike`). Racket contact is therefore automatic, as in the 1984
original; skill is in positioning, timing of the shot-type buttons and stamina.

### Browser layer

- `core/game.js` — the frame loop (`requestAnimationFrame`), pace scaling,
  pause/menu modes, demo mode, and the mapping of match events to sound and HUD.
- `render3d/` — Three.js scene (see RENDERING.md). Interface:
  `resize()`, `draw(scene)`, `floorPoint(sx, sy)`, `dispose()`.
- `input/input.js` — collects *intent* only (`pointerTarget`, drag deltas, held
  keys, queued actions); the game decides what it means.
- `audio/sound.js` — procedural Web Audio; no asset files.
- `ui/ui.js`, `ui/i18n.js` — DOM overlay and strings (EN/HE, RTL aware),
  including the nickname dialog, the leaderboard and the install/update controls.
- `pwa/pwa.js` — installable-app plumbing: registers the service worker
  (production only), surfaces "update available", captures the browser's
  install prompt (or shows the iOS hint), holds a screen wake lock during a
  match and asks for fullscreen on touch devices. `pwa/sw.js` is the worker
  *template*; `tools/vite-plugin-sw.js` fills in the precache list and a
  content hash at build time and writes `dist/sw.js`.
- `ranking/` — the world-ranking client (docs/RANKING.md): `identity.js`
  (player id, secret key, nickname), `rating.js` (reference Elo formula),
  `ranking.js` (queue, flush, leaderboard), `providers/` (backend adapters;
  `supabase.js` uses plain `fetch`). `config/backend.js` holds the public
  keys. `Game` reports a finished non-demo match through `onMatchFinished`;
  nothing in the core knows about the ranking.

### Touch aiming

Touch input has two gestures: a tap sets the human's target (or serves),
and a press-and-drag sets an **aim**. `Input` turns the drag into a court
vector (`aimLive`); on release the game calls `Match.setAim`, which arms it
for `AIM_DURATION`. At the next human contact `_strike` uses
`aimTargetX(ball, aim)` (continue the direction from the ball to the front
wall) instead of the body-position rule. The renderer draws the arrow from
`scene.aim` and the match core stays free of any input or DOM dependency.

## Data flow per frame

1. `Game._frame` computes `real` (wall-clock dt, capped at 50 ms) and
   `dt = real × pace`.
2. `Game.update` drains input actions, maps pointer/keys to the human's
   target (`_controlHuman`), then calls `Match.update(dt, real)`.
3. `Match.update` applies return-to-T, runs the AI, moves both players,
   separates them, and either holds the ball in the server's hand, steps the
   physics, or counts down the point pause.
4. `Game` throttles stamina HUD updates to 10 Hz.
5. `renderer.draw({ ball, players, effects, dt, inPlay })` renders.

`effects` is a plain array of `{x, y, z, age, life, kind}` records created by
the match and aged/removed by whichever renderer is active.

## Settings and local storage

Settings are a flat object persisted in `localStorage`
(`retro-squash.settings.v2`): `difficulty`, `pace`, `bestOf`, `autoT`,
`sound`, `lang`. `Game.applySettings` applies everything live
except `bestOf`, which takes effect at the next match.

Other keys: `retro-squash.player.v1` (identity: id, key, nickname),
`retro-squash.ranking.queue.v1` (results waiting to be sent) and
`retro-squash.ranking.state.v1` (last known rating and rank, for offline
display). Clearing site data creates a new anonymous player.

## Offline and updates

The production build is a PWA. The service worker precaches every file in
`dist/` (about 7 MB with the two character models) on first visit, serves
them cache-first afterwards and never touches cross-origin requests, so the
ranking backend is always live. A new deployment changes the content hash in
`sw.js`; the browser installs the new worker in the background, the page
shows "A new version is ready" and reloads when the player presses Update
(the new worker only takes over on request, so a match in progress is never
interrupted).

## Porting the core elsewhere

The core has no imports outside `src/config`, `src/physics`, `src/rules`,
`src/entities` and `src/core/match.js`. To port:

1. Copy those folders.
2. Provide a loop that calls `match.update(dt)` at your frame rate and a
   `rand()` function.
3. Drive the human by setting `match.human.setTarget(x, z)` and calling
   `match.arm('smash' | 'lob' | 'drop')` / `match.serve()`.
4. Render from `match.ball`, `match.players[i]` (`x, z, vx, vz, swing,
   swingSide, runPhase, stamina`) and `match.effects`.
5. Subscribe to the events for sound and UI.

Everything is in SI units, so no scaling is needed.
