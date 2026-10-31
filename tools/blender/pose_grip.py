"""Pose the right hand of the Blender character in a squash grip and place the racket in it.

Run in background Blender (GRIP_SAVE=1 saves the pose into the scene):

    blender -b tools/blender/squash-assets.blend --python tools/blender/pose_grip.py

The handle crosses the palm at GRIP_ANGLE above the knuckle line (toward the thumb side) and is
pressed SINK into the palm pad; the fingers wrap a cylinder of R_HANDLE around it, the index
spread up the handle as a trigger finger; the thumb comes at the handle diagonally toward the
head, its pad on the near-top bevel, making a V with the index; the butt sits just outside the
heel of the hand (see docs/design/character-brief.md, "Grip"). The butt position in the palm
frame is printed; copy it to GRIP_BUTT in src/render3d/skinned-player.js when it changes.
Renders docs/design/grip-*.png.
"""
import bpy, math, os, json
import numpy as np
from mathutils import Vector, Quaternion, Matrix

OUT = r'C:\claude\squash-game\docs\design'
SAVE = os.environ.get('GRIP_SAVE') == '1'
GRIP_ANGLE = math.radians(18)
R_HANDLE = 0.0135
FINGER_HALF = 0.0055
SINK = float(os.environ.get('SINK', '0.018'))      # the handle presses into the palm pad (the thenar wraps it)
L_EDGE = -0.047
INDEX_SPLAY = float(os.environ.get('INDEX_SPLAY', '-0.38'))   # rad about the palm normal, toward the head end
INDEX_PIP_MIN = math.radians(float(os.environ.get('INDEX_PIP_MIN', '55')))
THUMB_UP = float(os.environ.get('THUMB_UP', '0.03'))           # contact point: along the handle from the index knuckle toward the head
THUMB_BEVEL = float(os.environ.get('THUMB_BEVEL', '0.5'))       # 0 = top (+out) bevel, 1 = far (+fingers) bevel

rig = bpy.data.objects['PlayerRig']; racket = bpy.data.objects['Racket']; body = bpy.data.objects['PlayerBody']
B = rig.data.bones; P = rig.pose.bones
hips = B['mixamorig:Hips'].head_local


def hand_frame(side):
    hand = B[f'mixamorig:{side}Hand']
    d0 = (hand.tail_local - hand.head_local).normalized()
    th = B[f'mixamorig:{side}HandThumb1'].head_local - hand.head_local
    L0 = (th - d0 * th.dot(d0)).normalized()
    n0 = d0.cross(L0).normalized()
    if n0.dot(hips - hand.head_local) < 0: n0 = -n0
    return hand, d0, L0, n0


def local(pb, axis_w): return pb.bone.matrix_local.to_3x3().inverted() @ axis_w


def aim(pb, target_w):
    bpy.context.view_layer.update()
    m = pb.matrix.copy(); cur = (m.to_3x3() @ Vector((0, 1, 0))).normalized()
    rot = cur.rotation_difference(target_w.normalized()).to_matrix()
    nm = (rot @ m.to_3x3()).to_4x4(); nm.translation = m.translation; pb.matrix = nm


def flex_axis(bone, n0):
    fdir = (bone.tail_local - bone.head_local).normalized(); axis = fdir.cross(n0).normalized()
    test = fdir.copy(); test.rotate(Quaternion(axis, 0.5))
    return axis if test.dot(n0) > 0 else -axis


def rot2(v, a): return np.array([math.cos(a) * v[0] - math.sin(a) * v[1], math.sin(a) * v[0] + math.cos(a) * v[1]])


for pb in P:
    if 'Hand' in pb.name and pb.name not in ('mixamorig:RightHand', 'mixamorig:LeftHand'):
        pb.rotation_mode = 'QUATERNION'; pb.rotation_quaternion = Quaternion()
bpy.context.view_layer.update()

hand, d0, L0, n0 = hand_frame('Right')
def rel(v):
    r = v - hand.head_local; return np.array([r.dot(L0), r.dot(d0), r.dot(n0)])
def world(c): return hand.head_local + L0 * c[0] + d0 * c[1] + n0 * c[2]
n_palm = max(rel(v.co)[2] for v in body.data.vertices
             if (lambda r: abs(r[0]) < 0.015 and 0.04 < r[1] < 0.09 and -0.05 < r[2] < 0.08)(rel(v.co)))
