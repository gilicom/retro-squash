# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- `npm run deploy` publishes the build to GitHub Pages; live at https://gilicom.github.io/retro-squash/.

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
