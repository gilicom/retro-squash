# Rendering

Two renderers share one interface so the game can swap them:

```js
resize()                 // fit to the canvas CSS size and device pixel ratio
draw({ ball, players, effects, dt, inPlay })
floorPoint(sx, sy)       // court {x, z} under a screen point, or null
dispose?()
```

`Game._createRenderer` tries the 3D renderer first and falls back to the
classic one if `WebGLRenderer` throws (no WebGL, blocked context). The menu's
*Graphics* setting switches live; each renderer has its own canvas inside
`#stage` and the unused one is hidden.

## 3D renderer (`src/render3d/`)

Built on Three.js (r170). Output is sRGB with ACES filmic tone mapping,
PCF soft shadow maps and MSAA.

### Scene (`court3d.js`)

| Element | Implementation |
| --- | --- |
| Floor | Plane with a procedurally drawn maple plank texture (`textures.woodTexture`): 56 planks, staggered joints, grain streaks; `MeshStandardMaterial`, roughness 0.42, anisotropic filtering. |
| Walls | Planes with a plaster noise texture multiplied over off-white; side walls slightly darker. |
| Markings | Every line is a thin **raised bar** (`bar(a, b, normal)`): a 5 cm × 4 mm box oriented by a basis matrix, lifted 1 mm off its surface. No z-fighting, correct perspective, casts nothing. Includes the diagonal side-wall out lines. |
| Tin | Dark box with the red top line. |
| Glass back wall | Transparent `MeshPhysicalMaterial` plane, corner posts, top beam, sill and two slim glass fins at the panel joints (deliberately **not** at the centre, which would hide the ball). |
| Ceiling | Dark plane with three emissive light panels. |
| Surround | A large back-face box in near-black so the court reads as an arena interior. |
| Lights | Hemisphere (0.75) + one shadow-casting directional key light from above-behind the camera (2048² map, bias −0.0004, normal bias 0.02, radius 3) + two warm point fills under the ceiling. |

### Players (`player3d.js`)

A procedural rig of `CapsuleGeometry` limbs on `Group` pivots: hips → torso
(jersey, shorts, head, hair cap, headband) with two shoulder → elbow → hand
chains and two hip → knee chains with shoes.

**Racket** (`racket3d.js`): built to real proportions (68.5 cm): a 21 cm grip
with a wrapped-tape texture and coloured butt cap, slim graphite shaft, open
throat with two struts and a bridge, a teardrop head swept as a tube along a
Catmull-Rom outline (27 × 20 cm), a bumper strip in the player's colour, and
a string bed cut to the head shape with a 14 × 18 string texture. The hand
holds the top of the grip at the group origin; the head is along −y and the
string normal is +z.

**Arm posing** is direction based rather than Euler based: a stroke keyframe
gives, in the torso's yaw frame, where the elbow is relative to the shoulder
(E), where the wrist is relative to the elbow (W), where the racket points
(R) and which way the strings face (N), plus the free arm (LE, LW), body yaw
and forward lean, hip drop, stance width and knee bend. `_poseArm` converts
the vectors to joint quaternions (`setFromUnitVectors` for the segments, a
basis matrix for the racket) and compensates the torso's forward lean so a
level racket stays level when the body bends over the ball. Keyframes can be
read straight off a photograph.

**Stroke keyframes** were taken from reference photographs of a coach's
forehand preparation, forehand contact and backhand preparation (kept out of
the repository):

| Phase (t) | Forehand pose |
| --- | --- |
| 0 backswing | Shoulders turned ~55° to the right wall, elbow at shoulder height out to the side and back, forearm vertical, racket head up and slightly back, face open; free arm straight out to the left; feet wide, knees bent, weight on the back foot. |
| 0.22 contact | Deep lunge on the **left** leg forward and across toward the ball, right leg trailing straight with the heel up, hips ~60 cm; torso over the front knee (~45°), arm extended to the ball out in front of the front foot, racket level with the ball (lower balls pull the arm and the body further down), strings facing the front wall; free arm thrown back and up; eyes on the ball. |
| 0.6 follow-through | Racket continues to the target and up across the body, shoulders rotate back past square, weight transfers forward. |
| 1 ready | Racket up in front, knees soft. |

The backhand set mirrors it with the racket prepared above the head behind
the left shoulder. The swing lasts 0.5 s; the ball is launched at t = 0 by
the simulation, so contact at t = 0.22 is 0.1 s later.

