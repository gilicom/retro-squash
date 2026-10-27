import bpy, bmesh, math
import numpy as np
from mathutils import Vector, Matrix, noise
body = bpy.data.objects['PlayerBody']; rig = bpy.data.objects['PlayerRig']; me = body.data
kit = bpy.data.collections['PlayerKit']
gi = {g.name: g.index for g in body.vertex_groups}; BODY = gi['body']
def has(v, idx): return any(g.group == idx for g in v.groups)
vn = [Vector(n.vector) for n in me.vertex_normals]
EYE_Z, EYE_Y, HIPS, FOOT, NECK = 1.725, -0.135, 1.041, 0.076, 1.583
TEXDIR = r'C:\claude\squash-game\tools\blender\textures'
LIME = np.array([0.45, 1.0, 0.0]); BLACK = np.array([0.018, 0.018, 0.02])
info = {}
def remove(name):
    o = bpy.data.objects.get(name)
    if o: bpy.data.objects.remove(o, do_unlink=True)
def link(ob):
    if ob.name not in kit.objects: kit.objects.link(ob)
def attach(ob, bone=None):
    ob.parent = rig; ob.matrix_parent_inverse = rig.matrix_world.inverted()
    if bone:
        vg = ob.vertex_groups.get(bone) or ob.vertex_groups.new(name=bone); vg.add(list(range(len(ob.data.vertices))), 1.0, 'REPLACE')
    if not ob.modifiers.get('Armature'):
        mod = ob.modifiers.new('Armature', 'ARMATURE'); mod.object = rig
    link(ob)
def apply_mod(ob, name):
    with bpy.context.temp_override(object=ob, active_object=ob, selected_objects=[ob]):
        bpy.ops.object.modifier_apply(modifier=name)
def ss(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t)
def smooth1(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t)
def vlist(g): return g.verts if hasattr(g, 'verts') else [g]

def extract_raw(name, pred, offset):
    uv_src = me.uv_layers['UVMap'].data
    idx_map = {}; bm = bmesh.new(); uvl = bm.loops.layers.uv.new('UVMap')
    for p in me.polygons:
        vs = [me.vertices[i] for i in p.vertices]
        if not all(has(v, BODY) and pred(v.co) for v in vs): continue
        bverts = []
        for v in vs:
            if v.index not in idx_map: idx_map[v.index] = bm.verts.new(v.co + vn[v.index] * offset)
            bverts.append(idx_map[v.index])
        try: f = bm.faces.new(bverts)
        except ValueError: continue
        for loop, li in zip(f.loops, p.loop_indices): loop[uvl].uv = uv_src[li].uv
    bm.verts.index_update(); new_index = {src: nv.index for src, nv in idx_map.items()}
    m = bpy.data.meshes.new(name); bm.to_mesh(m); bm.free()
    ob = bpy.data.objects.new(name, m)
    for gname in gi: ob.vertex_groups.new(name=gname)
    for src, vi in new_index.items():
        for g in me.vertices[src].groups: ob.vertex_groups[g.group].add([vi], g.weight, 'REPLACE')
    link(ob); return ob

def cut(ob, cuts):
    sub = ob.modifiers.new('Subdivision', 'SUBSURF'); sub.levels = 1; sub.render_levels = 1
    apply_mod(ob, 'Subdivision')
    bm = bmesh.new(); bm.from_mesh(ob.data)
    for plane_co, plane_no, geom_filter in cuts:
        geom = [g for g in bm.verts[:] + bm.edges[:] + bm.faces[:] if geom_filter is None or geom_filter(g)]
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=plane_co, plane_no=plane_no, clear_outer=True, clear_inner=False)
    bm.to_mesh(ob.data); bm.free()
    for p in ob.data.polygons: p.use_smooth = True