R_EFF = R_HANDLE + FINGER_HALF
h2 = np.array([math.cos(GRIP_ANGLE), math.sin(GRIP_ANGLE), 0.0])
idx_mcp = rel(B['mixamorig:RightHandIndex1'].head_local)
c_idx = np.array([idx_mcp[0], idx_mcp[1] - 0.012, n_palm + R_HANDLE - SINK])
def axis_point(L): return c_idx + h2 * ((L - c_idx[0]) / h2[0])

# The trigger finger is spread up the handle toward the head; the others stay together.
splay = {'Index': INDEX_SPLAY, 'Middle': -0.03, 'Ring': 0.03, 'Pinky': 0.1}
limits = (math.radians(95), math.radians(108), math.radians(90))
report = {}
for finger in ('Index', 'Middle', 'Ring', 'Pinky'):
    mins = (0.0, INDEX_PIP_MIN if finger == 'Index' else math.radians(40), math.radians(40))
    bones = [B[f'mixamorig:RightHand{finger}{j}'] for j in (1, 2, 3)]
    heads = [rel(b.head_local) for b in bones] + [rel(bones[2].tail_local)]
    # A splayed finger wraps the handle where its tip lands, further along the handle.
    lat_shift = -math.sin(splay[finger]) * 0.045
    C = axis_point(heads[0][0] + lat_shift)[1:]
    J = heads[0][1:].copy(); prev_world = 0.0; angs = []
    for k in range(3):
        seg = heads[k + 1] - heads[k]; length = float(np.hypot(seg[1], seg[2])); phi_rest = math.atan2(seg[2], seg[1])
        v = C - J; rho = float(np.hypot(*v)); vhat = v / max(rho, 1e-6)
        t_len = math.sqrt(max(rho * rho - R_EFF * R_EFF, 0.0))
        if rho <= R_EFF + 1e-4 or length > t_len:
            cg = (length * length + rho * rho - R_EFF * R_EFF) / (2 * length * rho); gamma = math.acos(max(-1.0, min(1.0, cg)))
        else:
            gamma = math.asin(min(1.0, R_EFF / rho))
        dirv = rot2(vhat, -gamma); psi = math.atan2(dirv[1], dirv[0])
        w = psi - phi_rest
        while w < -math.pi: w += 2 * math.pi
        while w > math.pi: w -= 2 * math.pi
        loc = max(mins[k], min(limits[k], w - prev_world)); w = prev_world + loc; psi = w + phi_rest
        angs.append(round(math.degrees(loc), 1))
        J = J + length * np.array([math.cos(psi), math.sin(psi)]); prev_world = w
        pb = P[f'mixamorig:RightHand{finger}{k + 1}']
        q = Quaternion(local(pb, flex_axis(bones[k], n0)), loc)
        if k == 0: q = q @ Quaternion(local(pb, n0), splay[finger])
        pb.rotation_quaternion = q
    report[finger] = angs
h_w = (L0 * h2[0] + d0 * h2[1]).normalized()

# Thumb: the metacarpal climbs over the near side of the handle; the thumb then lies along the
# handle toward the head on the bevel between the top (+out) and the far (+fingers) side, each
# phalanx aimed so it rests on the handle surface (bisection on the dip angle), pad pressing the
# handle toward the trigger finger.
THUMB_CLEAR = float(os.environ.get('THUMB_CLEAR', '0.009'))
nb = (n0 * float(os.environ.get('NB_N', '0.75')) - d0 * float(os.environ.get('NB_D', '0.65'))).normalized()   # near-top bevel (wrist side of the top)
axis_pt_w = world(axis_point(0.0))
def axis_dist(p):
    v = p - axis_pt_w; return (v - h_w * v.dot(h_w)).length
def side_of(p):
    v = p - axis_pt_w; return (v - h_w * v.dot(h_w)).normalized().dot(nb)
# The thumb comes at the handle diagonally, up toward the head: the metacarpal points at the
# near-top bevel well up the handle, the proximal phalanx reaches it, the distal lies along it.
T1_UP = float(os.environ.get('T1_UP', '0.04')); T2_UP = float(os.environ.get('T2_UP', '0.065')); T1_CLEAR = float(os.environ.get('T1_CLEAR', '0.011'))
t1 = P['mixamorig:RightHandThumb1']
mcp_target = world(axis_point(idx_mcp[0] + T1_UP)) + nb * (R_HANDLE + T1_CLEAR)
aim(t1, mcp_target - t1.head)
bpy.context.view_layer.update()
mcp_miss = round((P['mixamorig:RightHandThumb2'].head - mcp_target).length, 4)
t2 = P['mixamorig:RightHandThumb2']
p2 = world(axis_point(idx_mcp[0] + T2_UP)) + nb * (R_HANDLE + THUMB_CLEAR)
aim(t2, p2 - t2.head)
bpy.context.view_layer.update()
def rest_on_handle(name, along, lo=-0.7, hi=0.7):
    pb = P[name]
    for _ in range(24):
        mid = (lo + hi) / 2
        aim(pb, along * math.cos(mid) + nb * math.sin(mid)); bpy.context.view_layer.update()
        d = axis_dist(pb.tail) - (R_HANDLE + THUMB_CLEAR)
        if d > 0: hi = mid
        else: lo = mid
    return round(math.degrees((lo + hi) / 2), 1)
