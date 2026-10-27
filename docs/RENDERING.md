# Rendering

The game renders with one WebGL renderer built on Three.js
(`src/render3d/`). Its interface to the game is:

```js
resize()                 // fit to the canvas CSS size and device pixel ratio
draw({ ball, players, effects, dt, inPlay, turn })
floorPoint(sx, sy)       // court {x, z} under a screen point, or null
dispose?()
```

If WebGL is unavailable the game shows an explanatory panel instead of
starting (the earlier 2-D canvas renderer was removed).

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

A procedural humanoid built in `body3d.js`: an elliptical lathe torso
(waist, ribcage, chest, trapezius) wearing a jersey texture with a fabric
weave, chest band, side panels and a number on the back, deltoid caps, neck,
a head with skull, jaw, nose, eyes with pupils, brows, ears, hair and a
headband, striped shorts, muscled lathe limbs (biceps, forearm, quadriceps,
calf) with joint spheres, hands with a thumb, wrist bands, striped socks and
shoes with a toe cap, lace stripe and sole; the skin has a subtle noise
texture. Pivots: hips → torso → head, two shoulder → elbow → hand chains and
two hip → knee → foot chains. The two players get different jersey numbers,
skin and hair.

**Racket**: the game loads `public/models/racket.glb`, modelled in Blender
(`racket-model.js`; 14k triangles, materials `RacketFrame`, `RacketGrip`,
`RacketAccent`, `RacketStrings`; accent and strings are recoloured per
player). It was built by script through the Blender MCP connection: a
teardrop head swept as an aero-section tube with the throat toward the
shaft, open throat with two struts and a bridge, dampener, octagonal grip
with collar and butt cap, shaft bands, bumper at the tip, and real string
tubes (14 × 18). Preview: `docs/design/racket-render.png`. If the file is
missing, the procedural racket below is used.

**Procedural racket** (`racket3d.js`, fallback): built to real proportions (68.5 cm): a 21 cm grip
with a wrapped-tape texture, collar and coloured butt cap, slim clear-coated
graphite shaft with accent bands, open throat with two struts, a bridge and a
dampener, a teardrop head swept as an aero (wider than deep) tube along a
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

**Stroke keyframes** were taken from three reference frames of a forehand
filmed from behind (kept out of the repository):

| Phase (t) | Forehand pose |
| --- | --- |
| 0 preparation (frame 1) | Hips and feet turned **90° to the right side wall**, shoulders a little further; left foot forward toward the front wall and right foot back with the heel up, knees bent; elbow at shoulder height out to the side, forearm vertical, racket head straight up above the shoulder; free hand pointing forward-down at the ball; eyes on the ball. |
| 0.24 contact (frame 2) | Hips still side-on, shoulders opening to the front wall; **both** knees bent deep, hips ~55 cm, body bent ~45° over the front (left) foot; arm extended to the ball at ankle height, racket level with the ball, strings facing the front wall; free arm trailing behind. Lower balls pull the arm and the body further down; head-high balls (volleys) are played standing taller with the extended arm at shoulder height. |
| 0.62 follow-through (frame 3) | Body rotates to face the front wall, racket comes up high on the left side with the elbow bent, weight on the front foot, back leg trailing; free arm tucked back. |
| 1 ready | Square to the front wall, racket up in front with the free hand near the throat, knees bent, feet wide. |

The backhand mirrors the set and turns the body 90° to the **left** wall; its
preparation comes from backhand volley frames: elbow bent across the chest at
shoulder height, racket head up and back behind the head, free arm bent in
front. The swing lasts 0.5 s; the ball is launched at t = 0 by the
simulation, so contact at t = 0.24 is 0.12 s later.

**Preparation while running**: as soon as it is a player's ball (the game
passes `referee.turn` to the renderer), the racket arm takes the frame-1
preparation on the side the ball is on, even at full run; the body turn,
stagger and knee bend of that pose fade with running speed so the legs keep
running until the lunge. The opponent, running back to the T, does not prepare.

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

**Footsteps**: feet never slide. Each foot has a planted world position.
Its rest position is computed under the hip (spread by the stance, staggered
and pushed by the stroke pose or lunge, led ahead by 0.12 s of velocity).
When the planted foot is farther from its rest than a stride threshold
(0.14 m + 0.08 m per m/s, up to 4 m/s) and the other foot is planted, it
lifts and swings in an arc (duration 0.14-0.30 s, shorter when faster;
height 4-16 cm) to the rest position and plants there. The legs are then
solved with two-bone IK from the hip height to the ankle (knee bending
forward), the foot kept flat with toes down during the swing and the back
heel raised in a stroke stance. The hips drop when the feet are far apart so
the legs can reach, which is what makes a lunge low. A teleport (new rally)
resets the feet under the body.