def bake(ob, color_fn, size, name):
    m = ob.data; uv = m.uv_layers['UVMap'].data
    img = np.zeros((size, size, 4), np.float32); img[..., 3] = 1
    covered = np.zeros((size, size), bool)
    V = np.array([v.co[:] for v in m.vertices])
    for p in m.polygons:
        li = list(p.loop_indices); vi = list(p.vertices)
        for k in range(1, len(vi) - 1):
            tri = (0, k, k + 1)
            U = np.array([uv[li[t]].uv[:] for t in tri]) * size; X = V[[vi[t] for t in tri]]
            x0, y0 = np.floor(U.min(0)).astype(int) - 1; x1, y1 = np.ceil(U.max(0)).astype(int) + 2
            x0, y0 = max(x0, 0), max(y0, 0); x1, y1 = min(x1, size), min(y1, size)
            if x1 <= x0 or y1 <= y0: continue
            ys, xs = np.mgrid[y0:y1, x0:x1]; px = xs + 0.5; py = ys + 0.5
            d = (U[1, 1] - U[2, 1]) * (U[0, 0] - U[2, 0]) + (U[2, 0] - U[1, 0]) * (U[0, 1] - U[2, 1])
            if abs(d) < 1e-9: continue
            l0 = ((U[1, 1] - U[2, 1]) * (px - U[2, 0]) + (U[2, 0] - U[1, 0]) * (py - U[2, 1])) / d
            l1 = ((U[2, 1] - U[0, 1]) * (px - U[2, 0]) + (U[0, 0] - U[2, 0]) * (py - U[2, 1])) / d
            l2 = 1 - l0 - l1
            interior = (l0 >= 0) & (l1 >= 0) & (l2 >= 0)
            near = (l0 >= -0.15) & (l1 >= -0.15) & (l2 >= -0.15)
            if not near.any(): continue
            L = np.clip(np.stack([l0, l1, l2], -1), 0, None); L /= L.sum(-1, keepdims=True)
            pos = L @ X
            col = color_fn(pos[..., 0], pos[..., 1], pos[..., 2])
            sub = img[y0:y1, x0:x1]; cv = covered[y0:y1, x0:x1]
            bleed = near & ~interior & ~cv
            sub[interior, :3] = col[interior]; sub[bleed, :3] = col[bleed]
            cv |= interior
    image = bpy.data.images.get(name)
    if image is None or image.size[0] != size:
        if image is not None: bpy.data.images.remove(image)
        image = bpy.data.images.new(name, size, size, alpha=False)
    image.pixels.foreach_set(img.ravel()); image.filepath_raw = TEXDIR + '\\' + name + '.png'; image.file_format = 'PNG'; image.save()
    return image

