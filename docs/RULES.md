# Rules

The referee (`src/rules/referee.js`) implements the singles rally and scoring
rules of the World Squash *Rules of Singles Squash* (2025 edition). Court
dimensions in `src/config/court.js` are the official ones.

## Court

| Element | Value | Constant |
| --- | --- | --- |
| Width × length | 6.40 m × 9.75 m | `W`, `L` |
| Front wall out line | 4.57 m | `FRONT_OUT` |
| Back wall out line | 2.13 m | `BACK_OUT` |
| Side wall out line | straight diagonal between the two | `sideOutHeight(z)` |
| Service line (front wall) | 1.78 m | `SERVICE_LINE` |
| Tin (top of the board line) | 0.48 m | `TIN` |
| Short line | 4.26 m from the back wall (z = 5.49) | `SHORT_LINE_Z` |
| Half-court line | x = 3.20 m, from the short line to the back wall | — |
| Service boxes | 1.60 m squares behind the short line at each side wall | `BOX` |

## The rally

A player's shot is **good** when the ball reaches the front wall above the tin
and below the out line, possibly via a side wall first (a boast) and possibly
via the back wall. It may touch side walls on the way back as long as it stays
below the diagonal out line. The receiver must strike it before it bounces
twice.

| Event | Call | Who loses | Code |
| --- | --- | --- | --- |
| Front wall below the tin line | *tin* | hitter | `tin` |
| Any wall above its out line, or the ceiling | *out* | hitter | `out` |
| Floor before the front wall | *down* | hitter | `down` |
| Second floor bounce after the front wall | *not up* | receiver | `notUp` |
| Ball stops rolling, or 9 s without a racket contact | *dead* | receiver | `dead` |

"Hitter" is the last player to strike the ball; "receiver" is the player whose
turn it is. The referee tracks turn order: only the player whose turn it is may
strike the ball, so a player can never hit their own shot twice.

## Service

Implemented per Rule 5.7 (2025):

- The server stands in a service box (the game places them there; movement is
  frozen until the serve) and the receiver in the opposite back quarter.
- The ball must hit the front wall **between the service line and the out
  line**. Below the service line is a fault (`serviceLine`).
- The first bounce must be in the **opposite back quarter** (behind the short
  line, on the other side of the half-court line) unless the receiver volleys
  it. Elsewhere is a fault (`serviceFault`).
- A fault serve loses the rally (no second serve, as in modern rules).
- The server **alternates boxes** while retaining the serve. After a change of
  server the new server starts from the right box (the rules let the server
  choose; the game chooses right).

## Scoring

Point-a-rally (PAR) to **11**, win by **2**: the winner of every rally scores a
point and serves the next rally. A game is won at 11 with a two-point margin
(10-10 continues until someone leads by two). The match is best of 1, 3 or 5
games (official matches are best of 5; best of 3 is permitted). The winner of a
game serves first in the next game.

`Referee.getScore()` returns points, games, server, serve side and match
status for the HUD. `Referee.history` keeps every rally's winner and reason.

## Simplifications

These parts of the rulebook are intentionally **not** modelled:

- **Lets and strokes** (interference, turning, the ball hitting an opponent).
  Players are pushed apart softly so they never overlap, and a ball passing
  through a player is ignored. The player whose turn it is has right of way.
- **Lines count as out**: the game uses the line heights as thresholds; a ball
  exactly on a line is judged by its centre.
- The server is not required to keep one foot in the box; the game simply
  places them there.
- Warm-up, time-outs, injuries, appeals and conduct rules.

## Tests

`tests/referee.test.js` covers every call above with hand-built ball events,
including the diagonal side-wall line, serve faults, box alternation, change of
server, the 2-point margin and the match structure. `tests/match.test.js` plays
full games headlessly and checks that rallies end for several different
reasons and that both players score.