**Body orientation**: the body follows the ball. When it is the player's
ball the hips turn 90° to the stroke's side wall as soon as they start
moving to it (the turn is reduced by only 30 % at full run); between shots
the body half-turns toward the ball and the head completes the turn.

Every other parameter (run, lateral, forward, backward, lunge, facing) is
smoothed with an exponential approach so poses blend instead of snapping.

Joint sign conventions are documented at the top of `player3d.js`; knees
only ever bend backwards.

### Rigged character (`skinned-player.js`)

When the character file (`CHARACTER_URL`, by default
`public/models/Xbot.glb`) loads, the procedural bodies are replaced by a
rigged glTF character on the standard **Mixamo** skeleton (bones named
`mixamorig<Name>`, T-pose). The rest facing (left hip → right hip × up)
and every bone's rest orientation are read from the file, so both +z and
-z facing exports and non-identity bone rotations work. The
procedural `PlayerModel` keeps running as an invisible **solver**, built
with the character's own bone lengths (thigh, shin, ankle height, hip
width, hip height read from the rest pose) so the footstep IK plants the
feet where the mesh's feet are.

After each solver update every body segment yields a world direction and a
bend axis (knee/elbow axis = cross of the two segments, with a fallback
when straight), and the matching bone is rotated so that its rest direction
and rest bend axis land on them: `world = frame(solved) · frame(rest)⁻¹ ·
restWorld`, applied top-down so each local rotation is relative to the
parent's actual rotation. Hips take the solver's position and facing; Spine
takes the torso, Head the head, feet keep flat and follow the solver's foot
frame. Untouched bones (clavicles, neck, upper spine, toes, fingers) keep
their rest pose; the racket-hand fingers are curled once around the grip.
The racket hangs from the right hand bone with the correction that makes
its world orientation equal the solver's hand (handle along the forearm,
strings facing the solver's palm normal).

**The player** (`public/models/player.glb`, 2 MB) was built in Blender
through the MCP connection from `docs/design/character-brief.md`:

- Body: MPFB (MakeHuman for Blender) base mesh, macros gender 1.0, age 0.45,
  muscle 0.8, weight 0.5, height 0.62, proportions 0.7; shape keys baked into
  the mesh (so the GLB carries no morph targets); MPFB's `mixamo` rig with
  weights (`mixamorig:*` bones, A-pose); the procedural v2 skin baked to a
  2048 px diffuse texture with Cycles and exported through a plain
  Principled material (JPEG in the GLB).
- Kit: shirt, shorts, socks and shoes are extracted from the body's own
  faces by height/width rules, offset along the vertex normals and given a
  Solidify thickness, so they fit exactly and share the body's weights;
  colours are **vertex colours** (black kit, lime piping on the shoulders,
  side seams, a chest patch, a shorts stripe, a sock ring, a shoe stripe).
  Hair is a solidified cap of scalp faces; eyes are MakeHuman's eye helper
  spheres with small iris spheres; headband and wristbands are tori weighted
  to the head and hand bones.
- Team colour: the renderer recolours the lime vertices (hue test) to the
  team colour per player and sets the hair colour, leaving skin and eyes
  alone. The Xbot mannequin is the fallback and is tinted as a whole.

The Blender scene is kept in `tools/blender/squash-assets.blend`
(git-ignored, large) for further work. Any other Mixamo-rig character can
replace the player: drop a GLB into `public/models/` and point
`CHARACTER_URL` at it. (Ready Player Me's avatar CDN no longer resolves.)

### Ball and effects (`renderer3d.js`)

- Ball: 5 cm black club ball with a soft rubber clearcoat, casts a shadow,
  plus a soft **contact blob** on the floor whose size and opacity follow the
  height, plus six fading dark **ghost spheres** sampled from the trail.
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

## Performance notes

- One directional shadow map, ~40 draw calls, no post-processing: runs at 60 fps
  on mid-range phones. Pixel ratio is capped at 2.
- Textures are generated once on a canvas (no network requests).
- `document.hidden` pauses the game, so background tabs do not burn battery.
