# Character brief: the squash player

Target look, from the reference sheet supplied by the project owner (a
realistic male squash player on a glass court). This is the specification
the player characters and rackets are built to; the procedural concept
sheet (`player-concept.svg`) is superseded by it where they differ.

## Body and face

- Male, athletic, lean and muscular (visible shoulder, arm and calf
  definition), about 1.80 m.
- Dark brown short hair, slightly tousled; short stubble; defined jaw.
- Expressions available for close-ups: focused (default), competitive,
  intense (shouting), confident, smile.

## Kit (player A)

| Item | Spec |
| --- | --- |
| Shirt | Fitted short-sleeve athletic tee, black, with lime-yellow seam piping on the shoulders/sides and a small lime logo on the chest. Slightly heathered/worn texture. |
| Shorts | Black, above the knee, lime side stripe and small logo. |
| Headband | Black with a lime logo, worn low on the forehead. |
| Wristbands | Black, both wrists. |
| Socks | White crew socks. |
| Shoes | Black court shoes with lime accents and a lime/white sole. |

**Player B** uses the same body and kit with the accent colour swapped (orange
or cyan) and a different face/hair, so the two are told apart at a glance.

## Equipment

- Racket: black graphite frame with lime decals, lime strings (14 × 18),
  black grip, dampener. Proportions as in the game (685 mm, 270 × 200 mm head).
- Ball: black (double yellow dot).

## Palette

| Role | Colour |
| --- | --- |
| Kit base | #15161a (near black) |
| Accent A (lime) | #c6ff2e |
| Accent B (alternative) | #ff8a3d orange or #3fd0ff cyan |
| Skin | #d9a27a, with warmer tones on the face |
| Hair | #3b2a1e |
| Socks | #f4f4f2 |

## Poses the rig must hold (from the reference action shots)

1. Low forehand lunge: front knee deep, back leg stretched, torso over the
   front foot, racket level with a ball near the floor.
2. Running to the ball with the racket already prepared high.
3. Backhand preparation facing the side wall, racket over the opposite
   shoulder.

These match the game's stroke keyframes (docs/RENDERING.md).

## Technical targets

- Mixamo-compatible skeleton (`mixamorig*`), T-pose export, glTF/GLB.
- 15-25k triangles for the body, 2-4k for the kit, 2k for the racket.
- Textures 2048 px (body), 1024 px (kit, racket). PBR: base colour,
  normal, roughness.
- Build path: Blender with MPFB (MakeHuman) for the base body and face,
  kit modelled and textured in Blender, exported as one GLB per player plus
  one racket GLB. The game's procedural solver drives the rig; no animation
  clips are needed.
