# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- `npm run deploy` publishes the build to GitHub Pages; live at https://gilicom.github.io/retro-squash/.

### Added (later)
- Demo mode: "Watch a demo" plays computer vs computer with auto-serve and
  auto-continue; a DEMO badge shows in the HUD.

### Changed
- After a rally ends (tin, out, double bounce) the ball keeps bouncing under
  the same physics until it dies, instead of freezing at the decision.
- Strokes follow the court side: a ball on the left half is played as a
  backhand and on the right half as a forehand; the computer stands an arm's
  length beside the ball on that side, reach is longer there, and the backhand
  racket arm crosses to the left already while running to the ball.
- The ball is the black club ball (both renderers).
- Player models: muscled limbs, elliptical torso, face with jaw, nose, eyes
  and brows, thumbs, striped shorts and socks, shoes with toe caps; rackets
  with an aero frame section, clear coat, shaft bands, dampener and grip collar.
- Real footsteps: feet are planted on the floor and only move by stepping
  (swing arcs sized by speed), legs solved by two-bone IK; stances and lunges
  are real steps too. Feet no longer slide.
- The body follows the ball: hips turn toward the stroke's side wall while
  moving to the ball and half-turn to the ball between shots.
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
- New player rig (`body3d.js`): shaped torso with a textured jersey (chest
  band, number), shoulder caps, neck, head with eyes, ears and hair, tapered
  limbs with joint spheres, wrist bands, socks and shoes; players differ in
  number, skin and hair.
- Strokes are played side-on: hips turn 90° to the side wall (right for a
  forehand, left for a backhand) in preparation and stay side-on through
  contact while the shoulders open; volleys are played standing taller with the
  arm extended at shoulder height; the ready stance has the free hand on the
  racket throat.
- Forehand retimed to three reference frames: frame-1 preparation held while
  running to the ball (backhand mirrored on the other side), both knees bent
  deep at contact, high follow-through on the opposite side.

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
