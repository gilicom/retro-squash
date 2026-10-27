# Physics

All physics lives in `src/physics/` and `src/config/physics.js`. Units are
metres, seconds and metres per second.

## Ball model (`physics/ball.js`)

The ball is a point mass with:

- **Gravity** `G = 9.81 m/s²`.
- **Quadratic air drag**: acceleration = −k·|v|·v with `DRAG = 0.02 /m`. A
  squash ball is light and slow enough for drag to matter: a 25 m/s drive loses
  a visible amount of pace over the length of the court.
- **Inelastic collisions** with the six court surfaces. Each contact scales the
  normal velocity by a coefficient of restitution and the tangential velocity
  by a friction factor:

| Surface | Restitution | Tangential factor | Notes |
| --- | --- | --- | --- |
| Floor | `FLOOR_BOUNCE = 0.52` | `FLOOR_FRICTION = 0.88` | Warm double-yellow-dot ball ≈ 0.5. Bounces under 0.25 m/s are zeroed so the ball settles instead of jittering. |
| Walls | `WALL_BOUNCE = 0.76` | `WALL_FRICTION = 0.92` | Front, back (glass) and both side walls. |
| Ceiling | 0.5 | — | Only reachable by a wild lob; the referee calls it out anyway. |

Integration is semi-implicit Euler at a fixed `STEP = 1/240 s`. The fast step
exists for gameplay rather than accuracy: a 26 m/s smash moves 11 cm per step,
comfortably inside the 50 cm depth window used for racket contact, so the ball
never tunnels through a player.

The ball reports every collision through an `onEvent(type, info)` callback with
the **pre-impact** position and speed. The referee judges legality from these
events; the ball itself has no notion of rules.

`isDead()` is true when the ball rests on the floor below `DEAD_SPEED = 0.35
m/s`; the match then calls the rally.

## Shots (`physics/shots.js`)

A shot is a target **height on the front wall** and a **launch speed**:

| Shot | Target height | Speed | Typical first bounce (from the back) |
| --- | --- | --- | --- |
| drive | 1.70 m | 19 m/s | z ≈ 6.8 m (good length) |
| smash | 0.78 m | 26 m/s | z ≈ 4.6 m, skids low |
| lob | 3.90 m | 12.2 m/s | z ≈ 7.4 m, apex ≈ 3.9 m |
| drop | 0.62 m | 9.5 m/s | z ≈ 0.85 m, dies by 3.6 m |
| serve | 3.30 m | 13 m/s | lands in the receiving quarter |
| lobServe | 4.30 m | 11 m/s | high, deep |
| boast | 1.30 m on the **side wall**, ~2.5 m from the front | 16 m/s | rebounds to the front wall, lands z ≈ 2.7 m |
| backBoast | launch 35° into the **back wall** | 15.5 m/s | loops to the front wall at 1.5-3 m, sits up near the front |

`forcedShot(player, ball)` returns a boast when the ball is behind the body
(> 0.12 m) and deep (< 1 m from the back wall): the side-wall boast in a back
corner, the back-wall boast in the middle. Both players are forced into it;
the computer also plays an attacking boast out of a back corner when the
opponent is deep.

Speeds are deliberately below professional pace (pros exceed 40 m/s) so that a
player who returns to the T can reach every ball; the **pace** setting scales
simulation time on top of this.

### Aiming: `aimAt(from, tx, ty, speed, tz = 0)`

Given a launch point and a target on the front wall, `aimAt` returns the
velocity. The horizontal components are set from `speed`; the vertical
component starts from the drag-free parabola and is corrected three times by
simulating a drag-only flight and measuring the arrival height. Three passes
give centimetre accuracy (asserted in `tests/shots.test.js`).

### Error model: `strikeVelocity(ball, shot, tx, rand, error)`

A clean contact uses the catalogue values plus a small random height jitter.
`error` (0 = clean, ~1.5 = desperate) models everything that makes a contact
worse:

- mean target height drops by `0.45 × error` (tin risk),
- height jitter grows by `(1 + 2.5 × error)`,
- width scatters by `±0.6 × error` m,
- pace drops by `15 % × min(error, 1.5)`.

`error` is the sum of **fatigue** (`0.8 × (1 − stamina)`) and
**contactPressure(player, ball)**:

| Factor | Contribution |
| --- | --- |
| reaching wide: `|ball.x − p.x| / reach` | up to 0.5 |
| ball below 0.30 m (scraping) | 0.35 |
| hitting on the run: `speed / topSpeed` | up to 0.4 |
| ball behind the body (`ball.z > p.z + 0.2`) | 0.3 |

This is what ends rallies naturally: stretched, tired or rushed players hit
the tin or send the ball out, without any scripted "miss chance".

### Direction

The human's target x on the front wall is
`ball.x + 2.2 × (ball.x − player.x) + 0.35 × player.vx`: hitting the ball on
the outside of the body angles it across court, moving into the ball adds
angle. The AI chooses `tx` deliberately (see AI.md).

## Tuning tools

- `npm run simulate` prints, for each shot and several contact points, the
  front-wall impact height, the first and second bounce positions and the
  referee's verdict. Use it after changing any constant above.
- `node tools/play-match.js` plays whole matches headlessly and reports rally
  length, endings and stamina usage.
