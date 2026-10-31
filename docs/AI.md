# Computer opponent

`src/entities/ai.js` controls the red player. It uses the same `Player` body
as the human (same movement, stamina and reach rules), so the only unfairness
is in the parameters below.

## Loop

Every frame (`AIController.update`):

1. **Not my turn** → recover to the T: a jog when there is time, faster (up
   to 80 % of top speed) when the ball is about to reach the human and the T is
   far (see STAMINA.md), stepping 0.3 m to the side away from the opponent so
   the human has a clear path. The computer is within 0.6 m of the T at 80 % of
   the opponent's strikes (`node tools/t-and-corners.mjs`). The T is where
   stamina recovers fastest, so the AI naturally paces itself.
2. **My turn** → every `reaction` seconds re-read the ball by **simulating a
   private copy of it forward** (`predict`) with the real ball physics,
   including wall bounces. The first moment the ball is playable becomes the
   target:
   - after the front wall, after its first floor bounce, between 0.15 m and
     1.25 m high and no longer rising fast. Bounces the ball has already
     taken count (the referee's bounce counter seeds the simulation), so a
     re-read after the first bounce still plays this bounce; it used to wait
     for the "first" bounce again and run to where the ball would be after
     the second, letting serves and short balls go.
   - When that point is deep by the back wall (or only comes off it), and the
     ball passes earlier at a comfortable height (0.45-1.9 m, beyond z = 3.5
     m) that the player can reach in time, the volley is taken instead: the
     receiver attacks a serve rather than digging it out of the back.
   - A ball that is still running on to the back wall after its bounce is
     let come off it and played as it comes out (low, slowing, in front of
     the body) when that point is reachable: a straight drive is then
     possible where taking the ball on its way in would force a boast.
   - As a fallback, the volley point if the ball never offers a bounce.
3. The run is **paced by the time available**: the speed cap is the speed
   that reaches the target 0.25 s early with 30 % in hand, never below 70 %
   of top speed, so an early ball is met at a brisk stride instead of a sprint
   that ends in a shuffle (and costs less stamina).
4. The target is **beside** the ball, not on it: 0.95 m to the right of a ball
   on the left half of the court (played as a backhand) and to the left of a
   ball on the right half (forehand), 0.15 m behind it, so contact is out in
   front on the natural side. Reach is 25 % longer on that side and 15 %
   shorter when the ball is on the body's wrong side (`Player.canReach`), and
   contact pressure counts stretching only beyond that arm's-length stance.
4. A **positional error** is drawn from a Gaussian with standard deviation
   `error × (1 + distance / 3) × (1 + 1.5 × fatigue)`: long runs and tiredness
   make the AI arrive in the wrong place and reach wide (which, through the
   pressure model in PHYSICS.md, makes it hit the tin).

Contact itself is automatic, as for the human: when the ball is within reach on
the AI's turn, `Match._strike` asks `chooseShot`.

## Shot selection (`chooseShot`)

The opponent's position decides the shot. `farSide` is the back corner away
from the opponent; `attack` is the difficulty's aggression, +0.3 against an
opponent whose stamina is below 0.4, and −1 (no touch shots) when the computer's
own stamina is below 0.35. `r` is a uniform roll.

| Situation (checked in this order) | Shot |
| --- | --- |
| Ball deep behind the body | **forced**: boast from a back corner, back-wall boast from the middle (`forcedShot`) |
| Opponent deep (more than 1 m behind the T), ball in the front 4 m, contact balanced, r < 0.45 + 0.5·attack | **drop** away from the opponent |
| Opponent deep, ball in a back corner, r < 0.35 + 0.5·attack | attacking **boast** out of the corner |
| Opponent deep, ball in the back half (not in a corner), r < 0.15 + 0.4·attack | attacking **boast** |
| Opponent forward (more than 1 m in front of the T), r < 0.8 | **lob** (60%) or hard **drive** deep to the far corner |
| Ball near the front (z < 3.2), opponent not forward, contact balanced, r < attack + 0.35 | **drop** away from the opponent |
| Ball above 1 m in the front 6.5 m, r < attack | **smash** |
| Ball in the front 7.5 m, opponent on the ball's side of the court, r < 0.35 + 0.2·attack (0.15 when they are on the other side) | hard **cross-court** (`cross`: 1.6 m on the front wall, 22 m/s) into the opposite back corner, so they have the whole width to cover |
| Otherwise | **drive**: cross-court to the far side, or (r > 0.7) straight and tight down the near wall |

"Contact balanced" means the contact pressure plus fatigue (PHYSICS.md) is
below 0.45: stretched, rushed, behind the body or tired, the player plays to
a back corner instead of a touch shot that would find the tin.

**Aiming at the corners** (`aimCorner`): drives, cross-courts and lobs are
not aimed at the corner's x on the front wall but at the front-wall x that
lands the ball in the corner (x = 0.5 or W − 0.5 at 8.2 m depth, 8.8 m for a
lob): the ball leaves the front wall at the mirror of its incoming angle, so a
straight drive from mid-court is aimed a little out from the corner and a
cross-court at the middle of the front wall (aimed at the far corner itself it
would meet the side wall first and sit up in mid-court). Under pressure a
drive or lob is lifted (`Match._strike`: 0.3 m higher on the front wall per
unit of error, the pace loss stays) so it still reaches the back; a pressed
boast is played safe too (small height loss, floored at 0.55 m on the side
wall). `node tools/t-and-corners.mjs` measures the first bounce of the
computer's shots (drives: median 5.5 m deep, 1.0 m off the side wall; crosses
6.2 m deep) and `node tools/shot-depth.mjs` shows clean landings.

A Gaussian aim error (`aimError`) is added to every target. Faster stamina
drain (2026-10-31) makes these choices matter: a tired player's shots scatter
(`fatigue` feeds the strike error) and a tired opponent is attacked with short
balls.

## Difficulty table (`src/config/difficulty.js`)

| | easy | normal | hard |
| --- | --- | --- | --- |
| top speed (m/s) | 3.0 | 3.8 | 4.6 |
| reaction (s) | 0.35 | 0.22 | 0.12 |
| positional error σ (m) | 0.45 | 0.25 | 0.10 |
| aim error σ (m) | 0.60 | 0.40 | 0.22 |
| reach (m) | 0.95 | 1.05 | 1.15 |
| aggression | 0.15 | 0.30 | 0.50 |
| fitness (stamina recovery ×) | 0.8 | 1.0 | 1.25 |

The human runs at 4.4 m/s with 1.10 m reach.

## Balance

`node tools/play-match.js` pits the AI against a bot driving the human with
the same shot selection at the opponent's level and the human's speed and
reach. Its endings line is keyed by the **winner**: `you:tin=41` means the
bot won 41 rallies because the computer tinned, `cpu:down=10` that the
computer won 10 because the bot's shot went down. With the current constants
(2026-11-01, 6/3/3 matches):

| Opponent | bot win ratio | avg hits / rally | longest rally |
| --- | --- | --- | --- |
| easy | ≈ 0.87 | ≈ 7 | ≈ 30 s |
| normal | ≈ 0.67 | ≈ 28 | ≈ 4 min |
| hard | ≈ 0.20 | ≈ 13 | ≈ 2 min |

Both sides now play for length and hold the T, so rallies between the two
AIs are long and decided by fatigue; a real human positions far worse than
the bot and errs more, so expect shorter rallies and lower ratios in play.
`node tools/match-log.mjs [seed] [level]` logs one match rally by rally
(fault, last shot, stamina) when a result looks one-sided.
Rallies end by tin, not-up, out and service faults in varying proportions; if a
change makes one reason dominate, something is off.