def heather(size, amp):
    rng = np.random.default_rng(7)
    n = np.repeat(np.repeat(rng.random((size // 8, size // 8)), 8, 0), 8, 1) + 0.5 * np.repeat(np.repeat(rng.random((size // 2, size // 2)), 2, 0), 2, 1)
    return 1 + amp * (n / 1.5 - 0.5)

def apply_heather(image, size, amp):
    px = np.array(image.pixels[:], np.float32).reshape(size, size, 4)
    px[..., :3] *= heather(size, amp)[..., None]
    image.pixels.foreach_set(px.ravel()); image.save()

def tex_material(name, image):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name); mat.use_nodes = True
    nt = mat.node_tree
    for n in list(nt.nodes):
        if n.type == 'TEX_IMAGE': nt.nodes.remove(n)
    bsdf = nt.nodes['Principled BSDF']; tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = image
    nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color']); bsdf.inputs['Roughness'].default_value = 0.8
    return mat

def seg_dist(px, pz, ax, az, bx, bz):
    vx, vz = bx - ax, bz - az; wx, wz = px - ax, pz - az
    t = np.clip((wx * vx + wz * vz) / (vx * vx + vz * vz), 0, 1)
    return np.hypot(wx - t * vx, wz - t * vz)

def silhouette_tables(ob, zlo, zhi, step=0.01):
    V = np.array([v.co[:] for v in ob.data.vertices])
    zs = np.arange(zlo, zhi + step, step); xmax = np.zeros_like(zs); yc = np.zeros_like(zs)
    for i, z in enumerate(zs):
        sel = np.abs(V[:, 2] - z) < step
        if sel.any():
            j = np.argmax(np.abs(V[sel, 0])); xmax[i] = abs(V[sel, 0][j]); yc[i] = V[sel, 1][j]
        elif i: xmax[i] = xmax[i - 1]; yc[i] = yc[i - 1]
    k = np.ones(7) / 7
    pad = lambda a: np.concatenate([np.full(3, a[0]), a, np.full(3, a[-1])])
    return zs, np.convolve(pad(xmax), k, 'valid'), np.convolve(pad(yc), k, 'valid')

# ---------------- shirt
remove('KitShirt'); remove('Collar')
armL = rig.data.bones['mixamorig:LeftArm']; foreL = rig.data.bones['mixamorig:LeftForeArm']
armR = rig.data.bones['mixamorig:RightArm']; foreR = rig.data.bones['mixamorig:RightForeArm']
def arm_cut(arm, fore, frac=0.62):
    a = arm.head_local; d = (fore.head_local - a).normalized()
    return (a + d * ((fore.head_local - a).length * frac), d)
cutL = arm_cut(armL, foreL); cutR = arm_cut(armR, foreR)
NECK_CUT = NECK - 0.006
shirt = extract_raw('KitShirt', lambda co: HIPS - 0.02 <= co.z <= NECK + 0.045 and abs(co.x) < 0.42 and not (co.z > NECK + 0.012 and abs(co.x) < 0.085), 0.006)
cut(shirt, [
    ((0, 0, HIPS + 0.07), (0, 0, -1), None),
    ((0, 0, NECK_CUT), (0, 0, 1), lambda g: all(abs(v.co.x) < 0.1 and -0.14 < v.co.y < 0.09 and v.co.z > NECK - 0.06 for v in vlist(g))),
    (cutL[0], cutL[1], lambda g: all(v.co.x > 0.2 for v in vlist(g))),
    (cutR[0], cutR[1], lambda g: all(v.co.x < -0.2 for v in vlist(g))),
])
zs, xmax, yc = silhouette_tables(shirt, HIPS, NECK)
V = np.array([v.co[:] for v in shirt.data.vertices])
xb = np.arange(0.08, 0.3, 0.01)
ridge = np.array([V[np.abs(np.abs(V[:, 0]) - x) < 0.01, 2].max() if (np.abs(np.abs(V[:, 0]) - x) < 0.01).any() else NECK for x in xb])
SLEEVE_X = min(abs(cutL[0].x), abs(cutR[0].x)) - 0.01
def shirt_col(x, y, z):
    ax = np.abs(x)
    top = np.interp(ax, xb, ridge)
    pip = ss(0.0075, 0.0035, np.abs(z - (top - 0.004))) * ss(0.095, 0.11, ax) * ss(SLEEVE_X, SLEEVE_X - 0.015, ax)
    rag = ss(0.006, 0.0025, seg_dist(ax, z, 0.075, NECK - 0.035, 0.205, NECK - 0.17))
    rag_f = rag * ss(-0.04, -0.07, y); rag_b = rag * ss(0.03, 0.06, y)
    xm = np.interp(z, zs, xmax); ym = np.interp(z, zs, yc)
    seam = ss(0.9, 0.96, ax / np.maximum(xm, 1e-3)) * ss(0.012, 0.004, np.abs(y - ym)) * ss(HIPS + 0.09, HIPS + 0.12, z) * ss(NECK - 0.15, NECK - 0.18, z)
    lx, lz = 0.075, 1.455
    logo = np.minimum.reduce([seg_dist(x, z, lx - 0.013, lz + 0.013, lx + 0.004, lz + 0.004), seg_dist(x, z, lx + 0.004, lz + 0.004, lx - 0.004, lz - 0.004), seg_dist(x, z, lx - 0.004, lz - 0.004, lx + 0.013, lz - 0.013)])
    logo = ss(0.0045, 0.002, logo) * ss(-0.06, -0.09, y)
    t = np.maximum.reduce([pip, rag_f, rag_b, seam, logo])[..., None]
    return BLACK * (1 - t) + LIME * t
img_shirt = bake(shirt, shirt_col, 2048, 'KitShirtTex'); apply_heather(img_shirt, 2048, 0.5)
shirt.data.materials.append(tex_material('KitShirtTex', img_shirt))
sm = shirt.modifiers.new('Solidify', 'SOLIDIFY'); sm.thickness = 0.006; sm.offset = 1.0; sm.use_rim = True
attach(shirt)
# collar rib
ring = [v.co for v in me.vertices if has(v, BODY) and abs(v.co.z - NECK_CUT) < 0.006 and abs(v.co.x) < 0.12 and -0.2 < v.co.y < 0.1]
cy = (max(c.y for c in ring) + min(c.y for c in ring)) / 2
rx = max(abs(c.x) for c in ring) + 0.0075; ry = (max(c.y for c in ring) - min(c.y for c in ring)) / 2 + 0.0075
bm = bmesh.new(); verts = []; segs, rings = 40, 8; r = 0.0045
for i in range(segs):
    a = 2 * math.pi * i / segs; ringv = []
    for j in range(rings):
        b = 2 * math.pi * j / rings
        ringv.append(bm.verts.new(Vector(((rx + r * math.cos(b)) * math.cos(a), cy + (ry + r * math.cos(b)) * math.sin(a), NECK_CUT + 0.002 + r * math.sin(b)))))
    verts.append(ringv)
for i in range(segs):
    for j in range(rings):
        bm.faces.new([verts[i][j], verts[(i + 1) % segs][j], verts[(i + 1) % segs][(j + 1) % rings], verts[i][(j + 1) % rings]])
m = bpy.data.meshes.new('Collar'); bm.to_mesh(m); bm.free(); m.materials.append(bpy.data.materials['BandBlack'])
for p in m.polygons: p.use_smooth = True
collar = bpy.data.objects.new('Collar', m); attach(collar, 'mixamorig:Spine2')
# ---------------- shorts
remove('KitShorts')
shorts = extract_raw('KitShorts', lambda co: 0.68 <= co.z <= HIPS + 0.1 and abs(co.x) < 0.3, 0.008)
cut(shorts, [((0, 0, HIPS + 0.085), (0, 0, 1), None), ((0, 0, 0.715), (0, 0, -1), None)])
zs2, xmax2, yc2 = silhouette_tables(shorts, 0.7, HIPS + 0.1)
def shorts_col(x, y, z):
    ax = np.abs(x); xm = np.interp(z, zs2, xmax2); ym = np.interp(z, zs2, yc2)
    stripe = ss(0.9, 0.96, ax / np.maximum(xm, 1e-3)) * ss(0.014, 0.006, np.abs(y - ym)) * ss(0.73, 0.76, z) * ss(HIPS + 0.06, HIPS + 0.03, z)
    logo = ss(0.0045, 0.002, seg_dist(x, z, 0.085, 0.8, 0.105, 0.78)) * ss(-0.03, -0.07, y)
    t = np.maximum(stripe, logo)[..., None]
    return BLACK * (1 - t) + LIME * t
img_shorts = bake(shorts, shorts_col, 1024, 'KitShortsTex'); apply_heather(img_shorts, 1024, 0.35)
shorts.data.materials.append(tex_material('KitShortsTex', img_shorts))
sm = shorts.modifiers.new('Solidify', 'SOLIDIFY'); sm.thickness = 0.007; sm.offset = 1.0; sm.use_rim = True
attach(shorts)
# ---------------- hair cap
remove('Hair')
band = bpy.data.objects['Headband']; band_top = max((band.matrix_world @ v.co).z for v in band.data.vertices)
bm = bmesh.new(); cz = EYE_Z + 0.04; cyh = -0.055
bmesh.ops.create_uvsphere(bm, u_segments=56, v_segments=32, radius=0.13, matrix=Matrix.Translation((0, cyh, cz)))
kill = []
# hairline by azimuth around the head (0 = forehead, pi/2 = above the ear, pi = nape)
TH = np.array([0.0, 0.55, 0.95, 1.2, 1.35, 1.5, 1.8, 2.1, 2.5, math.pi])
ZL = np.array([band_top - 0.012, band_top - 0.014, EYE_Z + 0.03, EYE_Z + 0.015, EYE_Z + 0.0, EYE_Z + 0.005, EYE_Z - 0.03, EYE_Z - 0.055, EYE_Z - 0.07, EYE_Z - 0.075])
for v in bm.verts:
    th = abs(math.atan2(v.co.x, -(v.co.y - cyh)))
    zline = float(np.interp(th, TH, ZL)) + 0.005 * noise.noise(v.co * 60)
    if v.co.z < zline: kill.append(v)
bmesh.ops.delete(bm, geom=kill, context='VERTS')
m = bpy.data.meshes.new('Hair'); bm.to_mesh(m); bm.free(); m.materials.append(bpy.data.materials['Hair'])
hair = bpy.data.objects.new('Hair', m); link(hair)
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
attach(hair, 'mixamorig:Head')
hmat = bpy.data.materials['Hair']; hb = hmat.node_tree.nodes['Principled BSDF']
hb.inputs['Base Color'].default_value = (0.045, 0.025, 0.014, 1); hb.inputs['Roughness'].default_value = 0.55
info['hair_verts'] = len(hm.vertices); info['band_top'] = round(band_top, 3)
# ---------------- renders
scene = bpy.context.scene; scene.render.engine = 'BLENDER_EEVEE'
bpy.data.objects['Racket'].hide_render = True
cam = bpy.data.objects['PreviewCam']; cam.location = (2.3, -3.6, 1.15); cam.rotation_euler = (math.radians(84), 0, math.radians(32)); cam.data.lens = 55
scene.render.resolution_x = 700; scene.render.resolution_y = 1000
scene.render.filepath = r'C:\claude\squash-game\docs\design\player-kit-wip.png'; bpy.ops.render.render(write_still=True)
cam.location = (0.6, -1.05, 1.8); cam.rotation_euler = (math.radians(86), 0, math.radians(29)); cam.data.lens = 85
scene.render.filepath = r'C:\claude\squash-game\docs\design\player-head-wip.png'; bpy.ops.render.render(write_still=True)
cam.location = (-0.9, -1.25, 1.45); cam.rotation_euler = (math.radians(88), 0, math.radians(-36)); cam.data.lens = 70
scene.render.filepath = r'C:\claude\squash-game\docs\design\player-torso-wip.png'; bpy.ops.render.render(write_still=True)
bpy.data.objects['Racket'].hide_render = False
info['shirt_faces'] = len(shirt.data.polygons); info['shorts_faces'] = len(shorts.data.polygons)
result = info
