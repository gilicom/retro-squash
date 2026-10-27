import bpy, bmesh, math
import numpy as np
from mathutils import Vector, Matrix
body = bpy.data.objects['PlayerBody']; rig = bpy.data.objects['PlayerRig']; me = body.data
kit = bpy.data.collections['PlayerKit']; B = rig.data.bones
TEXDIR = r'C:\claude\squash-game\tools\blender\textures'
LIME = np.array([0.45, 1.0, 0.0]); BLACK = np.array([0.02, 0.02, 0.022]); WHITE = np.array([0.85, 0.85, 0.82]); GREY = np.array([0.12, 0.12, 0.13])
info = {}
V = np.array([v.co[:] for v in me.vertices])
BODY = body.vertex_groups['body'].index
INBODY = np.array([any(g.group == BODY for g in v.groups) for v in me.vertices])
GROUND = float(V[INBODY, 2].min())
SOLE_TOP = GROUND + 0.02
def ss(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t)
def remove(name):
    o = bpy.data.objects.get(name)
    if o: bpy.data.objects.remove(o, do_unlink=True)
def attach(ob, weights):
    """weights: list of (bone, {vertex index: weight})"""
    ob.parent = rig; ob.matrix_parent_inverse = rig.matrix_world.inverted()
    for bone, wmap in weights:
        vg = ob.vertex_groups.new(name=bone)
        for vi, w in wmap.items():
            if w > 0: vg.add([vi], w, 'REPLACE')
    mod = ob.modifiers.new('Armature', 'ARMATURE'); mod.object = rig
    if ob.name not in kit.objects: kit.objects.link(ob)

