# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- `npm run deploy` publishes the build to GitHub Pages; live at https://gilicom.github.io/retro-squash/.

### Changed
- Player animation rebuilt around real squash movement: low ready stance on the
  toes, a single split step timed to the opponent's contact, side shuffles,
  short quiet running strides, backpedalling, a deep lunge into the ball and a
  stroke with the shoulders turned to the side wall. Knees now bend the right way.
- Players jog back to the T instead of sprinting, and sprint only when the ball
  is about to reach the opponent; the T is a small step behind the short line.
- Forehand and backhand strokes re-animated from reference photographs:
  direction-based arm posing with elbow/wrist/racket keyframes, shoulders
  turned to the side wall in preparation, contact with the arm extended and the
  racket level with the ball over a deep lunge on the opposite leg, free arm for
  balance, racket prepared early while approaching the ball.
- New squash racket model to real proportions: teardrop head, open throat,
  long wrapped grip, bumper strip, shaped string bed.
- Added `dev/poses.html`, a pose viewer for comparing the model with photographs.

### Fixed
- WASD and the other keys did nothing on non-Latin keyboard layouts (e.g.
  Hebrew); keys are now matched by physical key code.

## [0.1.0] - 2026-10-24

First playable version.

### Added
- Pure match core: ball physics (gravity, quadratic drag, inelastic
  collisions), ballistic shot aiming, World Squash singles rules (tin, out
  lines, service rules, one bounce, PAR 11, best of 1/3/5).
- Stamina model with recovery on the T, return-to-T assist and pace setting.
- Computer opponent with physics-based prediction, three difficulty levels and
  situational shot selection.
- Real 3D renderer (Three.js): textured court, raised line markings, glass
  back wall, shadows, procedural articulated players, ball trail and effects.
- Classic 2-D canvas renderer as a WebGL fallback.
- Mouse, keyboard and touch controls; on-screen lob/drop buttons.
- Procedural Web Audio sound effects.
- English and Hebrew UI with RTL layout; settings persisted in localStorage.
- Headless tools (`tools/simulate.js`, `tools/play-match.js`) and a test suite
  (ball, shots, referee, full matches).
- Documentation set in `docs/`.
