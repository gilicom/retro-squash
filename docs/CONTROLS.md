# Controls

`src/input/input.js` collects intent; `src/core/game.js` interprets it.

## Desktop

| Input | Effect |
| --- | --- |
| Mouse move | The player runs to the floor point under the cursor (ray cast against the floor plane, exact in both renderers). |
| Arrow keys / WASD | Move relative to the current position (up = toward the front wall). Keyboard and mouse can be mixed; the last used wins. |
| Left click / Space / Enter | Serve when it is your serve; otherwise arm a **smash** for the next contact. |
| Right click / Shift | Lob serve, or arm a **lob**. |
| Middle click / K | Arm a **drop**. |
| P / Escape | Pause / resume. |

An armed shot stays queued for 0.9 s (`ARM_DURATION`), then reverts to a drive.

Keys are matched by physical position (`KeyboardEvent.code`), so WASD works
with any keyboard layout, including Hebrew, where the W key produces a
Hebrew letter in `event.key`.

## Touch

| Input | Effect |
| --- | --- |
| Drag anywhere on the court | Moves the player **relative** to the drag (gain 1.6), so the finger never has to cover the player. |
| Tap (< 260 ms, < 12 px) | Serve, or arm a smash. |
| LOB / DROP buttons | Lob serve or arm the shot. |
| Pause button (top corner) | Pause. |

Touch mode is detected with `(pointer: coarse)` and switches live if a mouse
is used instead. The page disables browser gestures (`touch-action: none`,
`overscroll-behavior: none`) and respects safe-area insets on notched phones.

## Shot direction

The racket hits automatically whenever the ball is within reach on your turn
(|Δz| < 0.5 m, |Δx| < reach, 0 < y < 2.35 m). Direction is not aimed with a
stick; it comes from body position, as in the 1984 original:

```
targetX = ball.x + 2.2 × (ball.x − player.x) + 0.35 × player.vx
```

Hit the ball on the outside of your body to angle it across court; move into it
to add angle; let it come to your centre for a straight drive. Awkward contacts
(stretching, scraping, running, ball behind you) add error — see PHYSICS.md.

## Demo

*Watch a demo* in the menu starts a match in which a bot of the selected
difficulty plays the human's part, so both sides are computer controlled.
It serves and continues between games by itself; only pause and the menu
respond. *Play* leaves demo mode.

## Return to T

With the assist on (menu), the player jogs back to the T after every shot
until you give new input. See STAMINA.md.
