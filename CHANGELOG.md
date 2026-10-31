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

### Added (characters)
- Rigged glTF characters on the Mixamo skeleton, driven by the procedural
  solver through direction retargeting (`skinned-player.js`); the bundled
  three.js Xbot mannequin is the default; any Mixamo athlete on the same rig
  can replace it. Rest facing and bone
  orientations are read from the file. Procedural bodies remain the fallback. Pose viewer
  `model=1` shows the rigged character.

### Changed (stamina and tactics, 2026-10-31)
- Fewer misses on easy balls: the computer's positional error shrinks as the
  ball gets close and for slow balls, grows less with distance and fatigue.
- Concentration slips as a rally drags on (strike error +0.012 per hit, up
  to 0.3), a brake on endless rallies; stamina never drops below 0.05. The
  balance harness bot now picks shots like the computer and jogs back through
  the T assist.
- Stamina drains almost twice as fast (about 35 m of sprinting empties it)
  and refills much slower (0.018/s idle, 0.04/s on the T, 0.07/s between
  points: a full bar takes about a minute of rest); serves scatter less with
  fatigue than other shots.
- The computer picks shots by the opponent's position: drops and attacking
  boasts when the opponent is deep behind the T, lobs and hard drives when
  they are forward, tight straight drives otherwise; it attacks a tired
  opponent more and plays safe when tired itself (docs/AI.md).

### Changed (movement, 2026-10-31)
- Economical footwork: strides of 0.5-1.5 m (2-4 steps from the T to any
  corner) with a shorter stance and longer flight at speed; fewer small
  adjustment steps.
- Players stand further from the ball for the stroke: the computer sets up
  0.95 m beside the ball (was 0.45 m, the racket covers the rest) and the
  contact pressure model treats 0.95 m as the clean distance, with a cramped
  penalty when the ball comes within 0.45 m of the body; the natural-side
  racket reach grew to 1.4x the reach radius to match.
- Recovery to the T is a resting jog (1.7 m/s, urgent recoveries capped at
  75% of top speed) while the run to the ball stays at full speed; stamina
  recovers while jogging (effort below 45% of top speed no longer drains).
- Jog stride reworked: each foot on the floor for 42% of the cycle with a
  short flight phase, touchdown ahead of the hips and toe-off behind them,
  heel lift of 9-16 cm with the knee driving forward, hips lowest at
  mid-stance. Pose viewer: `frames` parameter samples the gait in time.
- Light jog: above a shuffle the feet follow a jog cycle (short quick strides
  along the direction of travel, half a cycle planted and half swinging with a
  knee lift and toes down, hips dipping at mid-stance), blended in by speed;
  stationary adjustments, lunges and stroke stances stay with the step system.
- Narrower lunge stance so the legs no longer split unnaturally wide.

### Changed (pose review, 2026-10-27)
- The swing starts SWING_LEAD (0.12 s) before the ball comes within reach,
  predicted along the ball's velocity, and a swing already under way is kept
  through the hit, so the racket meets the ball at the contact keyframe
  instead of at the start of the motion.
- Keyframe string normals are put on the palm's natural side once at
  definition time (no run-time flip), which removes the hand spin in the
  forehand backswing.
- A lifted heel raises the ankle by the toe lever, so feet no longer sink
  into the floor in stroke stances and steps.
- The head looks at the ball (yaw and pitch) before and through the stroke;
  on the T it keeps watching the opponent.
- Backhand preparation: hips turned 135° toward the wall, racket hand beside
  the left shoulder clear of the head, elbow pointing at the front wall.
- The racket hand's palm always stays on its natural side (-(forearm x
  racket)); the free hand's palm faces down and toward the body, so hands no
  longer flip between keyframes.
- Wristbands removed from the character. Keyframe renders in
  `docs/design/keyframes` for pose review.

### Changed (character v2)
- Real squash grip: the fingers are posed in Blender around the handle, which
  runs diagonally across the palm (18° above the knuckle line) with the thumb
  along the top bevel and the butt outside the heel of the hand; the grip is
  baked into the exported rest pose and `skinned-player.js` maps the solver's
  racket direction and string normal onto the palm with the same geometry.
- The racket is held cocked in the hand: the stroke keyframes keep it 55-70°
  off the forearm instead of pointing along the arm.
- Kit redone with baked textures instead of blocky vertex colours: shirt
  (2048 px) with shoulder piping, raglan lines, side seams and a chest logo,
  shorts (1024 px) with a side stripe; clean sleeve, hem and neckline cuts and
  a thin collar rib. The team colour is applied by recolouring the lime of the
  texture at load time.
- Shoes modelled as lofted court shoes (upper with heel tab, swoosh, tongue and
  laces painted in a texture; white midsole with a lime outsole) instead of
  extruded foot skin.
- Hair cap rebuilt: smooth hairline around the ears and nape, tousled clumps.
- Team colours are now lime (you) and orange (cpu) as in the character brief.

### Added (assets)
- Player character built in Blender through the MCP connection: MPFB athletic
  body with a Mixamo rig and a baked skin texture, kit extracted from the body
  (shirt, shorts, socks, shoes with vertex-colour accents), hair cap, eyes,
  headband and wristbands; team colour swaps the accent per player.
- Racket remodelled to the measured proportions of a real squash racket
  (Tecnifibre Carboflex reference): 685 mm, 178 mm grip, 130 mm shaft, head
  375 mm tip to throat with its 210 mm maximum width 150 mm below the tip,
  arms sinking into a slim throat, 13 x 17 mm beam, strings down to the throat.
- Players watch the opponent while waiting on the T and the ball when it is
  their shot; the backhand preparation holds the arm further from the body.
- Racket modelled in Blender (`public/models/racket.glb`), loaded and tinted
  per player; the procedural racket remains the fallback.

### Added (shots)
- Boast (side wall first) and back-wall boast. Both players are forced into
  them when the ball is deep behind the body; the computer also boasts
  deliberately out of a back corner when the opponent is deep.

### Removed
- The 2-D canvas renderer and the Graphics setting; the game is WebGL only
  and shows a message when WebGL is unavailable.

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
