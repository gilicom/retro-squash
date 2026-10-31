"""Export the player character to public/models/player.glb (run in background Blender or from the
scene). The posed scene stays as it is on disk; the grip is baked into the rest pose on a copy
of the state that is saved as squash-assets-export.blend.

    blender -b tools/blender/squash-assets.blend --python tools/blender/export_player.py

Wristband objects are dropped (removed from the character on 2026-10-27); textures go out as JPEG
to keep the file near 3 MB.
"""
import bpy, os, json

rig = bpy.data.objects['PlayerRig']; body = bpy.data.objects['PlayerBody']
kit = bpy.data.collections['PlayerKit']
info = {}
# 0. pieces that are no longer part of the character
for ob in [o for o in kit.objects if 'Wristband' in o.name]:
    bpy.data.objects.remove(ob, do_unlink=True)
# 1. bake the grip into the rest pose (modifiers applied and re-added, pose applied as rest)
for ob in [body] + list(kit.objects):
    mod = ob.modifiers.get('Armature')
    if not mod: continue
    with bpy.context.temp_override(object=ob, active_object=ob, selected_objects=[ob]):
        bpy.ops.object.modifier_apply(modifier='Armature')
    m = ob.modifiers.new('Armature', 'ARMATURE'); m.object = rig
bpy.ops.object.select_all(action='DESELECT')
rig.select_set(True); bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='POSE')
bpy.ops.pose.select_all(action='SELECT')
bpy.ops.pose.armature_apply(selected=False)
bpy.ops.object.mode_set(mode='OBJECT')
# 2. export the character (body, rig, kit) as one GLB
bpy.ops.object.select_all(action='DESELECT')
for ob in [rig, body] + list(kit.objects):
    ob.hide_set(False); ob.hide_viewport = False; ob.select_set(True)
bpy.context.view_layer.objects.active = rig
out = r'C:\claude\squash-game\public\models\player.glb'
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_apply=True,
                          export_vertex_color='MATERIAL', export_image_format='JPEG', export_animations=False,
                          export_lights=False, export_cameras=False, export_skins=True, export_yup=True,
                          export_texcoords=True, export_normals=True, export_materials='EXPORT')
info['size_kb'] = round(os.path.getsize(out) / 1024)
info['objects'] = [ob.name for ob in [body] + list(kit.objects)]
# 3. keep the export-state scene under another name; the posed scene on disk is untouched
bpy.ops.wm.save_as_mainfile(filepath=r'C:\claude\squash-game\tools\blender\squash-assets-export.blend', copy=True)
print('RESULT ' + json.dumps(info))
