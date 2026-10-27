import bpy, os
rig = bpy.data.objects['PlayerRig']; body = bpy.data.objects['PlayerBody']
kit = bpy.data.collections['PlayerKit']
info = {}
# 1. keep the posed scene on disk (fingers still as pose bones), then bake the grip into the rest pose
bpy.ops.wm.save_mainfile()
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
                          export_vertex_color='MATERIAL', export_image_format='AUTO', export_animations=False,
                          export_lights=False, export_cameras=False, export_skins=True, export_yup=True,
                          export_texcoords=True, export_normals=True, export_materials='EXPORT')
info['size_kb'] = round(os.path.getsize(out) / 1024)
info['objects'] = [ob.name for ob in [body] + list(kit.objects)]
# 3. save the export-state scene under another name so the posed scene stays as it was
bpy.ops.wm.save_as_mainfile(filepath=r'C:\claude\squash-game\tools\blender\squash-assets-export.blend', copy=True)
result = info
