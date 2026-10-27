# Development

## Requirements

- Node 18 or newer (uses `node:test`, ES modules, `structuredClone`-free code).
- A browser with WebGL for the 3D renderer; any browser for the classic one.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm install` | Installs `three` and `vite`. |
| `npm run dev` | Vite dev server on port 5173 with `--host` (reachable from phones on the LAN). |
| `npm run build` | Production bundle in `dist/` with `base: './'` so it works from any sub-path (GitHub Pages, S3, itch.io). Source maps included. |
| `npm run preview` | Serves `dist/`. |
| `npm test` | Runs `tests/**/*.test.js` with Node's test runner. No test framework to install. |
| `npm run simulate` | Shot/serve landing tables (`tools/simulate.js`). |
| `node tools/play-match.js [difficulty] [n]` | Headless bot-vs-AI matches with statistics. |

## Tests

| File | Covers |
| --- | --- |
| `tests/ball.test.js` | Bounce decay, containment, collision event data, drag. |
| `tests/shots.test.js` | `aimAt` accuracy under drag, every shot legal from the back, x clamping. |
| `tests/referee.test.js` | Every fault type, serve rules, box alternation, server change, 11/2-point margin, match structure. |
| `tests/match.test.js` | Full seeded games: completion, rally length, variety of endings, both sides scoring, difficulty ordering, stamina use, serve set-up after a point. |

Tests are deterministic (seeded `mulberry32` PRNG injected into `Match` and
`AIController`). When a balance change breaks `match.test.js`, run
`tools/play-match.js` to see what moved.

## Balancing workflow

1. Change a constant (`config/physics.js`, `config/difficulty.js`,
   `physics/shots.js`).
2. `npm run simulate` — make sure every shot still lands legally and serves
   reach the receiving quarter.
3. `node tools/play-match.js` — check win ratios (easy > normal > hard), rally
   length, and that rallies end for several reasons.
4. `npm test`.
5. Play it: `npm run dev`, try all three difficulties and both paces.

## Debugging in the browser

`window.squash` is the `Game` instance. Useful:

```js
squash.match.state            // 'serve' | 'rally' | 'point' | ...
squash.match.referee.history  // every rally so far
squash.match.human.stamina
squash.rendererKind           // '3d' | 'classic'
squash.match.serve('lobServe')
```

The browser pauses the game when the tab is hidden (`visibilitychange`); to
drive it from DevTools while hidden, stub `squash.pause = () => {}` and step
with `squash.update(1/60, 1/60)` followed by
`squash.renderer.draw({...})`.

## Pose viewer

`http://localhost:5173/dev/poses.html` renders one player model large, at a
chosen stroke phase, from any angle, with a single render per load (works in
throttled background tabs):

| Parameter | Meaning |
| --- | --- |
| `side` | 1 forehand (default), -1 backhand |
| `phase` | 0..1 position in the swing (0 backswing, 0.22 contact, 0.6 follow-through); omit for the ready pose |
| `prep` | 0..1 backswing preparation blend (ready pose only) |
| `ballY` | ball height in metres (default 0.3) |
| `cam` | camera azimuth in degrees (0 from the front wall, 90 from the player's right) |
| `lunge`, `run` | force lunge depth / running intensity |
| `model`, `file` | `model=1` shows the rigged glTF character driven by the same solver; `file` picks it from public/models (default Xbot.glb) |

Example: `dev/poses.html?side=1&phase=0.22&cam=35&ballY=0.3`. Put reference
photographs in `ref/` (git-ignored) and compare.

## Conventions

- ES modules, no transpilation, no framework. Plain classes and functions.
- Every module starts with a `@module` JSDoc block explaining its role; public
  functions document parameters with units.
- SI units everywhere (m, s, m/s). Angles in radians.
- Pure core must not import from `render*`, `ui`, `input`, `audio` or touch
  `window`/`document`. The test suite enforces this indirectly by running it in
  Node.
- Formatting: 2 spaces, single quotes, semicolons, trailing commas
  (`.editorconfig`). Line length ~120.
- Strings for the UI go in `ui/i18n.js` in both languages.

## Adding a language

Add a key to `STRINGS` in `src/ui/i18n.js` with every string from `en`, add
`'xx'` to `LANGS`, and a button in the language segment in `index.html`. Set
`dir` handling in `UI.applyLanguage` if the language is right-to-left.

## Deployment

The game is a static site: no server code, no environment variables. The web
manifest and theme colour let it be added to a phone's home screen as a
full-screen app.

- **GitHub Pages (current)**: `npm run deploy` builds and force-pushes `dist/`
  to the `gh-pages` branch, which Pages serves at
  https://gilicom.github.io/retro-squash/. Needs only push rights.
- **Automatic on push**: `.github/workflows/deploy.yml` (kept untracked until
  the `gh` token has the `workflow` scope: `gh auth refresh -s workflow`)
  runs tests, builds and deploys through GitHub Actions; switch Pages to the
  "GitHub Actions" source when committing it.
- **Anywhere else**: `npm run build` and upload `dist/` (relative asset paths,
  works from any sub-folder).

## Versioning

Semantic versioning in `package.json`; notable changes in `CHANGELOG.md`.
