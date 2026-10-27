# Blender build scripts

The player character and the racket are built in Blender 5.2 with the
[MPFB](https://static.makehumancommunity.org/mpfb.html) add-on (MakeHuman
bodies). The working scene `squash-assets.blend` is not versioned (it is
large and contains the MakeHuman base mesh); these scripts rebuild the kit
on top of it and export `public/models/player.glb`. They were run through
the Blender MCP connection (`exec(open(path).read())`) but work the same
from Blender's text editor.

Scene objects the scripts expect: `PlayerBody` (MPFB basemesh, shape keys
baked, vertex group `body` for the real skin, material `PlayerSkinExport`),
`PlayerRig` (MPFB Mixamo rig, A-pose, bones `mixamorig:*`), collection
`PlayerKit` (eyes, headband, wristbands, socks), `Racket`, `PreviewCam`
and two preview lights.

| Step | Script | Result |
| --- | --- | --- |
| 1 | `build_kit.py` | Shirt and shorts cut from the body faces with the body UVs, hems and neckline cut by planes, textures painted by a numpy rasteriser into `textures/` (git-ignored, embedded in the GLB), collar rib, hair cap. |
| 2 | `build_hair.py` | Hair cap alone (azimuth hairline, boundary snapped to the hairline curve, shrink-wrap, noise clumps). |
| 3 | `build_shoes.py` | Lofted court shoes (`ShoeLeft/Right`) with a painted texture and separate soles with vertex colours. |
| 4 | `pose_grip.py` | Poses the fingers around the racket handle and places `Racket` in the hand; prints `GRIP_BUTT` for `src/render3d/skinned-player.js`. Renders `docs/design/grip-*.png`. |
| 5 | `export_player.py` | Saves the scene, bakes the grip into the rest pose (Armature modifiers applied and re-added, `pose.armature_apply`), exports the GLB with `export_apply` and vertex colours, saves a copy as `squash-assets-export.blend`. Re-export with JPEG textures (`export_image_format='JPEG'`) to keep the file near 3 MB. |

Landmarks used by the scripts (metres, armature space): eyes z 1.725 / y
−0.135, hips 1.041, neck base 1.583, ground 0. The character faces −Y; +X is
the character's left.
