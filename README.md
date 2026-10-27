# Retro Squash

A modern, physically realistic reimagining of **Squash** (Itisa, 1984), the Spanish
arcade game where two paddle-wielding players trade shots off the front wall of a
court. This version keeps the arcade feel (the racket hits automatically, the angle
comes from where the ball meets you) and adds everything the original could not:
a real 3D court rendered with WebGL, a ball with gravity, air drag and spin-free
bounces, the full World Squash rulebook for a singles rally, stamina, a computer
opponent that reads the ball, and controls for both desktop and touch screens.

- **Play in the browser**, desktop or phone, portrait or landscape.
- **Real 3D** (Three.js) with shadows, a glass back wall and rigged characters
  driven by procedural animation.
- **Real rules**: tin, out lines, service boxes, receiving quarter, one bounce,
  point-a-rally to 11, win by 2, best of 1 / 3 / 5.
- **Stamina and the T**: running drains a bar; standing on the T refills it.
  "Return to T" jogs you back after every shot until you move.
- **Demo mode**: watch computer vs computer from the menu.
- **No build step required to run**; Vite is used for the dev server and bundling.
- **Play it now**: https://gilicom.github.io/retro-squash/ (works on phones; add to home screen for full screen).

[Hebrew summary / תקציר בעברית](#תקציר-בעברית) is at the end of this file.

## Quick start

```bash
npm install
npm run dev
```

Open the printed URL (default `http://localhost:5173`). To play from a phone on
the same network, use the `--host` address Vite prints.

| Command            | What it does                                              |
| ------------------ | --------------------------------------------------------- |
| `npm run dev`      | Dev server with hot reload                                |
| `npm run build`    | Production bundle in `dist/` (relative paths, host anywhere) |
| `npm run preview`  | Serve the production bundle locally                       |
| `npm test`         | Unit + headless match tests (Node's built-in test runner) |
| `npm run simulate` | Print shot and serve landing tables                       |
| `npm run deploy`   | Build and publish to GitHub Pages (`gh-pages` branch)     |
| `node tools/play-match.js [easy|normal|hard] [matches]` | Bot-vs-AI balance statistics |

Requires Node 18+. Only two dependencies: `three` (runtime) and `vite` (dev).

## How to play

**Desktop**: move the mouse (the player runs to the point on the floor you point
at) or use the arrow keys / WASD. The racket hits automatically when the ball is
within reach; where the ball meets the racket decides the angle, and moving into
the ball adds angle. Left click or Space = smash (or serve), right click or
Shift = lob, K = drop, P / Escape = pause.

**Touch**: drag anywhere to run (relative to the drag, so your finger never covers
the player). Tap = smash / serve. On-screen LOB and DROP buttons.

Rules in one breath: the ball must reach the front wall above the tin and below
the red out lines (it may touch side walls first), and it may bounce once before
you return it. Serve from a box, above the service line, into the opposite back
quarter. First to 11, win by 2. See [docs/RULES.md](docs/RULES.md).

## Project layout

```
index.html              Page shell: two canvases (3D + classic), HUD, menus
src/
  main.js               Entry: settings persistence, wires UI <-> Game
  config/               Court dimensions, physics constants, difficulty, stamina, pace
  physics/              Ball integration and ballistic shot aiming (pure, no DOM)
  rules/                Referee: rally legality, faults, scoring, match structure
  entities/             Player (movement, stamina, reach) and the AI controller
  core/
    match.js            Pure match simulation (runs in Node) and its events
    game.js             Browser glue: loop, renderer choice, input, sound, HUD
  render3d/             Three.js renderer: court, lights, characters, ball, effects
  input/                Mouse, keyboard and touch
  audio/                Procedural Web Audio sound effects
  ui/                   DOM overlay and EN/HE strings
  styles/               CSS
tests/                  node:test suites (ball, shots, referee, full matches)
tools/                  Headless simulation and balancing scripts
docs/                   Design and reference documentation (see below)
public/                 Static assets (favicon, web manifest)
```

## Documentation

| Document | Contents |
| --- | --- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Module map, data flow, state machines, how to port the core to another engine |
| [docs/PHYSICS.md](docs/PHYSICS.md) | Ball model, constants, shot aiming, pressure/fatigue error model |
| [docs/RULES.md](docs/RULES.md) | Which World Squash rules are implemented, how, and what is simplified |
| [docs/AI.md](docs/AI.md) | How the computer opponent predicts, moves and chooses shots; difficulty table |
| [docs/STAMINA.md](docs/STAMINA.md) | Stamina model, the T, return-to-T assist, pace |
| [docs/CONTROLS.md](docs/CONTROLS.md) | Input mapping for mouse, keyboard and touch |
| [docs/RENDERING.md](docs/RENDERING.md) | 3D scene, materials, lighting, camera fitting, player rig; classic renderer |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | Tooling, tests, balancing workflow, deployment, coding conventions |
| [CHANGELOG.md](CHANGELOG.md) | Version history |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to contribute |

Every source file starts with a `@module` doc comment, and public functions carry
JSDoc with units (metres, seconds, m/s).

## Characters

The players are rigged glTF characters on the Mixamo skeleton, driven by the
game's own procedural animation (footsteps, lunge, strokes). The bundled
player was built in Blender with MPFB (MakeHuman) from the design brief in
`docs/design/`; the three.js **Xbot** mannequin is the fallback. For realistic players,
export any character from [Mixamo](https://www.mixamo.com) (T-pose, FBX →
glTF/GLB) or [Ready Player Me](https://readyplayer.me), place it in
`public/models/` and set `CHARACTER_URL` in `src/render3d/renderer3d.js`;
no animation files are needed. See docs/RENDERING.md.

## Credits

Inspired by *Squash* by ITISA Electronics (Palamós, 1984). Xbot character
from the [three.js](https://github.com/mrdoob/three.js) examples (MIT). Court dimensions and
rules follow the World Squash *Rules of Singles Squash* (2025 edition). Player
movement and animation follow coaching material: Control the T, [A blueprint
for moving like the pros](https://blog.controlthet.com/blog/a-blueprint-for-moving-like-the-pros),
and Squash Magazine, [Technique: it starts with the feet](https://squashmagazine.com/2012/03/technique-it-starts-with-the-feet-part-3/). Licensed
under the MIT licence; see [LICENSE](LICENSE).

## תקציר בעברית

**Retro Squash** הוא שחזור מודרני של משחק הארקייד הספרדי Squash (Itisa, 1984):
מגרש סקווש תלת-ממדי אמיתי בדפדפן (WebGL / Three.js), כדור עם כבידה וגרר אוויר,
חוקי World Squash המלאים למשחק יחידים (טין, קווי אאוט, קופסאות הגשה, רבע קבלה,
קפיצה אחת, ניקוד 11 עם יתרון 2), מד סטמינה, חזרה אוטומטית ל-T, יריב ממוחשב
בשלוש רמות, ותמיכה בעכבר, מקלדת ומגע.

הפעלה: `npm install` ואז `npm run dev`. בנייה לפרסום: `npm run build` (התיקייה
`dist/` ניתנת להעלאה לכל אחסון סטטי). בדיקות: `npm test`.

שליטה במחשב: תנועת העכבר מזיזה את השחקן; המחבט חובט אוטומטית. לחיצה / רווח =
חבטת עוצמה או הגשה, לחיצה ימנית / Shift = לוב, K = דרופ, P = השהיה. במובייל:
גרירה להזזה, הקשה לעוצמה, וכפתורי לוב ודרופ. שפת הממשק ניתנת להחלפה בתפריט.

תיעוד מלא בתיקיית `docs/` (ארכיטקטורה, פיזיקה, חוקים, בינה מלאכותית, סטמינה,
שליטה, רינדור ופיתוח).
