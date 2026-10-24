# Stamina, the T and pace

Squash is won by getting back to the T. The stamina model exists to make that
true in the game: a player who sprints corner to corner without recovering ends
up slow and sloppy, while one who returns to the centre can reach every ball.

## Stamina reservoir (`Player.stamina`, 0..1)

Updated every frame in `Player.update` (constants in
`src/config/difficulty.js` → `STAMINA`):

| State | Change per second |
| --- | --- |
| Running (effort > 35 % of top speed) | − `drainPerMetre (0.016) × effort² × metres` — sprinting costs four times as much as half pace |
| Standing or jogging | + `recoverIdle (0.05) × fitness` |
| Standing on the T (within 0.9 m) | + `recoverOnT (0.11) × fitness` |
| Between rallies | + `recoverBetweenPoints (0.22) × fitness` |
| Between games | + 0.5 instantly |

Roughly 60 m of flat-out running empties the bar; a 10-second breather on the T
returns about a third of it.

## Effects of fatigue

- **Speed**: `effectiveSpeed = speed × (0.5 + 0.5 × stamina)`; an exhausted
  player runs at half pace.
- **Shots**: `error += 0.8 × (1 − stamina)` in `strikeVelocity`, which lowers
  the average height (tin risk), widens the scatter and takes pace off.
- **AI positioning**: its prediction error grows by `(1 + 1.5 × fatigue)`.

Both players use the same model; the AI's `fitness` multiplier differs per
difficulty.

## The T

`T_POSITION` is a small step (0.55 m) behind the point where the short line
meets the half-court line, where coaches tell players to stand. The renderers draw a yellow ring there during play; it
brightens and pulses while the human is more than 0.9 m away, as a reminder.

## Recovery speed

Players do not sprint back to the T. `recoverySpeed()` in `entities/player.js`
returns a jog (`RECOVERY_SPEED = 3.2 m/s`) when there is time, rising toward
top speed when the T is far and the ball is about to reach the opponent (time
available ≈ ball-to-opponent distance / ball speed). Both the AI (between its
turns) and the return-to-T assist use it, so a relaxed rally costs little
stamina and a fast one costs a lot, as in real play.

## Return-to-T assist (`Settings.autoT`, default on)

After the human serves or strikes, `Match.returnToT` is set. While it is set
and no new input arrives, the player's target is the T at recovery speed. Any mouse movement,
touch drag or key press clears it (`Game._controlHuman`), so the assist never
fights the player: it only fills the gap between shots. The HUD stamina bars
let you see the pay-off.

## Pace (`Settings.pace`)

`PACE = { relaxed: 0.8, normal: 1.0, fast: 1.2 }` multiplies simulation time
(`dt = real × pace`). Ball, players, stamina and the AI all slow down together,
so relaxed pace changes the feel without changing the balance. UI pauses use
wall-clock time and are unaffected.
