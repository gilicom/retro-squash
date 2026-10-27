import bpy, bmesh, math
import numpy as np
from mathutils import Vector, Matrix, noise
body = bpy.data.objects['PlayerBody']; rig = bpy.data.objects['PlayerRig']
kit = bpy.data.collections['PlayerKit']
EYE_Z = 1.725
def smooth1(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t)
def apply_mod(ob, name):
    with bpy.context.temp_override(object=ob, active_object=ob, selected_objects=[ob]):
        bpy.ops.object.modifier_apply(modifier=name)
old = bpy.data.objects.get('Hair')
if old: bpy.data.objects.remove(old, do_unlink=True)
band = bpy.data.objects['Headband']; band_top = max((band.matrix_world @ v.co).z for v in band.data.vertices)
cz = EYE_Z + 0.04; cyh = -0.055
TH = np.array([0.0, 0.55, 0.95, 1.2, 1.35, 1.5, 1.8, 2.1, 2.5, math.pi])
ZL = np.array([band_top - 0.012, band_top - 0.014, EYE_Z + 0.03, EYE_Z + 0.015, EYE_Z + 0.0, EYE_Z + 0.005, EYE_Z - 0.03, EYE_Z - 0.055, EYE_Z - 0.07, EYE_Z - 0.075])
def zline(co):
    th = abs(math.atan2(co.x, -(co.y - cyh)))
    return float(np.interp(th, TH, ZL)) + 0.004 * noise.noise(Vector((co.x, co.y, 0)) * 50)
bm = bmesh.new()
bmesh.ops.create_uvsphere(bm, u_segments=64, v_segments=36, radius=0.13, matrix=Matrix.Translation((0, cyh, cz)))
kill = [v for v in bm.verts if v.co.z < zline(v.co)]
bmesh.ops.delete(bm, geom=kill, context='VERTS')
# snap the ragged boundary onto the hairline curve so the edge is smooth
for v in bm.verts:
    if any(e.is_boundary for e in v.link_edges): v.co.z = zline(v.co)
m = bpy.data.meshes.new('Hair'); bm.to_mesh(m); bm.free(); m.materials.append(bpy.data.materials['Hair'])
hair = bpy.data.objects.new('Hair', m); kit.objects.link(hair)
sw = hair.modifiers.new('Shrinkwrap', 'SHRINKWRAP'); sw.target = body; sw.wrap_method = 'NEAREST_SURFACEPOINT'; sw.offset = 0.003
apply_mod(hair, 'Shrinkwrap')
hm = hair.data
bm = bmesh.new(); bm.from_mesh(hm); bm.verts.ensure_lookup_table(); bm.normal_update()
boundary = [v.co.copy() for v in bm.verts if any(e.is_boundary for e in v.link_edges)]
bverts = np.array([c[:] for c in boundary]) if boundary else np.zeros((1, 3))
for v in bm.verts:
    dist = float(np.min(np.linalg.norm(bverts - np.array(v.co[:]), axis=1)))
    fade = smooth1(0.0, 0.035, dist)
    n1 = noise.noise(v.co * 28); n2 = noise.noise(v.co * 70 + Vector((3, 1, 2)))
    v.co += v.normal * (0.004 + fade * (0.012 * (n1 + 0.4) + 0.004 * n2))
bm.to_mesh(hm); bm.free()
for p in hm.polygons: p.use_smooth = True
sm = hair.modifiers.new('Solidify', 'SOLIDIFY'); sm.thickness = 0.012; sm.offset = 1.0; sm.use_rim = True
hair.parent = rig; hair.matrix_parent_inverse = rig.matrix_world.inverted()
vg = hair.vertex_groups.new(name='mixamorig:Head'); vg.add(list(range(len(hm.vertices))), 1.0, 'REPLACE')
mod = hair.modifiers.new('Armature', 'ARMATURE'); mod.object = rig
scene = bpy.context.scene; scene.render.engine = 'BLENDER_EEVEE'
bpy.data.objects['Racket'].hide_render = True
cam = bpy.data.objects['PreviewCam']
cam.location = (0.6, -1.05, 1.8); cam.rotation_euler = (math.radians(86), 0, math.radians(29)); cam.data.lens = 85
scene.render.resolution_x = 700; scene.render.resolution_y = 1000
scene.render.filepath = r'C:\claude\squash-game\docs\design\player-head-wip.png'; bpy.ops.render.render(write_still=True)
cam.location = (-0.95, 0.55, 1.75); cam.rotation_euler = (math.radians(88), 0, math.radians(-120)); cam.data.lens = 85
scene.render.filepath = r'C:\claude\squash-game\docs\design\player-head-back-wip.png'; bpy.ops.render.render(write_still=True)
bpy.data.objects['Racket'].hide_render = False
result = {'hair_verts': len(hm.vertices)}
