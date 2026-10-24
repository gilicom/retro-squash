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
camera looking down −z, which matches). The classic renderer projects them
through `core/camera.js`.

## Module map

```
                    ┌───────────────────────── browser layer ─────────────────────────┐
 index.html ─► main.js ─► ui/ui.js (DOM, i18n) ◄──┐                                   │
                   │                              │ events / callbacks                │
                   └──► core/game.js ─────────────┴─► input/input.js   audio/sound.js │
                           │        │                                                 │
                           │        └─► render3d/renderer3d.js   or   render/renderer.js
                           │             (court3d, player3d, textures)   (court, entities, camera)
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

Within a rally the ball is integrated at a fixed 240 Hz (`PHYSICS.STEP`) with
an accumulator, independent of the frame rate. After every physics step the
match checks whether the player whose turn it is can reach the ball and, if so,
strikes it (`_strike`). Racket contact is therefore automatic, as in the 1984
original; skill is in positioning, timing of the shot-type buttons and stamina.

### Browser layer

- `core/game.js` — the frame loop (`requestAnimationFrame`), pace scaling,
  pause/menu modes, renderer selection with WebGL fallback, and the mapping of
  match events to sound and HUD.
- `render3d/` — Three.js scene (see RENDERING.md). Interface:
  `resize()`, `draw(scene)`, `floorPoint(sx, sy)`, `dispose()`.
- `render/` — classic canvas renderer with the same interface.
- `input/input.js` — collects *intent* only (`pointerTarget`, drag deltas, held
  keys, queued actions); the game decides what it means.
- `audio/sound.js` — procedural Web Audio; no asset files.
- `ui/ui.js`, `ui/i18n.js` — DOM overlay and strings (EN/HE, RTL aware).

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

## Settings

Settings are a flat object persisted in `localStorage`
(`retro-squash.settings.v2`): `difficulty`, `pace`, `bestOf`, `autoT`,
`graphics`, `sound`, `lang`. `Game.applySettings` applies everything live
except `bestOf`, which takes effect at the next match.

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