dips = {'t3': rest_on_handle('mixamorig:RightHandThumb3', h_w)}
bpy.context.view_layer.update()
thumb_info = {'dips_deg': dips, 'tip_dist': round(axis_dist(P['mixamorig:RightHandThumb3'].tail), 4), 't2_head_dist': round(axis_dist(P['mixamorig:RightHandThumb2'].head), 4), 't2_head_side': round(side_of(P['mixamorig:RightHandThumb2'].head), 2), 't2_tail_side': round(side_of(P['mixamorig:RightHandThumb2'].tail), 2), 't2_tail_dist': round(axis_dist(P['mixamorig:RightHandThumb2'].tail), 4), 'tip_side': round(side_of(P['mixamorig:RightHandThumb3'].tail), 2), 'mcp_miss': mcp_miss, 'cmc': [round(v, 4) for v in rel(t1.head)], 'mcp_target': [round(v, 4) for v in rel(mcp_target)], 'mcp': [round(v, 4) for v in rel(P['mixamorig:RightHandThumb2'].head)], 'axis_at_thumb': np.round(axis_point(idx_mcp[0] + T1_UP), 4).tolist()}

# left hand relaxed
hand_l, d0l, L0l, n0l = hand_frame('Left')
for finger, angs in {'Index': (20, 25, 15), 'Middle': (23, 30, 18), 'Ring': (26, 32, 18), 'Pinky': (30, 32, 18)}.items():
    for j, deg in enumerate(angs, start=1):
        pb = P[f'mixamorig:LeftHand{finger}{j}']; pb.rotation_quaternion = Quaternion(local(pb, flex_axis(pb.bone, n0l)), math.radians(deg))
for j, deg in enumerate((8, 12, 8), start=1):
    pb = P[f'mixamorig:LeftHandThumb{j}']; pb.rotation_quaternion = Quaternion(local(pb, flex_axis(pb.bone, n0l)), math.radians(deg))

# racket
c_idx_w = world(c_idx)
butt_w = c_idx_w - h_w * ((c_idx[0] - L_EDGE) / h2[0] + 0.012)
z_axis = -h_w; y_axis = -n0; x_axis = y_axis.cross(z_axis).normalized(); y_axis = z_axis.cross(x_axis).normalized()
racket.matrix_world = Matrix.Translation(butt_w) @ Matrix((x_axis, y_axis, z_axis)).transposed().to_4x4()
bpy.context.view_layer.update()

# renders
scene = bpy.context.scene; scene.render.engine = 'BLENDER_EEVEE'; scene.render.resolution_x = 900; scene.render.resolution_y = 900; scene.render.resolution_percentage = 100
cam = bpy.data.objects['PreviewCam']; cam.data.lens = 70; scene.camera = cam
def look(pos, target):
    d = (target - pos).normalized(); zc = -d; xc = Vector((0, 0, 1)).cross(zc).normalized(); yc = zc.cross(xc)
    cam.matrix_world = Matrix((xc, yc, zc)).transposed().to_4x4(); cam.matrix_world.translation = pos
c = c_idx_w - h_w * 0.02
tag = 'grip'
views = {'a-palm': c + n0 * 0.42 - d0 * 0.05, 'b-web': c + n0 * 0.3 + L0 * 0.22 - d0 * 0.2, 'c-top': c + d0 * 0.4 + n0 * 0.12, 'd-back': c - n0 * 0.42 - d0 * 0.05}
for name, pos in views.items():
    look(pos, c); scene.render.filepath = OUT + f'\\{tag}-{name}.png'; bpy.ops.render.render(write_still=True)
result = {'GRIP_BUTT (lat, fwd, out)': np.round(rel(butt_w), 4).tolist(), 'n_palm': round(n_palm, 4), 'finger_angles_deg': report,
          'thumb_tip': [round(v, 4) for v in rel(P['mixamorig:RightHandThumb3'].tail)], 'thumb': thumb_info}
if SAVE:
    bpy.ops.wm.save_mainfile()
    result['saved'] = bpy.data.filepath
print('RESULT ' + json.dumps(result))
