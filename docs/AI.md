# Computer opponent

`src/entities/ai.js` controls the red player. It uses the same `Player` body
as the human (same movement, stamina and reach rules), so the only unfairness
is in the parameters below.

## Loop

Every frame (`AIController.update`):

1. **Not my turn** → recover to the T at a jog (faster only when the ball is
   about to reach the human and the T is far; see STAMINA.md), stepping half a
   metre to the side away from the opponent so the human has a clear path. The
   T is where stamina recovers fastest, so the AI naturally paces itself.
2. **My turn** → every `reaction` seconds re-read the ball by **simulating a
   private copy of it forward** (`predict`) with the real ball physics,
   including wall bounces. The first moment the ball is playable becomes the
   target:
   - after the front wall, after its first floor bounce, between 0.15 m and
     1.25 m high and no longer rising fast, or
   - as a fallback, a volley point deeper than z = 3.5 m if the ball never
     offers a bounce.
3. The target is **beside** the ball, not on it: 0.95 m to the right of a ball
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
| Opponent deep (more than 1 m behind the T), ball in the front 4 m, r < 0.45 + 0.5·attack | **drop** away from the opponent |
| Opponent deep, ball in a back corner, r < 0.35 + 0.5·attack | attacking **boast** out of the corner |
| Opponent deep, ball in the back half (not in a corner), r < 0.15 + 0.4·attack | attacking **boast** |
| Opponent forward (more than 1 m in front of the T), r < 0.8 | **lob** (60%) or hard **drive** deep to the far corner |
| Ball near the front (z < 3.2), opponent not forward, r < attack + 0.35 | **drop** away from the opponent |
| Ball above 1 m in the front 6.5 m, r < attack | **smash** |
| Otherwise | **drive**: cross-court to the far side, or (r > 0.7) straight and tight down the near wall |

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

`node tools/play-match.js` pits the AI against a bot of normal strength driving
the human. With the current constants (3 matches each):

| Opponent | human win ratio | avg hits / rally | longest rally |
| --- | --- | --- | --- |
| easy | ≈ 0.89 | ≈ 6 | ≈ 20 s |
| normal | ≈ 0.85 | ≈ 11 | ≈ 70 s |
| hard | ≈ 0.27 | ≈ 25 | ≈ 2 min |

A real human positions far worse than the bot, so expect lower ratios in play.
Rallies end by tin, not-up, out and service faults in varying proportions; if a
change makes one reason dominate, something is off.