**Preparation**: while approaching the ball the ready pose blends toward the
backswing of the side the ball is on (`prep`), so the racket is up before the
lunge, as coaches teach.

A development page, `dev/poses.html`, renders the model large at any phase and
camera angle for side-by-side comparison with photographs (see
DEVELOPMENT.md).

`PlayerModel.update(player, ball, dt)` poses the rig from simulation state
only (position, velocity, target, swing, run phase). The poses are modelled on
squash movement as taught by coaches (split step, lunge, recovery to the T;
see Control the T, *A blueprint for moving like the pros*, and Squash
Magazine's movement series, both linked in the README):

| Situation | Pose |
| --- | --- |
| **Ready stance** (slow or still, ball in play) | Low: knees bent, feet wider than the hips, heels off the floor (weight on the toes), forward lean, racket up in front, a slow breathing sway. |
| **Split step** (the instant the opponent's racket meets the ball) | One very small, very fast hop (4.5 cm, 0.26 s), landing with the feet a little wider and the knees taking the landing, so the first step can push off. Triggered from the opponent's swing state, never on a timer. |
| **Side shuffle** (movement mostly along x) | Body stays square to the front wall; the lead leg steps out and the trailing leg closes; torso leans into the direction. No running stride. |
| **Running forward** (toward the front wall) | Short quick strides, strong knee fold behind, forward lean, left arm pumping; the racket is prepared early (raised further as speed grows). Vertical bob is kept small: good movement is quiet. |
| **Backpedalling** (toward the back wall) | Shorter strides under the body, body opened toward the corner it is moving to. |
| **Lunge** (last 0.9 m before the target while moving fast, or reaching for a ball during the stroke) | Hips drop ~22 cm, the leg on the lunge side extends toward the ball with a deep knee bend, the other leg trails straight, torso over the front knee, free arm out for balance. |
| **Stroke** | Shoulders and hips turn toward the side wall on the ball side; high backswing → contact out in front at 30 % → follow-through across the body at 75 % → back to ready. Lift adapts to ball height (low balls are scooped). Forehand and backhand are mirrored sets. |

Every parameter (run, lateral, forward, backward, lunge, facing) is smoothed
with an exponential approach so poses blend instead of snapping. The head
counter-rotates to stay level and turns toward the ball.

Joint sign conventions are documented at the top of `player3d.js`; knees
only ever bend backwards.

### Ball and effects (`renderer3d.js`)

- Ball: 5 cm white sphere (the televised glass-court ball; black is unreadable
  at this size), clearcoat material, casts a shadow, plus a soft **contact
  blob** on the floor whose size and opacity follow the height, plus six
  fading **ghost spheres** sampled from the trail.
- T marker: a ring sprite on the floor that fades in during play and pulses
  when the human is away from the T.
- Effects: `kind: 'ring'` (camera-facing expanding ring at racket contact) and
  `kind: 'mark'` (small dark disc on the wall at the impact point, oriented to
  that wall). The renderer creates/disposes meshes lazily per effect record.

### Camera

A broadcast-style perspective from behind the glass. `resize()` places the
eye (landscape: 3.6 m high, 3.3 m behind the glass; portrait: 4.3 m / 2.0 m),
looks at a point near the front wall, then **fits the field of view**: it
measures the angular extent of the eight court corners in camera space, pitches
the camera to centre them, and sets `fov` from the larger of the vertical span
and the horizontal span converted through the aspect ratio. A small extra tilt
leaves room for the HUD. During play the camera drifts up to 32 cm sideways
toward the ball for parallax.

`floorPoint` ray-casts the pointer through the camera against the plane y = 0.

## Classic renderer (`src/render/`)

A 2-D canvas renderer with a pinhole camera (`core/camera.js`) that projects
3D points to the screen; straight lines stay straight under perspective, so the
court is projected polygons and segments with gradients. Players are drawn as
stylised figures from a few projected key points; the near player is 82 %
opaque so it never hides the ball. It exists for devices without WebGL and as
a readable reference implementation of the projection maths.

## Performance notes

- One directional shadow map, ~40 draw calls, no post-processing: runs at 60 fps
  on mid-range phones. Pixel ratio is capped at 2.
- Textures are generated once on a canvas (no network requests).
- `document.hidden` pauses the game, so background tabs do not burn battery.