# ---------------- shoe texture (parametric: u along the foot, v = angle over the top)
SIZE = 1024
def shoe_texture():
    name = 'KitShoeTex'
    uu = (np.arange(SIZE) + 0.5) / SIZE; vv = (np.arange(SIZE) + 0.5) / SIZE
    u, v = np.meshgrid(uu, vv)              # v rows, u columns
    phi = v * math.pi                       # 0 outer sole edge, pi/2 top, pi inner sole edge
    side = np.minimum(phi, math.pi - phi)   # height angle on either side
    col = np.broadcast_to(BLACK, (SIZE, SIZE, 3)).copy()
    def paint(mask, c):
        m = mask[..., None]; col[:] = col * (1 - m) + c * m
    # swoosh arc on both sides
    arc = 0.28 + 0.62 * np.sin(np.pi * np.clip((u - 0.14) / 0.72, 0, 1))
    sw = ss(0.17, 0.1, np.abs(side - arc)) * ss(0.12, 0.17, u) * ss(0.9, 0.85, u)
    paint(sw, LIME)
    # heel tab
    paint(ss(0.075, 0.055, u), LIME)
    # toe guard
    paint(ss(0.9, 0.95, u), GREY)
    # tongue and eyelets
    tongue = ss(0.49, 0.515, u) * ss(0.77, 0.75, u) * ss(0.5, 0.42, np.abs(phi - math.pi / 2))
    paint(tongue, GREY)
    for i in range(4):
        uc = 0.53 + i * 0.062
        for s in (-1, 1):
            d = np.hypot((u - uc) * 3.2, (phi - (math.pi / 2 + s * 0.3)))
            paint(ss(0.05, 0.03, d), LIME)
        # lace crossing between the eyelet rows
        lace = ss(0.012, 0.006, np.abs((phi - math.pi / 2) - 0.3 * (1 - 2 * ((u - uc) / 0.062)))) * ss(uc, uc + 0.01, u) * ss(uc + 0.062, uc + 0.052, u) * ss(0.33, 0.3, np.abs(phi - math.pi / 2))
        paint(lace, WHITE)
    rng = np.random.default_rng(3)
    heather = 1 + 0.3 * (np.repeat(np.repeat(rng.random((SIZE // 4, SIZE // 4)), 4, 0), 4, 1) - 0.5)
    col *= heather[..., None]
    img = np.ones((SIZE, SIZE, 4), np.float32); img[..., :3] = col
    image = bpy.data.images.get(name)
    if image is not None: bpy.data.images.remove(image)
    image = bpy.data.images.new(name, SIZE, SIZE, alpha=False)
    image.pixels.foreach_set(img.ravel()); image.filepath_raw = TEXDIR + '\\' + name + '.png'; image.file_format = 'PNG'; image.save()
    mat = bpy.data.materials.get('KitShoeTex') or bpy.data.materials.new('KitShoeTex'); mat.use_nodes = True
    nt = mat.node_tree
    for n in list(nt.nodes):
        if n.type == 'TEX_IMAGE': nt.nodes.remove(n)
    bsdf = nt.nodes['Principled BSDF']; tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = image
    nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color']); bsdf.inputs['Roughness'].default_value = 0.6
    return mat
shoe_mat = shoe_texture()
sole_mat = bpy.data.materials['KitVertexColor']

def build_shoe(side):
    foot = B[f'mixamorig:{side}Foot']; toe = B[f'mixamorig:{side}ToeBase']
    fx = foot.head_local.x
    sel = INBODY & (V[:, 2] < GROUND + 0.17) & (np.abs(V[:, 0] - fx) < 0.09)
    F = V[sel]
    ax = np.array([toe.head_local.x - foot.head_local.x, toe.head_local.y - foot.head_local.y, 0.0]); ax /= np.linalg.norm(ax)
    proj = F @ ax
    heel = F[np.argmin(proj)].copy(); tip = F[np.argmax(proj)].copy()
    heel[2] = GROUND; tip[2] = GROUND
    heel = heel - ax * ((heel - tip) @ ax) * 0  # keep
    length = float((tip - heel) @ ax); heel = tip - ax * length
    lat = np.array([-ax[1], ax[0], 0.0])
    if lat[0] * (0 - fx) > 0: lat = -lat          # lateral points outward (away from the other foot)
    t_all = ((F - heel) @ ax) / length; l_all = (F - heel) @ lat
    us = np.linspace(-0.055, 1.07, 30); M = 24
    def collar(u):
        return float(np.interp(u, [0.0, 0.12, 0.35, 0.5], [0.09, 0.085, 0.072, 0.075]))
    def open_half(u):
        if u < 0.06 or u > 0.52: return -1.0
        return float(np.interp(u, [0.06, 0.18, 0.4, 0.52], [0.3, 0.8, 0.9, 0.55]))
    raw = []
    for u in us:
        uc = min(max(u, 0.0), 1.0)
        slab = F[(np.abs(t_all - uc) < 0.035) & (F[:, 2] < GROUND + 0.075)]
        l = (slab - heel) @ lat
        w_in, w_out = float(l.min()), float(l.max())
        top = float(slab[:, 2].max()) - GROUND
        raw.append(((w_in + w_out) / 2, (w_out - w_in) / 2, top))
    raw = np.array(raw)
    k = np.ones(5) / 5
    sm = lambda a: np.convolve(np.concatenate([np.full(2, a[0]), a, np.full(2, a[-1])]), k, 'valid')
    centres, halves, tops = sm(raw[:, 0]), sm(raw[:, 1]), sm(raw[:, 2])
    stations = []
    for u, centre, half, top in zip(us, centres, halves, tops):
        half = half + 0.011
        height = min(top + 0.014, collar(u)) if u < 0.5 else min(top + 0.013, 0.075)
        if u < 0: f = math.sqrt(max(0.0, 1 - (u / 0.07) ** 2)); half *= f; height = height * (0.35 + 0.65 * f)
        if u > 1: f = math.sqrt(max(0.0, 1 - ((u - 1) / 0.085) ** 2)); half *= f; height = (height - 0.02) * f + 0.02
        half = max(half, 0.006); height = max(height, 0.028)
        stations.append((u, float(centre), float(half), float(height)))
    P_EXP = 2.5
    def point(u, centre, half, height, phi):
        c, s = math.cos(phi), math.sin(phi)
        w = half * math.copysign(abs(c) ** (2 / P_EXP), c); z = SOLE_TOP - 0.004 + (height + GROUND - (SOLE_TOP - 0.004)) * abs(s) ** (2 / P_EXP)
        return heel + ax * (u * length) + lat * (centre + w) + np.array([0, 0, z])
    bm = bmesh.new(); uvl = bm.loops.layers.uv.new('UVMap')
    grid = []; uvs = []
    for (u, centre, half, height) in stations:
        row = []; uvrow = []; oh = open_half(u)
        for j in range(M + 1):
            phi = math.pi * j / M
            if oh > 0 and abs(phi - math.pi / 2) < oh:
                # inside the opening: keep only the two edge samples, snapped onto the collar curve
                prev_out = abs(math.pi * (j - 1) / M - math.pi / 2) >= oh; next_out = abs(math.pi * (j + 1) / M - math.pi / 2) >= oh
                if prev_out: phi = math.pi / 2 - oh
                elif next_out: phi = math.pi / 2 + oh
                else: row.append(None); uvrow.append(None); continue
            p = point(u, centre, half, height, phi)
            row.append(bm.verts.new(Vector(p))); uvrow.append(((u + 0.055) / 1.125, phi / math.pi))
        grid.append(row); uvs.append(uvrow)
    for i in range(len(stations) - 1):
        for j in range(M):
            quad = [grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]]
            if any(q is None for q in quad): continue
            try: f = bm.faces.new(quad)
            except ValueError: continue
            for loop, (ii, jj) in zip(f.loops, [(i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1)]): loop[uvl].uv = uvs[ii][jj]
    # end caps
    for i, u in ((0, -0.068), (len(stations) - 1, 1.095)):
        st = stations[i]; cp = heel + ax * (u * length) + lat * st[1] + np.array([0, 0, GROUND + 0.02 + 0.3 * st[3]])
        cv = bm.verts.new(Vector(cp)); row = grid[i]
        for j in range(M):
            a, b = row[j], row[j + 1]
            if a is None or b is None: continue
            try: f = bm.faces.new([a, b, cv] if i == 0 else [b, a, cv])
            except ValueError: continue
            for loop in f.loops: loop[uvl].uv = ((u + 0.055) / 1.125, 0.5) if loop.vert == cv else uvs[i][row.index(loop.vert)]
    bm.normal_update()
    # make normals point outward
    centre_pt = Vector(heel + ax * (0.5 * length) + lat * stations[15][1] + np.array([0, 0, GROUND + 0.04]))
    flip = sum(1 for f in bm.faces if f.normal.dot(f.calc_center_median() - centre_pt) < 0) > len(bm.faces) / 2
    if flip: bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    m = bpy.data.meshes.new(f'Shoe{side}'); bm.to_mesh(m); bm.free(); m.materials.append(shoe_mat)
    for p in m.polygons: p.use_smooth = True
    ob = bpy.data.objects.new(f'Shoe{side}', m)
    sm = ob.modifiers.new('Solidify', 'SOLIDIFY'); sm.thickness = 0.004; sm.offset = -1.0; sm.use_rim = True
    def weights_for(mesh):
        wf, wt = {}, {}
        for v in mesh.vertices:
            u = float(((np.array(v.co[:]) - heel) @ ax) / length)
            t = float(np.clip((u - 0.62) / 0.2, 0, 1)); wf[v.index] = 1 - t; wt[v.index] = t
        return [(f'mixamorig:{side}Foot', wf), (f'mixamorig:{side}ToeBase', wt)]
    attach(ob, weights_for(m))
    # ---- sole: offset outline of the upper's bottom edge, extruded from the ground to the midsole top
    outline = []
    for (u, centre, half, height) in stations: outline.append(point(u, centre, half + 0.006, height, 0.0))
    outline.append(heel + ax * (1.1 * length) + lat * stations[-1][1] + np.array([0, 0, SOLE_TOP]))
    for (u, centre, half, height) in reversed(stations): outline.append(point(u, centre, half + 0.006, height, math.pi))
    outline.append(heel + ax * (-0.075 * length) + lat * stations[0][1] + np.array([0, 0, SOLE_TOP]))
    bm = bmesh.new(); col = bm.verts.layers.float_color.new('Col')
    rings = []
    for z, c in ((GROUND, LIME), (GROUND + 0.008, LIME), (GROUND + 0.0085, WHITE), (SOLE_TOP, WHITE)):
        ring = []
        for p in outline:
            v = bm.verts.new(Vector((p[0], p[1], z))); v[col] = (c[0], c[1], c[2], 1.0); ring.append(v)
        rings.append(ring)
    n = len(outline)
    for r in range(len(rings) - 1):
        for i in range(n):
            bm.faces.new([rings[r][i], rings[r][(i + 1) % n], rings[r + 1][(i + 1) % n], rings[r + 1][i]])
    bm.faces.new(list(reversed(rings[0]))); bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    m2 = bpy.data.meshes.new(f'Sole{side}'); bm.to_mesh(m2); bm.free(); m2.materials.append(sole_mat)
    sole = bpy.data.objects.new(f'Sole{side}', m2)
    attach(sole, weights_for(m2))
    return len(m.vertices), len(m2.vertices)
remove('KitShoes')
for n in ('ShoeLeft', 'ShoeRight', 'SoleLeft', 'SoleRight'): remove(n)
info['left'] = build_shoe('Left'); info['right'] = build_shoe('Right'); info['ground'] = round(GROUND, 4)
scene = bpy.context.scene; scene.render.engine = 'BLENDER_EEVEE'
bpy.data.objects['Racket'].hide_render = True
cam = bpy.data.objects['PreviewCam']
cam.location = (0.75, -0.95, 0.28); cam.rotation_euler = (math.radians(80), 0, math.radians(38)); cam.data.lens = 60
scene.render.resolution_x = 900; scene.render.resolution_y = 700
scene.render.filepath = r'C:\claude\squash-game\docs\design\player-shoes-wip.png'; bpy.ops.render.render(write_still=True)
bpy.data.objects['Racket'].hide_render = False
result = info
